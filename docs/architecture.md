# GapCover: architecture and limits (Phase 1 prototype)

Plain summary: people who hold tokenized stocks pay a small fee for protection against a big drop between the market close and the next open. Liquidity providers put in USDC that pays those claims and earn the fees. This is a Base Sepolia prototype. Everything in it is simulated.

## How one night works

1. **Start.** A session is scheduled with a sale window, a close time and an open time.
2. **Buy.** While the sale window is open (and before a short cut-off ahead of the close), a holder picks a protection level and an amount. The pool records the fee, reserves the maximum payout, and refuses the cover if reserved payouts would exceed the pool's assets.
3. **Close.** After the close time, anyone can close the session. It records the reference price (the last fresh price before the close) and the token's multiplier, so splits can be detected.
4. **Open and settle.** After the open time, anyone can settle with the price feed round that proves the first fresh price after the open. The pool pays every cover in the same transaction. If a transfer fails, the amount goes to a claimable balance instead.
5. **No price, or a company event.** If there is no fresh price within the window, or the stock's multiplier changed, anyone can void the session after a grace period. Fees are refunded.

Payout for one cover: the drop from the reference price to the settle price, minus the deductible, capped at the tier's cap, times the covered value.

## Protection levels (prototype values, not priced)

| Level | Holder takes first | We pay up to | Fee |
|---|---:|---:|---:|
| Light | 5% | 15% | 0.20% |
| Standard | 2% | 10% | 0.60% |
| Tight | 1% | 5% | 0.90% |

## Contracts

| Brief role | Where it lives today |
|---|---|
| CoverPool (capital, shares, deposits, withdrawals) | `CoverPool.sol` |
| CoverageManager (purchases, policy records) | `CoverPool.sol` (per-session cover list) |
| SettlementEngine (gap and payout maths) | `CoverPool.sol` (`settle`, `payoutOf`) |
| ClaimsManager (payout and fallback claims) | `CoverPool.sol` (`Payout`, `claimable`, `claim`) |
| SessionKeeper (scheduling) | `MockSessionKeeper` (anyone can schedule, testnet only) |
| Oracle | Chainlink-style feed interface, mock feed on testnet |

One contract on purpose: fewer moving parts to audit. Splitting it into several contracts is a Phase 3 and 4 decision, after the real feed and partner requirements are known.

## Liquidity provider accounting

- A deposit mints pool shares. Shares are accounting entries, not a new token.
- The share price rises when fees arrive and falls when claims are paid.
- Deposits and withdrawals are locked while a session has covers outstanding, so nobody can join late for the fees or leave early to avoid a loss.
- The pool is fully collateralized: reserved payouts never exceed assets.

## The website

- **Protect** (cover page): a scroll story that plays one example night, a "try another night" chart, and the buy flow.
- **Provide liquidity**: pool totals, a night-by-night history (fees earned, paid out, result), deposit and withdraw.
- **Demo**: plays a whole weekend in about 80 seconds with two practice accounts, one protected and one not.

The history panel reads the contract directly (`sessionCount`, `getSession`, `getCover`). It does not scan event logs, so it works on public RPCs that limit log ranges.

## What is simulated

- USDC, the stock token and the price feed are mock contracts.
- The price can be moved by anyone through the demo controls.
- The pool is seeded with 100,000 mock USDC from the deployer. It is not independent underwriting capital.
- Sessions are compressed to about 80 seconds.

## Known limits

- No per-customer or per-session value cap. One session can reserve the whole pool.
- Anyone holding tokens can buy a small cover and lock the pool until the session settles.
- Payouts are pushed in `settle`, with at most 32 covers per session. Real volume needs pull-based claims.
- Terms are fixed and there is no pause or guardian. The only emergency path is voiding a session.
- A holder could buy cover, then move the tokens out. Acceptable on testnet, not with real payouts.
- Per-provider earnings scan event logs in 9,000-block chunks from the deploy block. Fine on testnet, a subgraph is better at scale.
- Fees are prototype numbers. They must be backtested on real overnight and weekend gaps before any real launch.
- Not audited. No legal or regulatory review.

See `docs/launch-readiness.md` for the full checklist against the real-launch brief.
