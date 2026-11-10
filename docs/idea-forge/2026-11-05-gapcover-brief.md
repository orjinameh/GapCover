# Idea Forge Brief: Gap Cover, parametric weekend-gap protection for tokenized stocks on Base

Working title "Gap Cover" is provisional. This brief is the single source of truth for the architect (Step 1). It fixes what and why, not how. Full field, gate, scores and pressure-test are in `2026-11-05-gapcover-forge-log.md`.

## Event and constraints

- **Hackathon:** Stocks Maxxing Season (Base), https://www.base.org/stocksmaxxing, Rules https://www.base.org/stocksmaxxing/rules
- **Dates:** applications open Nov 5, partner brainstorm Nov 6 to 13, build and launch Nov 13 to Dec 5, submission closes Dec 5, 2026, 11:59pm EST (per the application form). Inert calendar fact, not gated on by idea-forge.
- **Submission requirements (Rules):** a public X post with a video demo tagging @buildonbase; the Submission Form with the X post link and Track(s); built on or meaningfully integrating with Base; original work (pre-existing code allowed if the form states what was built in the period). One submission per track. Testnet submissions are not judged less favorably.
- **Team:** builder + autonomous agent pool. Skills: Solidity + Foundry, TypeScript / Next.js / React. Risk: novel-wow.
- **Scoring:** kit default rubric (buildability 35, demo 25, fit 20, novelty 20) after the buildability gate and a head-to-head against prior art. Gap Cover also wins under idea-heavy weights.

## Problem

Coinbase tokenized stocks on Base trade 24/7, but the Chainlink reference feeds update only during market hours and hold the last value off-hours. Every holder carries an unpriced, unhedged gap into each market open (weekends, overnight, earnings), and no on-chain instrument lets them hedge it. The same risk silently hurts LPs and lenders. Base's own docs warn never to settle or liquidate against a frozen feed, but offer no product that prices the gap.

## Solution (one line)

A parametric on-chain cover: holders buy protection before the close, underwriters earn premiums, and anyone can settle at the next open for a payout computed from the last in-session feed price versus the first fresh post-open feed price, with a refuse-if-frozen guard.

## Must-have demo features

1. **Cover pool contracts (Solidity / Foundry):** per-ticker pool, session windows, buy cover (notional, deductible tier, cap), underwriter deposit and withdraw with a lock through the session, flat tier premium from on-chain parameters, permissionless `settle()` that uses the first round with `updatedAt` at or after the session open, reverts on a frozen or stale feed, and is multiplier-aware.
2. **B20-faithful mocks on Base Sepolia:** mock stock token (ERC-20 plus `uiMultiplier()`, `balanceOfUI`, `toUIAmount`, `fromUIAmount`) and a Chainlink V3 interface mock aggregator, with real token and feed addresses as constructor arguments so the same contracts point at mainnet unchanged.
3. **Next.js dashboard with weekend simulator:** market-open/closed banner, buy cover, pool utilization and underwriter yield, one-click "run the weekend" that drives the mock feed and a mock DEX price, then shows the covered wallet and an uncovered wallet side by side after the atomic payout.

## Target track

**Programmable Stock Markets** (structured products, financing tools, market infrastructure). One track, to keep the build deep. Meme and Agentic are not targeted.

## Judging criteria (published)

Not published in any page reachable. The Rules say submissions are scored against the Quest Page criteria, weighted equally unless the Quest Page sets weights, and the Quest Page text carries none. The architect and demo plan should assume equal weights over: works end to end on Base, use of what is unique to tokenized stocks, novelty and usefulness, demo clarity. Builder to confirm on the Quest Page or in a partner Telegram group.

## Why it wins

White space: unlike the stock-paired launchpads (Stonks Exchange, BaseStonk, o1, feel.cash), Bitwise and Glider rebalancing, Aave and Superform collateral and earn, Virtuals agents holding equities, or the Solana xStocks winners (xPrime, Stretch, xStream), none found prices the gap between a 24/7 token and a feed frozen off-hours. Head-to-head edge: on **use of tokenized-stock-specific properties**, ours exists only because of documented B20 and feed behavior; on **demo clarity**, one atomic payout from two feed prints with a side-by-side wallet beats a mocked UI. Limit: this rests on one bounded search pass, not an exhaustive one. Verify during the Nov 6 to 13 partner week that no partner already ships gap protection.

## Demo money shot

Friday close: a holder buys cover on an NVDA-style position. Press "run the weekend": the mock DEX price falls, the feed prints a 6% gap at the open, `settle()` fires, and the covered wallet receives its payout in the same transaction while the uncovered wallet shows the full loss. About 15 seconds.

## Out of scope (explicit)

- Anything that enables trading for U.S. users (out of scope per the application form conditions), mainnet deployment, real funds, real B20 minting, KYC or geo-gating (disclaimer only).
- Actuarial pricing beyond flat tier parameters, dynamic pricing, secondary cover trading.
- Upside options, shorting, cross-asset or multi-leg products, leverage.
- Launching a token, agents, memestock features, partner integrations beyond optional notes.
- Legal claims of any kind about the instrument; no claims of rights in any underlying company.

## Feasibility notes for the architect (primitives, not design)

Transcribed from Base docs (https://docs.base.org/specifications/b20/tokenized-stocks-on-base, https://docs.base.org/sdks/tokenized-stocks/overview):

- Tokenized stocks are B20 tokens: native precompiles, no per-asset bytecode, ERC-20 compatible; identify by address, not ticker.
- Multiplier API: `uiMultiplier()` (WAD, 1e18), `balanceOfUI(account)`, `totalSupplyUI()`, `toUIAmount(raw)`, `fromUIAmount(ui)`, `multiplier()`, `scaledBalanceOf()`. Scheduled updates via `updateUIMultiplier`, cancellation via `cancelUIMultiplierUpdate`.
- Policies: `isAuthorized(policyID, account)` never reverts, call `policyExists(policyId)` first; `approve()` is not policy-gated; blocked transfers revert; `transferWithMemo` available.
- Price: Token Price = Underlying Price x Multiplier. Chainlink V3 aggregator via proxy `latestRoundData()`, 8 decimals, total-return values, updates on 0.5% deviation or 24h heartbeat during market hours, holds last value off-hours with `updatedAt` frozen. Docs: never settle or liquidate against a frozen feed; apply staleness bounds. On corporate actions the feed freezes until Coinbase confirms both price and multiplier.
- Base mainnet feed proxies: AAPL `0x787f13dEa48Db0897CbCDD985de77809D837F988`, AMZN `0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295`, GOOGL `0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2`, META `0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D`, MSFT `0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c`, MSTR `0xB3cE282CD188b35DA0E38D8Bc7d58e33173D202a`, NVDA `0x04689a41629776563E6822F76f2e57D148d28513`, SNDK `0x388b0dC46C0Fb05A74BeE0994fa5b02c6Fcca2eA`, SPCX `0x6A634B235903C4ad6376892180d6fF8612e3Fa68`, TSLA `0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4`. The docs list an onchain registry at `0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD` but do not confirm it is the oracle registry: verify.
- Coinbase Tokenized Stocks API: `https://api.coinbase.com/v1/tokenized-stocks`, no auth, read-only: `GET /`, `/chains`, `/total-supply/{contract_address}`, `/metadata/{ticker}`, `/prospectus/{ticker}`, `/corporate-actions/{id}`. Reference data only, no trading.
- Eligibility: non-US jurisdictions only. Docs conflict on whitelisting (body says no whitelisted wallets, disclaimer allows it): verify.
- Testnet: B20 tokens and equity feeds are not documented on Base Sepolia, and a local fork likely cannot emulate precompiles (unverified). Therefore build against interface-faithful mocks on Base Sepolia.
- **One external dependency to request on day 1:** ask the Base builder channel and partner Telegram groups whether any B20 token or equity feed exists on Base Sepolia, and what the Quest Page judging weights are. Not blocking, since mocks cover the demo.

## Architect kickoff block (paste into a NEW fresh session at tier top, effort xhigh)

```
SESSION SETTINGS: tier top · effort xhigh, or high for a one-task plan-bug fix
(references/model-routing.md §Seat settings). Start by stating the exact model id you are running
as. If it is below this campaign's top-tier binding, warn me and wait for my go before anything
else. (In an autopilot dispatch, just state it, the autopilot logs drift.)

You are the ARCHITECT for this build. Load and follow architect/SKILL.md (and its references/).
Do not write product code. Your only deliverables are: an approved spec, executor-ready plan
documents, docs/superpowers/manifest.json, and the pre-filled docs/gates/submission-draft.md
(build-time facts marked TBD-post-build).

PROJECT: On-chain parametric cover that pays tokenized-stock holders for the gap between the last in-session and first post-open Chainlink prices, with a refuse-if-frozen guard

REPO: <owner>/gap-cover (create via your logged-in gh per references/repo-bootstrap.md; not yet created)

DOCS: docs/idea-forge/2026-11-05-gapcover-brief.md, docs/idea-forge/2026-11-05-gapcover-forge-log.md, https://www.base.org/stocksmaxxing, https://www.base.org/stocksmaxxing/rules

CONSTRAINTS: Base Sepolia, Solidity + Foundry, TypeScript / Next.js / React, hard deadline 2026-12-05 11:59pm EST, team = builder + AI. Target track: Programmable Stock Markets. Must land the demo money shot (weekend simulator, atomic payout, covered vs uncovered wallet). Out of scope: mainnet, real funds, real B20 minting, KYC or geo-gating, dynamic pricing, secondary cover trading, upside options, shorting, token launch, agents, memestock features.

EXECUTION TARGET: built in Claude Code by the orchestrator, the main session dispatches a fresh
subagent per task (orchestrator/SKILL.md). Every task must be self-contained per
references/task-contract.md, paste upstream signatures into each task, declare Provides/Requires, and
give exactly one gate command per task. Hand off at the reviewed plan + manifest (the default,
omit the manifest only when the build has no deploy/key/fund tasks) and the
orchestrator builds it. (For an external multi-account pool instead, stop at the manifest for a kernel.)
```
