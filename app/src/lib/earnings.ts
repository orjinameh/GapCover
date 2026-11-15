import { parseAbiItem, type Address } from "viem";
import { need } from "./config";
import { pub } from "./chain";

const DEPOSITED = parseAbiItem("event Deposited(address indexed from, address indexed to, uint256 assets, uint256 shares)");
const WITHDRAWN = parseAbiItem("event Withdrawn(address indexed owner, address indexed to, uint256 assets, uint256 shares)");

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const ZERO = "0x0000000000000000000000000000000000000000";

/** First block where the pool has code. Cached per tab. */
async function deployBlock(pool: Address): Promise<bigint> {
  const key = `gc-deploy-${pool}`;
  try {
    const c = sessionStorage.getItem(key);
    if (c) return BigInt(c);
  } catch {}
  let lo = 0n;
  let hi = await pub.getBlockNumber();
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const code = await pub.getCode({ address: pool, blockNumber: mid });
    if (code && code !== "0x") hi = mid;
    else lo = mid + 1n;
  }
  try {
    sessionStorage.setItem(key, lo.toString());
  } catch {}
  return lo;
}

/**
 * Money this person put in minus money they took out, from the pool's own events.
 * Returns null if the RPC can't serve the logs, or if gGAP was sent to or from this wallet by another
 * wallet (deposits and withdrawals alone then no longer tell the story), so the page hides the row.
 */
export async function readNetDeposits(me: Address): Promise<bigint | null> {
  try {
    const pool = need("pool");
    const latest = await pub.getBlockNumber();
    let from = await deployBlock(pool);
    const STEP = 9_000n;
    let net = 0n;
    for (; from <= latest; from += STEP) {
      const to = from + STEP - 1n > latest ? latest : from + STEP - 1n;
      const [d, w, tin, tout] = await Promise.all([
        pub.getLogs({ address: pool, event: DEPOSITED, args: { to: me }, fromBlock: from, toBlock: to }),
        pub.getLogs({ address: pool, event: WITHDRAWN, args: { owner: me }, fromBlock: from, toBlock: to }),
        pub.getLogs({ address: pool, event: TRANSFER, args: { to: me }, fromBlock: from, toBlock: to }),
        pub.getLogs({ address: pool, event: TRANSFER, args: { from: me }, fromBlock: from, toBlock: to }),
      ]);
      if (tin.some((l) => l.args.from !== ZERO) || tout.some((l) => l.args.to !== ZERO)) return null;
      for (const l of d) net += l.args.assets ?? 0n;
      for (const l of w) net -= l.args.assets ?? 0n;
    }
    return net;
  } catch {
    return null;
  }
}
