// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {CoverPool} from "../src/CoverPool.sol";

/// With subscriptionOnly set, one-off buyCover is closed and subscriptions are the only way to get cover.
contract SubscriptionOnlyTest is Base {
    function setUp() public override {
        super.setUp();
        pool = new CoverPool(
            _usdcI(), _stockI(), _feedI(), keeper,
            CoverPool.Params(REF_MAX_AGE, PRINT_WINDOW, VOID_GRACE, BUY_CUTOFF, LOCK_WINDOW, 64, 10e6, 10_000, 10_000, true),
            _tiers()
        );
        _fund(uw, POOL_SEED, 0);
        _fund(h1, 1_000_000e6, 0);
        vm.prank(uw);
        pool.deposit(POOL_SEED, uw);
    }

    function test_oneOffBuyIsClosed() public {
        _schedule();
        vm.prank(h1);
        vm.expectRevert(CoverPool.OneOffClosed.selector);
        pool.buyCover(sid, 100e18, 1);
    }

    function test_subscriptionStillGetsCover() public {
        vm.prank(h1);
        pool.subscribe(1, 100e18);
        address[] memory w = new address[](1);
        w[0] = h1;

        uint256 n1 = _schedule(); // waiting night
        pool.renewMany(n1, w);
        assertEq(pool.getSession(n1).coverCount, 0);
        _closeAt(100e8);
        pool.settle(n1, _openPrint(100e8));

        uint256 n2 = _schedule(); // first covered night
        pool.renewMany(n2, w);
        assertEq(pool.getSession(n2).coverCount, 1);
        assertEq(pool.getCover(n2, 0).holder, h1);
    }
}
