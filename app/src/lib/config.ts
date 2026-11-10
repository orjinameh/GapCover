import { defineChain, type Address, type Chain } from "viem";
import { baseSepolia } from "viem/chains";

export const IS_LOCAL = process.env.NEXT_PUBLIC_CHAIN === "local";

const localChain = defineChain({
  id: 31337,
  name: "Local anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"] } },
});

export const CHAIN: Chain = IS_LOCAL ? localChain : baseSepolia;
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

export const DEPLOYED = Object.values(ADDR).every(Boolean);

/** Compressed demo timings, seconds. Must satisfy the pool's lockWindow set in script/Deploy.s.sol. */
export const DEMO = { closeIn: 40, openIn: 80 };
export const TICKER = "NVDAm";
export const START_PRICE = 100n * 10n ** 8n; // $100, 8 decimals
export const DEMO_TOKENS = 100n * 10n ** 18n; // 100 tokens = 10,000 USDC notional at $100

export function need<K extends keyof typeof ADDR>(k: K): Address {
  const v = ADDR[k];
  if (!v) throw new Error(`Missing NEXT_PUBLIC_${k.toUpperCase()}. Run the deploy and write-env steps.`);
  return v;
}
