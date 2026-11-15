# GapCover: Phase 2 spike (real stock token, real USDC, real price feed)

Date: 15 Nov 2026. Desk research from current Base and Chainlink docs. No code was run against a live network (the sandbox has no chain access), so everything on-chain below is **unverified until the read-only script in "Next steps" runs**.

## Verdict

A real version looks feasible, and the pool's design already matches the real feed's shape. Three things need a decision before building: which price print settles a night, how to treat the overnight smoothing, and where to test, because the feeds are documented for Base mainnet only.

## What exists today

| Piece | Finding | Source |
|---|---|---|
| Tokenized stocks | Coinbase issues B20 stock tokens natively on Base. The feed list covers AAPL, AMZN, GOOGL, META, MSFT, MSTR, NVDA, SNDK, SPCX and TSLA. Token addresses are not on the docs page. They come from the Base assets page or the registry API. Registry: `0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD`. | Base docs |
| Who can hold them | Holding and secondary trading are permissionless. KYC happens only at mint and redeem. Tokens are only available to persons in eligible jurisdictions **outside the U.S.** Onchain policies can block addresses and functions can be paused. | Base docs |
| Price feed | Chainlink 24/5 feeds, standard `latestRoundData()` through a proxy. They publish the **token** price (underlying price x multiplier). Feed decimals are 8. | Chainlink docs |
| Feed behaviour | Sessions (ET): pre 04:00-09:30, regular 09:30-16:00, post 16:00-20:00, overnight 20:00-04:00, weekend Fri 20:00 to Sun 20:00. No updates, not even heartbeats, while markets are closed. Overnight price is an exponential moving average. Overnight answers can be odd, including zero. Chainlink's feed table (read by you on 15 Nov) lists the NVDA feed with **0.5% deviation, 86,400 s (24 h) heartbeat, 8 decimals**, and marks it **"High risk"** in Chainlink's own market-risk rating. | Chainlink docs |
| Networks | Base **mainnet** only is named. Nothing for Base Sepolia. | Chainlink docs |
| USDC | Base mainnet `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Base Sepolia `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. Decimals not stated on the page, expected 6, to be read on-chain. | Circle docs |
| Splits and dividends | Applied through a multiplier. Raw `balanceOf` does not change. When an action happens, the feed freezes and resumes only after both the price and multiplier update. | Base and Chainlink docs |

## Fit against the pool

| Pool expects | Real world | Fit |
|---|---|---|
| Feed gives the token price, 8 decimals read on-chain | Feed publishes token price | Good. Notional is raw balance x feed price, so the multiplier is not counted twice. |
| `uiMultiplier()` and `effectiveAt()` on the stock token | Documented on B20 | Good. Void on a multiplier change already works this way. |
| `answer > 0` | Overnight feed can report zero | Good. A zero answer is rejected. |
| First fresh print after open settles the night | Feed is silent over the weekend and resumes at the first print | Works, but see decision 1. |
| Staleness bound `refMaxAge` | 24 h heartbeat, so a quiet price can go a full day without a new print | The 1 day on testnet is the right order, but a price can be exactly that old and still be correct. Needs care with the buy-time check. |
| First fresh print after open arrives within `printWindow` (120 s on testnet) | A feed only updates on a 0.5% move or the 24 h heartbeat | At risk. If the price stays within 0.5% after the resume, no print arrives in a short window and the night voids (fees refunded). The probe measures how often this happens. |
| Pays out USDC only | USDC can blacklist or pause addresses | Already handled: a failed payout falls back to a claimable balance. |
| Pool never holds the stock | Policies can block addresses | Good. The pool only reads holders' balances. |

## Decisions needed

1. **What counts as the open.** The feed resumes Sunday 20:00 ET with a smoothed overnight value, not at the Monday 09:30 open. A drop like the Nvidia case (news on Sunday, lower open on Monday) may only be partly in the Sunday print. Options: settle on the first print after Sunday 20:00 (simple, but smoothed), or on the first print after Monday 09:30 (matches what traders call the open, but the cover then spans Sunday night trading). This changes who wins and loses, so it is a product decision, not just a technical one.
2. **Overnight cover.** Weekdays have no clean overnight gap in a 24/5 feed. The overnight session trades and is smoothed. The clean, honest product today is the **weekend gap**, Friday 20:00 to Sunday 20:00 ET. A weekday overnight product needs the same decision as above and more careful pricing.
3. **Where to test.** With no Base Sepolia feed documented, the options are a mainnet fork (free, no real money), a read-only script against mainnet, and a separate small mock of the real feed's quirks (zeros, silence, freezes).
4. **Eligibility.** The tokens are for people outside the U.S. The footer already says "Not for U.S. residents", but a real launch needs a real jurisdiction check. That is a legal question.

## Pool changes this implies (Phase 3 scope, listed here so nothing is a surprise)

- Check the L2 sequencer uptime feed before accepting a sale or a settle print.
- A sanity bound between reference and settle price, to reject a bad print.
- Set `refMaxAge`, `printWindow` and `voidGrace` from the real feed's measured behaviour.
- A deliberate rule for the settle print (decision 1).

## Next steps that need no real money

1. Run a **read-only script against Base mainnet**: for the NVDA feed and token, print `decimals()`, `latestRoundData()` age, round-to-round gaps across a weekend, and the multiplier. This replaces every "expected" above with a measured value. It needs a machine with network access, so it runs in your Codespace, with the output redirected to a file.
2. Fork test the pool against the real USDC and a real B20 token on a mainnet fork.
3. Use the measured gaps to backtest fee levels (Phase 3 pricing).

## What this spike could not confirm

- The feed address table did not load from the Chainlink page, so the NVDA feed address is still to be copied from it.
- Token addresses, and whether a testnet token or feed exists, are unconfirmed.
- Whether smart contracts are allowed to hold these tokens is not addressed in the docs. The pool does not need to hold them, but a launch partner may ask.
- Real decimals of the token, and the actual (not documented) update behaviour right after the weekend resume.
