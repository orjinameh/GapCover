/** Turns a failed transaction into one plain sentence. */
export function friendlyError(raw: string): string {
  const m = raw;
  if (/User rejected|denied/i.test(m)) return "Cancelled.";
  if (/missing or invalid|insufficient funds|exceeds the balance/i.test(m))
    return "This account has no network fee money. Open Your account, copy the address and get free test ETH for Base Sepolia.";
  const rules: [RegExp, string][] = [
    [/SaleClosed/, "Protection is not on sale right now. Start a new night on the Demo page, then buy within 2 minutes."],
    [/SessionNotActive/, "This night is no longer open. Start a new night on the Demo page."],
    [/FeedFrozen/, "The practice price is out of date. On the Demo page, press Start a night. It refreshes the price first."],
    [/NotHolder/, "You don't have enough stocks. Tap Get it free to add practice stocks."],
    [/BelowMinNotional/, "That is too small. The minimum is $10."],
    [/CapacityExceeded/, "The pool does not have enough money held ready to cover this. Try a smaller amount."],
    [/TooManyCovers/, "This night is full. Start a new one."],
    [/PoolLocked/, "The pool is locked while protection is active."],
    [/NotClosable/, "Too late to close this night. The 30-second window passed. Cancel it and start a new one."],
    [/NotSettleable/, "It is not time to open the market yet."],
    [/NotVoidable/, "This night can't be cancelled yet."],
  ];
  for (const [re, t] of rules) if (re.test(m)) return t;
  return m.split("\n")[0];
}
