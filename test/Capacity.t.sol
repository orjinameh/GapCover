// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {CoverPool} from "../src/CoverPool.sol";

/// How many covers one night can hold. Settle and void both loop over every cover,
/// so the cover limit is really a gas limit. These tests measure it.
/// Every holder buys $100 of stock at the Standard level (a $0.60 fee). A 10% drop pays $8 each.
contract CapacityTest is Base {
    uint256 constant N = 150;
    // Base allows about 16.7M gas per transaction. Stay well under it.
    uint256 constant GAS_BUDGET = 9_000_000;

    function _holder(uint256 i) internal pure returns (address) {
        return address(uint160(0x10000 + i));
    }

    function _fill() internal {
        pool = _newPool(200);
        _fund(uw, POOL_SEED, 0);
        vm.prank(uw);
        pool.deposit(POOL_SEED, uw);
        _schedule();
        for (uint256 i; i < N; ++i) {
            address a = _holder(i);
            _fund(a, 1_000e6, 10e18);
            vm.prank(a);
            pool.buyCover(sid, 1e18, 1);
        }
        assertEq(pool.getSession(sid).coverCount, N);
    }

    function test_settleWithManyCoversFitsTheBudgetAndPaysEveryone() public {
        _fill();
        _closeAt(100e8);
        uint80 r = _openPrint(90e8);
        uint256 g = gasleft();
        pool.settle(sid, r);
        uint256 used = g - gasleft();
        emit log_named_uint("gas to settle 150 covers", used);
        assertLt(used, GAS_BUDGET);
        for (uint256 i; i < N; i += 37) {
            assertEq(_bal(_holder(i)), 1_000e6 - 600_000 + 8e6, "paid $8 on a $0.60 fee");
        }
        assertEq(_bal(_holder(N - 1)), 1_000e6 - 600_000 + 8e6);
        _assertSolvent();
    }

    function test_voidWithManyCoversFitsTheBudgetAndRefundsEveryone() public {
        _fill();
        _closeAt(100e8);
        vm.warp(openTime + PRINT_WINDOW + VOID_GRACE + 1);
        uint256 g = gasleft();
        vm.prank(anyone);
        pool.voidSession(sid);
        uint256 used = g - gasleft();
        emit log_named_uint("gas to void 150 covers", used);
        assertLt(used, GAS_BUDGET);
        assertEq(_bal(_holder(0)), 1_000e6, "fee refunded in full");
        assertEq(_bal(_holder(N - 1)), 1_000e6, "fee refunded in full");
        _assertSolvent();
    }
}
