// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CoverPool} from "../src/CoverPool.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IB20Stock} from "../src/interfaces/IB20Stock.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockB20} from "../src/mocks/MockB20.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";

/// Shared fixture. Price units: 8 decimals. 100e8 = $100 per raw token (18 decimals).
/// 100e18 raw tokens at $100 = 10,000 USDC notional = 10_000e6.
abstract contract Base is Test {
    MockUSDC usdc;
    MockB20 stock;
    MockAggregator feed;
    CoverPool pool;

    address keeper = makeAddr("keeper");
    address uw = makeAddr("underwriter");
    address h1 = makeAddr("holder1");
    address h2 = makeAddr("holder2");
    address anyone = makeAddr("anyone");

    uint32 constant REF_MAX_AGE = 25 hours;
    uint32 constant PRINT_WINDOW = 2 hours;
    uint32 constant VOID_GRACE = 6 hours;
    uint32 constant BUY_CUTOFF = 10 minutes;
    uint32 constant LOCK_WINDOW = 1 hours;

    uint256 constant T0 = 1_700_000_000;
    uint64 saleStart;
    uint64 closeTime;
    uint64 openTime;
    uint256 sid;

    uint256 constant POOL_SEED = 100_000e6;
    uint256 constant TEN_K = 10_000e6;

    function setUp() public virtual {
        vm.warp(T0);
        usdc = new MockUSDC();
        stock = new MockB20("NVDA mock", "NVDAm", 18);
        feed = new MockAggregator(8, "NVDA / USD mock");
        feed.pushRoundAt(100e8, T0 - 1 hours);
        pool = _newPool(64);
        _fund(uw, POOL_SEED, 0);
        vm.prank(uw);
        pool.deposit(POOL_SEED, uw);
        _fund(h1, 1_000_000e6, 1_000e18);
        _fund(h2, 1_000_000e6, 1_000e18);
    }

    function _tiers() internal pure returns (CoverPool.Tier[] memory t) {
        t = new CoverPool.Tier[](3);
        t[0] = CoverPool.Tier(500, 1500, 20); // light
        t[1] = CoverPool.Tier(200, 1000, 60); // standard
        t[2] = CoverPool.Tier(100, 500, 90); // tight
    }

    function _params(uint16 maxCovers) internal pure returns (CoverPool.Params memory) {
        return CoverPool.Params(REF_MAX_AGE, PRINT_WINDOW, VOID_GRACE, BUY_CUTOFF, LOCK_WINDOW, maxCovers, 10e6);
    }

    function _usdcI() internal view returns (IERC20) { return IERC20(address(usdc)); }
    function _stockI() internal view returns (IB20Stock) { return IB20Stock(address(stock)); }
    function _feedI() internal view returns (IAggregatorV3) { return IAggregatorV3(address(feed)); }

    function _newPool(uint16 maxCovers) internal returns (CoverPool) {
        return new CoverPool(
            IERC20(address(usdc)), IB20Stock(address(stock)), IAggregatorV3(address(feed)), keeper, _params(maxCovers), _tiers()
        );
    }

    function _fund(address who, uint256 usdcAmt, uint256 tokenAmt) internal {
        usdc.faucet(who, usdcAmt);
        if (tokenAmt > 0) stock.mint(who, tokenAmt);
        vm.prank(who);
        usdc.approve(address(pool), type(uint256).max);
    }

    /// Schedules a standard weekend: sale now, close in 1 day, open 60 hours after close.
    function _schedule() internal returns (uint256 id) {
        saleStart = uint64(block.timestamp);
        closeTime = saleStart + 1 days;
        openTime = closeTime + 60 hours;
        vm.prank(keeper);
        id = pool.scheduleSession(saleStart, closeTime, openTime);
        sid = id;
    }

    function _buy(address who, uint256 tokens, uint8 tier) internal returns (uint256 coverId) {
        vm.prank(who);
        coverId = pool.buyCover(sid, tokens, tier);
    }

    /// A last in-session print shortly before close, then close the session.
    function _closeAt(uint256 refPrice) internal {
        feed.pushRoundAt(int256(refPrice), closeTime - 30 minutes);
        vm.warp(closeTime + 1 minutes);
        pool.closeSession(sid);
    }

    /// Warp to one minute after open and print the first post-open round. Returns its id.
    function _openPrint(uint256 price) internal returns (uint80 id) {
        vm.warp(openTime + 1 minutes);
        id = feed.pushRound(int256(price));
    }

    function _bal(address a) internal view returns (uint256) {
        return usdc.balanceOf(a);
    }

    function _assertSolvent() internal view {
        CoverPool.Session memory s = pool.getSession(pool.activeSession());
        assertGe(usdc.balanceOf(address(pool)), s.reserved + pool.pendingClaims(), "solvency");
    }
}
