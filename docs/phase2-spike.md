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

### Backtest results (15 Nov 2026)

Source: Yahoo daily prices, Nov 2016 to Nov 2026, Friday-style close to the next open. NVDA, TSLA, AAPL and MSTR, 521 weekends each, 2,084 in total. Loss ratio = average payout / fee.

| Level (fee) | All four stocks, loss ratio | Break-even fee | Pays on | Worst 4 weekends in a row |
|---|---|---|---|---|
| Light (0.20%) | 0.46 | 0.092% | 2.4% of weekends | 34% of cover value |
| Standard (0.60%) | 0.38 | 0.230% | 10.5% | 36% |
| Tight (0.90%) | 0.36 | 0.327% | 20.6% | 20% |

The four-stock "worst 4 in a row" is the single worst weekend hitting all four stocks at once, since the files are merged by date.

By stock, Standard: loss ratio NVDA 0.37, TSLA 0.40, AAPL 0.15, MSTR 0.61. **A single year went above 1.00 (the pool lost money) for NVDA in 2020 (1.02), TSLA in 2020 (1.33) and MSTR in 2021, 2022, 2025 and 2026 (1.35, 1.48, 1.01, 1.12).** All four together never went above 0.85 (2020), so a shared pool is steadier than a pool per stock.

Biggest weekend drops: NVDA 14.7%, TSLA 14.9%, AAPL 13.0%, MSTR 27.4%. The cap is 10% on Standard, so the pool pays at most that.

Proposed Standard fee per stock, using average payout / 0.40 (the pooled 0.38 loss ratio, which leaves room for bad years and for people buying before expected bad news): **NVDA 0.55%, TSLA 0.60%, AAPL 0.23%, MSTR 0.92%.** For Light the same method gives 0.25%, 0.20%, 0.09%, 0.39%. For Tight: 0.75%, 0.94%, 0.40%, 1.18%.

Limits: price gaps only. Friday close to Monday open is close to, but not the same as, the real product's last Friday print to Monday 09:30 print. It does not model adverse selection (buying cover before news), costs, or weekends outside the 10 years. In the 12 real weekends on the feed, Standard on NVDA had a loss ratio of 1.18 because of one event, which fits the yearly picture above.

A fee of 0.6% per weekend is about 31% a year for someone who protects every weekend. Real buyers are likely to protect around events instead of every weekend, which is the adverse selection the backtest cannot see.

## Provider simulation

`app/scripts/pool-sim.mjs` replays the ten years of weekend price gaps as one shared pool and prints what a liquidity provider would have earned and suffered, for several fees, several limits on how much of the pool one night may use, and two buyer behaviours (random timing, and buyers who show up before bad weekends). It reports the yearly return, worst weekend, worst year, losing years, biggest fall and the longest wait to recover. It reuses the fee backtest's price files.

```
FILES=nvda.csv,tsla.csv,aapl.csv,mstr.csv node scripts/pool-sim.mjs > poolsim.log 2>&1
```

It assumes buyers always fill the chosen share of the pool, so real returns will be lower. Before any model change is built, the choices (a limit on pool use, a fee that follows risk, a shared pool) should be picked from this output.

### Provider simulation results (15 Nov 2026)

Four stocks (NVDA, TSLA, AAPL, MSTR) as one shared Standard pool, 521 weekends, Nov 2016 to Nov 2026. No gaps in the price files were skipped, so the data is clean. The worst weekends are real crashes: 5 Aug 2024 (NVDA 14%, TSLA 11%, AAPL 9%, MSTR 27%), 16 Mar 2020, 9 Mar 2020 and 7 Apr 2025. **Stocks gap together in a crash, so a shared pool does not protect against a market-wide crash. Only a limit on pool use does.**

| Fee | Pool used | Buyers random: yearly / worst weekend / worst year | Buyers show up before bad weekends: yearly / worst weekend / worst year |
|---|---|---|---|
| 0.60% | 10% | +20.9% / -8.5% / +3.6% | +11.6% / -9.4% / -7.4% |
| 0.60% | 25% | +59.4% / -21.2% / +6.7% | +29.6% / -23.5% / -21.9% |
| 0.40% | 10% | +9.0% / -8.7% / -6.3% | +0.6% / -9.6% / -16.6% |
| 0.40% | 25% | +23.1% / -21.7% / -17.8% | -0.1% / -24.0% / -39.9% |

The worst weekend is about 85% to 90% of the share of the pool one night may use, so the pool-use limit is the main dial. A 0.40% fee earns about nothing if buyers show up before bad weekends, so **keep Standard at 0.60%**. This supersedes the earlier fee proposal, which used average payouts only.

Recommendation: limit one night to 10% to 15% of the pool, keep the 0.60% Standard fee, add a per-person cap, a larger minimum cover and a pause switch, and put team or partner money in as first loss. Not tested: demand. A 0.60% weekly fee is about 31% a year for someone who protects every weekend.

### Level pricing results (15 Nov 2026)

Same four stocks, 521 weekends, 15% of the pool used per night. Yearly return to providers, buyers random / timing 1.5:

| Level | Fee | Yearly return | Worst weekend | Worst year | Recovery |
|---|---|---|---|---|---|
| Light | 0.20% | 5.7% / 3.5% | -8.4% / -10.8% | -5.3% / -12.7% | 2.3 / 4.0 yrs |
| Light | 0.30% | 11.3% / 9.0% | -8.3% / -10.7% | -0.2% / -8.1% | 1.2 / 2.7 yrs |
| Light | 0.40% | 17.2% / 14.8% | -8.2% / -10.6% | +2.4% / -3.1% | 0.8 / 1.4 yrs |
| Light | 0.50% | 23.5% / 20.9% | -8.1% / -10.5% | +3.0% / +2.0% | 0.5 / 1.1 yrs |
| Standard | 0.60% | 32.8% / 24.4% | -12.7% / -14.1% | +5.3% / -5.4% | 0.8 / 1.5 yrs |
| Tight | 0.50% | 29.4% / 9.3% | -13.5% | -18.9% / -44.5% | 1.7 / 5.0 yrs |
| Tight | 0.60% | 51.1% / 27.7% | -13.2% | -5.2% / -35.0% | 1.3 / 2.4 yrs |
| Tight | 0.70% | 76.3% / 49.2% | -12.9% | +10.8% / -23.9% | 0.8 / 1.7 yrs |
| Tight | 0.90% | 139.9% / 103.1% | -12.3% | +16.4% / +4.0% | 0.5 / 0.8 yrs |

Decisions: Light re-priced from 0.20% to **0.40%** (0.20% earned 3% to 6% a year with 2 to 4 year recoveries). Standard stays at 0.60%. **Tight is hidden in the app.** It pays out often (1% deductible, 5% cap, so each reserved dollar backs three times the notional), which gives large swings at a fee buyers would find poor value (1% deductible plus 0.9% fee), and at fees buyers would accept it hurts providers. It stays in the contract unchanged. Not tested: demand at these fees.
