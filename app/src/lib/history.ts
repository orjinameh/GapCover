import { need } from "./config";
import { POOL_ABI } from "./abis";
import { STATUS, pub, type Session } from "./chain";
import { payoutOf, type Tier } from "./math";

type RawCover = { holder: string; tier: number; notional: bigint; premium: bigint; maxPayout: bigint };

export type Night = {
  id: bigint;
  status: number;
  coverCount: number;
  /** fees paid in by customers for this night */
  fees: bigint;
  /** money the pool paid out (0 until the night is settled) */
  paidOut: bigint;
  refPrice: bigint;
  settlePrice: bigint;
};

export type PoolHistory = {
  /** oldest first */
  nights: Night[];
  /** fees and payouts across settled nights only (cancelled nights refund their fees) */
  earned: bigint;
  paid: bigint;
  /** how many nights exist in total, including ones not shown */
  total: number;
};

/**
 * Reads the pool's own records. No log scanning: sessionCount, getSession and getCover are
 * enough, so it works on public RPCs that limit eth_getLogs ranges.
 */
export async function readPoolHistory(tiers: Tier[], limit = 12): Promise<PoolHistory> {
  const pool = need("pool");
  const total = Number((await pub.readContract({ address: pool, abi: POOL_ABI, functionName: "sessionCount" })) as bigint);
  const ids: bigint[] = [];
  for (let i = total; i >= 1 && ids.length < limit; i--) ids.push(BigInt(i));
  if (ids.length === 0) return { nights: [], earned: 0n, paid: 0n, total };

  const sessions = await Promise.all(
    ids.map(async (id) => {
      const s = (await pub.readContract({ address: pool, abi: POOL_ABI, functionName: "getSession", args: [id] })) as Session;
      return { id, s: { ...s, status: Number(s.status), coverCount: Number(s.coverCount) } as Session };
    }),
  );

  const nights: Night[] = await Promise.all(
    sessions.map(async ({ id, s }) => {
      let paidOut = 0n;
      if (s.status === STATUS.Settled && s.coverCount > 0) {
        const covers = await Promise.all(
          Array.from({ length: s.coverCount }, (_, i) =>
            pub.readContract({ address: pool, abi: POOL_ABI, functionName: "getCover", args: [id, BigInt(i)] }) as Promise<RawCover>,
          ),
        );
        for (const c of covers) {
          const t = tiers[Number(c.tier)];
          if (t) paidOut += payoutOf(c.notional, t, s.refPrice, s.settlePrice);
        }
      }
      return { id, status: s.status, coverCount: s.coverCount, fees: s.premiums, paidOut, refPrice: s.refPrice, settlePrice: s.settlePrice };
    }),
  );

  let earned = 0n;
  let paid = 0n;
  for (const n of nights) {
    if (n.status === STATUS.Settled) {
      earned += n.fees;
      paid += n.paidOut;
    }
  }
  return { nights: nights.reverse(), earned, paid, total };
}
