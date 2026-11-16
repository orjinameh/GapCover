import { defineChain, type Address, type Chain } from "viem";
import { base, baseSepolia } from "viem/chains";

export const IS_LOCAL = process.env.NEXT_PUBLIC_CHAIN === "local";
/** Mainnet beta: real USDC, real stock token and feed. No practice tools, no faucet, no demo wallet. */
export const IS_BETA = process.env.NEXT_PUBLIC_CHAIN === "base";

const localChain = defineChain({
  id: 31337,
  name: "Local anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"] } },
});

export const CHAIN: Chain = IS_LOCAL ? localChain : IS_BETA ? base : baseSepolia;
export const RPC_URL: string = process.env.NEXT_PUBLIC_RPC_URL ?? CHAIN.rpcUrls.default.http[0];

const addr = (v: string | undefined): Address | undefined =>
  v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined;

export const ADDR = {
  pool: addr(process.env.NEXT_PUBLIC_POOL),
  stock: addr(process.env.NEXT_PUBLIC_STOCK),
  usdc: addr(process.env.NEXT_PUBLIC_USDC),
  feed: addr(process.env.NEXT_PUBLIC_FEED),
  spot: addr(process.env.NEXT_PUBLIC_SPOT),
  keeper: addr(process.env.NEXT_PUBLIC_KEEPER),
};

// The beta has no spot market and no demo keeper, so those two are optional there.
export const DEPLOYED = IS_BETA ? Boolean(ADDR.pool && ADDR.stock && ADDR.usdc && ADDR.feed) : Object.values(ADDR).every(Boolean);

/** Compressed demo timings, seconds. Must satisfy the pool's lockWindow set in script/Deploy.s.sol. */
export const DEMO = { closeIn: 40, openIn: 80 };
/** Slower night for pressing the buttons by hand. Sale stays open for 2 minutes. */
export const DEMO_MANUAL = { closeIn: 120, openIn: 180 };
export const TICKER = process.env.NEXT_PUBLIC_TICKER ?? (IS_BETA ? "NVDAc" : "NVDAm");
/** Decimals of the stock token. The practice token has 18, the Base stock tokens have 8. */
export const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS ?? (IS_BETA ? 8 : 18));
export const START_PRICE = 100n * 10n ** 8n; // $100, 8 decimals
export const DEMO_TOKENS = 100n * 10n ** 18n; // 100 tokens = 10,000 USDC notional at $100

export function need<K extends keyof typeof ADDR>(k: K): Address {
  const v = ADDR[k];
  if (!v) throw new Error(`Missing NEXT_PUBLIC_${k.toUpperCase()}. Run the deploy and write-env steps.`);
  return v;
}
