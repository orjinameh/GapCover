// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {CoverPool} from "../src/CoverPool.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IB20Stock} from "../src/interfaces/IB20Stock.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";

/// Runs the real pool code against the REAL contracts on a Base mainnet fork:
/// real USDC, the real NVDAc stock token (8 decimals) and the real Chainlink NVDA feed.
/// It moves no real money: everything happens inside a local copy of the chain.
///
/// Needs two environment variables, otherwise every test returns without running:
///   BASE_RPC  a Base mainnet RPC url, for example https://mainnet.base.org
///   HOLDER    any address that holds at least 10 NVDAc on Base (copy one from the token's
///             "Holders" tab on BaseScan, pick a normal wallet, not a contract)
///
/// Run:  BASE_RPC=... HOLDER=0x... forge test --match-path test/ForkReal.t.sol -vv > fork.log 2>&1
contract ForkRealTest is Test {
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant NVDAC = 0xb20000000000000000000078ee7ce2fE4908108C;
    address constant NVDA_FEED = 0x04689a41629776563E6822F76f2e57D148d28513;

    // The feed is silent over weekends, so the freshness limit is wide on purpose in this test.
    uint32 constant REF_MAX_AGE = 7 days;
    uint32 constant PRINT_WINDOW = 2 hours;
    uint32 constant VOID_GRACE = 6 hours;
    uint32 constant BUY_CUTOFF = 10 minutes;
    uint32 constant LOCK_WINDOW = 1 hours;

    bool skipAll;
    CoverPool pool;
    address holder;
    address uw;

    function setUp() public {
        string memory rpc = vm.envOr("BASE_RPC", string(""));
        address h = vm.envOr("HOLDER", address(0));
        if (bytes(rpc).length == 0 || h == address(0)) {
            skipAll = true;
            console.log("Skipped: set BASE_RPC and HOLDER to run the fork tests.");
            return;
        }
        vm.createSelectFork(rpc);
        holder = h;
        uw = makeAddr("underwriter");

        CoverPool.Tier[] memory t = new CoverPool.Tier[](3);
        t[0] = CoverPool.Tier(500, 1500, 20);
        t[1] = CoverPool.Tier(200, 1000, 60);
        t[2] = CoverPool.Tier(100, 500, 90);

        pool = new CoverPool(
            IERC20(USDC),
            IB20Stock(NVDAC),
            IAggregatorV3(NVDA_FEED),
            address(this), // this test acts as the keeper
            CoverPool.Params(REF_MAX_AGE, PRINT_WINDOW, VOID_GRACE, BUY_CUTOFF, LOCK_WINDOW, 64, 10e6),
            t
        );

        // Play money inside the fork: real USDC balances for the provider and the buyer.
        deal(USDC, uw, 100_000e6);
        deal(USDC, holder, 10_000e6);
        vm.prank(uw);
        IERC20(USDC).approve(address(pool), type(uint256).max);
        vm.prank(holder);
        IERC20(USDC).approve(address(pool), type(uint256).max);
        vm.prank(uw);
        pool.deposit(100_000e6, uw);
    }

    function test_decimals_are_read_and_scaled_correctly() public view {
        if (skipAll) return;
        assertEq(pool.assetDecimals(), 6, "USDC decimals");
        assertEq(pool.tokenDecimals(), 8, "NVDAc decimals");
        assertEq(pool.feedDecimals(), 8, "feed decimals");
        // 8 + 8 - 6 = 10, so a raw balance times a feed answer is divided by 1e10 to give USDC units.
        // The scaling itself is checked against real purchases in test_buyCover_notional_and_fee_match_independent_maths.
    }

    function test_real_token_exposes_the_multiplier_the_pool_reads() public view {
        if (skipAll) return;
        uint256 m = IB20Stock(NVDAC).uiMultiplier();
        uint256 eff = IB20Stock(NVDAC).effectiveAt();
        console.log("uiMultiplier", m);
        console.log("effectiveAt", eff);
        assertGt(m, 0, "multiplier is zero");
    }

    function test_buyCover_notional_and_fee_match_independent_maths() public {
        if (skipAll) return;
        _schedule();
        uint256 raw = 5e8; // 5 NVDAc
        require(IERC20(NVDAC).balanceOf(holder) >= raw, "HOLDER has less than 5 NVDAc");

        (, int256 answer,,,) = IAggregatorV3(NVDA_FEED).latestRoundData();
        uint256 expectedNotional = (raw * uint256(answer)) / 1e10;
        uint256 expectedFee = (expectedNotional * 60 + 9_999) / 10_000; // Standard tier, 0.60%
        uint256 expectedMax = (expectedNotional * 1000) / 10_000; // Standard cap, 10%

        uint256 holderBefore = IERC20(USDC).balanceOf(holder);
        uint256 poolBefore = IERC20(USDC).balanceOf(address(pool));

        vm.prank(holder);
        uint256 coverId = pool.buyCover(1, raw, 1);

        CoverPool.Cover memory c = pool.getCover(1, coverId);
        console.log("notional (USDC units)", c.notional);
        console.log("fee", c.premium);
        assertEq(uint256(c.notional), expectedNotional, "notional");
        assertEq(uint256(c.premium), expectedFee, "fee");
        assertEq(uint256(c.maxPayout), expectedMax, "max payout");
        // Real USDC moved exactly the fee, no more.
        assertEq(holderBefore - IERC20(USDC).balanceOf(holder), expectedFee, "holder paid");
        assertEq(IERC20(USDC).balanceOf(address(pool)) - poolBefore, expectedFee, "pool received");
    }

    function test_closeSession_snapshots_real_price_and_multiplier() public {
        if (skipAll) return;
        _schedule();
        vm.prank(holder);
        pool.buyCover(1, 5e8, 1);

        (, int256 answer,,,) = IAggregatorV3(NVDA_FEED).latestRoundData();
        CoverPool.Session memory s0 = pool.getSession(1);
        vm.warp(uint256(s0.closeTime) + 1 minutes);
        pool.closeSession(1);

        CoverPool.Session memory s = pool.getSession(1);
        assertEq(s.refPrice, uint256(answer), "reference price");
        assertEq(s.multiplierAtClose, IB20Stock(NVDAC).uiMultiplier(), "multiplier");
        assertEq(uint8(s.status), uint8(CoverPool.Status.Closed), "status");
    }

    function test_cover_is_refused_for_more_than_the_holder_owns() public {
        if (skipAll) return;
        _schedule();
        uint256 have = IERC20(NVDAC).balanceOf(holder);
        vm.prank(holder);
        vm.expectRevert(CoverPool.NotHolder.selector);
        pool.buyCover(1, have + 1, 1);
    }

    function _schedule() internal {
        uint64 start = uint64(block.timestamp);
        uint64 close = start + 1 days;
        uint64 open = close + 60 hours;
        pool.scheduleSession(start, close, open);
    }
}
