import type { Address } from "viem";
import { need } from "./config";
import { POOL_ABI } from "./abis";
import { STATUS, pub, type Session } from "./chain";
import { payoutOf, type Tier } from "./math";

export type CoverState = "active" | "frozen" | "awaiting" | "paid" | "nopayout" | "refunded";

export type MyCover = {
  sessionId: bigint;
  coverId: bigint;
  tier: number;
  notional: bigint;
  premium: bigint;
  maxPayout: bigint;
  session: Session;
  payout: bigint;
  state: CoverState;
};

type RawCover = { holder: Address; tier: number; notional: bigint; premium: bigint; maxPayout: bigint };

/** Newest first, at most `limit` covers. */
export async function readMyCovers(me: Address, tiers: Tier[], now: bigint, limit = 20): Promise<MyCover[]> {
  const pool = need("pool");
  const count = (await pub.readContract({ address: pool, abi: POOL_ABI, functionName: "holderCoverCount", args: [me] })) as bigint;
  const n = Number(count);
  const idx: number[] = [];
  for (let i = n - 1; i >= 0 && idx.length < limit; i--) idx.push(i);

  const refs = await Promise.all(
    idx.map((i) => pub.readContract({ address: pool, abi: POOL_ABI, functionName: "holderCoverAt", args: [me, BigInt(i)] }) as Promise<readonly [bigint, bigint]>),
  );
  const sessions = new Map<string, Session>();
  await Promise.all(
    [...new Set(refs.map((r) => r[0].toString()))].map(async (sid) => {
      const s = (await pub.readContract({ address: pool, abi: POOL_ABI, functionName: "getSession", args: [BigInt(sid)] })) as Session;
      sessions.set(sid, { ...s, status: Number(s.status), coverCount: Number(s.coverCount) });
    }),
  );
  const raws = await Promise.all(
    refs.map((r) => pub.readContract({ address: pool, abi: POOL_ABI, functionName: "getCover", args: [r[0], r[1]] }) as Promise<RawCover>),
  );

  return refs.map((r, k) => {
    const session = sessions.get(r[0].toString())!;
    const c = raws[k];
    const tier = tiers[Number(c.tier)];
    let state: CoverState = "active";
    let payout = 0n;
    if (session.status === STATUS.Scheduled) state = now < session.closeTime ? "active" : "frozen";
    else if (session.status === STATUS.Closed) state = now < session.openTime ? "frozen" : "awaiting";
    else if (session.status === STATUS.Settled) {
      payout = tier ? payoutOf(c.notional, tier, session.refPrice, session.settlePrice) : 0n;
      state = payout > 0n ? "paid" : "nopayout";
    } else if (session.status === STATUS.Voided) state = "refunded";
    return {
      sessionId: r[0],
      coverId: r[1],
      tier: Number(c.tier),
      notional: c.notional,
      premium: c.premium,
      maxPayout: c.maxPayout,
      session,
      payout,
      state,
    };
  });
}

export const STATE_TEXT: Record<CoverState, string> = {
  active: "Active. Market open",
  frozen: "Market closed, feed frozen",
  awaiting: "Open, awaiting first price",
  paid: "Paid out",
  nopayout: "Settled, gap below your deductible",
  refunded: "Voided, premium refunded",
};
