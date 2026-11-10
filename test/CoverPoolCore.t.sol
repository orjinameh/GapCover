// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {CoverPool} from "../src/CoverPool.sol";

contract CoverPoolCore is Base {
    // ---------------------------------------------------------------- config

    function test_constructorReadsDecimals() public view {
        assertEq(pool.assetDecimals(), 6);
        assertEq(pool.tokenDecimals(), 18);
        assertEq(pool.feedDecimals(), 8);
        assertEq(pool.tiersLength(), 3);
    }

    function test_constructorRejectsBadConfig() public {
        CoverPool.Tier[] memory none = new CoverPool.Tier[](0);
        vm.expectRevert(CoverPool.BadConfig.selector);
        new CoverPool(_usdcI(), _stockI(), _feedI(), keeper, _params(1), none);

        CoverPool.Tier[] memory bad = new CoverPool.Tier[](1);
        bad[0] = CoverPool.Tier(100, 0, 10);
        vm.expectRevert(CoverPool.BadConfig.selector);
        new CoverPool(_usdcI(), _stockI(), _feedI(), keeper, _params(1), bad);

        vm.expectRevert(CoverPool.BadConfig.selector);
        new CoverPool(_usdcI(), _stockI(), _feedI(), keeper, _params(0), _tiers());
    }

    // ---------------------------------------------------------- underwriting

    function test_depositAndWithdrawRoundTrip() public {
        address u2 = makeAddr("u2");
        _fund(u2, 5_000e6, 0);
        vm.startPrank(u2);
        uint256 minted = pool.deposit(5_000e6, u2);
        assertGt(minted, 0);
        uint256 out = pool.withdraw(minted, u2);
        vm.stopPrank();
        assertApproxEqAbs(out, 5_000e6, 1);
        assertLe(out, 5_000e6, "never more than deposited");
    }

    function test_sharePriceStartsAtOne() public {
        // fresh pool with no deposits
        CoverPool fresh = _newPool(4);
        assertEq(fresh.sharePrice(), 1e18);
    }

    function test_withdrawMoreThanSharesReverts() public {
        uint256 tooMany = pool.shares(uw) + 1;
        vm.prank(uw);
        vm.expectRevert(CoverPool.InsufficientShares.selector);
        pool.withdraw(tooMany, uw);
    }

    function test_zeroDepositReverts() public {
        vm.prank(uw);
        vm.expectRevert(CoverPool.ZeroAmount.selector);
        pool.deposit(0, uw);
    }

    function test_firstDepositorInflationAttackFails() public {
        CoverPool fresh = _newPool(4);
        address attacker = makeAddr("attacker");
        address victim = makeAddr("victim");
        usdc.faucet(attacker, 500_100e6);
        usdc.faucet(victim, 1_000_000e6);
        vm.startPrank(attacker);
        usdc.approve(address(fresh), type(uint256).max);
        fresh.deposit(1, attacker); // 1 wei share
        usdc.transfer(address(fresh), 500_000e6); // donation to inflate price
        vm.stopPrank();
        vm.startPrank(victim);
        usdc.approve(address(fresh), type(uint256).max);
        uint256 vShares = fresh.deposit(1_000_000e6, victim);
        uint256 vOut = fresh.convertToAssets(vShares);
        vm.stopPrank();
        // victim keeps nearly everything, the virtual offset makes the donation mostly a gift to the pool
        assertGt(vOut, 990_000e6);
        assertLe(vOut, 1_000_000e6);
    }

    // --------------------------------------------------------------- schedule

    function test_scheduleOnlyKeeper() public {
        vm.expectRevert(CoverPool.NotKeeper.selector);
        pool.scheduleSession(uint64(block.timestamp), uint64(block.timestamp + 1 days), uint64(block.timestamp + 3 days));
    }

    function test_scheduleRejectsBadOrdering() public {
        uint64 n = uint64(block.timestamp);
        vm.startPrank(keeper);
        vm.expectRevert(CoverPool.BadSchedule.selector);
        pool.scheduleSession(n - 1, n + 1 days, n + 3 days); // past
        vm.expectRevert(CoverPool.BadSchedule.selector);
        pool.scheduleSession(n, n + BUY_CUTOFF, n + 3 days); // no sale window
        vm.expectRevert(CoverPool.BadSchedule.selector);
        pool.scheduleSession(n, n + 1 days, n + 1 days + LOCK_WINDOW); // open too close to close
        vm.stopPrank();
    }

    function test_onlyOneActiveSession() public {
        _schedule();
        vm.prank(keeper);
        vm.expectRevert(CoverPool.BadSchedule.selector);
        pool.scheduleSession(uint64(block.timestamp), uint64(block.timestamp + 1 days), uint64(block.timestamp + 3 days));
    }

    function test_cancelOnlyWhenUnsold() public {
        _schedule();
        _buy(h1, 100e18, 1);
        vm.prank(keeper);
        vm.expectRevert(CoverPool.SessionNotActive.selector);
        pool.cancelSession(sid);
    }

    function test_cancelFreesSlot() public {
        _schedule();
        vm.prank(keeper);
        pool.cancelSession(sid);
        assertEq(pool.activeSession(), 0);
        _schedule();
        assertEq(sid, 2);
    }

    // -------------------------------------------------------------- buy cover

    function test_buyCoverPricesNotionalAndPremium() public {
        _schedule();
        uint256 before = _bal(h1);
        uint256 coverId = _buy(h1, 100e18, 1); // 100 tokens * $100 = 10,000; standard 0.60%
        CoverPool.Cover memory c = pool.getCover(sid, coverId);
        assertEq(c.notional, TEN_K);
        assertEq(c.premium, 60e6);
        assertEq(c.maxPayout, 1_000e6); // 10% cap
        assertEq(before - _bal(h1), 60e6);
        assertEq(pool.getSession(sid).reserved, 1_000e6);
        assertEq(pool.totalAssets(), POOL_SEED + 60e6);
    }

    function test_premiumRoundsUp() public {
        _schedule();
        // notional 12.345678 USDC, light tier 0.20%: exact 24691.356 -> ceil 24692
        uint256 coverId = _buy(h1, 12_345_678e10, 0);
        CoverPool.Cover memory c = pool.getCover(sid, coverId);
        assertEq(c.notional, 12_345_678);
        assertEq(c.premium, 24_692);
    }

    function test_buyRevertsOnFrozenFeedAtPurchase() public {
        // feed printed 1h before T0. Schedule a long sale and buy 25h+ later.
        saleStart = uint64(block.timestamp);
        closeTime = saleStart + 4 days;
        openTime = closeTime + 60 hours;
        vm.prank(keeper);
        sid = pool.scheduleSession(saleStart, closeTime, openTime);
        vm.warp(T0 + 25 hours); // last print is 26h old
        vm.prank(h1);
        vm.expectRevert(CoverPool.FeedFrozen.selector);
        pool.buyCover(sid, 100e18, 1);
    }

    function test_buyRevertsOnBadAnswer() public {
        _schedule();
        feed.pushRound(0);
        vm.prank(h1);
        vm.expectRevert(CoverPool.BadAnswer.selector);
        pool.buyCover(sid, 100e18, 1);
        feed.pushRound(-5);
        vm.prank(h1);
        vm.expectRevert(CoverPool.BadAnswer.selector);
        pool.buyCover(sid, 100e18, 1);
    }

    function test_buyRevertsAfterCutoff() public {
        _schedule();
        vm.warp(closeTime - BUY_CUTOFF + 1);
        feed.pushRound(100e8);
        vm.prank(h1);
        vm.expectRevert(CoverPool.SaleClosed.selector);
        pool.buyCover(sid, 100e18, 1);
    }

    function test_buyAllowedExactlyAtCutoff() public {
        _schedule();
        vm.warp(closeTime - BUY_CUTOFF);
        feed.pushRound(100e8);
        _buy(h1, 100e18, 1);
    }

    function test_buyRevertsBeforeSaleStart() public {
        saleStart = uint64(block.timestamp + 1 hours);
        closeTime = saleStart + 1 days;
        openTime = closeTime + 60 hours;
        vm.prank(keeper);
        sid = pool.scheduleSession(saleStart, closeTime, openTime);
        vm.prank(h1);
        vm.expectRevert(CoverPool.SaleClosed.selector);
        pool.buyCover(sid, 100e18, 1);
    }

    function test_buyRevertsIfNotHolder() public {
        _schedule();
        vm.prank(anyone);
        vm.expectRevert(CoverPool.NotHolder.selector);
        pool.buyCover(sid, 100e18, 1);
    }

    function test_insurableInterestIsCumulativePerHolder() public {
        _schedule();
        _buy(h1, 600e18, 1);
        vm.prank(h1);
        vm.expectRevert(CoverPool.NotHolder.selector); // 600 + 600 > 1000 held
        pool.buyCover(sid, 600e18, 1);
        _buy(h1, 400e18, 1); // exactly the rest is fine
    }

    function test_buyRevertsBelowMinNotional() public {
        _schedule();
        vm.prank(h1);
        vm.expectRevert(CoverPool.BelowMinNotional.selector);
        pool.buyCover(sid, 1e16, 1); // 0.01 token = $1
    }

    function test_buyRevertsBadTierAndZero() public {
        _schedule();
        vm.startPrank(h1);
        vm.expectRevert(CoverPool.BadTier.selector);
        pool.buyCover(sid, 100e18, 3);
        vm.expectRevert(CoverPool.ZeroAmount.selector);
        pool.buyCover(sid, 0, 1);
        vm.stopPrank();
    }

    function test_buyRevertsWrongSession() public {
        _schedule();
        vm.prank(h1);
        vm.expectRevert(CoverPool.SessionNotActive.selector);
        pool.buyCover(99, 100e18, 1);
    }

    function test_capacityExceeded() public {
        _schedule();
        stock.mint(h1, 10_000e18);
        // each cover: 1000 tokens = $100k notional, light cap 15% = $15k reserved, premium $200.
        // Six fit (90k reserved). The seventh needs 105k against 100k + 1.4k of premiums.
        for (uint256 i; i < 6; ++i) {
            _buy(h1, 1_000e18, 0);
        }
        _assertSolvent();
        vm.prank(h1);
        vm.expectRevert(CoverPool.CapacityExceeded.selector);
        pool.buyCover(sid, 1_000e18, 0);
    }

    function test_maxCoversEnforced() public {
        pool = _newPool(2);
        _fund(uw, POOL_SEED, 0);
        vm.prank(uw);
        pool.deposit(POOL_SEED, uw);
        _fund(h1, 0, 0);
        _fund(h2, 0, 0);
        _schedule();
        _buy(h1, 100e18, 1);
        _buy(h2, 100e18, 1);
        vm.prank(h1);
        vm.expectRevert(CoverPool.TooManyCovers.selector);
        pool.buyCover(sid, 100e18, 1);
    }

    // ------------------------------------------------------------------ lock

    function test_depositAndWithdrawBlockedWhileCoverOutstanding() public {
        _schedule();
        vm.prank(uw);
        pool.withdraw(1, uw); // free before any cover
        _buy(h1, 100e18, 1);
        assertTrue(pool.locked());
        vm.prank(uw);
        vm.expectRevert(CoverPool.PoolLocked.selector);
        pool.withdraw(1, uw);
        vm.prank(uw);
        vm.expectRevert(CoverPool.PoolLocked.selector);
        pool.deposit(1e6, uw);
    }

    function test_noLockWithSessionButNoCovers() public {
        _fund(uw, 1e6, 0);
        _schedule();
        assertFalse(pool.locked());
        vm.prank(uw);
        pool.deposit(1e6, uw);
    }

    function test_underwriterEarnsPremiumAfterNoGapSettlement() public {
        _schedule();
        uint256 priceBefore = pool.sharePrice();
        _buy(h1, 100e18, 1);
        assertGt(pool.sharePrice(), priceBefore, "premium accrues at purchase");
        _closeAt(100e8);
        uint80 r = _openPrint(100e8);
        pool.settle(sid, r);
        assertGt(pool.sharePrice(), priceBefore);
        assertFalse(pool.locked());
        uint256 all = pool.shares(uw);
        vm.prank(uw);
        uint256 out = pool.withdraw(all, uw);
        assertApproxEqAbs(out, POOL_SEED + 60e6, 1e3);
    }

    // ---------------------------------------------------------------- mocks

    function test_claimNothingReverts() public {
        vm.prank(h1);
        vm.expectRevert(CoverPool.NothingToClaim.selector);
        pool.claim();
    }
}
