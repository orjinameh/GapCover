// US market calendar for the keeper. Pure functions, no network.
// Holidays: NYSE Group's published 2026, 2027 and 2028 calendar (full-day closures only).
// Add 2029 and later before then. The keeper refuses to run past the last year listed.
//
// A "window" is one stretch with no trading, at least two calendar days long (a weekend, or a weekend plus a
// holiday, or a midweek holiday). Cover is bought before it and settled after it:
//   closeTime = 20:00 ET on the last trading day before the gap (when the 24/5 feed goes quiet)
//   openTime  = 09:30 ET on the first trading day after the gap (the regular open)
export const HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19", "2028-07-04", "2028-09-04", "2028-11-23", "2028-12-25",
]);
export const LAST_YEAR = 2028;

const ET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
});

/** Wall-clock date and time in New York for a UTC millisecond timestamp. */
export function wallInEt(ms) {
  const o = {};
  for (const p of ET.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, m: o.month, d: o.day, h: o.hour, mi: o.minute };
}

/** UTC milliseconds for a New York wall-clock time (handles the clock change). */
export function etToUtcMs(y, m, d, h, mi) {
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let utc = wall;
  for (let i = 0; i < 3; i++) {
    const w = wallInEt(utc);
    utc += wall - Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi);
  }
  return utc;
}

const pad = (n) => String(n).padStart(2, "0");
const key = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export function isTradingDay(y, m, d) {
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !HOLIDAYS.has(key(y, m, d));
}

/** Calendar day arithmetic on a {y,m,d} object. */
function addDays({ y, m, d }, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/**
 * The next no-trading window whose close is still in the future of `afterMs`.
 * Returns { closeMs, openMs, closeDay, openDay } with times in UTC milliseconds.
 */
export function nextWindow(afterMs) {
  let day = wallInEt(afterMs);
  day = addDays({ y: day.y, m: day.m, d: day.d }, -7); // start a week back so a window already under way is found
  for (let guard = 0; guard < 400; guard++) {
    if (day.y > LAST_YEAR) throw new Error(`Holiday list ends in ${LAST_YEAR}. Add the next years to calendar.mjs.`);
    if (isTradingDay(day.y, day.m, day.d)) {
      let next = addDays(day, 1);
      while (!isTradingDay(next.y, next.m, next.d)) {
        next = addDays(next, 1);
        if (next.y > LAST_YEAR + 1) throw new Error("Holiday list too short.");
      }
      const gapDays = Math.round((Date.UTC(next.y, next.m - 1, next.d) - Date.UTC(day.y, day.m - 1, day.d)) / 86_400_000);
      if (gapDays >= 2) {
        const closeMs = etToUtcMs(day.y, day.m, day.d, 20, 0);
        const openMs = etToUtcMs(next.y, next.m, next.d, 9, 30);
        if (closeMs > afterMs) return { closeMs, openMs, closeDay: key(day.y, day.m, day.d), openDay: key(next.y, next.m, next.d) };
      }
      day = next;
    } else {
      day = addDays(day, 1);
    }
  }
  throw new Error("No window found.");
}
