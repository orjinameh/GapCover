# Gap Cover: spec v1 (delivery A)

Hackathon: Base Stocks Maxxing Season, track Programmable Stock Markets. Deadline 2026-12-05 11:59 PM EST (Dec 6 04:59 UTC). Base Sepolia only. No mainnet, no real funds, no burner key ever in chat.

## 1. Day-0 spike result

| Check | Result |
|---|---|
| Foundry in sandbox | Works. forge 1.7.1 installed from npm (official installer host is blocked in the sandbox). |
| Solidity compile in sandbox | Works via solc-js 0.8.28 wrapper (native solc download is blocked). On your machine Foundry downloads native solc normally. |
| forge-std | v1.9.7, vendored as plain files in lib/forge-std (no submodule). |
| `forge test` on a scratch project | 2 tests pass. |
| Blocker | None. Fallback (rugless memestock) not triggered. |

Facts re-verified against current docs (not only the brief):

1. Raw vs UI: `balanceOfUI = balanceOf * uiMultiplier / 1e18`. Raw `balanceOf`, transfers and allowances stay raw. A stored 0 multiplier reads as 1e18. Source: docs.base.org/specifications/b20/concepts/multipliers.
2. Scheduled updates: `updateUIMultiplier(new, effectiveAt)`. At maturity nothing is emitted, reads just change. Detect a pending update with `effectiveAt() > block.timestamp`. Same source.
3. The Chainlink feed reports TOKEN price: Token Price = Underlying x Multiplier. So the feed is per raw token and continuous across a split. Source: docs.chain.link/data-feeds/tokenized-equity-feeds/coinbase.
4. Decimals of the token and of the feed are NOT stated. Docs only recommend 18 for equities. The contracts read `decimals()` from both at construction and never hard code them.
5. DISCREPANCY: Chainlink's page calls these "24/5" feeds (regular, pre, post, overnight sessions), holding the last close when markets are closed and with no off-hours heartbeats. The brief says "market hours only". Consequence: the cover period is whatever the calendar keeper configures (Friday last print to first print after the feed resumes). Nothing in the contracts assumes a particular schedule. You should still confirm the real resume time (see section 9).
6. Heartbeat and deviation thresholds (24h, 0.5%) come from the brief's Base docs transcription. The Chainlink page I could fetch does not repeat them. Treated as assumptions, exposed as parameters.
7. No testnet B20 or equity feed is documented. We ship mocks.

## 2. Scope and architecture

Contracts (Solidity 0.8.28, Foundry, no external deps, own minimal ERC-20 and safe transfer helpers, own reentrancy guard):

```
src/interfaces/IAggregatorV3.sol    Chainlink V3 read interface
src/interfaces/IB20Stock.sol        ERC-20 + multiplier API
src/CoverPool.sol                   one pool per ticker: underwriting, cover, settlement
src/mocks/MockB20.sol               B20-faithful token (raw/UI math, scheduled multiplier)
src/mocks/MockAggregator.sol        Chainlink V3 mock, proxy-style phased roundIds, getRoundData
src/mocks/MockUSDC.sol              6-decimals, public faucet mint with per-call cap
src/mocks/MockSpotMarket.sol        stand-in DEX: settable price per share, used only by the UI
src/mocks/MockSessionKeeper.sol     demo only: lets anyone schedule compressed sessions
script/Deploy.s.sol                 reads env var names only
test/*.t.sol
```

One pool per ticker, deployed separately, with the real token and feed addresses as constructor args. The same bytecode points at mainnet unchanged. A single contract owns underwriting, cover and settlement, because splitting them adds cross-contract trust and gas with no demo value.

Out of scope, unchanged from the brief: cover NFTs, secondary trading, dynamic pricing, KYC or geo gating (disclaimer only), tokens, agents.

## 3. Roles

| Role | Power | Cannot |
|---|---|---|
| Underwriter | deposit, withdraw when pool unlocked | touch cover terms |
| Holder | buy cover, claim | settle early |
| Anyone | closeSession, settle, voidSession | choose the price |
| Keeper | scheduleSession, cancel an unsold session | move funds, edit a session, change tiers or params |

Params and tiers are immutable after construction. There is no owner, no pause, no upgrade.

## 4. Session lifecycle

```
Scheduled --closeSession()--> Closed --settle(roundId)--> Settled
    |                            |
    +------voidSession()---------+--> Voided   (premiums refunded)
```

A session has `saleStart < closeTime - buyCutoff`, `closeTime`, `openTime > closeTime + lockWindow`. Only one non-terminal session per pool at a time.

Rules, in order of the timeline:

1. **Sale** (`saleStart` to `closeTime - buyCutoff`): `buyCover`. Refuses if the feed is stale (`updatedAt < now - refMaxAge`), `answer <= 0`, or the buyer's raw `balanceOf` is below the covered raw amount (insurable interest, see threat T9).
2. **Close** (`closeTime` to `closeTime + lockWindow`): anyone calls `closeSession`. It snapshots `refPrice` (latest round, must satisfy `updatedAt >= closeTime - refMaxAge` and `updatedAt < openTime`, `answer > 0`) and `multiplierAtClose = uiMultiplier()`. If nobody does it in the window the session can only be voided.
3. **Settle** (`now >= openTime`): anyone calls `settle(sessionId, roundId)`. The caller names the round. The contract accepts it only if:
   - `round.updatedAt >= openTime` and `round.updatedAt <= openTime + printWindow` (first FRESH print, bounded)
   - the previous round (`roundId - 1`) exists and has `updatedAt < openTime` and `updatedAt > 0` (so the named round is provably the FIRST print at or after open). Round ids whose aggregator part is 1 (phase change) are not provable and revert.
   - `answer > 0`, `answeredInRound >= roundId`
   - `uiMultiplier() == multiplierAtClose` and no pending update (`effectiveAt() <= now`)
   Otherwise it reverts with a named error. This is the refuse-if-frozen guard: a frozen feed cannot produce a round with `updatedAt >= openTime`, so settle cannot succeed against it.
4. **Void** (`voidSession`): allowed when (a) session never closed and `now > closeTime + lockWindow`, or (b) closed and `now > openTime + printWindow + voidGrace` with no settlement, or (c) closed and the multiplier changed or an update is pending after `openTime`. Voiding refunds every premium, releases the reserve, pays nobody a gap.

Why void and not "pay zero and keep premium" when no print arrives: absence of a print cannot be told apart from a frozen or paused feed. Docs say never settle on a frozen feed, so we refuse and refund. Cost: a quiet weekend with no print earns underwriters nothing. Mitigation: every deductible (>= 1%) sits above the 0.5% deviation threshold, so any gap worth paying forces a print at the open.

Multiplier handling: because the feed is per raw token, a split alone does not change the price comparison. We still void when the multiplier changes or is pending between close and settle, since the docs say the feed freezes until price and multiplier are both confirmed and total-return adjustments can make the comparison ambiguous. Conservative by design.

## 5. Payout math

All prices 8 decimals (read from the feed), asset 6 decimals (USDC), token decimals read at construction. WAD = 1e18.

```
notional      = rawAmount * answerAtBuy * 10^assetDec / 10^(tokenDec + feedDec)
maxPayout     = notional * capBps / 10_000
drop          = refPrice > settlePrice ? (refPrice - settlePrice) * WAD / refPrice : 0
excess        = drop > dedBps * WAD / 10_000 ? drop - dedBps * WAD / 10_000 : 0
payoutFrac    = min(excess, capBps * WAD / 10_000)
payout        = notional * payoutFrac / WAD          // rounds down, never above maxPayout
premium       = notional * premiumBps / 10_000       // rounds up
```

Excess-of-deductible (not franchise): you are paid only for the part of the drop beyond the deductible.

Premium tiers (flat, demo parameters, explicitly not actuarial):

| Tier | Deductible | Cap | Premium |
|---|---|---|---|
| 0 Light | 5% | 15% | 0.20% |
| 1 Standard | 2% | 10% | 0.60% |
| 2 Tight | 1% | 5% | 0.90% |

Worked demo: 10,000 USDC notional, Standard, 6% gap: premium 60, payout (6% - 2%) x 10,000 = 400. Covered wallet loses 600 on the position, gets 400 back, paid 60: net -260. Uncovered: -600.

## 6. Underwriter accounting

- Share vault, internal accounting (not an ERC-20). `shares = assets * (totalShares + 1e3) / (totalAssets + 1)` on deposit. The virtual offset blocks the first depositor inflation attack. Withdraw uses the inverse, rounded down.
- `totalAssets = asset.balanceOf(pool) - pendingClaims`.
- Premiums land in the pool at purchase, raising share price immediately. Payouts lower it at settle. Underwriter yield = share price change.
- Full collateralization: `buyCover` requires `reserved + maxPayout <= totalAssets`. Since payout <= maxPayout, the pool cannot become insolvent.
- Lock: `deposit` and `withdraw` revert while `reserved > 0` (covers outstanding in a non-terminal session). No late joiner takes premium without risk, no early leaver dodges a loss. Capital is free again after settle or void. Griefing by buying one tiny cover is bounded by the session length and blocked below `minNotional`.
- `maxCoversPerSession` (64) bounds the settle loop gas.
- Payout is pushed to each holder inside `settle` (this is the atomic payout shot). If a push fails, the amount goes to `claimable[holder]`, is excluded from `totalAssets`, and is withdrawn with `claim()`. One bad receiver cannot block settlement.

## 7. Interfaces (signatures the code and tests will follow)

```solidity
interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);
    function getRoundData(uint80 _roundId) external view returns (uint80, int256, uint256, uint256, uint80);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

interface IB20Stock /* is IERC20 */ {
    function decimals() external view returns (uint8);
    function uiMultiplier() external view returns (uint256);
    function multiplier() external view returns (uint256);
    function balanceOfUI(address) external view returns (uint256);
    function totalSupplyUI() external view returns (uint256);
    function toUIAmount(uint256 raw) external view returns (uint256);
    function fromUIAmount(uint256 ui) external view returns (uint256);
    function effectiveAt() external view returns (uint256);
}

contract CoverPool {
    enum Status { None, Scheduled, Closed, Settled, Voided }
    struct Tier { uint16 deductibleBps; uint16 capBps; uint16 premiumBps; }
    struct Params { uint32 refMaxAge; uint32 printWindow; uint32 voidGrace; uint32 buyCutoff;
                    uint32 lockWindow; uint16 maxCovers; uint128 minNotional; }

    constructor(IERC20 asset, IB20Stock stock, IAggregatorV3 feed, address keeper,
                Params memory p, Tier[] memory tiers);

    // keeper
    function scheduleSession(uint64 saleStart, uint64 closeTime, uint64 openTime) external returns (uint256 id);
    function cancelSession(uint256 id) external;            // only if no covers sold
    // underwriters
    function deposit(uint256 assets, address to) external returns (uint256 shares);
    function withdraw(uint256 shares, address to) external returns (uint256 assets);
    // holders
    function buyCover(uint256 id, uint256 rawAmount, uint8 tier) external returns (uint256 coverId);
    function claim() external returns (uint256 amount);
    // permissionless
    function closeSession(uint256 id) external;
    function settle(uint256 id, uint80 roundId) external;
    function voidSession(uint256 id) external;
    // views
    function totalAssets() external view returns (uint256);
    function sharePrice() external view returns (uint256);   // assets per share, WAD
    function locked() external view returns (bool);
    function previewPayout(uint256 id, uint256 coverId, uint256 settlePrice) external view returns (uint256);
}
```

Errors (named, all tested): `Reentrancy, BadConfig, NotKeeper, BadSchedule, SessionNotActive, SaleClosed, BadTier, ZeroAmount, ZeroShares, FeedFrozen, FeedStale, BadAnswer, NotHolder, BelowMinNotional, CapacityExceeded, TooManyCovers, PoolLocked, NotClosable, NotSettleable, PrintBeforeOpen, PrintTooLate, NotFirstPrint, RoundNotProvable, MultiplierChanged, NotVoidable, NothingToClaim, InsufficientShares`. A frozen feed at settle surfaces as `PrintBeforeOpen` (the named round predates the open). A frozen feed at purchase is `FeedFrozen`, a stale reference at close is `FeedStale`.

Implementation notes (built in delivery B, small deltas from the text above): `settle` is also refused after `openTime + printWindow + voidGrace`, so settle and void never overlap. Insurable interest is cumulative per holder per session. The close snapshot uses the latest print at call time (between close and close + lockWindow), not a historical round.

Mock deviations from the real thing, all flagged: mock aggregator pushRound is open to anyone on the demo deployment; MockB20 has an open `mint` and an open `scheduleUIMultiplier`; MockSessionKeeper lets anyone schedule compressed sessions. None of that exists in the pool.

## 8. Threat model

| # | Threat | Mitigation |
|---|---|---|
| T1 | Settle against a frozen feed | Round must have `updatedAt >= openTime`; frozen feed cannot qualify; void after grace |
| T2 | Settle against a late, intraday price instead of the open | Named round must be the first at or after open (previous round before open) and within `printWindow` |
| T3 | Stale reference price at close | `refMaxAge` bound, `updatedAt < openTime`, else void |
| T4 | Corporate action in the gap | Void on multiplier change or pending update; feed also freezes until confirmed |
| T5 | Insolvency | Full collateralization at purchase, immutable terms, lock during outstanding cover |
| T6 | First depositor inflation, rounding | Virtual share offset, round down on payout/withdraw, up on premium |
| T7 | Settle loop gas DoS, reverting receiver | Covers per session cap, push with fallback to `claimable` |
| T8 | Keeper abuse | Keeper only schedules future sessions, cannot edit, cannot touch funds; cancel only when unsold |
| T9 | Buying cover with no position (pure bet) | Requires raw `balanceOf >= rawAmount` at purchase. Weak: a flash loan or a transfer-out after purchase beats it. Documented limitation, acceptable for a testnet demo |
| T10 | Informed buying right before close | `buyCutoff` before close |
| T11 | Oracle manipulation by the feed itself | Out of scope, we trust Chainlink as docs instruct; staleness and freshness bounds only |
| T12 | Reentrancy | Trusted asset, still nonReentrant, checks-effects-interactions |
| T13 | Mock leaks into prod | Mocks live under src/mocks, Deploy script has a separate path for real addresses, pool has no mock hooks |
| T14 | Legal | Testnet only, disclaimer, no U.S. trading enablement, no claim of rights in any company, no KYC (disclaimer only) |

## 9. Open items for you (none block delivery B)

1. Confirm with the Base Telegram or Quest Page: judging weights, and whether any B20 token or equity feed exists on Base Sepolia. If one does, tell me the address and I wire it in.
2. Confirm the real off-hours window of the live feeds (24/5 vs market-hours only). Does not change the contracts.
3. I assumed token and feed decimals are read on-chain. Real decimals unverified.

## 10. Dashboard (delivery C), planned now so contracts expose what it needs

Next.js 15 App Router, React, strict TypeScript, viem only (no wagmi), plain CSS. Pages: Market (open/closed banner, buy cover), Underwrite (utilization, share price, yield), Simulator.

Simulator "run the weekend", on Base Sepolia with a compressed demo pool (windows of seconds, not days) via MockSessionKeeper:
1. Throwaway browser accounts A (covered) and B (uncovered) get mock tokens and USDC from the faucet functions. They need only a little Base Sepolia ETH for gas. Labeled throwaway, never your main wallet.
2. Schedule compressed session, A buys cover, close snapshot, DEX price falls, feed prints a 6% gap at open, `settle` pays A in the same tx.
3. Side by side: A (covered) vs B (uncovered), position value, payout, premium, net.

A local Anvil mode with time warp runs the same flow in seconds for development and the video's backup take.

## 11. Test matrix (delivery B)

Frozen feed refusal at buy, close and settle; gap below deductible pays 0; cap binds; excess math at boundaries; underwriter lock on deposit and withdraw; multiplier change voids; pending update voids; double settle reverts; settle too early and too late; wrong round (not first, before open, after printWindow, phase change); void paths a, b, c with refunds; reverting receiver goes to claimable; max covers; zero notional; capacity exceeded; first depositor inflation; full wipeout then redeposit; fuzz on payout <= maxPayout and on assets >= obligations; invariant: pool balance >= reserved + pendingClaims.

## 12. Build plan and gates

| Task | Gate command |
|---|---|
| B1 interfaces, mocks | `forge build` |
| B2 CoverPool | `forge test --match-contract CoverPoolCore` |
| B3 settlement and void | `forge test --match-contract CoverPoolSettle` |
| B4 fuzz and invariants | `forge test --match-contract Invariant` |
| C1 dashboard | `npm run build` in app/ |
| D1 deploy script | `forge script script/Deploy.s.sol` (dry run, no broadcast) |
| E1 submission pack | README sections present |

Note: I did not run the optional build-system manifest/orchestrator pipeline. Your A to E delivery order is the plan, and the table above carries the gate per task.

## 13. Design system (binding for all dashboard views)

Design guide set by Peter on Nov 8. Applies when the dashboard is built in delivery C; no UI code exists before then. Cinematic dark: bg #0B0B0C, text #F5F5F7, one neon accent (#C6FF3D) on exactly one micro element per viewport (the live dot). Three colors maximum.

- Layout: no card grids, no symmetric boxes. 27% / 73% split, edge-to-edge, padding `clamp(1.25rem, 4vw, 6rem)`, overlapping and absolutely positioned decorative type, 1px architectural wires as dividers.
- Type: hyper-scaled serif headlines (`clamp(4rem, 10vw, 14rem)`, line height 0.85, tight tracking), outline (text-stroke) display lines, 10px uppercase mono labels at 0.25em tracking and 60% opacity. System font stacks for now (no network font fetch in the build); swap in licensed faces later.
- Shadows: hard offsets only, or none. No blur.
- Motion: `cubic-bezier(0.16, 1, 0.3, 1)` at 700ms. Buttons are magnetic and mask-reveal their label from below. Honors `prefers-reduced-motion`.
- Plain CSS, no Tailwind, so there is no extra build dependency.
