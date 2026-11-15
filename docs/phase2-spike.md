# GapCover: Phase 2 spike (real stock token, real USDC, real price feed)

Date: 15 Nov 2026. Desk research from current Base and Chainlink docs. No code was run against a live network (the sandbox has no chain access), so everything on-chain below is **unverified until the read-only script in "Next steps" runs**.

## Measured on Base mainnet (probe runs, 15 Nov 2026)

Read-only calls against the real NVDA feed `0x04689a41629776563E6822F76f2e57D148d28513` and token `0xb20000000000000000000078ee7ce2fE4908108C`. 1,200 rounds, 19 Aug to 13 Nov: **12 weekends**.

| Item | Measured |
|---|---|
| Real USDC | 6 decimals |
| NVDAc token | 8 decimals (not the 18 Base's docs recommend), supply about 49,256 tokens, multiplier 1.000538, no pending update |
| Feed | 8 decimals, silent all weekend as documented, no zero or negative prints in 1,200 rounds |
| Typical update gap | median 21 minutes |
| Sequencer uptime feed | answered "up" (0) since 26 Jun, so the address in the probe looks right |
| First print after the weekend | at 20:00 ET (to the minute) in **all 12 weekends**. On the Labor Day weekend it came Monday 20:00 ET. |
| Last print before the weekend | between 11:17 and 16:39 ET on Fridays, not at the close. Weekends ran 2 days 5 hours to 3 days 6 hours. |

**The Nvidia weekend (6 to 9 Nov), from the feed:**

| Print | Price | Change vs Friday | Standard cover on $10,000 pays |
|---|---|---|---|
| Friday last print, 16:39 ET | $187.97 | | |
| First print after resume, Sun 20:00 ET | $183.03 | -2.62% | about $62 |
| First print from Mon 09:30 ET | $170.81 | **-9.13%** | about **$713** |

The price kept falling through Sunday night and pre-market. Settling on the Sunday print would have caught under a tenth of the payout. **The Protect page's Nvidia example says "opened about 5% lower" and "closed Friday at $186.64". The feed shows about -9.1% by the Monday 09:30 print and a last Friday print of $187.97.** The 5% came from news reports. The feed prices the token, including early trading, so the two can differ. The page needs a decision (see below).

**Across all 12 weekends (Standard cover, $60 fee per $10,000 each weekend, $720 in total):**

| Settle on | Weekends that pay | Total paid out |
|---|---|---|
| Sunday 20:00 ET print | 1 of 12 | $62 |
| Monday 09:30 ET print | 2 of 12 | $850 (one weekend is $713 of it) |

On the Monday rule, this sample pays out more than the fees collected. One event dominates, and 12 weekends is a small sample, so this is a warning and not a conclusion. Prices rose in most weekends, which pay nothing.

**What the data settles:** the worry that the first print might not arrive after the resume is mostly gone, since all 12 weekends printed at 20:00 ET. A weekend's Friday reference print can be hours before the close, but the feed only skips prints for moves under 0.5%, so the reference error is small next to a 2% deductible. The resume time moves on holidays, so the keeper needs a market calendar.

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

## Decisions made (15 Nov 2026)

1. **Settle on the Monday regular open.** A night's open is the first regular session after the weekend, 09:30 ET, moved to the next trading day after a holiday. The settle price is the first feed print at or after that time. The pool already settles on "first print after the open time", so this is how the keeper sets `openTime`, not a contract change. The close is Friday 20:00 ET, when the feed goes silent, and the reference price is the last print before it.
2. **Fees must be re-priced for this rule.** In 12 real weekends, a Standard cover ($60 per $10,000) would have paid out $850 against $720 of fees, because of one event. Phase 3 pricing starts from that.
3. **The Protect page's Nvidia example uses the feed's numbers:** $187.97 on Friday and $170.81 at Monday 09:30 ET, 9.1% lower. The net result is the same -$260.

## Decisions that were open

1. **What counts as the open.** (The measured Nvidia weekend above makes this the most important decision: the two candidates pay about $62 versus about $713.) The feed resumes Sunday 20:00 ET with a smoothed overnight value, not at the Monday 09:30 open. A drop like the Nvidia case (news on Sunday, lower open on Monday) may only be partly in the Sunday print. Options: settle on the first print after Sunday 20:00 (simple, but smoothed), or on the first print after Monday 09:30 (matches what traders call the open, but the cover then spans Sunday night trading). This changes who wins and loses, so it is a product decision, not just a technical one.
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

## Fork test against real USDC and the real feed

`test/ForkReal.t.sol` runs the real pool against real USDC and the real NVDA feed on a Base mainnet fork. It checks the 8-decimal scaling, that the fee and maximum payout match independent maths, that real USDC moves exactly the fee, and that closing a night snapshots the real price and multiplier. It sends nothing to the real chain.

**The real NVDAc token cannot run inside Foundry.** Its code uses an instruction Foundry's engine does not know (`OpcodeNotFound`, found on 15 Nov 2026), so a local fork fails on the first call to it, although Base itself runs it. The test uses a stand-in token with the values the read-only probe measured on the real one: 8 decimals, multiplier 1.000537939576369481, no pending update. The real token's behaviour is therefore verified by the probe (RPC reads), not by the fork test. Anything that depends on the real token's transfer rules, policies or pause behaviour needs another way to test, for example the Base team's tooling or a small test on a live network.

```
BASE_RPC=https://mainnet.base.org forge test --match-path test/ForkReal.t.sol -vv > fork.log 2>&1
```

Without `BASE_RPC` the tests return without running. Settlement against real prints is covered by the replay below.

## Replay of the real Nvidia weekend

`test/ForkReplay.t.sol` reads the feed's real old rounds (6 to 9 Nov 2026), moves time with `vm.warp`, buys $10,000 of Standard cover at the real Friday price, closes at the Friday shutdown and settles with the real round id. The pool proves the print is the first one itself. It runs the same weekend under both settlement rules: the Monday 09:30 ET open (expected about $713) and the Sunday 20:00 ET resume (expected about $62). It also checks each payout against separate maths.

```
BASE_RPC=https://mainnet.base.org forge test --match-path test/ForkReplay.t.sol -vv > replay.log 2>&1
```

Same stand-in token as above. Only the purchase and the close read "the latest round", so those two are pointed at the real Friday round with a mock call. Settlement uses no mock.

**Result (15 Nov 2026, both tests pass):** Friday last print $187.97. Settling on the Monday 09:30 ET print ($170.81) paid **$712.69** on a $10,000 Standard cover, against $60.00 of fees. Settling on the Sunday 20:00 ET resume print ($183.03) paid **$62.46**. Both match the separate maths within $2, and the pool accepted the real round ids as the first print after the open.

## Fee backtest

`app/scripts/fee-backtest.mjs` runs the three protection levels over years of real weekend price gaps (previous close to next open, any gap of 3+ days). It reports, per level: how often it pays, the average payout, the loss ratio (paid / fees), the fee that would break even, the fee that would leave a 30% margin, the worst four weekends in a row, and the result by year. It reads daily price files you download (Date, Open, Close columns; Yahoo, Stooq and Nasdaq formats work).

```
FILES=nvda.csv,tsla.csv node scripts/fee-backtest.mjs > backtest.log 2>&1
```

It uses price gaps only. It does not model people buying cover when they expect bad news, partner costs, or weekends missing from the file.
