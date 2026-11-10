// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {CoverPool} from "../src/CoverPool.sol";

contract CoverPoolSettle is Base {
    // ------------------------------------------------------------ happy path

    /// The demo money shot: 6% gap, standard tier, 10k notional -> 400 payout, atomic.
    function test_gapPaysExcessOverDeductibleAtomically() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        uint80 r = _openPrint(94e8);
        uint256 before = _bal(h1);
        vm.prank(anyone); // permissionless
        pool.settle(sid, r);
        assertEq(_bal(h1) - before, 400e6, "payout lands in the same tx");
        CoverPool.Session memory s = pool.getSession(sid);
        assertEq(uint8(s.status), uint8(CoverPool.Status.Settled));
        assertEq(s.refPrice, 100e8);
        assertEq(s.settlePrice, 94e8);
        assertEq(pool.activeSession(), 0);
        assertFalse(pool.locked());
        assertEq(pool.totalAssets(), POOL_SEED + 60e6 - 400e6);
    }

    function test_coveredVersusUncoveredNet() public {
        _schedule();
        _buy(h1, 100e18, 1); // covered
        // h2 holds the same tokens, uncovered
        uint256 h1Start = _bal(h1);
        _closeAt(100e8);
        uint80 r = _openPrint(94e8);
        pool.settle(sid, r);
        uint256 loss = 600e6; // 6% of 10,000
        int256 coveredNet = int256(_bal(h1)) - int256(h1Start) - int256(loss);
        // h1Start already excludes the premium paid
        assertEq(coveredNet, int256(400e6) - int256(loss)); // -200 after premium already spent
        assertEq(_bal(h2), 1_000_000e6, "uncovered wallet gets nothing");
    }

    function test_gapBelowDeductiblePaysZero() public {
        _schedule();
        _buy(h1, 100e18, 1); // 2% deductible
        _closeAt(100e8);
        uint80 r = _openPrint(9850e6); // 98.50: 1.5% drop
        uint256 before = _bal(h1);
        pool.settle(sid, r);
        assertEq(_bal(h1), before);
        assertEq(pool.totalAssets(), POOL_SEED + 60e6);
    }

    function test_exactDeductibleBoundaryPaysZero() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        uint80 r = _openPrint(98e8); // exactly 2%
        uint256 before = _bal(h1);
        pool.settle(sid, r);
        assertEq(_bal(h1), before);
    }

    function test_justOverDeductiblePaysDust() public {
        _schedule();
        uint256 c = _buy(h1, 100e18, 1);
        _closeAt(100e8);
        assertGt(pool.previewPayout(sid, c, 9799e6), 0); // 97.99
    }

    function test_capBinds() public {
        _schedule();
        _buy(h1, 100e18, 1); // cap 10% -> 1000
        _closeAt(100e8);
        uint80 r = _openPrint(40e8); // 60% crash
        uint256 before = _bal(h1);
        pool.settle(sid, r);
        assertEq(_bal(h1) - before, 1_000e6);
    }

    function test_priceUpPaysZero() public {
        _schedule();
        _buy(h1, 100e18, 2);
        _closeAt(100e8);
        uint80 r = _openPrint(130e8);
        uint256 before = _bal(h1);
        pool.settle(sid, r);
        assertEq(_bal(h1), before);
    }

    function test_threeTiersOnSameGap() public {
        _schedule();
        uint256 a = _buy(h1, 100e18, 0); // ded 5 cap 15
        uint256 b = _buy(h1, 100e18, 1); // ded 2 cap 10
        uint256 c = _buy(h1, 100e18, 2); // ded 1 cap 5
        _closeAt(100e8);
        // 6% drop: 1%, 4%, 5% (capped at 5%)
        assertEq(pool.previewPayout(sid, a, 94e8), 100e6);
        assertEq(pool.previewPayout(sid, b, 94e8), 400e6);
        assertEq(pool.previewPayout(sid, c, 94e8), 500e6);
    }

    function test_multipleHoldersPaidProRata() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _buy(h2, 200e18, 1);
        _closeAt(100e8);
        uint80 r = _openPrint(94e8);
        uint256 b1 = _bal(h1);
        uint256 b2 = _bal(h2);
        pool.settle(sid, r);
        assertEq(_bal(h1) - b1, 400e6);
        assertEq(_bal(h2) - b2, 800e6);
    }

    // ---------------------------------------------------- frozen feed refusal

    function test_frozenFeedRefusesSettle() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        vm.warp(openTime + 1 hours); // market open, but nobody (nothing) printed
        (uint80 latest,,,,) = feed.latestRoundData();
        vm.expectRevert(CoverPool.PrintBeforeOpen.selector);
        pool.settle(sid, latest);
    }

    function test_closeRefusesStaleReference() public {
        saleStart = uint64(block.timestamp);
        closeTime = saleStart + 2 days; // ref print will be 49h old at close
        openTime = closeTime + 60 hours;
        vm.prank(keeper);
        sid = pool.scheduleSession(saleStart, closeTime, openTime);
        vm.warp(closeTime + 1);
        vm.expectRevert(CoverPool.FeedStale.selector);
        pool.closeSession(sid);
    }

    function test_closeRefusesPostOpenReference() public {
        _schedule();
        _buy(h1, 100e18, 1);
        vm.warp(closeTime + 1);
        feed.pushRoundAt(100e8, openTime + 1); // a print dated after open (impossible live, still refused)
        vm.expectRevert(CoverPool.FeedStale.selector);
        pool.closeSession(sid);
    }

    function test_closeWindowEnforced() public {
        _schedule();
        feed.pushRoundAt(100e8, closeTime - 30 minutes);
        vm.warp(closeTime - 1);
        vm.expectRevert(CoverPool.NotClosable.selector);
        pool.closeSession(sid);
        vm.warp(closeTime + LOCK_WINDOW + 1);
        vm.expectRevert(CoverPool.NotClosable.selector);
        pool.closeSession(sid);
    }

    // -------------------------------------------------- which round is allowed

    function test_settleBeforeOpenReverts() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        (uint80 r,,,,) = feed.latestRoundData();
        vm.warp(openTime - 1);
        vm.expectRevert(CoverPool.NotSettleable.selector);
        pool.settle(sid, r);
    }

    function test_settleBeforeCloseSnapshotReverts() public {
        _schedule();
        (uint80 r,,,,) = feed.latestRoundData();
        vm.warp(openTime + 1);
        vm.expectRevert(CoverPool.NotSettleable.selector);
        pool.settle(sid, r);
    }

    function test_laterRoundIsNotFirstPrint() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        _openPrint(99e8); // first print, benign
        vm.warp(block.timestamp + 10 minutes);
        uint80 second = feed.pushRound(80e8); // attacker wants this crash price
        vm.expectRevert(CoverPool.NotFirstPrint.selector);
        pool.settle(sid, second);
    }

    function test_firstPrintIsAccepted() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        uint80 first = _openPrint(99e8);
        vm.warp(block.timestamp + 10 minutes);
        feed.pushRound(80e8);
        pool.settle(sid, first); // the first one still wins even though a later one exists
        assertEq(pool.getSession(sid).settlePrice, 99e8);
    }

    function test_printTooLateReverts() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        vm.warp(openTime + PRINT_WINDOW + 1);
        uint80 r = feed.pushRound(94e8);
        vm.expectRevert(CoverPool.PrintTooLate.selector);
        pool.settle(sid, r);
    }

    function test_printExactlyAtWindowEdgeAccepted() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        vm.warp(openTime + PRINT_WINDOW);
        uint80 r = feed.pushRound(94e8);
        pool.settle(sid, r);
    }

    function test_printExactlyAtOpenAccepted() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        vm.warp(openTime);
        uint80 r = feed.pushRound(94e8); // updatedAt == openTime counts as at or after open
        pool.settle(sid, r);
    }

    function test_unknownRoundReverts() public {
        _schedule();
        _closeAt(100e8);
        vm.warp(openTime + 1);
        vm.expectRevert(CoverPool.RoundNotProvable.selector);
        pool.settle(sid, 12345);
    }

    function test_phaseBoundaryRoundNotProvable() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        vm.warp(openTime + 1 minutes);
        feed.bumpPhase();
        uint80 r = feed.pushRound(94e8); // aggregator part == 1
        vm.expectRevert(CoverPool.RoundNotProvable.selector);
        pool.settle(sid, r);
    }

    function test_zeroOrNegativeAnswerRefused() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        uint80 r = _openPrint(0);
        vm.expectRevert(CoverPool.BadAnswer.selector);
        pool.settle(sid, r);
    }

    // ------------------------------------------------------------ double settle

    function test_doubleSettleReverts() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        uint80 r = _openPrint(94e8);
        pool.settle(sid, r);
        vm.expectRevert(CoverPool.NotSettleable.selector);
        pool.settle(sid, r);
        vm.expectRevert(CoverPool.NotVoidable.selector);
        pool.voidSession(sid);
    }

    function test_settleAfterGraceReverts() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        vm.warp(openTime + 1 minutes);
        uint80 r = feed.pushRound(94e8);
        vm.warp(openTime + PRINT_WINDOW + VOID_GRACE + 1);
        vm.expectRevert(CoverPool.NotSettleable.selector);
        pool.settle(sid, r);
    }

    // ---------------------------------------------------------------- multiplier

    function test_multiplierChangedBlocksSettleAndAllowsVoid() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        stock.scheduleUIMultiplier(2e18, openTime - 1 hours); // 2 for 1 lands in the gap
        uint80 r = _openPrint(94e8);
        vm.expectRevert(CoverPool.MultiplierChanged.selector);
        pool.settle(sid, r);
        uint256 before = _bal(h1);
        pool.voidSession(sid);
        assertEq(_bal(h1) - before, 60e6, "premium refunded");
        assertEq(pool.activeSession(), 0);
        assertFalse(pool.locked());
    }

    function test_pendingMultiplierAtSettleBlocks() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        uint80 r = _openPrint(94e8);
        stock.scheduleUIMultiplier(2e18, block.timestamp + 1 days); // announced, not yet effective
        vm.expectRevert(CoverPool.MultiplierChanged.selector);
        pool.settle(sid, r);
    }

    function test_unchangedMultiplierWithPastUpdateEqualAtCloseSettles() public {
        // multiplier changed BEFORE close is fine: it is snapshotted at close
        _schedule();
        stock.scheduleUIMultiplier(2e18, block.timestamp);
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        uint80 r = _openPrint(94e8);
        pool.settle(sid, r);
        assertEq(pool.getSession(sid).multiplierAtClose, 2e18);
    }

    // ---------------------------------------------------------------- void paths

    function test_voidNeverClosed() public {
        _schedule();
        _buy(h1, 100e18, 1);
        vm.expectRevert(CoverPool.NotVoidable.selector);
        pool.voidSession(sid); // too early
        vm.warp(closeTime + LOCK_WINDOW + 1);
        uint256 before = _bal(h1);
        pool.voidSession(sid);
        assertEq(_bal(h1) - before, 60e6);
        assertEq(uint8(pool.getSession(sid).status), uint8(CoverPool.Status.Voided));
        assertFalse(pool.locked());
        assertEq(pool.totalAssets(), POOL_SEED);
    }

    function test_voidNoPrint() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        vm.warp(openTime + PRINT_WINDOW + VOID_GRACE);
        vm.expectRevert(CoverPool.NotVoidable.selector);
        pool.voidSession(sid);
        vm.warp(openTime + PRINT_WINDOW + VOID_GRACE + 1);
        uint256 before = _bal(h1);
        pool.voidSession(sid);
        assertEq(_bal(h1) - before, 60e6);
        assertEq(pool.totalAssets(), POOL_SEED);
    }

    function test_voidRefusedWhileSettleStillPossible() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        vm.warp(openTime + 1 hours);
        vm.expectRevert(CoverPool.NotVoidable.selector);
        pool.voidSession(sid);
    }

    function test_poolReusableAfterVoid() public {
        _schedule();
        _buy(h1, 100e18, 1);
        vm.warp(closeTime + LOCK_WINDOW + 1);
        pool.voidSession(sid);
        feed.pushRound(100e8);
        _schedule();
        _buy(h1, 100e18, 1);
        assertEq(sid, 2);
    }

    // ------------------------------------------------- insolvency and receivers

    function test_revertingReceiverDoesNotBlockSettleAndCanClaimLater() public {
        _schedule();
        _buy(h1, 100e18, 1);
        _buy(h2, 100e18, 1);
        _closeAt(100e8);
        uint80 r = _openPrint(94e8);
        usdc.setBlocked(h1, true); // like a USDC blacklist
        pool.settle(sid, r); // must not revert
        assertEq(pool.claimable(h1), 400e6);
        assertEq(pool.pendingClaims(), 400e6);
        assertEq(_bal(h2), 1_000_000e6 - 60e6 + 400e6, "other holder still paid");
        // pending claims are not underwriter assets
        assertEq(pool.totalAssets(), POOL_SEED + 120e6 - 800e6);
        vm.prank(h1);
        vm.expectRevert(); // still blocked
        pool.claim();
        usdc.setBlocked(h1, false);
        uint256 before = _bal(h1);
        vm.prank(h1);
        pool.claim();
        assertEq(_bal(h1) - before, 400e6);
        assertEq(pool.pendingClaims(), 0);
    }

    function test_fullWipeoutThenFreshDeposit() public {
        // tiny pool, cover that pays its full cap, pool drained to the reserve limit
        pool = _newPool(8);
        _fund(uw, 0, 0);
        address u2 = makeAddr("u2");
        _fund(u2, 1_000e6, 0);
        vm.prank(u2);
        pool.deposit(1_000e6, u2);
        _fund(h1, 0, 0);
        _schedule();
        // 100 tokens at $100: standard cap 1,000 reserve needs <= assets + premium = 1,060
        _buy(h1, 100e18, 1);
        _closeAt(100e8);
        uint80 r = _openPrint(1e8); // total crash, full cap paid
        pool.settle(sid, r);
        // underwriter keeps premium minus cap: 1000 + 60 - 1000 = 60
        assertEq(pool.totalAssets(), 60e6);
        assertGt(pool.sharePrice(), 0);
        // a fresh depositor still gets sensible shares and can exit near par
        address u3 = makeAddr("u3");
        _fund(u3, 500e6, 0);
        vm.startPrank(u3);
        uint256 sh = pool.deposit(500e6, u3);
        uint256 out = pool.convertToAssets(sh);
        vm.stopPrank();
        assertApproxEqRel(out, 500e6, 1e15);
        assertLe(out, 500e6);
    }

    function test_totalWipeoutPoolAtZeroAssetsStillWorks() public {
        // Only possible with donations removed; assert the math does not divide by zero on an empty pool.
        CoverPool fresh = _newPool(4);
        assertEq(fresh.totalAssets(), 0);
        assertEq(fresh.convertToShares(1e6), 1e6 * 1e3);
        assertEq(fresh.convertToAssets(0), 0);
    }

    function test_payoutNeverExceedsReserve() public {
        _schedule();
        _buy(h1, 100e18, 0);
        _buy(h1, 100e18, 1);
        _buy(h1, 100e18, 2);
        uint256 reserved = pool.getSession(sid).reserved;
        _closeAt(100e8);
        uint80 r = _openPrint(1e8);
        uint256 before = pool.totalAssets();
        pool.settle(sid, r);
        assertLe(before - pool.totalAssets(), reserved);
    }

    function test_voidWithNoCoversIsClean() public {
        _schedule();
        vm.warp(closeTime + LOCK_WINDOW + 1);
        pool.voidSession(sid);
        assertEq(pool.activeSession(), 0);
    }

    function test_settleWithNoCoversIsClean() public {
        _schedule();
        _closeAt(100e8);
        uint80 r = _openPrint(94e8);
        pool.settle(sid, r);
        assertEq(uint8(pool.getSession(sid).status), uint8(CoverPool.Status.Settled));
    }
}
