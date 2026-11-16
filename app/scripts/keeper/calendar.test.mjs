// Run:  node app/scripts/keeper/calendar.test.mjs
import assert from "node:assert/strict";
import { nextWindow, etToUtcMs } from "./calendar.mjs";

const iso = (ms) => new Date(ms).toISOString();
const win = (y, m, d) => nextWindow(Date.UTC(y, m - 1, d, 12));

// The real Nvidia weekend used in the fork replay: close Fri 6 Nov 2026 20:00 ET, open Mon 9 Nov 09:30 ET.
let w = win(2026, 11, 5);
assert.equal(w.closeMs / 1000, 1794013200);
assert.equal(w.openMs / 1000, 1794234600);
assert.equal(w.closeDay, "2026-11-06");
assert.equal(w.openDay, "2026-11-09");

// Spring clock change on 8 Mar 2026: Friday is EST (UTC-5), Monday is EDT (UTC-4).
w = win(2026, 3, 5);
assert.equal(iso(w.closeMs), "2026-03-07T01:00:00.000Z");
assert.equal(iso(w.openMs), "2026-03-09T13:30:00.000Z");

// Good Friday 2027 (26 Mar): close Thursday 25 Mar 20:00 EDT, open Monday 29 Mar.
w = win(2027, 3, 22);
assert.equal(w.closeDay, "2027-03-25");
assert.equal(w.openDay, "2027-03-29");
assert.equal(iso(w.closeMs), "2027-03-26T00:00:00.000Z");
assert.equal(iso(w.openMs), "2027-03-29T13:30:00.000Z");

// Monday holiday (MLK, 18 Jan 2027): close Friday 15 Jan, open Tuesday 19 Jan.
w = win(2027, 1, 12);
assert.equal(w.closeDay, "2027-01-15");
assert.equal(w.openDay, "2027-01-19");
assert.equal(iso(w.openMs), "2027-01-19T14:30:00.000Z");

// Thanksgiving 2026 (Thu 26 Nov): a two day gap, Wed 25 close to Fri 27 open.
w = win(2026, 11, 17);
assert.equal(w.closeDay, "2026-11-20"); // the ordinary weekend comes first
w = nextWindow(etToUtcMs(2026, 11, 21, 12, 0));
assert.equal(w.closeDay, "2026-11-25");
assert.equal(w.openDay, "2026-11-27");

// A window already under way is skipped once its close has passed, and the next one is returned.
w = nextWindow(etToUtcMs(2026, 11, 7, 12, 0)); // Saturday, after the Friday close
assert.ok(w.closeMs > etToUtcMs(2026, 11, 7, 12, 0));
assert.equal(w.closeDay, "2026-11-13"); // next Friday

// July 2027: Monday 5 Jul is the observed holiday, so Friday 2 Jul close and Tuesday 6 Jul open.
w = win(2027, 6, 30);
assert.equal(w.closeDay, "2027-07-02");
assert.equal(w.openDay, "2027-07-06");

console.log("calendar tests passed");
