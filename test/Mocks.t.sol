// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockB20} from "../src/mocks/MockB20.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";

contract MocksTest is Test {
    MockB20 t;
    MockAggregator f;
    address a = makeAddr("a");

    function setUp() public {
        vm.warp(1_700_000_000);
        t = new MockB20("X", "X", 18);
        f = new MockAggregator(8, "X / USD");
        t.mint(a, 100e18);
    }

    function test_defaultMultiplierIsWad() public view {
        assertEq(t.uiMultiplier(), 1e18);
        assertEq(t.balanceOfUI(a), 100e18);
    }

    function test_twoForOneDocExample() public {
        // docs: multiplier 2e18, raw 100 -> UI 200
        t.scheduleUIMultiplier(2e18, block.timestamp);
        assertEq(t.balanceOfUI(a), 200e18);
        assertEq(t.balanceOf(a), 100e18, "raw untouched");
        assertEq(t.toUIAmount(100e18), 200e18);
        assertEq(t.fromUIAmount(200e18), 100e18);
    }

    function test_oneForTwoDocExample() public {
        t.scheduleUIMultiplier(5e17, block.timestamp);
        assertEq(t.balanceOfUI(a), 50e18);
    }

    function test_scheduledUpdateFlipsSilently() public {
        t.scheduleUIMultiplier(2e18, block.timestamp + 1 days);
        assertEq(t.uiMultiplier(), 1e18);
        assertGt(t.effectiveAt(), block.timestamp);
        vm.warp(block.timestamp + 1 days);
        assertEq(t.uiMultiplier(), 2e18);
        assertLe(t.effectiveAt(), block.timestamp);
    }

    function test_cancelPending() public {
        t.scheduleUIMultiplier(2e18, block.timestamp + 1 days);
        t.cancelUIMultiplierUpdate();
        vm.warp(block.timestamp + 2 days);
        assertEq(t.uiMultiplier(), 1e18);
    }

    function test_aggregatorRoundsAndPhases() public {
        uint80 r1 = f.pushRound(100e8);
        uint80 r2 = f.pushRound(101e8);
        assertEq(r2, r1 + 1);
        (uint80 id, int256 ans,, uint256 upd, uint80 inRound) = f.latestRoundData();
        assertEq(id, r2);
        assertEq(ans, 101e8);
        assertEq(upd, block.timestamp);
        assertEq(inRound, r2);
        f.bumpPhase();
        uint80 r3 = f.pushRound(102e8);
        assertEq(uint64(r3), 1, "aggregator part resets");
        assertEq(r3 >> 64, 2);
    }

    function test_aggregatorMissingRoundReverts() public {
        vm.expectRevert("No data present");
        f.getRoundData(7);
        vm.expectRevert("No data present");
        f.latestRoundData();
    }
}
