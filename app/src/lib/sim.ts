import type { Address } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { DEMO, DEMO_TOKENS, START_PRICE, need } from "./config";
import { ERC20_ABI, FEED_ABI, KEEPER_ABI, POOL_ABI, SPOT_ABI, STOCK_ABI, USDC_ABI } from "./abis";
import { STATUS, chainTime, ensureAllowance, pub, send, waitForChainTime, type Session, type Signer } from "./chain";
import { notionalOf, payoutOf, type Tier } from "./math";

export const STEPS = [
  "Fund the demo wallets",
  "Friday print, open the session",
  "Buy cover before the close",
  "Close: the feed freezes",
  "The weekend: spot falls",
  "Open: first fresh print",
  "Settle: atomic payout",
] as const;

export type StepState = "wait" | "run" | "done" | "fail";

export type Side = {
  address: Address;
  positionBefore: bigint;
  positionAfter: bigint;
  positionMove: bigint;
  premium: bigint;
  payout: bigint;
  net: bigint;
};

export type SimResult = {
  covered: Side;
  uncovered: Side;
  refPrice: bigint;
  settlePrice: bigint;
  expectedPayout: bigint;
  tierName: string;
  gapBps: number;
};

const BKEY = "gapcover.demo.uncovered";

/** The uncovered wallet never signs anything, so it needs no key. Only an address is kept. */
export function uncoveredAddress(): Address {
  try {
    const v = localStorage.getItem(BKEY);
    if (v && /^0x[0-9a-fA-F]{40}$/.test(v)) return v as Address;
    const a = privateKeyToAddress(generatePrivateKey());
    localStorage.setItem(BKEY, a);
    return a;
  } catch {
    return privateKeyToAddress(generatePrivateKey());
  }
}

async function bal(token: Address, who: Address): Promise<bigint> {
  return (await pub.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [who] })) as bigint;
}

/** If an earlier run was interrupted, free the pool when the rules allow it. */
async function recover(s: Signer, onNote: (n: string) => void) {
  const pool = need("pool");
  const id = (await pub.readContract({ address: pool, abi: POOL_ABI, functionName: "activeSession" })) as bigint;
  if (id === 0n) return;
  const sess = (await pub.readContract({ address: pool, abi: POOL_ABI, functionName: "getSession", args: [id] })) as Session;
  onNote(`A previous session #${id} is still active. Trying to clear it.`);
  try {
    await send(s, pool, POOL_ABI, "voidSession", [id]);
    return;
  } catch {
    const t = await chainTime();
    const wait = Number(sess.openTime) + 120 + 600 - Number(t);
    throw new Error(
      `Session #${id} is still running and cannot be voided yet. Wait about ${Math.max(wait, 1)}s, or let it finish, then run again.`,
    );
  }
}

export async function runWeekend(args: {
  signer: Signer;
  uncovered: Address;
  tier: Tier;
  tierIdx: number;
  gapBps: number;
  onStep: (i: number, st: StepState, note?: string) => void;
}): Promise<SimResult> {
  const { signer: s, uncovered, tier, tierIdx, gapBps, onStep } = args;
  const pool = need("pool");
  const stock = need("stock");
  const usdc = need("usdc");
  const feed = need("feed");
  const spot = need("spot");
  const keeper = need("keeper");
  const me = s.address;
  let cur = 0;
  const step = async <T,>(i: number, fn: () => Promise<T>): Promise<T> => {
    cur = i;
    onStep(i, "run");
    const r = await fn();
    onStep(i, "done");
    return r;
  };

  try {
    // 0 fund
    await step(0, async () => {
      await recover(s, (n) => onStep(0, "run", n));
      if ((await bal(usdc, me)) < 1_000n * 10n ** 6n) await send(s, usdc, USDC_ABI, "faucet", [me, 1_000n * 10n ** 6n]);
      if ((await bal(stock, me)) < DEMO_TOKENS) await send(s, stock, STOCK_ABI, "mint", [me, DEMO_TOKENS]);
      if ((await bal(stock, uncovered)) < DEMO_TOKENS) await send(s, stock, STOCK_ABI, "mint", [uncovered, DEMO_TOKENS]);
      await ensureAllowance(s, 2n ** 200n);
    });

    // 1 friday print and session
    const sid = await step(1, async () => {
      await send(s, feed, FEED_ABI, "pushRound", [START_PRICE]);
      await send(s, spot, SPOT_ABI, "setPrice", [stock, START_PRICE]);
      await send(s, keeper, KEEPER_ABI, "scheduleNow", [pool, DEMO.closeIn, DEMO.openIn]);
      return (await pub.readContract({ address: pool, abi: POOL_ABI, functionName: "activeSession" })) as bigint;
    });
    const sess = (await pub.readContract({ address: pool, abi: POOL_ABI, functionName: "getSession", args: [sid] })) as Session;

    // 2 buy cover
    const usdcBeforeBuy = await bal(usdc, me);
    const positionBefore = (DEMO_TOKENS * START_PRICE) / 10n ** 20n;
    await step(2, async () => {
      await send(s, pool, POOL_ABI, "buyCover", [sid, DEMO_TOKENS, tierIdx]);
    });
    const usdcAfterBuy = await bal(usdc, me);
    const premium = usdcBeforeBuy - usdcAfterBuy;

    // 3 close
    await step(3, async () => {
      await waitForChainTime(sess.closeTime, (l) => onStep(3, "run", `Market closes in ${l}s`));
      await send(s, pool, POOL_ABI, "closeSession", [sid]);
    });

    // 4 weekend: spot falls
    const settlePrice = (START_PRICE * BigInt(10_000 - gapBps)) / 10_000n;
    await step(4, async () => {
      await send(s, spot, SPOT_ABI, "setPrice", [stock, settlePrice]);
    });

    // 5 open, first print
    const roundId = await step(5, async () => {
      await waitForChainTime(sess.openTime, (l) => onStep(5, "run", `Market opens in ${l}s`));
      await send(s, feed, FEED_ABI, "pushRound", [settlePrice]);
      const r = (await pub.readContract({ address: feed, abi: FEED_ABI, functionName: "latestRoundData" })) as readonly [bigint, bigint, bigint, bigint, bigint];
      return r[0];
    });

    // 6 settle
    const usdcBeforeSettle = await bal(usdc, me);
    await step(6, async () => {
      await send(s, pool, POOL_ABI, "settle", [sid, roundId]);
    });
    const payout = (await bal(usdc, me)) - usdcBeforeSettle;

    const positionAfter = (DEMO_TOKENS * settlePrice) / 10n ** 20n;
    const positionMove = positionAfter - positionBefore;
    const expected = payoutOf(notionalOf(DEMO_TOKENS, START_PRICE), tier, START_PRICE, settlePrice);
    return {
      covered: { address: me, positionBefore, positionAfter, positionMove, premium, payout, net: positionMove - premium + payout },
      uncovered: { address: uncovered, positionBefore, positionAfter, positionMove, premium: 0n, payout: 0n, net: positionMove },
      refPrice: START_PRICE,
      settlePrice,
      expectedPayout: expected,
      tierName: tier.name,
      gapBps,
    };
  } catch (e) {
    onStep(cur, "fail", e instanceof Error ? e.message : String(e));
    throw e;
  }
}

export { STATUS };
