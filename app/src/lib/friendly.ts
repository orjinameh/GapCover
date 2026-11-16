import { IS_BETA } from "./config";

/** Turns a failed transaction into one plain sentence. */
export function friendlyError(raw: string): string {
  const m = raw;
  if (/User rejected|denied/i.test(m)) return "Cancelled.";
  if (/missing or invalid|insufficient funds|exceeds the balance/i.test(m))
    return IS_BETA
      ? "This account has no ETH for network fees, or not enough USDC. Add a small amount of ETH on Base and try again."
      : "This account has no network fee money. Open Your account, copy the address and get free test ETH for Base Sepolia.";
  const rules: [RegExp, string][] = [
    [/SaleClosed/, "Protection is not on sale right now. Start a new night on the Demo page, then buy within 2 minutes."],
    [/SessionNotActive/, "This night is no longer open. Start a new night on the Demo page."],
    [/FeedFrozen/, "The practice price is out of date. On the Demo page, press Start a night. It refreshes the price first."],
    [/NotHolder/, IS_BETA ? "You don't hold enough of this stock token." : "You don't have enough stocks. Tap Get it free to add practice stocks."],
    [/BelowMinNotional/, "That is too small. The minimum is $50."],
    [/SequencerDown|SequencerGrace/, "The network is recovering from an outage, so protection is paused for a short while. Try again later."],
    [/PriceOutOfBounds/, "The price looks wrong, so this night will not pay out. If it stays that way, the night is cancelled and every fee is refunded."],
    [/DepositCapReached/, "The pool is full for now. This beta has a small limit on how much it can hold."],
    [/OneOffClosed/, "Single-night protection is closed. Protection is bought through a weekly subscription."],
    [/AlreadySubscribed/, "You already have a weekly subscription. Cancel it first to change it."],
    [/NotSubscribed/, "There is no running subscription on this account."],
    [/SalesPaused/, "New protection is paused for now. Try again later."],
    [/PoolUseLimit/, "Too much of the pool is already set aside for this night. Try a smaller amount, or come back next night."],
    [/HolderLimit/, "This is more than one account can protect in a single night. Try a smaller amount."],
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
