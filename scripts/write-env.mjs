// Usage: node scripts/write-env.mjs <chainId>
// Reads deployments/<chainId>.json and writes app/.env.local (public addresses only, no secrets).
import { readFileSync, writeFileSync } from "node:fs";

const chainId = process.argv[2];
if (!chainId) {
  console.error("usage: node scripts/write-env.mjs <chainId>   (84532 for Base Sepolia, 31337 for local anvil)");
  process.exit(1);
}
const d = JSON.parse(readFileSync(`deployments/${chainId}.json`, "utf8"));
const lines = [
  `NEXT_PUBLIC_CHAIN=${chainId === "31337" ? "local" : "baseSepolia"}`,
  `NEXT_PUBLIC_POOL=${d.pool}`,
  `NEXT_PUBLIC_STOCK=${d.stock}`,
  `NEXT_PUBLIC_USDC=${d.usdc}`,
  `NEXT_PUBLIC_FEED=${d.feed}`,
  `NEXT_PUBLIC_SPOT=${d.spot}`,
  `NEXT_PUBLIC_KEEPER=${d.keeper}`,
];
writeFileSync("app/.env.local", lines.join("\n") + "\n");
console.log("wrote app/.env.local");
