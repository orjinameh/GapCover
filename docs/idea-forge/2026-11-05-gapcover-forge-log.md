# Idea Forge Log: Base Stocks Maxxing Season

Intermediate artifact. The deliverable is the brief (`2026-11-05-gapcover-brief.md`). This log keeps the full field, gate, scores, head-to-head and pressure-test so nothing is cut.

Run settings: model `claude-sonnet-5-5` (below the kit's `top` tier, proceeded on the builder's explicit go). Risk appetite `novel-wow`. Tracks `open`. Skills: Solidity + Foundry, TypeScript / Next.js / React. Capacity: autonomous agent pool + builder.

## Step 1 inputs, confirmed

1. Hackathon: Stocks Maxxing Season, https://www.base.org/stocksmaxxing (Rules: https://www.base.org/stocksmaxxing/rules)
2. Tracks: open (Meme and Community Economies, Agentic Stock Finance, Programmable Stock Markets)
3. Capacity: autonomous multi-agent pool + builder
4. Skills: Solidity + Foundry, TypeScript / Next.js / React
5. Risk: novel-wow
6. Prior art: one bounded search pass, results below

## Weights used

The kit's default rubric weights, unchanged: Intrinsic buildability 35, Demo WOW + story 25, Theme + track fit 20, Novelty 20. The builder stressed that the idea matters most; that is already how the kit works, since the buildability gate knocks out weak or un-demoable ideas, the head-to-head against prior art decides the winner, and novelty and fit feed the score. An earlier draft of this log wrongly treated that emphasis as a reweighting; it has been corrected. For transparency the table also shows an idea-heavy sensitivity column (novelty 35, fit 35, build 20, demo 10). The winner is the same under both.

Published judging criteria: not retrievable. The Rules page says submissions are scored against the Quest Page criteria, weighted equally unless the Quest Page sets weights, and the Quest Page text carries no criteria. Confirm on the Quest Page or in a partner Telegram group.

## Prior art (one bounded pass, links verified by fetch)

| Project / category | What it does | Source |
|---|---|---|
| Stonks Exchange | Memecoin launchpad, each coin paired with tokenized stocks, creator fees buy stocks for holders, Aerodrome Slipstream pools | https://www.thestonks.exchange/ |
| BaseStonk | Non-custodial launchpad, tokens paired with equities, Uniswap v4 pools with creator hooks and fees | https://basestonk.io/ |
| o1 Exchange, feel.cash, InstinctsMRKT | Launchpads and memestocks (holders earn stock, stock-paired memes) | https://www.kucoin.com/news/insight/NVDA/6ac736c538a2640007931fea |
| Bitwise ATPs + Glider | Rules-based rebalanced stock portfolios, 0.15% fee | https://niteagent.com/blog/ai-agents-tokenized-equities-2026 |
| Virtuals | Agents hold tokenized equities in their own wallets | same |
| Aave, Superform | Stocks as collateral, earn strategies | https://blog.base.org/tokenized-stocks, https://hackernoon.com/superform-activates-earn-strategies-for-tokenized-stocks-on-base-powered-by-aave |
| xStocks Hackathon (Solana) winners | xPrime (prime brokerage), Stretch (single-equity structured payoffs), xStream (automation) | https://capwolf.com/tokenized-equities-hackathon-reveals-on-chain-future-beyond-simple-tracking/ |
| Gaps named by sources | No agent-side check of multiplier accuracy or staleness; frozen-feed liquidation risk; compromised agent key | niteagent link above |

Honest limit: absence from a one-pass search is not proof that nothing exists. The brief flags this and asks to verify during the Nov 6 to 13 partner week.

## Facts that shaped feasibility (from Base docs)

- Coinbase tokenized stocks are B20 tokens, native precompiles (no per-asset bytecode), ERC-20 compatible, trade 24/7.
- Chainlink V3 feeds per stock update on a 0.5% deviation or 24h heartbeat **during market hours only**, then hold the last value off-hours (`updatedAt` stops). Docs warn: never settle or liquidate against a frozen feed.
- Corporate actions run through a multiplier (`uiMultiplier()`), feed freezes until multiplier and price are both updated.
- Testnet deployments of the B20 tokens or feeds are not documented. Local forks probably cannot emulate precompiles (unverified).
- Availability is limited to eligible non-US jurisdictions.

The core insight: tokens trade all weekend while the reference feed is frozen, so holders carry an unhedged and unpriced gap into every market open. This is a property unique to 24/7 tokenized equities.

## Step 2: Diverge (full field, unranked)

Seeds crossed: tokenization/RWA, wealth for all, AI agents and KYA, agent payments, privacy, prediction markets, staked media, spec is law, plus Base-specific facts above.

| ID | Track | Candidate: problem, solution, demo moment |
|---|---|---|
| C1 | Prog | **Gap Cover.** Holders carry unpriced weekend and overnight gap risk. A parametric cover pays out from the difference between the last in-session and first post-open feed prints. Demo: weekend drop, open print, payout lands atomically. |
| C2 | Prog | **Shadow Price oracle.** Feeds freeze off-hours while tokens trade. A DEX-derived 24/7 reference with a confidence band. Demo: frozen feed vs moving shadow price. |
| C3 | Agent | **Multiplier Sentinel.** Nobody verifies multiplier updates. A watchdog agent attests and pauses integrators. Demo: bad multiplier flagged. |
| C4 | Prog | **Dividend streamer.** Multiplier bumps are invisible cash. Convert them into a USDC stream. Demo: multiplier bump becomes a stream. |
| C5 | Meme | **Memestock Index Court.** Community-voted basket of memestocks. Demo: vote reweights basket. |
| C6 | Meme | **Earnings Bingo pools.** Community pools on earnings outcomes. Demo: pool settles on result. |
| C7 | Agent | **Staked Analysts.** Analysts or agents stake behind stock calls, slashed by feed outcome. Demo: slash on a wrong call. |
| C8 | Agent | **Copy-trade vault.** Followers mirror a leader with caps. Demo: leader trade mirrors. |
| C9 | Prog | **Pairs and short synthetics.** Long NVDA / short AMD tokens. Demo: spread token moves. |
| C10 | Prog | **Stock credit line.** Borrow USDC against stock tokens. Demo: borrow, repay. |
| C11 | Prog | **Close-price prediction market.** Binary markets on stock closes settled by Chainlink. Demo: settle. |
| C12 | Prog | **Private portfolio.** Confidential positions via ZK. Demo: hidden balance proves a claim. |
| C13 | Prog | **Stock salary streams.** Pay contractors in a streaming basket. Demo: stream accrues. |
| C14 | Agent | **x402 DCA agent.** An agent buys on schedule and pays per signal. Demo: pay-per-call buy. |
| C15 | Meme | **Rugless memestock.** Memecoin with a stock-basket treasury and burn-to-redeem NAV floor. Demo: price dumps, holder burns and redeems the basket. |
| C16 | Meme | **Memestock baskets.** Index of memestocks. Demo: basket mint. |
| C17 | Agent | **Earnings-call agent.** Reads filings and auto-hedges. Demo: hedge fires post-call. |
| C18 | Prog | **Hours-aware LP hook.** Uniswap v4 hook widens fees when the feed is stale and spot deviates. Demo: naive LP vs hooked LP at the open. |
| C20 | Agent | **Agent research market.** Pay agents per report via x402. Demo: unlock on payment. |
| C21 | Meme | **Tip in stock.** Tip creators in tokenized stock. Demo: tip lands. |
| C22 | Agent / Meme | **Optimistic agent trades with community veto.** An agent proposes, members have a window to veto. Demo: live veto cancels a trade. |
| C23 | Prog | **Structured note.** Principal-protected note on one stock. Demo: payoff curve settles. |
| C24 | Prog | **Prime brokerage lite.** Cross-margin on stock tokens. Demo: margin call. |
| C25 | Meme | **Shareholder poll.** Holdings-weighted polls on company matters. |

### Bolder-pass (8 most generic rewritten; both versions kept in the field)

| ID | From | Bolder rewrite |
|---|---|---|
| B5 | C5 | Index where constituents auto-eject when pool price drifts below NAV backing, keeper paid a bounty. Demo: ejection fires live. |
| B8 | C8 | Leader posts a bond that absorbs follower losses first. Demo: loss hits the bond before followers. |
| B10 | C10 | Lending whose LTV tightens on a schedule toward market close and refuses to liquidate on a frozen feed. Demo: LTV steps down Friday. |
| B13 | C13 | Payday basket with one-tap rage-quit back to USDC at last close NAV. |
| B14 | C14 | Agent that funds its own research from DCA yield and shows the P&L. |
| B16 | C16 | Index rebalanced by anyone for a keeper bounty, rules on-chain. |
| B20 | C20 | Research bounty: post a question, agents compete, escrow pays the answer that the feed outcome supports. |
| B21 | C21 | Tip in stock claimable by X handle, unclaimed tips return after 7 days. |

## Step 3a: Buildability gate (knockouts, never scored)

| ID | Why out |
|---|---|
| C3 | Money shot needs a real corporate-action multiplier event on mainnet, which the builder cannot trigger. |
| C6 | Event-outcome pools: gambling and prediction-market licensing exposure the Rules explicitly flag. |
| C9 | Synthetic shorts: regulated derivative exposure, plus needs liquid price venue the builder does not control. |
| C11 | Prediction market: Rules flag prediction-market licensing; real settlement rides on live markets. |
| C12 | ZK proving stack is outside the declared skill set (Solidity, TypeScript). |
| C17 | Needs live filings data and paid LLM and data access with no controlled demo path. |
| C25 | Rules forbid claiming shareholder rights the tokens do not provide. |

Budget note: no budget was locked, but every survivor below runs on free tiers, public RPC and testnet.

Surviving field: 25 scored candidates (17 from C-series, 8 bolder rewrites).

## Step 3b: White-space and weighted score

Novelty was set from the prior-art table, not taste: launchpad and memestock variants score low (saturated, five live launchpads), copy-trade, lending and index ideas score low (Bitwise, Aave, Virtuals, xStocks winners), and ideas keyed to the 24/7 vs market-hours property score higher because no Base project turned up in the pass.

| Rank | ID | Candidate | Novelty | Fit | Build | Demo | Score (kit weights 20/20/35/25) | Score (idea-heavy 35/35/20/10) |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| 1 | C1 | Gap Cover | 4 | 5 | 4 | 4 | 420 | 435 |
| 2 | C15 | Rugless memestock | 2 | 5 | 5 | 4 | 415 | 385 |
| 3 | C22 | Optimistic agent trades + veto | 2 | 5 | 4 | 5 | 405 | 375 |
| 4 | B10 | Time-aware LTV lending | 3 | 5 | 4 | 4 | 400 | 400 |
| 5 | B8 | First-loss copy vault | 3 | 4 | 4 | 4 | 380 | 365 |
| 6 | C4 | Dividend streamer | 3 | 3 | 5 | 3 | 370 | 340 |
| 7 | C18 | Hours-aware LP hook | 4 | 5 | 3 | 3 | 360 | 405 |
| 8 | B5 | Auto-eject memestock index | 3 | 3 | 4 | 4 | 360 | 330 |
| 9 | C7 | Staked Analysts | 3 | 4 | 4 | 3 | 355 | 355 |
| 10 | B16 | Keeper-rebalanced index | 3 | 4 | 4 | 3 | 355 | 355 |
| 11 | C2 | Shadow Price oracle | 4 | 4 | 4 | 2 | 350 | 380 |
| 12 | C13 | Stock salary streams | 2 | 3 | 5 | 3 | 350 | 305 |
| 13 | B14 | Self-funding research agent | 3 | 4 | 3 | 4 | 345 | 345 |
| 14 | C8 | Copy-trade vault | 2 | 4 | 4 | 3 | 335 | 320 |
| 15 | C10 | Stock credit line | 2 | 4 | 4 | 3 | 335 | 320 |
| 16 | C23 | Structured note | 2 | 4 | 4 | 3 | 335 | 320 |
| 17 | B13 | Payday basket with rage-quit | 3 | 3 | 4 | 3 | 335 | 320 |
| 18 | C21 | Tip in stock | 1 | 3 | 5 | 3 | 330 | 270 |
| 19 | B21 | Tip in stock via X claim | 1 | 3 | 5 | 3 | 330 | 270 |
| 20 | C5 | Memestock Index Court | 2 | 3 | 4 | 3 | 315 | 285 |
| 21 | C16 | Memestock baskets | 2 | 4 | 4 | 2 | 310 | 310 |
| 22 | B20 | Research bounty market | 3 | 3 | 3 | 3 | 300 | 300 |
| 23 | C14 | x402 DCA agent | 2 | 3 | 3 | 3 | 280 | 265 |
| 24 | C20 | Agent research market | 2 | 3 | 3 | 2 | 255 | 255 |
| 25 | C24 | Prime brokerage lite | 1 | 4 | 2 | 3 | 245 | 245 |

C15 and C22 were scored Novelty 2 after the head-to-head (Step 3c): both are incremental against shipped prior art, and the skill feeds that verdict back into Novelty.

## Step 3c: Judge's-eye head-to-head (top 3 by raw score, run before the final ranking)

Decisive criteria are inferred (the Quest Page criteria were unreachable): works end to end on Base, uses what is unique to tokenized stocks, novelty and usefulness, demo clarity.

| Candidate | vs strongest prior art | Verdict |
|---|---|---|
| C1 Gap Cover | vs Stretch (generic single-equity payoffs) and Aave/Superform (collateral and earn). Wins on **uses what is unique to tokenized stocks**: the risk exists only because tokens trade 24/7 against a feed frozen off-hours. Wins on **demo clarity**: one atomic payout derived from two feed prints, with a covered and an uncovered wallet side by side. Ties on Base integration depth. No clear loss found. | Advances |
| C15 Rugless memestock | vs Stonks Exchange, feel.cash, o1 (launchpads that route fees to stock). Edge: verifiable burn-to-redeem floor. Loses on novelty: backed-floor tokens exist in general DeFi, and the Meme track is the most crowded. Fund-like structure adds compliance exposure. | Runner-up |
| C22 Optimistic veto | vs Safe delay modules and Virtuals agents. Wins on demo (live veto). Loses on novelty, since optimistic delay with veto is a known pattern. | Third |

## Step 3d: Pressure-test top 3 for hidden blockers

**C1 Gap Cover**
- Feed cadence: the feed updates only on 0.5% deviation or the 24h heartbeat during market hours, so the "open print" is not guaranteed at open. Resolution: settle on the first round with `updatedAt` at or after the session open, with a bounded settle window and a refuse-if-frozen guard (matches the docs' own warning). Not a blocker.
- Testnet: B20 tokens and the equity feeds are not documented on Base Sepolia, and a local fork likely cannot emulate precompiles. Resolution: ship B20-faithful mock tokens and Chainlink-interface mock feeds on Base Sepolia, with real addresses as constructor arguments so the same contracts point at mainnet. Builder controls everything. Not a blocker. Day-1 item: ask the Base and partner groups whether any B20 or feed exists on Sepolia.
- Underwriter capital: handled with a self-funded demo pool; no outside liquidity needed.
- Legal: the cover is a derivative-like instrument. Rules say compliance is the team's responsibility. Mitigation: testnet only, no real funds, clear disclaimers. Shared by every Programmable-track idea.
- Verdict: no uncontrollable blocker. Buildability stays 4.

**C15** needs no external dependency, but carries the highest legal and novelty risk. Score stands.

**C22** needs a scripted agent and a scripted or pre-recorded veto, both controllable. Score stands.

## Step 3e: Sensitivity

After the head-to-head feedback, Gap Cover wins under the kit weights (420 vs 415 for C15) and under the idea-heavy weights (435 vs 385). Before the feedback, C15 led on the kit weights (435 vs 420) on a Novelty score of 3; it dropped because Stonks Exchange, feel.cash and o1 already route stock to memecoin holders, so burn-to-redeem is an incremental wedge. The margin over C15 under the kit weights is only 5 points, so C15 remains the fallback if partner feedback shows the Meme track is the better fit.

## Step 4: Commit

Winner: **C1 Gap Cover**. See `2026-11-05-gapcover-brief.md`.
