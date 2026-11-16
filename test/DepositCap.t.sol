// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {CoverPool} from "../src/CoverPool.sol";

/// The beta limits how much money the pool can take in.
contract DepositCapTest is Base {
    address u2 = makeAddr("u2");

    function setUp() public override {
        super.setUp();
        pool = new CoverPool(
            _usdcI(), _stockI(), _feedI(), keeper,
            CoverPool.Params(REF_MAX_AGE, PRINT_WINDOW, VOID_GRACE, BUY_CUTOFF, LOCK_WINDOW, 64, 10e6, 10_000, 10_000, false, 2_000e6, address(0), 0, 0),
            _tiers()
        );
        _fund(uw, POOL_SEED, 0);
        _fund(u2, 10_000e6, 0);
    }

    function test_depositsUpToTheCapWork() public {
        vm.prank(uw);
        pool.deposit(1_500e6, uw);
        vm.prank(u2);
        pool.deposit(500e6, u2); // exactly 2,000
        assertEq(pool.totalAssets(), 2_000e6);
    }

    function test_depositOverTheCapIsRefused() public {
        vm.prank(uw);
        pool.deposit(1_500e6, uw);
        vm.prank(u2);
        vm.expectRevert(CoverPool.DepositCapReached.selector);
        pool.deposit(501e6, u2);
    }

    function test_withdrawingFreesRoomUnderTheCap() public {
        vm.startPrank(uw);
        uint256 minted = pool.deposit(2_000e6, uw);
        vm.expectRevert(CoverPool.DepositCapReached.selector);
        pool.deposit(1e6, uw);
        pool.withdraw(minted / 2, uw);
        pool.deposit(500e6, uw); // room again
        vm.stopPrank();
    }

    function test_zeroCapMeansNoLimit() public {
        pool = new CoverPool(
            _usdcI(), _stockI(), _feedI(), keeper,
            CoverPool.Params(REF_MAX_AGE, PRINT_WINDOW, VOID_GRACE, BUY_CUTOFF, LOCK_WINDOW, 64, 10e6, 10_000, 10_000, false, 0, address(0), 0, 0),
            _tiers()
        );
        _fund(uw, POOL_SEED, 0);
        vm.prank(uw);
        pool.deposit(POOL_SEED, uw);
        assertEq(pool.totalAssets(), POOL_SEED);
    }
}
