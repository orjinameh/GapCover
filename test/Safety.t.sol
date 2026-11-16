// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {CoverPool} from "../src/CoverPool.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";

/// Sequencer uptime check, grace period, and the suspect-price bound at settlement.
contract SafetyTest is Base {
    MockAggregator seq;
    uint32 constant GRACE = 1 hours;

    function setUp() public override {
        super.setUp();
        seq = new MockAggregator(0, "L2 sequencer (mock)");
        seq.pushRoundAt(0, T0 - 1 days); // up, since a day ago
        pool = new CoverPool(
            _usdcI(), _stockI(), _feedI(), keeper,
            CoverPool.Params(REF_MAX_AGE, PRINT_WINDOW, VOID_GRACE, BUY_CUTOFF, LOCK_WINDOW, 64, 10e6, 10_000, 10_000, false, 0, address(seq), GRACE, 5000),
            _tiers()
        );
        _fund(uw, POOL_SEED, 0);
        _fund(h1, 1_000_000e6, 0);
        vm.prank(uw);
        pool.deposit(POOL_SEED, uw);
    }

    function test_paramsReturnsTheSettings() public view {
        CoverPool.Params memory q = pool.params();
        assertEq(q.sequencerFeed, address(seq));
        assertEq(q.sequencerGrace, GRACE);
        assertEq(q.minSettleBps, 5000);
        assertEq(q.maxCovers, 64);
    }

    function test_buyWorksWhenSequencerIsUp() public {
        _schedule();
        _buy(h1, 100e18, 1);
        assertEq(pool.getSession(sid).coverCount, 1);
    }

    function test_buyRefusedWhileSequencerIsDown() public {
        _schedule();
        seq.pushRoundAt(1, block.timestamp);
        vm.prank(h1);
        vm.expectRevert(CoverPool.SequencerDown.selector);
        pool.buyCover(sid, 100e18, 1);
    }

    function test_buyRefusedDuringGracePeriodThenAllowed() public {
        _schedule();
        seq.pushRoundAt(1, block.timestamp);
        seq.pushRoundAt(0, block.timestamp); // came back now
        vm.prank(h1);
        vm.expectRevert(CoverPool.SequencerGrace.selector);
        pool.buyCover(sid, 100e18, 1);

        vm.warp(block.timestamp + GRACE + 1);
        feed.pushRound(100e8); // keep the price fresh
        _buy(h1, 100e18, 1);
        assertEq(pool.getSession(sid).coverCount, 1);
    }

    function test_closeRefusedWhileSequencerIsDown() public {
        _schedule();
        _buy(h1, 100e18, 1);
        feed.pushRoundAt(100e8, closeTime - 30 minutes);
        vm.warp(closeTime + 1 minutes);
        seq.pushRoundAt(1, block.timestamp);
        vm.expectRevert(CoverPool.SequencerDown.selector);
        pool.closeSession(sid);
    }

    function test_settleRefusedWhileSequencerIsDown() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        uint80 r = _openPrint(90e8);
        seq.pushRoundAt(1, block.timestamp);
        vm.expectRevert(CoverPool.SequencerDown.selector);
        pool.settle(sid, r);
    }

    function test_suspectLowPrintIsNotPaid() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        uint80 r = _openPrint(1e8); // a $1 print on a $100 stock: a glitch
        vm.expectRevert(CoverPool.PriceOutOfBounds.selector);
        pool.settle(sid, r);
        // the night stays open and cannot pay on that print
        assertEq(uint8(pool.getSession(sid).status), uint8(CoverPool.Status.Closed));
    }

    function test_suspectPrintNightCanBeVoidedAndFeesRefunded() public {
        _schedule();
        uint256 before = _bal(h1);
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        _openPrint(1e8);
        vm.warp(openTime + PRINT_WINDOW + VOID_GRACE + 1);
        vm.prank(anyone);
        pool.voidSession(sid);
        assertEq(_bal(h1), before, "fee refunded in full");
    }

    function test_bigButGenuineDropStillPaysBelowTheBound() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        uint80 r = _openPrint(60e8); // 40% drop is above the 50% floor, pays the capped amount
        uint256 before = _bal(h1);
        pool.settle(sid, r);
        assertEq(_bal(h1) - before, 1_000e6);
    }

    function test_constructorRejectsBadBound() public {
        vm.expectRevert(CoverPool.BadConfig.selector);
        new CoverPool(
            _usdcI(), _stockI(), _feedI(), keeper,
            CoverPool.Params(REF_MAX_AGE, PRINT_WINDOW, VOID_GRACE, BUY_CUTOFF, LOCK_WINDOW, 64, 10e6, 10_000, 10_000, false, 0, address(0), 0, 10_001),
            _tiers()
        );
    }
}
