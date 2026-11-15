// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {CoverPool} from "../src/CoverPool.sol";

/// Weekly subscriptions: waiting period, notice on cancel, skipped (never failed) renewals, limits.
/// A standard cover on 100e18 tokens at $100 = $10,000 notional, $60 fee, $1,000 max payout.
contract SubscriptionTest is Base {
    function _wallets() internal view returns (address[] memory w) {
        w = new address[](2);
        w[0] = h1;
        w[1] = h2;
    }

    /// Runs one full night: schedule, renew, close, settle with no drop.
    function _night() internal returns (uint256 id) {
        id = _schedule();
        pool.renewMany(id, _wallets());
        _closeAt(100e8);
        uint80 r = _openPrint(100e8);
        pool.settle(id, r);
    }

    function test_contractFitsSizeLimit() public view {
        assertLt(address(pool).code.length, 24_576, "contract too big to deploy");
    }

    function test_subscribeRecordsOrderAndListsWallet() public {
        vm.prank(h1);
        pool.subscribe(1, 100e18);
        (bool active,, uint8 tier,, uint64 cancelAfter, uint256 raw) = pool.subs(h1);
        assertTrue(active);
        assertEq(tier, 1);
        assertEq(cancelAfter, 0);
        assertEq(raw, 100e18);
        assertEq(pool.subscribersLength(), 1);
        assertEq(pool.subscriberAt(0), h1);
    }

    function test_cannotSubscribeTwiceOrWithoutTheStock() public {
        vm.startPrank(h1);
        pool.subscribe(1, 100e18);
        vm.expectRevert(CoverPool.AlreadySubscribed.selector);
        pool.subscribe(1, 200e18);
        vm.stopPrank();

        vm.prank(anyone);
        vm.expectRevert(CoverPool.NotHolder.selector);
        pool.subscribe(1, 1e18);

        vm.prank(h2);
        vm.expectRevert(CoverPool.BadTier.selector);
        pool.subscribe(9, 1e18);
    }

    function test_waitingPeriodSkipsTheFirstTwoNights() public {
        vm.prank(h1);
        pool.subscribe(1, 100e18); // sessionCount is 0, so the first covered night is 2

        uint256 n1 = _night();
        assertEq(pool.getSession(n1).coverCount, 0, "night 1 is the waiting night");
        _fundForNextNight();
        uint256 n2 = _night();
        assertEq(pool.getSession(n2).coverCount, 1, "night 2 is covered");
        assertEq(pool.getCover(n2, 0).holder, h1);
        assertEq(pool.getCover(n2, 0).premium, 60e6);
    }

    function test_renewalCannotRunTwiceForTheSameNight() public {
        vm.prank(h1);
        pool.subscribe(1, 100e18);
        _night();
        uint256 n2 = _schedule();
        pool.renewMany(n2, _wallets());
        pool.renewMany(n2, _wallets());
        assertEq(pool.getSession(n2).coverCount, 1);
        assertTrue(pool.renewedFor(n2, h1));
    }

    function test_failedRenewalIsSkippedNotRevertedAndNothingIsOwed() public {
        vm.prank(h1);
        pool.subscribe(1, 100e18);
        vm.prank(h2);
        pool.subscribe(1, 100e18);
        _night();
        uint256 n2 = _schedule();

        vm.prank(h1);
        usdc.approve(address(pool), 0); // h1 can no longer pay the fee

        pool.renewMany(n2, _wallets()); // must not revert
        assertEq(pool.getSession(n2).coverCount, 1, "only h2 was covered");
        assertEq(pool.getCover(n2, 0).holder, h2);
        assertFalse(pool.renewedFor(n2, h1), "skipped night is not marked");
        assertEq(pool.coveredRaw(n2, h1), 0, "no cover leaked");
    }

    function test_stockSoldMeansSkipped() public {
        vm.prank(h1);
        pool.subscribe(1, 100e18);
        _night();
        uint256 n2 = _schedule();
        vm.prank(h1);
        stock.transfer(anyone, 1_000e18);
        pool.renewMany(n2, _wallets());
        assertEq(pool.getSession(n2).coverCount, 0);
    }

    function test_cancelKeepsOneMoreNightThenStops() public {
        vm.prank(h1);
        pool.subscribe(1, 100e18);
        _night(); // night 1
        uint256 n2 = _schedule(); // night 2 is scheduled, then h1 cancels during it
        vm.prank(h1);
        pool.cancelSubscription(); // cancelAfter = 2 + 1 = 3
        pool.renewMany(n2, _wallets());
        assertEq(pool.getSession(n2).coverCount, 1, "night 2 still renewed");
        _closeAt(100e8);
        pool.settle(n2, _openPrint(100e8));

        uint256 n3 = _night(); // covered: id 3 <= cancelAfter
        assertEq(pool.getSession(n3).coverCount, 1, "notice night is covered");
        uint256 n4 = _night();
        assertEq(pool.getSession(n4).coverCount, 0, "after the notice it stops");
    }

    function test_cannotCancelWhenNotSubscribedOrTwice() public {
        vm.prank(h1);
        vm.expectRevert(CoverPool.NotSubscribed.selector);
        pool.cancelSubscription();
        vm.startPrank(h1);
        pool.subscribe(1, 100e18);
        pool.cancelSubscription();
        vm.expectRevert(CoverPool.NotSubscribed.selector);
        pool.cancelSubscription();
        vm.stopPrank();
    }

    function test_resubscribingRestartsTheWait() public {
        vm.prank(h1);
        pool.subscribe(1, 100e18);
        _night();
        _fundForNextNight();
        _night(); // night 2 covered
        vm.startPrank(h1);
        pool.cancelSubscription();
        pool.subscribe(1, 200e18); // allowed once cancelled, restarts the wait
        vm.stopPrank();
        (,,, uint64 since,,) = pool.subs(h1);
        assertEq(since, pool.sessionCount());
        assertFalse(pool.subscriptionDue(pool.sessionCount() + 1, h1), "next night is waiting");
        assertTrue(pool.subscriptionDue(pool.sessionCount() + 2, h1), "second night is covered");
    }

    function test_pausedSalesSkipRenewals() public {
        vm.prank(h1);
        pool.subscribe(1, 100e18);
        _night();
        uint256 n2 = _schedule();
        vm.prank(keeper);
        pool.setSalesPaused(true);
        pool.renewMany(n2, _wallets());
        assertEq(pool.getSession(n2).coverCount, 0);
    }

    function test_renewOneOnlyCallableByThePool() public {
        vm.expectRevert(CoverPool.OnlySelf.selector);
        pool.renewOne(1, h1);
    }

    function test_subscriberPaysThePremiumAndCoverPaysOutLikeAnyOther() public {
        vm.prank(h1);
        pool.subscribe(1, 100e18);
        _night();
        uint256 n2 = _schedule();
        uint256 before = _bal(h1);
        pool.renewMany(n2, _wallets());
        assertEq(before - _bal(h1), 60e6, "paid exactly the fee");
        _closeAt(100e8);
        uint80 r = _openPrint(80e8); // 20% drop, capped payout $1,000
        pool.settle(n2, r);
        assertEq(_bal(h1), before - 60e6 + 1_000e6);
    }

    /// The pool-use limit still applies to renewals.
    function test_limitsApplyToRenewals() public {
        pool = new CoverPool(
            _usdcI(), _stockI(), _feedI(), keeper,
            CoverPool.Params(REF_MAX_AGE, PRINT_WINDOW, VOID_GRACE, BUY_CUTOFF, LOCK_WINDOW, 64, 10e6, 10_000, 100),
            _tiers()
        ); // one wallet may reserve 1% of the pool = $1,000
        _fund(uw, POOL_SEED, 0);
        _fund(h1, 1_000_000e6, 0);
        vm.prank(uw);
        pool.deposit(POOL_SEED, uw);
        vm.prank(h1);
        pool.subscribe(1, 200e18); // would reserve $2,000, over the limit
        _night();
        uint256 n2 = _schedule();
        pool.renewMany(n2, _wallets());
        assertEq(pool.getSession(n2).coverCount, 0, "over the wallet limit, so skipped");
    }

    function _fundForNextNight() internal {
        vm.warp(block.timestamp + 1 hours); // keep the feed fresh enough between nights
        feed.pushRound(100e8);
    }
}
