// Read-only probe of a real Chainlink tokenized-equity feed and its B20 token on Base mainnet.
// Sends no transactions and needs no wallet or money.
//
// Run from the app folder:
//   FEED=0x... TOKEN=0x... node scripts/phase2-probe.mjs > probe.log 2>&1
// Optional: RPC=https://mainnet.base.org  ROUNDS=400  SEQ=<sequencer uptime feed address>
import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";

const FEED = process.env.FEED;
const TOKEN = process.env.TOKEN;
const RPC = process.env.RPC || "https://mainnet.base.org";
const ROUNDS = Number(process.env.ROUNDS || 2500);
const USDC = process.env.USDC || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// Chainlink's Base sequencer uptime feed. Address from memory: treated as unverified, failures are fine.
const SEQ = process.env.SEQ || "0xBCF85224fc0756B9Fa45aA7892530B47e10b6433";

if (!FEED || !TOKEN) {
  console.log("Missing FEED or TOKEN. Example:\n  FEED=0x... TOKEN=0x... node scripts/phase2-probe.mjs > probe.log 2>&1");
  process.exit(1);
}

const client = createPublicClient({ chain: base, transport: http(RPC) });
const feedAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function getRoundData(uint80) view returns (uint80,int256,uint256,uint256,uint80)",
]);
const tokenAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function uiMultiplier() view returns (uint256)",
  "function effectiveAt() view returns (uint256)",
]);
const erc20Abi = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);

const et = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const when = (s) => `${et.format(new Date(Number(s) * 1000))} ET`;
const dur = (s) => { s = Number(s); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return `${d ? d + "d " : ""}${h}h ${m}m`; };
const tryRead = async (label, fn) => { try { return await fn(); } catch (e) { console.log(`  ${label}: could not read (${String(e.shortMessage || e.message).split("\n")[0]})`); return null; } };
const rd = (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args });

console.log("== Network ==");
console.log("chainId", await client.getChainId(), "block", await client.getBlockNumber());

console.log("\n== Real USDC ==");
console.log("  symbol", await tryRead("symbol", () => rd(USDC, erc20Abi, "symbol")), "decimals", await tryRead("decimals", () => rd(USDC, erc20Abi, "decimals")));

console.log("\n== Token (B20) ==");
for (const f of ["name", "symbol", "decimals", "totalSupply", "uiMultiplier", "effectiveAt"]) {
  const v = await tryRead(f, () => rd(TOKEN, tokenAbi, f));
  if (v !== null) console.log(" ", f, v.toString());
}

console.log("\n== Feed ==");
const dec = await tryRead("decimals", () => rd(FEED, feedAbi, "decimals"));
console.log("  decimals", dec, "| description", await tryRead("description", () => rd(FEED, feedAbi, "description")));
const latest = await rd(FEED, feedAbi, "latestRoundData");
const now = BigInt(Math.floor(Date.now() / 1000));
console.log("  latest round", latest[0].toString(), "answer", latest[1].toString(), "updated", when(latest[3]), `(${dur(now - latest[3])} ago)`);

console.log("\n== Sequencer uptime feed (address unverified) ==");
const seq = await tryRead("latestRoundData", () => rd(SEQ, feedAbi, "latestRoundData"));
if (seq) console.log("  answer", seq[1].toString(), "(0 = up, 1 = down) since", when(seq[2]));

console.log(`\n== Last ${ROUNDS} rounds ==`);
const rounds = [{ id: latest[0], answer: latest[1], at: latest[3] }];
let id = latest[0];
let stopped = "";
while (rounds.length < ROUNDS) {
  const batch = [];
  for (let i = 1; i <= 20 && rounds.length + batch.length < ROUNDS; i++) batch.push(id - BigInt(i));
  const got = await Promise.all(batch.map((r) => rd(FEED, feedAbi, "getRoundData", [r]).then((x) => ({ id: x[0], answer: x[1], at: x[3] })).catch(() => null)));
  let broke = false;
  for (const g of got) { if (!g || g.at === 0n) { broke = true; stopped = "history ended or phase changed"; break; } rounds.push(g); }
  if (broke) break;
  id -= 20n;
}
console.log("  rounds read", rounds.length, stopped ? `(${stopped})` : "");
if (rounds.length > 1) {
  const gaps = [], moves = [];
  let zeros = 0;
  for (let i = 0; i < rounds.length - 1; i++) {
    const a = rounds[i], b = rounds[i + 1];
    gaps.push({ secs: a.at - b.at, from: b.at, to: a.at });
    if (b.answer > 0n && a.answer > 0n) moves.push({ pct: (Number(a.answer - b.answer) / Number(b.answer)) * 100, at: a.at });
  }
  for (const r of rounds) if (r.answer <= 0n) zeros++;
  const sorted = [...gaps].sort((x, y) => (y.secs > x.secs ? 1 : -1));
  const normal = [...gaps].map((g) => g.secs).sort((x, y) => (x > y ? 1 : -1));
  console.log("  zero or negative answers:", zeros);
  console.log("  median gap between rounds:", dur(normal[Math.floor(normal.length / 2)]));
  console.log("  longest gaps (weekends and holidays should show up here):");
  for (const g of sorted.slice(0, 5)) console.log("   ", dur(g.secs), "from", when(g.from), "to", when(g.to));
  const big = [...moves].sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct)).slice(0, 5);
  console.log("  biggest round-to-round moves:");
  for (const m of big) console.log("   ", m.pct.toFixed(2) + "%", "at", when(m.at));
  console.log("  oldest round read:", when(rounds[rounds.length - 1].at));
}

// ---- Weekend table: what each candidate "open" print would have settled at ----
if (rounds.length > 1) {
  const asc = [...rounds].reverse();
  const etf = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const parts = (sec) => { const o = {}; for (const x of etf.formatToParts(new Date(Number(sec) * 1000))) o[x.type] = x.value; return { wd: o.weekday, mins: (Number(o.hour) % 24) * 60 + Number(o.minute) }; };
  const px = (r) => Number(r.answer) / 1e8;
  console.log("\n== Weekend gaps: where the price was at each possible 'open' ==");
  console.log("  (Standard cover on $10,000: you take the first 2%, we pay the rest up to 10%)");
  let n = 0;
  for (let i = 1; i < asc.length; i++) {
    if (asc[i].at - asc[i - 1].at < 40n * 3600n) continue;
    n++;
    const fri = asc[i - 1], sun = asc[i];
    let mon = null;
    for (let j = i; j < asc.length; j++) { const t = parts(asc[j].at); if (t.wd !== "Sun" && t.mins >= 9 * 60 + 30) { mon = asc[j]; break; } }
    const pay = (drop) => (drop > 2 ? Math.min(drop - 2, 10) * 100 : 0);
    const chg = (r) => ((px(fri) - px(r)) / px(fri)) * 100;
    console.log(`  Weekend ${n}: last print ${when(fri.at)} at $${px(fri).toFixed(2)}`);
    console.log(`    first print after resume ${when(sun.at)} at $${px(sun).toFixed(2)}  change ${(-chg(sun)).toFixed(2)}%  payout $${pay(chg(sun)).toFixed(0)}`);
    if (mon) console.log(`    first print from 09:30 ET   ${when(mon.at)} at $${px(mon).toFixed(2)}  change ${(-chg(mon)).toFixed(2)}%  payout $${pay(chg(mon)).toFixed(0)}`);
  }
  if (n === 0) console.log("  No weekend gap in the rounds read. Raise ROUNDS.");
}
console.log("\nDone. Nothing was sent to the network except read calls.");
