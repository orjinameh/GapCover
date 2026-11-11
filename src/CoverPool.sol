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

    Params public p;
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

    mapping(address => uint256) public shares;
    uint256 public totalShares;
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

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(IERC20 asset_, IB20Stock stock_, IAggregatorV3 feed_, address keeper_, Params memory params, Tier[] memory tiers_) {
        if (address(asset_) == address(0) || address(stock_) == address(0) || address(feed_) == address(0)) revert BadConfig();
        if (params.maxCovers == 0 || params.printWindow == 0 || params.refMaxAge == 0) revert BadConfig();
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

    function deposit(uint256 assets, address to) external nonReentrant returns (uint256 minted) {
        if (locked()) revert PoolLocked();
        if (assets == 0) revert ZeroAmount();
        minted = convertToShares(assets);
        if (minted == 0) revert ZeroShares();
        shares[to] += minted;
        totalShares += minted;
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
        asset.safeTransfer(to, assets);
        emit Withdrawn(msg.sender, to, assets, shares_);
    }

    // ------------------------------------------------------------------ holders

    function buyCover(uint256 id, uint256 rawAmount, uint8 tier) external nonReentrant returns (uint256 coverId) {
        Session storage s = sessions[id];
        if (s.status != Status.Scheduled) revert SessionNotActive();
        if (block.timestamp < s.saleStart || block.timestamp + p.buyCutoff > s.closeTime) revert SaleClosed();
        if (tier >= tiers.length) revert BadTier();
        if (rawAmount == 0) revert ZeroAmount();
        if (s.coverCount >= p.maxCovers) revert TooManyCovers();

        (uint256 price, uint256 updatedAt) = _latest();
        if (updatedAt == 0 || updatedAt + p.refMaxAge < block.timestamp) revert FeedFrozen();

        uint256 already = coveredRaw[id][msg.sender];
        if (stock.balanceOf(msg.sender) < already + rawAmount) revert NotHolder();
        coveredRaw[id][msg.sender] = already + rawAmount;

        uint256 notional = (rawAmount * price * notionalMul) / notionalDiv;
        if (notional < p.minNotional || notional == 0) revert BelowMinNotional();
        Tier memory t = tiers[tier];
        uint256 maxPayout = (notional * t.capBps) / 10_000;
        uint256 premium = (notional * t.premiumBps + 9_999) / 10_000;
        if (notional > type(uint128).max) revert CapacityExceeded();
        if (uint256(s.reserved) + maxPayout > totalAssets() + premium) revert CapacityExceeded();

        coverId = covers[id].length;
        covers[id].push(Cover(msg.sender, tier, uint128(notional), uint128(premium), uint128(maxPayout)));
        holderCovers[msg.sender].push(CoverRef(uint64(id), uint32(coverId)));
        s.reserved += uint128(maxPayout);
        s.premiums += uint128(premium);
        s.coverCount += 1;
        asset.safeTransferFrom(msg.sender, address(this), premium);
        emit CoverBought(id, coverId, msg.sender, tier, rawAmount, notional, premium, maxPayout);
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
        uint256 settlePrice = _firstPrint(s.openTime, roundId);
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

    function tiersLength() external view returns (uint256) {
        return tiers.length;
    }

    function previewPayout(uint256 id, uint256 coverId, uint256 settlePrice) external view returns (uint256) {
        return _payout(covers[id][coverId], sessions[id].refPrice, settlePrice);
    }

    // ---------------------------------------------------------------- internals

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
