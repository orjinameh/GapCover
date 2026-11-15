// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {CoverPool} from "../src/CoverPool.sol";

/// The pool shares are a standard ERC-20 token (gGAP).
contract ShareTokenTest is Base {
    address bob = makeAddr("bob");

    function test_metadata() public view {
        assertEq(pool.name(), "GapCover liquidity share");
        assertEq(pool.symbol(), "gGAP");
        assertEq(pool.decimals(), 9); // USDC 6 + 3
    }

    function test_balanceAndSupplyMatchShares() public view {
        assertEq(pool.balanceOf(uw), pool.shares(uw));
        assertEq(pool.totalSupply(), pool.totalShares());
        assertGt(pool.totalSupply(), 0);
    }

    function test_transferMovesValueAndNewOwnerCanWithdraw() public {
        uint256 bal = pool.balanceOf(uw);
        vm.prank(uw);
        assertTrue(pool.transfer(bob, bal / 2));
        assertEq(pool.balanceOf(bob), bal / 2);
        assertEq(pool.totalSupply(), bal);

        uint256 before = _bal(bob);
        vm.prank(bob);
        pool.withdraw(bal / 2, bob);
        assertApproxEqAbs(_bal(bob) - before, POOL_SEED / 2, 2);
    }

    function test_transferFromNeedsAllowance() public {
        uint256 bal = pool.balanceOf(uw);
        vm.prank(bob);
        vm.expectRevert(CoverPool.InsufficientAllowance.selector);
        pool.transferFrom(uw, bob, 1);

        vm.prank(uw);
        pool.approve(bob, 100);
        vm.prank(bob);
        pool.transferFrom(uw, bob, 60);
        assertEq(pool.allowance(uw, bob), 40);
        assertEq(pool.balanceOf(uw), bal - 60);
        assertEq(pool.balanceOf(bob), 60);
    }

    function test_cannotSendMoreThanOwned() public {
        uint256 bal = pool.balanceOf(uw);
        vm.prank(uw);
        vm.expectRevert(CoverPool.InsufficientShares.selector);
        pool.transfer(bob, bal + 1);
    }

    function test_cannotSendToZeroAddress() public {
        vm.prank(uw);
        vm.expectRevert(CoverPool.BadRecipient.selector);
        pool.transfer(address(0), 1);
    }

    function test_transfersWorkWhileLockedButWithdrawDoesNot() public {
        _schedule();
        _buy(h1, 100e18, 1);
        assertTrue(pool.locked());
        uint256 bal = pool.balanceOf(uw);

        vm.prank(uw);
        pool.transfer(bob, bal / 2);
        assertEq(pool.balanceOf(bob), bal / 2);

        vm.prank(bob);
        vm.expectRevert(CoverPool.PoolLocked.selector);
        pool.withdraw(bal / 2, bob);
    }

    function test_priceRisesWithFeesNotWithSupply() public {
        uint256 supply = pool.totalSupply();
        uint256 priceBefore = pool.sharePrice();
        _schedule();
        _buy(h1, 100e18, 1); // pays a fee into the pool
        assertEq(pool.totalSupply(), supply, "fees mint nothing");
        assertGt(pool.sharePrice(), priceBefore, "fees raise the price");
    }

    function test_depositMintsAtCurrentPrice() public {
        address u2 = makeAddr("u2");
        _fund(u2, 5_000e6, 0);
        vm.prank(u2);
        uint256 minted = pool.deposit(5_000e6, u2);
        assertEq(pool.balanceOf(u2), minted);
        assertEq(pool.totalSupply(), pool.balanceOf(uw) + minted);
    }
}
