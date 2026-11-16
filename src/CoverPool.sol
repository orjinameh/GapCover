// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "./interfaces/IERC20.sol";
import {IB20Stock} from "./interfaces/IB20Stock.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {SafeTransfer} from "./libs/SafeTransfer.sol";

/// @title CoverPool
/// @notice Parametric cover for the off-hours gap of one tokenized stock. One pool per ticker.
/// Holders buy cover before the close. At the next open anyone settles from the last in-session
/// feed price against the first fresh post-open feed price. A frozen feed cannot settle.
/// Terms are immutable. There is no owner, pause or upgrade. TESTNET ONLY, not audited.
/// The pool shares are a standard ERC-20 token (gGAP): minted on deposit, burned on withdrawal, freely
/// transferable. Its price is the pool's assets divided by the supply, so fees raise it and payouts lower it.
contract CoverPool {
    using SafeTransfer for IERC20;

    enum Status { None, Scheduled, Closed, Settled, Voided }

    struct Tier {
        uint16 deductibleBps;
        uint16 capBps;
        uint16 premiumBps;
    }

    struct Params {
        uint32 refMaxAge; // max age of the reference or purchase price
        uint32 printWindow; // first post-open print must land within this after open
        uint32 voidGrace; // after printWindow, how long settle stays possible before anyone can void
        uint32 buyCutoff; // sales stop this long before close
        uint32 lockWindow; // closeSession allowed from close until close + lockWindow
        uint16 maxCovers; // covers per session, bounds the settle loop
        uint128 minNotional; // in asset units
        uint16 maxUseBps; // most of the pool one night may reserve for payouts, 10_000 = no limit
        uint16 maxHolderBps; // most of the pool one wallet may reserve for payouts in one night, 10_000 = no limit
        bool subscriptionOnly; // true: cover can only be bought through subscriptions (renewMany), buyCover is closed
        uint128 depositCap; // deposits stop when the pool's assets would exceed this (asset units). 0 = no cap
        address sequencerFeed; // Chainlink L2 sequencer uptime feed. address(0) = no check
        uint32 sequencerGrace; // after the sequencer comes back, wait this long before trusting prices
        uint16 minSettleBps; // a settle price below this share of the close price is refused as suspect. 0 = no bound
    }

    struct Session {
        uint64 saleStart;
        uint64 closeTime;
        uint64 openTime;
        Status status;
        uint32 coverCount;
        uint128 reserved; // sum of max payouts
        uint128 premiums;
        uint256 refPrice;
        uint256 settlePrice;
        uint256 multiplierAtClose;
    }

    struct Cover {
        address holder;
        uint8 tier;
        uint128 notional;
        uint128 premium;
        uint128 maxPayout;
    }

    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS_TO_WAD = 1e14;
    uint256 internal constant VIRTUAL_SHARES = 1e3;
    uint8 internal constant VOID_NEVER_CLOSED = 1;
    uint8 internal constant VOID_NO_PRINT = 2;
    uint8 internal constant VOID_MULTIPLIER = 3;

    IERC20 public immutable asset;
    IB20Stock public immutable stock;
    IAggregatorV3 public immutable feed;
    address public immutable keeper;
    uint8 public immutable assetDecimals;
    uint8 public immutable tokenDecimals;
    uint8 public immutable feedDecimals;
    uint256 internal immutable notionalMul;
    uint256 internal immutable notionalDiv;

    Params internal p;
    Tier[] public tiers;

    mapping(uint256 => Session) internal sessions;
    mapping(uint256 => Cover[]) internal covers;
    mapping(uint256 => mapping(address => uint256)) public coveredRaw;
    struct CoverRef {
        uint64 sessionId;
        uint32 coverId;
    }
    mapping(address => CoverRef[]) internal holderCovers;
    uint256 public sessionCount;
    uint256 public activeSession; // id of the non terminal session, 0 if none

    mapping(uint256 => mapping(address => uint256)) public holderReserved; // session => wallet => reserved payout
    bool public salesPaused; // stops new cover only. Deposits, withdrawals, settlement and refunds never stop.

    mapping(address => uint256) public shares; // ERC-20 balances
    uint256 public totalShares; // ERC-20 total supply
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public claimable;
    uint256 public pendingClaims;

    uint256 private _lock = 1;

    event SessionScheduled(uint256 indexed id, uint64 saleStart, uint64 closeTime, uint64 openTime);
    event SessionCancelled(uint256 indexed id);
    event CoverBought(uint256 indexed id, uint256 indexed coverId, address indexed holder, uint8 tier, uint256 rawAmount, uint256 notional, uint256 premium, uint256 maxPayout);
    event SessionClosed(uint256 indexed id, uint256 refPrice, uint256 multiplier);
    event SessionSettled(uint256 indexed id, uint80 roundId, uint256 refPrice, uint256 settlePrice, uint256 totalPayout);
    event SessionVoided(uint256 indexed id, uint8 reason);
    event Payout(uint256 indexed id, uint256 indexed coverId, address indexed holder, uint256 amount);
    event PayoutDeferred(address indexed holder, uint256 amount);
    event Claimed(address indexed holder, uint256 amount);
    event Deposited(address indexed from, address indexed to, uint256 assets, uint256 shares);
    event SalesPausedSet(bool paused);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Withdrawn(address indexed owner, address indexed to, uint256 assets, uint256 shares);

    error Reentrancy();
    error BadConfig();
    error NotKeeper();
    error BadSchedule();
    error SessionNotActive();
    error SaleClosed();
    error BadTier();
    error ZeroAmount();
    error ZeroShares();
    error FeedFrozen();
    error FeedStale();
    error BadAnswer();
    error NotHolder();
    error BelowMinNotional();
    error CapacityExceeded();
    error TooManyCovers();
    error PoolLocked();
    error NotClosable();
    error NotSettleable();
    error PrintBeforeOpen();
    error PrintTooLate();
    error NotFirstPrint();
    error RoundNotProvable();
    error MultiplierChanged();
    error NotVoidable();
    error NothingToClaim();
    error InsufficientShares();
    error InsufficientAllowance();
    error SalesPaused();
    error PoolUseLimit();
    error HolderLimit();
    error BadRecipient();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(IERC20 asset_, IB20Stock stock_, IAggregatorV3 feed_, address keeper_, Params memory params, Tier[] memory tiers_) {
        if (address(asset_) == address(0) || address(stock_) == address(0) || address(feed_) == address(0)) revert BadConfig();
        if (params.minSettleBps > 10_000) revert BadConfig();
        if (params.maxCovers == 0 || params.printWindow == 0 || params.refMaxAge == 0) revert BadConfig();
        if (params.maxUseBps == 0 || params.maxUseBps > 10_000 || params.maxHolderBps == 0 || params.maxHolderBps > 10_000) revert BadConfig();
        if (tiers_.length == 0 || tiers_.length > 8) revert BadConfig();
        for (uint256 i; i < tiers_.length; ++i) {
            Tier memory t = tiers_[i];
            if (t.capBps == 0 || t.capBps > 10_000 || t.premiumBps == 0 || t.premiumBps > 10_000 || t.deductibleBps > 10_000) revert BadConfig();
            tiers.push(t);
        }
        asset = asset_;
        stock = stock_;
        feed = feed_;
        keeper = keeper_;
        p = params;
        uint8 ad = asset_.decimals();
        uint8 td = stock_.decimals();
        uint8 fd = feed_.decimals();
        if (uint256(td) + fd > 60 || ad > 36) revert BadConfig();
        assetDecimals = ad;
        tokenDecimals = td;
        feedDecimals = fd;
        uint256 sum = uint256(td) + fd;
        if (sum >= ad) {
            notionalMul = 1;
            notionalDiv = 10 ** (sum - ad);
        } else {
            notionalMul = 10 ** (ad - sum);
            notionalDiv = 1;
        }
    }

    // ------------------------------------------------------------------ keeper

    function scheduleSession(uint64 saleStart, uint64 closeTime, uint64 openTime) external returns (uint256 id) {
        if (msg.sender != keeper) revert NotKeeper();
        if (activeSession != 0) revert BadSchedule();
        if (saleStart < block.timestamp) revert BadSchedule();
        if (uint256(closeTime) <= uint256(saleStart) + p.buyCutoff) revert BadSchedule();
        if (uint256(openTime) <= uint256(closeTime) + p.lockWindow) revert BadSchedule();
        id = ++sessionCount;
        sessions[id] = Session({
            saleStart: saleStart,
            closeTime: closeTime,
            openTime: openTime,
            status: Status.Scheduled,
            coverCount: 0,
            reserved: 0,
            premiums: 0,
            refPrice: 0,
            settlePrice: 0,
            multiplierAtClose: 0
        });
        activeSession = id;
        emit SessionScheduled(id, saleStart, closeTime, openTime);
    }

    /// The keeper can stop NEW cover from being sold. It cannot touch money, block withdrawals or block settlement.
    function setSalesPaused(bool paused) external {
        if (msg.sender != keeper) revert NotKeeper();
        salesPaused = paused;
        emit SalesPausedSet(paused);
    }

    function cancelSession(uint256 id) external {
        if (msg.sender != keeper) revert NotKeeper();
        Session storage s = sessions[id];
        if (s.status != Status.Scheduled || s.coverCount != 0) revert SessionNotActive();
        s.status = Status.Voided;
        activeSession = 0;
        emit SessionCancelled(id);
    }

    // ------------------------------------------------------------- underwriters

    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this)) - pendingClaims;
    }

    function locked() public view returns (bool) {
        uint256 a = activeSession;
        return a != 0 && sessions[a].reserved > 0;
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        return (assets * (totalShares + VIRTUAL_SHARES)) / (totalAssets() + 1);
    }

    function convertToAssets(uint256 shares_) public view returns (uint256) {
        return (shares_ * (totalAssets() + 1)) / (totalShares + VIRTUAL_SHARES);
    }

    /// Assets per share, WAD scaled, 1e18 before any gain or loss.
    function sharePrice() external view returns (uint256) {
        return ((totalAssets() + 1) * VIRTUAL_SHARES * WAD) / (totalShares + VIRTUAL_SHARES);
    }

    // ----------------------------------------------------- gGAP token (ERC-20)

    function name() external pure returns (string memory) { return "GapCover liquidity share"; }
    function symbol() external pure returns (string memory) { return "gGAP"; }
    /// Three more decimals than the asset, because shares start at 1000 per smallest asset unit.
    function decimals() external view returns (uint8) { return assetDecimals + 3; }
    function totalSupply() external view returns (uint256) { return totalShares; }
    function balanceOf(address a) external view returns (uint256) { return shares[a]; }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            if (a < value) revert InsufficientAllowance();
            allowance[from][msg.sender] = a - value;
        }
        _move(from, to, value);
        return true;
    }

    /// Moving shares is allowed while the pool is locked. Only deposit and withdraw wait for the lock.
    function _move(address from, address to, uint256 value) internal {
        if (to == address(0)) revert BadRecipient();
        if (shares[from] < value) revert InsufficientShares();
        shares[from] -= value;
        shares[to] += value;
        emit Transfer(from, to, value);
    }

    function deposit(uint256 assets, address to) external nonReentrant returns (uint256 minted) {
        if (locked()) revert PoolLocked();
        if (assets == 0) revert ZeroAmount();
        if (p.depositCap != 0 && totalAssets() + assets > p.depositCap) revert DepositCapReached();
        minted = convertToShares(assets);
        if (minted == 0) revert ZeroShares();
        shares[to] += minted;
        totalShares += minted;
        emit Transfer(address(0), to, minted);
        asset.safeTransferFrom(msg.sender, address(this), assets);
        emit Deposited(msg.sender, to, assets, minted);
    }

    function withdraw(uint256 shares_, address to) external nonReentrant returns (uint256 assets) {
        if (locked()) revert PoolLocked();
        if (shares_ == 0) revert ZeroAmount();
        if (shares[msg.sender] < shares_) revert InsufficientShares();
        assets = convertToAssets(shares_);
        shares[msg.sender] -= shares_;
        totalShares -= shares_;
        emit Transfer(msg.sender, address(0), shares_);
        asset.safeTransfer(to, assets);
        emit Withdrawn(msg.sender, to, assets, shares_);
    }

    // ------------------------------------------------------------------ holders

    function buyCover(uint256 id, uint256 rawAmount, uint8 tier) external nonReentrant returns (uint256 coverId) {
        if (p.subscriptionOnly) revert OneOffClosed();
        return _buy(msg.sender, id, rawAmount, tier);
    }

    /// Shared by one-off purchases and subscription renewals. `who` pays the fee and must hold the stock.
    function _buy(address who, uint256 id, uint256 rawAmount, uint8 tier) internal returns (uint256 coverId) {
        Session storage s = sessions[id];
        _checkSale(s, rawAmount, tier);
        (uint256 notional, uint256 maxPayout, uint256 premium) = _price(who, id, rawAmount, tier);
        if (uint256(s.reserved) + maxPayout > totalAssets() + premium) revert CapacityExceeded();
        _checkLimits(id, who, s.reserved, maxPayout);

        coverId = covers[id].length;
        covers[id].push(Cover(who, tier, uint128(notional), uint128(premium), uint128(maxPayout)));
        holderCovers[who].push(CoverRef(uint64(id), uint32(coverId)));
        s.reserved += uint128(maxPayout);
        s.premiums += uint128(premium);
        s.coverCount += 1;
        asset.safeTransferFrom(who, address(this), premium);
        emit CoverBought(id, coverId, who, tier, rawAmount, notional, premium, maxPayout);
    }

    function _checkSale(Session storage s, uint256 rawAmount, uint8 tier) internal view {
        if (salesPaused) revert SalesPaused();
        _sequencerOk();
        if (s.status != Status.Scheduled) revert SessionNotActive();
        if (block.timestamp < s.saleStart || block.timestamp + p.buyCutoff > s.closeTime) revert SaleClosed();
        if (tier >= tiers.length) revert BadTier();
        if (rawAmount == 0) revert ZeroAmount();
        if (s.coverCount >= p.maxCovers) revert TooManyCovers();
    }

    /// Reads the price, checks the buyer owns the stock, and works out notional, max payout and fee.
    function _price(address who, uint256 id, uint256 rawAmount, uint8 tier)
        internal
        returns (uint256 notional, uint256 maxPayout, uint256 premium)
    {
        (uint256 price, uint256 updatedAt) = _latest();
        if (updatedAt == 0 || updatedAt + p.refMaxAge < block.timestamp) revert FeedFrozen();

        uint256 already = coveredRaw[id][who];
        if (stock.balanceOf(who) < already + rawAmount) revert NotHolder();
        coveredRaw[id][who] = already + rawAmount;

        notional = (rawAmount * price * notionalMul) / notionalDiv;
        if (notional < p.minNotional || notional == 0) revert BelowMinNotional();
        if (notional > type(uint128).max) revert CapacityExceeded();
        Tier memory t = tiers[tier];
        maxPayout = (notional * t.capBps) / 10_000;
        premium = (notional * t.premiumBps + 9_999) / 10_000;
    }

    // ------------------------------------------------------------ subscriptions
    // A subscription is a standing order: "protect N stocks at this level every weekend". It is a consent, not a
    // payment. Each weekend anyone may call renewMany, which buys cover for each subscriber exactly as buyCover
    // would, pulling the fee from the subscriber's wallet. If anything fails (no allowance, not enough dollars, the
    // stock is gone, a limit is hit) that weekend is simply skipped: no cover, no debt.
    // Safeguards: a waiting period (cover starts on the second night after subscribing), a notice period when
    // cancelling, and no changing the amount while subscribed (cancel and join again, which restarts the wait).

    uint64 public constant SUB_WAIT = 2; // first covered night is sessionCount-at-signup + 2
    uint64 public constant SUB_NOTICE = 1; // one more night is renewed after cancelling

    struct Sub {
        bool active;
        bool listed;
        uint8 tier;
        uint64 since; // sessionCount when subscribing
        uint64 cancelAfter; // 0 = running. Otherwise the last night that is still renewed.
        uint256 rawAmount;
    }

    mapping(address => Sub) public subs;
    address[] internal subscribers;
    mapping(uint256 => mapping(address => bool)) public renewedFor;

    event Subscribed(address indexed holder, uint8 tier, uint256 rawAmount, uint64 firstNight);
    event SubscriptionCancelled(address indexed holder, uint64 lastNight);
    event Renewed(uint256 indexed id, address indexed holder, uint256 coverId);
    event RenewalSkipped(uint256 indexed id, address indexed holder);

    error SequencerDown();
    error SequencerGrace();
    error PriceOutOfBounds();
    error DepositCapReached();
    error OneOffClosed();
    error AlreadySubscribed();
    error NotSubscribed();
    error OnlySelf();

    function subscribe(uint8 tier, uint256 rawAmount) external nonReentrant {
        Sub storage x = subs[msg.sender];
        if (x.active && x.cancelAfter == 0) revert AlreadySubscribed();
        if (tier >= tiers.length) revert BadTier();
        if (rawAmount == 0) revert ZeroAmount();
        if (stock.balanceOf(msg.sender) < rawAmount) revert NotHolder();
        x.active = true;
        x.tier = tier;
        x.rawAmount = rawAmount;
        x.since = uint64(sessionCount);
        x.cancelAfter = 0;
        if (!x.listed) {
            x.listed = true;
            subscribers.push(msg.sender);
        }
        emit Subscribed(msg.sender, tier, rawAmount, x.since + SUB_WAIT);
    }

    function cancelSubscription() external nonReentrant {
        Sub storage x = subs[msg.sender];
        if (!x.active || x.cancelAfter != 0) revert NotSubscribed();
        x.cancelAfter = uint64(sessionCount) + SUB_NOTICE;
        emit SubscriptionCancelled(msg.sender, x.cancelAfter);
    }

    function subscribersLength() external view returns (uint256) {
        return subscribers.length;
    }

    function subscriberAt(uint256 i) external view returns (address) {
        return subscribers[i];
    }

    /// True if this wallet's subscription should buy cover for night `id`.
    function subscriptionDue(uint256 id, address who) public view returns (bool) {
        Sub storage x = subs[who];
        if (!x.active || renewedFor[id][who]) return false;
        if (id < uint256(x.since) + SUB_WAIT) return false;
        if (x.cancelAfter != 0 && id > x.cancelAfter) return false;
        return true;
    }

    /// Anyone may call. Failures are skipped, never reverted, so one bad wallet cannot block the rest.
    function renewMany(uint256 id, address[] calldata who) external nonReentrant {
        for (uint256 i; i < who.length; ++i) {
            if (!subscriptionDue(id, who[i])) continue;
            try this.renewOne(id, who[i]) returns (uint256 coverId) {
                emit Renewed(id, who[i], coverId);
            } catch {
                emit RenewalSkipped(id, who[i]);
            }
        }
    }

    /// Only callable by this contract (through renewMany), so a failed renewal rolls back by itself.
    function renewOne(uint256 id, address who) external returns (uint256 coverId) {
        if (msg.sender != address(this)) revert OnlySelf();
        Sub storage x = subs[who];
        renewedFor[id][who] = true;
        return _buy(who, id, x.rawAmount, x.tier);
    }

    /// Night-wide and per-wallet share-of-pool limits. Records the wallet's reserved payout.
    function _checkLimits(uint256 id, address who, uint256 reservedNow, uint256 maxPayout) internal {
        uint256 assetsNow = totalAssets();
        if (reservedNow + maxPayout > (assetsNow * p.maxUseBps) / 10_000) revert PoolUseLimit();
        uint256 mine = holderReserved[id][who] + maxPayout;
        if (mine > (assetsNow * p.maxHolderBps) / 10_000) revert HolderLimit();
        holderReserved[id][who] = mine;
    }

    function claim() external nonReentrant returns (uint256 amount) {
        amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        pendingClaims -= amount;
        asset.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    // ------------------------------------------------------------- permissionless

    /// Snapshots the last in-session price and the multiplier.
    function closeSession(uint256 id) external {
        Session storage s = sessions[id];
        if (s.status != Status.Scheduled) revert NotClosable();
        _sequencerOk();
        if (block.timestamp < s.closeTime || block.timestamp > uint256(s.closeTime) + p.lockWindow) revert NotClosable();
        (uint256 price, uint256 updatedAt) = _latest();
        if (updatedAt == 0 || updatedAt + p.refMaxAge < s.closeTime || updatedAt >= s.openTime) revert FeedStale();
        s.refPrice = price;
        s.multiplierAtClose = stock.uiMultiplier();
        s.status = Status.Closed;
        emit SessionClosed(id, price, s.multiplierAtClose);
    }

    /// Anyone names the first post-open round. The contract proves it is the first one or reverts.
    function settle(uint256 id, uint80 roundId) external nonReentrant {
        Session storage s = sessions[id];
        if (s.status != Status.Closed) revert NotSettleable();
        if (block.timestamp < s.openTime || block.timestamp > uint256(s.openTime) + p.printWindow + p.voidGrace) revert NotSettleable();
        _sequencerOk();
        uint256 settlePrice = _firstPrint(s.openTime, roundId);
        // A glitch print (the feed is flagged high risk and can print zero or far-off prices) must not pay out.
        // Refused prints leave the night open; after the grace period anyone can void it and every fee is refunded.
        if (p.minSettleBps != 0 && settlePrice * 10_000 < s.refPrice * p.minSettleBps) revert PriceOutOfBounds();
        if (_multiplierMoved(s)) revert MultiplierChanged();

        s.settlePrice = settlePrice;
        s.status = Status.Settled;
        s.reserved = 0;
        activeSession = 0;

        uint256 total;
        uint256 n = covers[id].length;
        for (uint256 i; i < n; ++i) {
            Cover storage c = covers[id][i];
            uint256 pay = _payout(c, s.refPrice, settlePrice);
            if (pay == 0) continue;
            total += pay;
            _push(c.holder, pay);
            emit Payout(id, i, c.holder, pay);
        }
        emit SessionSettled(id, roundId, s.refPrice, settlePrice, total);
    }

    /// Refunds every premium and frees the pool. See the three void conditions below.
    function voidSession(uint256 id) external nonReentrant {
        Session storage s = sessions[id];
        uint8 reason;
        if (s.status == Status.Scheduled) {
            if (block.timestamp <= uint256(s.closeTime) + p.lockWindow) revert NotVoidable();
            reason = VOID_NEVER_CLOSED;
        } else if (s.status == Status.Closed) {
            if (block.timestamp > uint256(s.openTime) + p.printWindow + p.voidGrace) reason = VOID_NO_PRINT;
            else if (block.timestamp >= s.openTime && _multiplierMoved(s)) reason = VOID_MULTIPLIER;
            else revert NotVoidable();
        } else {
            revert NotVoidable();
        }
        s.status = Status.Voided;
        s.reserved = 0;
        activeSession = 0;
        uint256 n = covers[id].length;
        for (uint256 i; i < n; ++i) {
            Cover storage c = covers[id][i];
            _push(c.holder, c.premium);
        }
        emit SessionVoided(id, reason);
    }

    // -------------------------------------------------------------------- views

    function getSession(uint256 id) external view returns (Session memory) {
        return sessions[id];
    }

    function coversLength(uint256 id) external view returns (uint256) {
        return covers[id].length;
    }

    function getCover(uint256 id, uint256 coverId) external view returns (Cover memory) {
        return covers[id][coverId];
    }

    /// Number of covers a holder has ever bought, across all sessions.
    function holderCoverCount(address holder) external view returns (uint256) {
        return holderCovers[holder].length;
    }

    /// i-th cover of a holder, oldest first.
    function holderCoverAt(address holder, uint256 i) external view returns (uint256 sessionId, uint256 coverId) {
        CoverRef memory r = holderCovers[holder][i];
        return (r.sessionId, r.coverId);
    }

    /// All deployment settings in one call (the settings struct is not a public variable, it is too wide for a getter).
    function params() external view returns (Params memory) {
        return p;
    }

    function tiersLength() external view returns (uint256) {
        return tiers.length;
    }

    function previewPayout(uint256 id, uint256 coverId, uint256 settlePrice) external view returns (uint256) {
        return _payout(covers[id][coverId], sessions[id].refPrice, settlePrice);
    }

    // ---------------------------------------------------------------- internals

    /// Reverts if the L2 sequencer is down, or came back less than sequencerGrace ago.
    function _sequencerOk() internal view {
        address f = p.sequencerFeed;
        if (f == address(0)) return;
        (, int256 answer, uint256 startedAt,,) = IAggregatorV3(f).latestRoundData();
        if (answer != 0) revert SequencerDown();
        if (block.timestamp - startedAt <= p.sequencerGrace) revert SequencerGrace();
    }

    function _latest() internal view returns (uint256 price, uint256 updatedAt) {
        (, int256 answer,, uint256 u,) = feed.latestRoundData();
        if (answer <= 0) revert BadAnswer();
        return (uint256(answer), u);
    }

    function _firstPrint(uint256 open, uint80 roundId) internal view returns (uint256) {
        int256 answer;
        uint256 updatedAt;
        uint80 answeredIn;
        try feed.getRoundData(roundId) returns (uint80, int256 a, uint256, uint256 u, uint80 ai) {
            answer = a;
            updatedAt = u;
            answeredIn = ai;
        } catch {
            revert RoundNotProvable();
        }
        if (updatedAt < open) revert PrintBeforeOpen(); // frozen feed ends up here
        if (updatedAt > open + p.printWindow) revert PrintTooLate();
        if (answer <= 0 || answeredIn < roundId) revert BadAnswer();
        if (uint64(roundId) <= 1) revert RoundNotProvable(); // phase boundary, predecessor unknowable
        uint256 prevUpdated;
        try feed.getRoundData(roundId - 1) returns (uint80, int256, uint256, uint256 u2, uint80) {
            prevUpdated = u2;
        } catch {
            revert RoundNotProvable();
        }
        if (prevUpdated == 0) revert RoundNotProvable();
        if (prevUpdated >= open) revert NotFirstPrint();
        return uint256(answer);
    }

    function _multiplierMoved(Session storage s) internal view returns (bool) {
        return stock.uiMultiplier() != s.multiplierAtClose || stock.effectiveAt() > block.timestamp;
    }

    function _payout(Cover storage c, uint256 ref, uint256 settlePrice) internal view returns (uint256) {
        if (settlePrice >= ref) return 0;
        uint256 drop = ((ref - settlePrice) * WAD) / ref;
        Tier memory t = tiers[c.tier];
        uint256 ded = uint256(t.deductibleBps) * BPS_TO_WAD;
        if (drop <= ded) return 0;
        uint256 frac = drop - ded;
        uint256 capW = uint256(t.capBps) * BPS_TO_WAD;
        if (frac > capW) frac = capW;
        return (uint256(c.notional) * frac) / WAD;
    }

    /// Pays now. If the transfer fails for any reason the amount waits in claimable.
    function _push(address to, uint256 amount) internal {
        if (amount == 0) return;
        if (!asset.trySend(to, amount)) {
            claimable[to] += amount;
            pendingClaims += amount;
            emit PayoutDeferred(to, amount);
        }
    }
}
