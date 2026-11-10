import { createPublicClient, http, type Abi, type Address, type WalletClient, type Transport, type Chain, type Account } from "viem";
import { ADDR, CHAIN, IS_LOCAL, RPC_URL, need } from "./config";
import { ERC20_ABI, FEED_ABI, POOL_ABI, SPOT_ABI } from "./abis";
import { TIER_NAMES, type Tier } from "./math";

export const pub = createPublicClient({ chain: CHAIN, transport: http(RPC_URL), pollingInterval: IS_LOCAL ? 300 : 1500 });

export type Signer = { address: Address; wc: WalletClient<Transport, Chain, Account>; kind: "demo" | "browser" };

export const STATUS = { None: 0, Scheduled: 1, Closed: 2, Settled: 3, Voided: 4 } as const;

export type Session = {
  saleStart: bigint;
  closeTime: bigint;
  openTime: bigint;
  status: number;
  coverCount: number;
  reserved: bigint;
  premiums: bigint;
  refPrice: bigint;
  settlePrice: bigint;
  multiplierAtClose: bigint;
};

export type Me = {
  address: Address;
  eth: bigint;
  usdc: bigint;
  tokens: bigint;
  shares: bigint;
  shareValue: bigint;
  claimable: bigint;
  usdcAllowance: bigint;
};

export type Snapshot = {
  now: bigint;
  fetchedAt: number;
  totalAssets: bigint;
  sharePrice: bigint;
  locked: boolean;
  activeId: bigint;
  session: Session | null;
  tiers: Tier[];
  feedPrice: bigint;
  feedUpdatedAt: bigint;
  spot: bigint;
  me: Me | null;
};

export async function chainTime(): Promise<bigint> {
  const b = await pub.getBlock({ blockTag: "latest" });
  return b.timestamp;
}

export async function readSnapshot(me?: Address): Promise<Snapshot> {
  const pool = need("pool");
  const stock = need("stock");
  const usdc = need("usdc");
  const feed = need("feed");
  const spot = need("spot");
  const rd = <T,>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) =>
    pub.readContract({ address, abi, functionName, args }) as Promise<T>;

  const [now, totalAssets, sharePrice, locked, activeId, round, spotPx, tierRaw] = await Promise.all([
    chainTime(),
    rd<bigint>(pool, POOL_ABI, "totalAssets"),
    rd<bigint>(pool, POOL_ABI, "sharePrice"),
    rd<boolean>(pool, POOL_ABI, "locked"),
    rd<bigint>(pool, POOL_ABI, "activeSession"),
    rd<readonly [bigint, bigint, bigint, bigint, bigint]>(feed, FEED_ABI, "latestRoundData"),
    rd<bigint>(spot, SPOT_ABI, "price", [stock]),
    Promise.all([0, 1, 2].map((i) => rd<readonly [number, number, number]>(pool, POOL_ABI, "tiers", [BigInt(i)]))),
  ]);

  const tiers: Tier[] = tierRaw.map((t, i) => ({
    name: TIER_NAMES[i],
    deductibleBps: Number(t[0]),
    capBps: Number(t[1]),
    premiumBps: Number(t[2]),
  }));

  let session: Session | null = null;
  if (activeId !== 0n) {
    const s = await rd<Session>(pool, POOL_ABI, "getSession", [activeId]);
    session = { ...s, status: Number(s.status), coverCount: Number(s.coverCount) };
  }

  let meState: Me | null = null;
  if (me) {
    const [eth, usdcBal, tokens, shares, claimable, allowance] = await Promise.all([
      pub.getBalance({ address: me }),
      rd<bigint>(usdc, ERC20_ABI, "balanceOf", [me]),
      rd<bigint>(stock, ERC20_ABI, "balanceOf", [me]),
      rd<bigint>(pool, POOL_ABI, "shares", [me]),
      rd<bigint>(pool, POOL_ABI, "claimable", [me]),
      rd<bigint>(usdc, ERC20_ABI, "allowance", [me, pool]),
    ]);
    const shareValue = shares > 0n ? await rd<bigint>(pool, POOL_ABI, "convertToAssets", [shares]) : 0n;
    meState = { address: me, eth, usdc: usdcBal, tokens, shares, shareValue, claimable, usdcAllowance: allowance };
  }

  return {
    now,
    fetchedAt: Date.now(),
    totalAssets,
    sharePrice,
    locked,
    activeId,
    session,
    tiers,
    feedPrice: round[1],
    feedUpdatedAt: round[3],
    spot: spotPx,
    me: meState,
  };
}

export type Phase = "idle" | "sale" | "frozen" | "await" | "late";

/** Banner state from chain time and the active session. */
export function phaseOf(s: Snapshot): { phase: Phase; label: string; target?: bigint } {
  const now = s.now + BigInt(Math.floor((Date.now() - s.fetchedAt) / 1000));
  const x = s.session;
  if (!x || x.status === STATUS.Settled || x.status === STATUS.Voided || x.status === STATUS.None)
    return { phase: "idle", label: "No session scheduled" };
  if (now < x.closeTime) return { phase: "sale", label: "Market open · cover on sale", target: x.closeTime };
  if (now < x.openTime) return { phase: "frozen", label: "Market closed · feed frozen", target: x.openTime };
  return { phase: "await", label: "Open · awaiting first print" };
}

export function secondsLeft(s: Snapshot, target?: bigint): number | null {
  if (target === undefined) return null;
  const now = s.now + BigInt(Math.floor((Date.now() - s.fetchedAt) / 1000));
  const d = Number(target - now);
  return d > 0 ? d : 0;
}

export async function send(
  s: Signer,
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
) {
  const hash = await s.wc.writeContract({ address, abi, functionName, args, account: s.wc.account, chain: CHAIN });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted (${hash})`);
  return receipt;
}

export async function ensureAllowance(s: Signer, need_: bigint) {
  const usdc = need("usdc");
  const pool = need("pool");
  const cur = (await pub.readContract({ address: usdc, abi: ERC20_ABI, functionName: "allowance", args: [s.address, pool] })) as bigint;
  if (cur >= need_) return;
  await send(s, usdc, ERC20_ABI, "approve", [pool, 2n ** 256n - 1n]);
}

export { ADDR };

/** Local anvil: jump chain time. Public chains: wait for real time. Returns when chain time >= ts. */
export async function waitForChainTime(ts: bigint, onTick?: (left: number) => void) {
  if (IS_LOCAL) {
    const now = await chainTime();
    if (now < ts) {
      await pub.request({ method: "evm_setNextBlockTimestamp" as never, params: [Number(ts)] as never });
      await pub.request({ method: "evm_mine" as never, params: [] as never });
    }
    return;
  }
  for (;;) {
    const now = await chainTime();
    if (now >= ts) return;
    onTick?.(Number(ts - now));
    await new Promise((r) => setTimeout(r, 1500));
  }
}
