# GapCover: launch readiness and gap analysis

Last updated 16 Nov 2026. Reflects the contract, app and scripts as built. All 123 Foundry tests pass; the 7 fork tests need a Base RPC and were run separately. Nothing here is audited.

## Status against the launch-readiness checklist

| Requirement | Status | Notes |
|---|---|---|
| Real USDC integration | Fork-tested | Works with real Base USDC on a mainnet fork (`test/ForkReal.t.sol`). Still to do: the real token's blacklist and pause behaviour against `SafeTransfer.trySend`. |
| Supported tokenized stock | Partly | NVDAc (`0xb200…108C`) is live on Base, 8 decimals, with `uiMultiplier`. It cannot run inside Foundry (unsupported opcode), so tests use a stand-in. The constructor accepted it in a fork dry run of the mainnet deploy. Its own functions are only exercised on real Base. |
| Validated equity price feed | Spiked, replayed, bounded | 12 weekends measured (`docs/phase2-spike.md`). The real Nvidia weekend replays correctly. A sequencer uptime check (with a grace period) and a suspect-price floor at settle are in the contract and tested on mocks. Still a single feed, trusted by design. |
| Verified session and settlement rules | Built | A weekly keeper script with a tested NYSE holiday calendar (`docs/keeper.md`). Not yet run against a live pool. The Chainlink feed's behaviour on holidays is assumed. |
| Real underwriting commitments | None | The practice pool is seeded with mock USDC. A mainnet beta would be seeded by the team, under a deposit cap. |
| Premium collection and payouts | Working on testnet | Fees accrue to the gGAP price. Payouts are pushed in `settle` with a `claimable` fallback. |
| Solvency and exposure limits | Built, tested | See below. |
| Independent audit | Not started | |
| Legal and regulatory review | Not started | It looks like insurance in some places, and the stock token is a regulated security issued in Abu Dhabi. |
| Risk disclosures | In the app | Home, Protect, Earn and How it works state the worst case. Needs legal review before real money. |
| Monitoring and incident response | Not started | The keeper logs to a file and has no alerting. |

## Contract gaps against section 6 of the brief

| Brief requirement | Current behaviour | Status |
|---|---|---|
| Max exposure per stock | One pool per ticker | Fine while each pool holds only its own capital. |
| Max exposure per session | `maxUseBps`: one night may reserve at most that share of the pool (15% in the demo and beta) | Done. The simulation's worst weekend scales with it (about 13% to 14% at 15%). |
| Max exposure per customer | `maxHolderBps`: one wallet at most 5% of the pool per night | Done. |
| Solvency checks | Enforced at purchase | Good. |
| Oracle freshness | `refMaxAge` at purchase and close; sequencer check | Done. |
| Manipulated or stale prices | First-print proof, print window, frozen feed refuses, settle price floor | Done for glitch prints. A genuine crash over 50% would be refunded, not paid (a deliberate trade-off). |
| Emergency handling | Void and refund after grace; `setSalesPaused` (keeper only) stops new sales, never touches money | Done. One wallet holds it. A multisig is better. |
| Deposit limits | `depositCap` (0 = none) | Done. |

## Design issues, and where they stand

1. **Whole-pool lock can be triggered cheaply.** Partly fixed: the minimum cover is $50 (was $10). The lock is still global. Per-depositor queues remain an option.
2. **Payout loop is push-based, 100 covers per night.** Raised from 32 after a gas test (test/Capacity.t.sol: 150 covers settle and void in one transaction). A bigger night needs pull-based claims. In the beta, one-off buying is closed so only subscribers use the slots.
3. **A quiet weekend with no print voids the night**, so providers earn nothing for carrying risk. Pricing assumes this is rare. Not measured.
4. **Insurable interest is now checked at payout.** A cover pays only for the stock the wallet still holds when the night settles (a holder who moved half of it away gets half; all of it, nothing). Still not airtight: a wallet could sell after the open print and before settlement, and settlement normally lands within minutes of the open.
5. **Prices.** Backtested on ten years of weekends for four stocks (`docs/phase2-spike.md`). Light is 0.40%, Standard 0.60%, Tight is hidden. Demand at these prices is untested.
6. **Adverse selection.** Buyers who show up only before bad weekends cut provider returns from about 24% to 28% to about 18% a year in the simulation. Weekly subscriptions with a two-night wait and a notice on cancelling are the answer; one-off buying is closed with `subscriptionOnly` (on in the mainnet script, off on the practice network because the Demo simulator needs it).
7. **gGAP is an ERC-20.** Shares are transferable, also while the pool is locked. A market price can drift from the pool value around a risky weekend.

## Underwriter partners

Insur, Nexus Mutual and Symbiotic are exploration targets only. None has agreed to anything. Their eligibility, risk appetite, legal terms and integration paths are unconfirmed. Do not state otherwise anywhere in the product or submission.

## What is still open before real users

1. Audit and legal review.
2. Run the keeper against a live pool for several weekends, including one holiday.
3. Pull-based claims (design issue 2). The insurable-interest check at payout is done.
4. Monitoring, and a multisig for the keeper and pause role.
5. Demand: nobody has yet shown they will pay about 0.6% a weekend, every weekend.
6. The first real night on Base mainnet must be tiny and watched by hand, because the real token cannot be tested locally.
