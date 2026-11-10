// Mirrors CoverPool math exactly (integer, rounding as in the contract). The chain stays the source of truth.
export const WAD = 10n ** 18n;

export type Tier = { name: string; deductibleBps: number; capBps: number; premiumBps: number };

export const TIER_NAMES = ["Light", "Standard", "Tight"];

/** notional in 6 decimal USDC from raw 18 decimal tokens and an 8 decimal price */
export function notionalOf(raw: bigint, price: bigint): bigint {
  return (raw * price) / 10n ** 20n;
}

export function premiumOf(notional: bigint, premiumBps: number): bigint {
  return (notional * BigInt(premiumBps) + 9_999n) / 10_000n;
}

export function payoutOf(notional: bigint, t: Tier, ref: bigint, settle: bigint): bigint {
  if (settle >= ref) return 0n;
  const drop = ((ref - settle) * WAD) / ref;
  const ded = BigInt(t.deductibleBps) * 10n ** 14n;
  if (drop <= ded) return 0n;
  let frac = drop - ded;
  const cap = BigInt(t.capBps) * 10n ** 14n;
  if (frac > cap) frac = cap;
  return (notional * frac) / WAD;
}

export function fmtUsd(v: bigint, dp = 2): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / 1_000_000n;
  const frac = (a % 1_000_000n).toString().padStart(6, "0").slice(0, dp);
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${w}${dp > 0 ? "." + frac : ""}`;
}

export function fmtSigned(v: bigint, dp = 2): string {
  return `${v > 0n ? "+" : ""}${fmtUsd(v, dp)}`;
}

export function fmtPx(v: bigint): string {
  const whole = v / 100_000_000n;
  const frac = (v % 100_000_000n).toString().padStart(8, "0").slice(0, 2);
  return `${whole}.${frac}`;
}

export function fmtTokens(v: bigint): string {
  const whole = v / WAD;
  const frac = (v % WAD).toString().padStart(18, "0").slice(0, 2);
  return `${whole}.${frac}`;
}

export function parseUsd(s: string): bigint {
  const [w, f = ""] = s.trim().split(".");
  if (!/^\d*$/.test(w) || !/^\d*$/.test(f)) return 0n;
  return BigInt(w || "0") * 1_000_000n + BigInt((f + "000000").slice(0, 6));
}

export function parseTokens(s: string): bigint {
  const [w, f = ""] = s.trim().split(".");
  if (!/^\d*$/.test(w) || !/^\d*$/.test(f)) return 0n;
  return BigInt(w || "0") * WAD + BigInt((f + "0".repeat(18)).slice(0, 18));
}
