// Backtest of the three protection levels on real weekend price gaps.
// Reads daily price files (CSV with Date, Open, Close columns, any order, any case), for example
// a download from Yahoo Finance "Historical Data" or Stooq. No network, no wallet, no money.
//
//   FILES=nvda.csv,tsla.csv node scripts/fee-backtest.mjs > backtest.log 2>&1
//
// A "weekend" is any gap of 3 or more calendar days between two trading days (so holiday weekends count).
// Gap = Friday-style close to the next open. The real product settles on the first Monday print instead,
// which is close to the open, so this is a good stand-in over many years.
import { readFileSync } from "node:fs";

const FILES = (process.env.FILES || "").split(",").map((s) => s.trim()).filter(Boolean);
if (FILES.length === 0) {
  console.log("Set FILES, for example:  FILES=nvda.csv,tsla.csv node scripts/fee-backtest.mjs > backtest.log 2>&1");
  process.exit(1);
}

// Same values as the contract tiers (percent of the covered value).
const TIERS = [
  { name: "Light", ded: 5, cap: 15, fee: 0.2 },
  { name: "Standard", ded: 2, cap: 10, fee: 0.6 },
  { name: "Tight", ded: 1, cap: 5, fee: 0.9 },
];

function parseDate(x) {
  if (x.includes("/")) { const [m, d, y] = x.split("/"); return Date.UTC(Number(y), Number(m) - 1, Number(d)); } // 11/06/2026
  return Date.parse(x.slice(0, 10) + "T00:00:00Z"); // 2026-11-06
}

function readPrices(file) {
  const lines = readFileSync(file, "utf8").trim().split(/\r?\n/);
  const head = lines[0].split(",").map((h) => h.trim().replace(/"/g, "").toLowerCase());
  const di = head.indexOf("date");
  const oi = head.indexOf("open");
  const ci = head.findIndex((h) => h.startsWith("close")); // also matches "Close/Last"
  if (di < 0 || oi < 0 || ci < 0) throw new Error(`${file}: needs Date, Open and Close columns, found: ${head.join(", ")}`);
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",").map((x) => x.trim().replace(/"/g, ""));
    const t = parseDate(c[di]);
    const o = Number(c[oi].replace("$", ""));
    const cl = Number(c[ci].replace("$", ""));
    if (!Number.isFinite(t) || !(o > 0) || !(cl > 0)) continue; // skips blank or broken rows
    rows.push({ t, open: o, close: cl });
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

/** Weekend gaps as drops in percent (positive = price fell). */
let skipped = 0;
function weekendGaps(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const days = (rows[i].t - rows[i - 1].t) / 86400000;
    if (days < 3) continue;
    if (days > 4) { skipped++; continue; } // a longer gap means missing trading days in the file, not a weekend
    out.push({ year: new Date(rows[i].t).getUTCFullYear(), date: new Date(rows[i].t).toISOString().slice(0, 10), days, drop: ((rows[i - 1].close - rows[i].open) / rows[i - 1].close) * 100 });
  }
  return out;
}

const pay = (drop, t) => Math.min(Math.max(drop - t.ded, 0), t.cap); // percent of the covered value
const pct = (x, d = 2) => `${x.toFixed(d)}%`;
const quantile = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

function report(label, gaps) {
  console.log(`\n=== ${label}: ${gaps.length} weekends (${gaps[0]?.date} to ${gaps[gaps.length - 1]?.date}) ===`);
  if (gaps.length === 0) return;
  const drops = gaps.map((g) => g.drop);
  console.log("  five biggest drops: " + [...gaps].sort((a, b) => b.drop - a.drop).slice(0, 5).map((g) => `${g.date} ${g.drop.toFixed(1)}% (${g.days}d gap)`).join(", "));
  console.log(`  biggest weekend drop ${pct(Math.max(...drops))}, 99th percentile ${pct(quantile(drops, 0.99))}, 95th ${pct(quantile(drops, 0.95))}, weekends down 2%+ : ${drops.filter((d) => d > 2).length}`);
  console.log("  level      fee     pays on   avg payout  loss ratio  break-even fee  fee for 70%  worst 4 weekends");
  for (const t of TIERS) {
    const pays = gaps.map((g) => pay(g.drop, t));
    const mean = pays.reduce((a, b) => a + b, 0) / pays.length;
    const hits = pays.filter((p) => p > 0).length;
    let worst4 = 0;
    for (let i = 0; i + 4 <= pays.length; i++) worst4 = Math.max(worst4, pays.slice(i, i + 4).reduce((a, b) => a + b, 0));
    console.log(
      `  ${t.name.padEnd(9)} ${pct(t.fee).padStart(6)}  ${pct((hits / pays.length) * 100, 1).padStart(8)}  ${pct(mean, 3).padStart(10)}  ${(mean / t.fee).toFixed(2).padStart(10)}  ${pct(mean, 3).padStart(14)}  ${pct(mean / 0.7, 3).padStart(11)}  ${pct(worst4).padStart(16)}`,
    );
  }
  // By year, Standard level: shows how much one bad year moves the result.
  const std = TIERS[1];
  const years = [...new Set(gaps.map((g) => g.year))];
  console.log("  Standard by year (loss ratio = paid / fees, above 1.00 means the pool lost money that year):");
  for (const y of years) {
    const g = gaps.filter((x) => x.year === y);
    const mean = g.reduce((a, x) => a + pay(x.drop, std), 0) / g.length;
    console.log(`    ${y}: ${g.length} weekends, loss ratio ${(mean / std.fee).toFixed(2)}`);
  }
}

const all = [];
for (const f of FILES) {
  skipped = 0;
  const gaps = weekendGaps(readPrices(f));
  if (skipped) console.log(`\n${f}: skipped ${skipped} gap(s) longer than 4 days (missing trading days in the file)`);
  report(f, gaps);
  all.push(...gaps);
}
if (FILES.length > 1) report("All files together", all.sort((a, b) => a.date.localeCompare(b.date)));
console.log("\nHow to read it: loss ratio = average payout divided by the fee. Under 1.00 the pool keeps a margin before costs; the 'fee for 70%' column is the fee that would leave a 30% margin.");
console.log("Limits: price gaps only. It ignores people buying cover when they expect bad news, partners' costs, and any bad weekend not in the file.");
