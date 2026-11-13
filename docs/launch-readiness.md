# GapCover: launch readiness and gap analysis

Reviewed against the real-launch development brief (Nov 2026). Based on reading `src/CoverPool.sol`, `docs/spec.md`, the dashboard components and the deploy script. Tests were not run for this review.

## Status against the launch-readiness checklist

| Requirement | Status | Notes |
|---|---|---|
| Real USDC integration | Not started | Pool takes any 6-decimal ERC-20 by constructor arg, so this is a deployment change. Check the real token's blacklist and pause behaviour against `SafeTransfer.trySend`. |
| Supported tokenized stock | Not started | Pool expects the B20 interface (`uiMultiplier`, `effectiveAt`). A real token must match it or needs an adapter. |
| Validated equity price feed | Not started | Settlement proves "first print after open" using Chainlink round ids. Spec section 1 notes the real feeds are 24/5 with unverified heartbeats and decimals. Needs a spike against a live feed. |
| Verified session and settlement rules | Partly | Logic is thorough and tested on mocks. The real keeper does not exist; `MockSessionKeeper` lets anyone schedule. |
| Real underwriting commitments | None | Pool is seeded with 100,000 mock USDC from the deployer. |
| Premium collection and payouts | Working on testnet | Premium accrues to share price at purchase. Payouts are pushed in `settle` with a `claimable` fallback. |
| Solvency and exposure limits | Partly | See below. |
| Independent audit | Not started | |
| Legal and regulatory review | Not started | Footer disclaimers are not a substitute. |
| Risk disclosures | Improved in this patch | Still needs legal review before real money. |
| Monitoring and incident response | Not started | |

## Contract gaps against section 6 of the brief

| Brief requirement | Current behaviour | Gap |
|---|---|---|
| Max exposure per stock | One pool per ticker, so reserved is bounded by that pool's assets | Fine if each pool holds only its own capital. Needs an explicit cap if pools ever share capital. |
| Max exposure per session | `reserved + maxPayout <= totalAssets` and `maxCovers` (a count, not a value) | No value cap below total assets. One session can reserve 100% of the pool. |
| Max exposure per customer | None | Add a per-holder cap on max payout per session. |
| Solvency checks | Enforced at purchase | Good. |
| Oracle freshness | `refMaxAge` at purchase and close | Good. No deviation or sanity bound between reference and settle price, and no secondary source. |
| Manipulated or stale prices | First-print proof, print window, frozen feed refuses | Single feed trusted by design (threat T11). |
| Emergency handling | Void and refund after grace | Terms are immutable with no pause or guardian. A bad config or a broken feed cannot be paused. Decide deliberately: a minimal guardian that can only stop new sales, never touch funds, is common. |

## Underwriting design issues worth fixing before real capital

1. **Whole-pool lock can be triggered cheaply.** `locked()` is true whenever any cover exists in the active session. Anyone holding tokens can buy one 10 USDC-notional cover and freeze all deposits and withdrawals until settlement. Consider a minimum meaningful notional, or per-depositor withdrawal queues instead of a global lock.
2. **Payout loop is push-based and capped at 32 covers per session.** Fine for a demo. For real volume, move to pull-based claims (the `ClaimsManager` role in the brief), which also removes the settle gas ceiling.
3. **A quiet weekend with no print voids the session and refunds premiums**, so underwriters earn nothing for carrying risk (spec section 4). Pricing must account for this.
4. **Insurable-interest check is weak** (threat T9): a holder can buy cover and move tokens out. Acceptable on testnet, a real exposure for paid claims.
5. **Premiums are not validated.** Tier parameters are prototype values. Backtest historical overnight and weekend gaps for the chosen stock before setting them.
6. **Spec says "weekend gap"; the brief says "overnight".** The contract is schedule-agnostic, so both work, but the product must define exactly which sessions are covered.

## Underwrite dashboard gaps against section 5

Present: pool assets, reserved share, share price, return since start, own position, deposit, withdraw all.

Missing: premiums earned, claims paid, history of pool performance (needs event indexing from `CoverBought`, `SessionSettled`, `Payout`, `SessionVoided`), partial withdrawal, and available versus reserved capital in dollars.

## Underwriter partners

Insur, Nexus Mutual and Symbiotic are exploration targets only. None has agreed to anything. Their eligibility, risk appetite, legal terms and integration paths are unconfirmed. Do not state otherwise anywhere in the product or submission.

## Suggested order of work

1. Phase 1 (hackathon): copy and transparency changes (this patch), then the Underwrite history panel.
2. Phase 2: live-feed spike (decimals, heartbeat, off-hours behaviour), real USDC and token compatibility tests on a fork, real keeper.
3. Contract hardening: per-customer and per-session value caps, minimum cover size, pull-based claims, decision on a guardian.
4. Pricing backtest, then partner outreach with real numbers.
5. Audit, legal review, then a capped single-stock mainnet launch.
