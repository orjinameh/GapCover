// Downloads daily price history (Date, Open, Close) for the fee backtest and saves one CSV per stock
// in the folder you run it from. Read-only: it only asks a public price service for data.
//
//   TICKERS=NVDA,TSLA,AAPL,MSTR node scripts/get-prices.mjs > prices.log 2>&1
// Optional: RANGE=10y (default), 5y, max
//
// If the service refuses (rate limit, captcha, a web page instead of data) the script says so and stops.
// It does not try to get around that: download the files in your browser instead.
import { writeFileSync } from "node:fs";

/** Turns the service's JSON into CSV text with Date, Open, Close. Exported for testing. */
export function toCsv(json) {
  const r = json?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error("no price data in the answer");
  const off = r.meta?.gmtoffset ?? 0;
  const q = r.indicators.quote[0];
  const lines = ["Date,Open,Close"];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open[i], c = q.close[i];
    if (!(o > 0) || !(c > 0)) continue;
    lines.push(`${new Date((r.timestamp[i] + off) * 1000).toISOString().slice(0, 10)},${o},${c}`);
  }
  return lines.join("\n");
}

if (process.argv[1] && process.argv[1].endsWith("get-prices.mjs")) {
  const TICKERS = (process.env.TICKERS || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const RANGE = process.env.RANGE || "10y";
  if (TICKERS.length === 0) {
    console.log("Set TICKERS, for example:  TICKERS=NVDA,TSLA node scripts/get-prices.mjs > prices.log 2>&1");
    process.exit(1);
  }

  for (const t of TICKERS) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=${RANGE}&interval=1d`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; gapcover-backtest)" } });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { throw new Error(`got a web page instead of data (status ${res.status})`); }
      const csv = toCsv(json);
      writeFileSync(`${t.toLowerCase()}.csv`, csv);
      console.log(`${t}: saved ${csv.split("\n").length - 1} days to ${t.toLowerCase()}.csv`);
    } catch (e) {
      console.log(`${t}: failed (${e.message}). Download this one in your browser instead.`);
    }
  }
}
