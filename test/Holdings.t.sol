// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {CoverPool} from "../src/CoverPool.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

/// A cover pays only for stock the wallet still holds when the night settles.
/// Standard level: 2% deductible, 10% cap. A 9% drop on 100 tokens at $100 pays 7% of $10,000 = $700.
contract HoldingsTest is Base {
    uint256 constant FULL = 700e6;

    function _run(uint256 openPrice) internal returns (uint80 r) {
        _closeAt(100e8);
        r = _openPrint(openPrice);
    }

    function test_holderWhoKeepsTheStockIsPaidInFull() public {
        _schedule();
        _buy(h1, 100e18, 1);
        uint80 r = _run(91e8);
        uint256 before = _bal(h1);
        pool.settle(sid, r);
        assertEq(_bal(h1) - before, FULL);
    }

    function test_soldHalfAfterBuyingIsPaidHalf() public {
        _schedule();
        _buy(h1, 100e18, 1);
        vm.prank(h1);
        stock.transfer(anyone, 950e18); // keeps 50 of 1,000; only 50 of the 100 covered remain
        uint80 r = _run(91e8);
        uint256 before = _bal(h1);
        pool.settle(sid, r);
        assertEq(_bal(h1) - before, FULL / 2);
    }

    function test_soldEverythingAfterBuyingIsPaidNothing() public {
        _schedule();
        _buy(h1, 100e18, 1);
        vm.prank(h1);
        stock.transfer(anyone, 1_000e18);
        uint80 r = _run(91e8);
        uint256 before = _bal(h1);
        pool.settle(sid, r);
        assertEq(_bal(h1), before, "no stock, no payout");
        assertEq(uint8(pool.getSession(sid).status), uint8(CoverPool.Status.Settled));
        _assertSolvent();
    }

    function test_movedAwayThenBackBeforeSettleIsPaidInFull() public {
        _schedule();
        _buy(h1, 100e18, 1);
        vm.prank(h1);
        stock.transfer(anyone, 1_000e18);
        vm.prank(anyone);
        stock.transfer(h1, 1_000e18);
        uint80 r = _run(91e8);
        uint256 before = _bal(h1);
        pool.settle(sid, r);
        assertEq(_bal(h1) - before, FULL);
    }

    function test_holdingMoreThanCoveredDoesNotPayMore() public {
        _schedule();
        _buy(h1, 100e18, 1);
        vm.prank(h2);
        stock.transfer(h1, 500e18); // h1 now holds 1,500
        uint80 r = _run(91e8);
        uint256 before = _bal(h1);
        pool.settle(sid, r);
        assertEq(_bal(h1) - before, FULL, "paid for what was covered, no more");
    }

    function test_twoCoversSameWalletShareTheSameShortfall() public {
        _schedule();
        _buy(h1, 50e18, 1);
        _buy(h1, 50e18, 1);
        vm.prank(h1);
        stock.transfer(anyone, 950e18); // 50 left of 100 covered
        uint80 r = _run(91e8);
        uint256 before = _bal(h1);
        pool.settle(sid, r);
        assertEq(_bal(h1) - before, FULL / 2);
    }

    function test_previewMatchesWhatIsPaid() public {
        _schedule();
        uint256 c = _buy(h1, 100e18, 1);
        vm.prank(h1);
        stock.transfer(anyone, 950e18);
        uint80 r = _run(91e8);
        uint256 preview = pool.previewPayout(sid, c, 91e8);
        uint256 before = _bal(h1);
        pool.settle(sid, r);
        assertEq(_bal(h1) - before, preview);
    }

    function test_oneHolderMovingStockDoesNotAffectAnother() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _buy(h2, 100e18, 1);
        vm.prank(h1);
        stock.transfer(anyone, 1_000e18);
        uint80 r = _run(91e8);
        uint256 b1 = _bal(h1);
        uint256 b2 = _bal(h2);
        pool.settle(sid, r);
        assertEq(_bal(h1), b1);
        assertEq(_bal(h2) - b2, FULL);
    }

    function test_unreadableBalanceDoesNotBlockSettlement() public {
        _schedule();
        _buy(h1, 100e18, 1);
        uint80 r = _run(91e8);
        vm.mockCallRevert(address(stock), abi.encodeWithSelector(IERC20.balanceOf.selector, h1), "token says no");
        uint256 before = _bal(h1);
        pool.settle(sid, r);
        assertEq(_bal(h1) - before, FULL, "settles, and is not reduced");
    }
}
