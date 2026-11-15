// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {CoverPool} from "../src/CoverPool.sol";

/// Pool-use limit, per-wallet limit and the sales pause. Pool seed is 100,000 USDC.
contract HardeningTest is Base {
    // A Standard cover on 100e18 tokens at $100 = $10,000 notional, max payout $1,000 (10%).
    function _limitedPool(uint16 useBps, uint16 holderBps) internal {
        pool = new CoverPool(
            _usdcI(), _stockI(), _feedI(), keeper,
            CoverPool.Params(REF_MAX_AGE, PRINT_WINDOW, VOID_GRACE, BUY_CUTOFF, LOCK_WINDOW, 64, 10e6, useBps, holderBps, false),
            _tiers()
        );
        _fund(uw, POOL_SEED, 0);
        _fund(h1, 1_000_000e6, 0);
        _fund(h2, 1_000_000e6, 0);
        vm.prank(uw);
        pool.deposit(POOL_SEED, uw);
        _schedule();
    }

    function test_poolUseLimitStopsTheNightAtTheLimit() public {
        _limitedPool(500, 10_000); // 5% of 100k = $5,000 reserved = five covers of $1,000
        for (uint256 i; i < 5; ++i) _buy(i % 2 == 0 ? h1 : h2, 100e18, 1);
        vm.prank(h1);
        vm.expectRevert(CoverPool.PoolUseLimit.selector);
        pool.buyCover(sid, 100e18, 1);
        assertLe(pool.getSession(sid).reserved, 5_000e6);
    }

    function test_holderLimitIsPerWallet() public {
        _limitedPool(10_000, 200); // 2% of 100k = $2,000 per wallet = two covers
        _buy(h1, 100e18, 1);
        _buy(h1, 100e18, 1);
        vm.prank(h1);
        vm.expectRevert(CoverPool.HolderLimit.selector);
        pool.buyCover(sid, 100e18, 1);
        // another wallet is not affected
        _buy(h2, 100e18, 1);
        assertEq(pool.holderReserved(sid, h1), 2_000e6);
        assertEq(pool.holderReserved(sid, h2), 1_000e6);
    }

    function test_limitsAtTenThousandBpsChangeNothing() public {
        _limitedPool(10_000, 10_000);
        for (uint256 i; i < 10; ++i) _buy(h1, 100e18, 1);
        assertEq(pool.getSession(sid).reserved, 10_000e6);
    }

    function test_constructorRejectsBadLimits() public {
        vm.expectRevert(CoverPool.BadConfig.selector);
        new CoverPool(_usdcI(), _stockI(), _feedI(), keeper,
            CoverPool.Params(REF_MAX_AGE, PRINT_WINDOW, VOID_GRACE, BUY_CUTOFF, LOCK_WINDOW, 64, 10e6, 0, 10_000, false), _tiers());
        vm.expectRevert(CoverPool.BadConfig.selector);
        new CoverPool(_usdcI(), _stockI(), _feedI(), keeper,
            CoverPool.Params(REF_MAX_AGE, PRINT_WINDOW, VOID_GRACE, BUY_CUTOFF, LOCK_WINDOW, 64, 10e6, 10_000, 10_001, false), _tiers());
    }

    function test_onlyKeeperCanPause() public {
        vm.prank(anyone);
        vm.expectRevert(CoverPool.NotKeeper.selector);
        pool.setSalesPaused(true);
    }

    function test_pauseStopsNewCoverButNothingElse() public {
        _schedule();
        _buy(h1, 100e18, 1);
        vm.prank(keeper);
        pool.setSalesPaused(true);

        vm.prank(h2);
        vm.expectRevert(CoverPool.SalesPaused.selector);
        pool.buyCover(sid, 100e18, 1);

        // The existing cover still settles and pays, and the pause does not block closing or settling.
        _closeAt(100e8);
        uint80 r = _openPrint(80e8); // 20% drop, pays the capped $1,000
        pool.settle(sid, r);
        assertEq(uint8(pool.getSession(sid).status), uint8(CoverPool.Status.Settled));

        // Deposits and withdrawals still work while paused.
        address u2 = makeAddr("u2");
        _fund(u2, 1_000e6, 0);
        vm.startPrank(u2);
        uint256 minted = pool.deposit(1_000e6, u2);
        pool.withdraw(minted, u2);
        vm.stopPrank();
    }

    function test_unpauseRestoresSales() public {
        _schedule();
        vm.startPrank(keeper);
        pool.setSalesPaused(true);
        pool.setSalesPaused(false);
        vm.stopPrank();
        _buy(h1, 100e18, 1);
        assertEq(pool.getSession(sid).coverCount, 1);
    }
}
