// What a liquidity provider would have earned and suffered, weekend by weekend, over the price history.
// Reuses the price files from the fee backtest (Date, Open, Close columns). No network, no wallet, no money.
//
//   FILES=nvda.csv,tsla.csv,aapl.csv,mstr.csv node scripts/pool-sim.mjs > poolsim.log 2>&1
// Optional: TIER=Standard (Light, Standard or Tight)   CONFIG=0.40,0.25,1  (fee %, share of pool used, adverse factor)
//
// Model, in plain words: the pool holds 1.00 of capital. Each weekend it sells cover on every stock in the files
// (a shared pool), using the chosen share of its money, spread equally over the stocks. It collects the fee and pays
// what the price gap triggers. "Adverse factor" makes payouts bigger than the average gap would pay, to mimic buyers
// who show up before bad weekends (1 = buyers are random, 2 = payouts are twice as big, capped at the level's cap).
import { readFileSync } from "node:fs";

const FILES = (process.env.FILES || "").split(",").map((s) => s.trim()).filter(Boolean);
if (FILES.length === 0) {
  console.log("Set FILES, for example:  FILES=nvda.csv,tsla.csv node scripts/pool-sim.mjs > poolsim.log 2>&1");
  process.exit(1);
}
const TIERS = { Light: { ded: 5, cap: 15 }, Standard: { ded: 2, cap: 10 }, Tight: { ded: 1, cap: 5 } };
const TIER = TIERS[process.env.TIER || "Standard"];
if (!TIER) { console.log("TIER must be Light, Standard or Tight"); process.exit(1); }
const [CFEE, CUTIL, CADV] = (process.env.CONFIG || "0.40,0.25,1").split(",").map(Number);

function parseDate(x) {
  if (x.includes("/")) { const [m, d, y] = x.split("/"); return Date.UTC(Number(y), Number(m) - 1, Number(d)); }
  return Date.parse(x.slice(0, 10) + "T00:00:00Z");
}
function readPrices(file) {
  const lines = readFileSync(file, "utf8").trim().split(/\r?\n/);
  const head = lines[0].split(",").map((h) => h.trim().replace(/"/g, "").toLowerCase());
  const di = head.indexOf("date"), oi = head.indexOf("open"), ci = head.findIndex((h) => h.startsWith("close"));
  if (di < 0 || oi < 0 || ci < 0) throw new Error(`${file}: needs Date, Open and Close columns`);
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",").map((x) => x.trim().replace(/"/g, ""));
    const t = parseDate(c[di]), o = Number(c[oi].replace("$", "")), cl = Number(c[ci].replace("$", ""));
    if (Number.isFinite(t) && o > 0 && cl > 0) rows.push({ t, open: o, close: cl });
  }
  return rows.sort((a, b) => a.t - b.t);
}

// weekend -> drops (percent, positive = fell) for every stock that has that weekend
let skippedGaps = 0;
const byDate = new Map();
for (const f of FILES) {
  const rows = readPrices(f);
  for (let i = 1; i < rows.length; i++) {
    const days = (rows[i].t - rows[i - 1].t) / 86400000;
    if (days < 3) continue;
    if (days > 4) { skippedGaps++; continue; } // missing trading days in the file, not a weekend
    const key = new Date(rows[i].t).toISOString().slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(((rows[i - 1].close - rows[i].open) / rows[i - 1].close) * 100);
  }
}
if (skippedGaps) console.log(`Skipped ${skippedGaps} gap(s) longer than 4 days (missing trading days in the files).\n`);
const weekends = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));

function simulate(fee, util, adv) {
  let eq = 1, peak = 1, worstWeek = 0, maxDD = 0, underwaterWeeks = 0, longestUnder = 0;
  const years = new Map();
  for (const [date, drops] of weekends) {
    const nShare = util / drops.length / (TIER.cap / 100); // covered value per stock, in units of pool capital
    let r = 0;
    for (const d of drops) {
      const pay = Math.min(Math.max(d - TIER.ded, 0) * adv, TIER.cap);
      r += (nShare * (fee - pay)) / 100;
    }
    const y = date.slice(0, 4);
    years.set(y, (years.get(y) ?? 1) * (1 + r));
    eq *= 1 + r;
    worstWeek = Math.min(worstWeek, r);
    if (eq >= peak) { peak = eq; underwaterWeeks = 0; } else { underwaterWeeks++; longestUnder = Math.max(longestUnder, underwaterWeeks); }
    maxDD = Math.min(maxDD, eq / peak - 1);
  }
  const yrs = weekends.length / 52;
  const rets = [...years.values()].map((v) => v - 1);
  return { cagr: eq ** (1 / yrs) - 1, worstWeek, maxDD, worstYear: Math.min(...rets), losingYears: rets.filter((x) => x < 0).length, nYears: rets.length, longestUnder, years };
}

const p = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
console.log(`Shared pool over ${FILES.length} stock(s), ${weekends.length} weekends (${weekends[0][0]} to ${weekends[weekends.length - 1][0]}), level ${process.env.TIER || "Standard"}: you take ${TIER.ded}%, cap ${TIER.cap}%.`);
console.log("Returns are per year on the provider's money, before costs, compounding every weekend.\n");

const ADVS = (process.env.ADVS || "1,2").split(",").map(Number);
const EXTRA_UTIL = (process.env.UTILS || "0.1,0.25,0.5,1").split(",").map(Number);
for (const adv of ADVS) {
  console.log(`--- Buyers: ${adv === 1 ? "random timing (adverse factor 1)" : `adverse factor ${adv} (${adv === 2 ? "show up before bad weekends: " : ""}payouts ${adv} times the average, up to the cap)`} ---`);
  console.log("  fee    pool used   yearly return   worst weekend   worst year   losing years   biggest fall   longest wait to recover");
  for (const fee of (process.env.FEES || "0.3,0.4,0.6").split(",").map(Number)) {
    for (const util of EXTRA_UTIL) {
      const s = simulate(fee, util, adv);
      console.log(
        `  ${fee.toFixed(2)}%  ${p(util, 0).padStart(9)}   ${p(s.cagr).padStart(13)}   ${p(s.worstWeek).padStart(13)}   ${p(s.worstYear).padStart(10)}   ${`${s.losingYears} of ${s.nYears}`.padStart(12)}   ${p(s.maxDD).padStart(12)}   ${`${(s.longestUnder / 52).toFixed(1)} years`.padStart(14)}`,
      );
    }
  }
  console.log("");
}

const c = simulate(CFEE, CUTIL, CADV);
console.log(`--- By year for fee ${CFEE}%, ${p(CUTIL, 0)} of the pool used, adverse factor ${CADV} ---`);
for (const [y, v] of c.years) console.log(`  ${y}: ${p(v - 1)}`);
// The weekends that hurt most for this configuration, so the numbers can be checked against real events.
const hurt = weekends.map(([date, drops]) => {
  let r = 0;
  const nShare = CUTIL / drops.length / (TIER.cap / 100);
  for (const d of drops) r += (nShare * (CFEE - Math.min(Math.max(d - TIER.ded, 0) * CADV, TIER.cap))) / 100;
  return { date, drops, r };
}).sort((a, b) => a.r - b.r).slice(0, 5);
console.log("\n--- Five worst weekends for that setting (check these dates against what really happened) ---");
for (const h of hurt) console.log(`  ${h.date}: provider ${p(h.r)}   drops ${h.drops.map((d, i) => `${FILES.length === h.drops.length ? FILES[i].replace(/\.csv$/, "") + " " : ""}${d.toFixed(1)}%`).join(", ")}`);
console.log("\nHow to read it: 'worst weekend' is the most a provider lost in one weekend. 'Longest wait' is the longest stretch below the previous high point.");
console.log("Limits: it assumes buyers always fill the share of the pool you choose, every weekend (real demand will be lower, so real returns will be too). Price gaps only, equal split across the stocks in the files, no costs, no change in demand when fees change, and the past ten years only.");
