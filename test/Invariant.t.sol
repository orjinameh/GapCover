// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {CoverPool} from "../src/CoverPool.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// Randomised lifecycle driver. Every action is wrapped so a revert is a no-op, not a failure.
contract Handler is Base {
    uint256 public totalPaidOut;
    uint256 public sessionsSettled;

    function init() external {
        setUp();
        targetPoolAssets = POOL_SEED;
    }

    uint256 public targetPoolAssets;

    function poolAddr() external view returns (CoverPool) {
        return pool;
    }

    function usdcAddr() external view returns (MockUSDC) {
        return usdc;
    }

    function actDeposit(uint256 amt) external {
        amt = bound(amt, 1e6, 50_000e6);
        _fund(uw, amt, 0);
        vm.prank(uw);
        try pool.deposit(amt, uw) {} catch {}
    }

    function actWithdraw(uint256 pct) external {
        pct = bound(pct, 1, 100);
        uint256 sh = (pool.shares(uw) * pct) / 100;
        if (sh == 0) return;
        vm.prank(uw);
        try pool.withdraw(sh, uw) {} catch {}
    }

    function actSchedule() external {
        if (pool.activeSession() != 0) return;
        feed.pushRound(100e8);
        _schedule();
    }

    function actBuy(uint256 tokens, uint8 tier, bool useH2) external {
        if (pool.activeSession() == 0) return;
        tokens = bound(tokens, 1e18, 400e18);
        tier = uint8(bound(tier, 0, 2));
        address who = useH2 ? h2 : h1;
        feed.pushRound(100e8);
        vm.prank(who);
        try pool.buyCover(sid, tokens, tier) {} catch {}
    }

    function actClose() external {
        if (pool.activeSession() == 0) return;
        if (pool.getSession(sid).status != CoverPool.Status.Scheduled) return;
        _closeAt(100e8);
    }

    function actSettle(uint256 price) external {
        if (pool.activeSession() == 0) return;
        if (pool.getSession(sid).status != CoverPool.Status.Closed) return;
        price = bound(price, 1e8, 150e8);
        uint80 r = _openPrint(price);
        uint256 before = pool.totalAssets();
        try pool.settle(sid, r) {
            sessionsSettled++;
            uint256 after_ = pool.totalAssets();
            if (before > after_) totalPaidOut += before - after_;
        } catch {}
    }

    function actVoid() external {
        if (pool.activeSession() == 0) return;
        vm.warp(openTime + PRINT_WINDOW + VOID_GRACE + 1 hours);
        try pool.voidSession(sid) {} catch {}
    }

    function actClaim(bool useH2) external {
        vm.prank(useH2 ? h2 : h1);
        try pool.claim() {} catch {}
    }
}

contract InvariantCoverPool is Base {
    Handler internal handler;

    function setUp() public override {
        handler = new Handler();
        handler.init();
        pool = handler.poolAddr();
        usdc = handler.usdcAddr();
        targetContract(address(handler));
    }

    /// The pool always holds enough to cover every reserved max payout plus deferred claims.
    function invariant_poolIsSolvent() public view {
        uint256 active = pool.activeSession();
        uint256 reserved = active == 0 ? 0 : pool.getSession(active).reserved;
        assertGe(usdc.balanceOf(address(pool)), reserved + pool.pendingClaims());
    }

    /// Reserved liability never exceeds total assets once covers are sold.
    function invariant_reserveBackedByAssets() public view {
        uint256 active = pool.activeSession();
        if (active == 0) return;
        assertGe(pool.totalAssets(), pool.getSession(active).reserved);
    }

    /// No shares are created from nothing.
    function invariant_underwriterCanNeverRedeemMoreThanAssets() public view {
        assertLe(pool.convertToAssets(pool.totalShares()), pool.totalAssets());
    }
}

contract FuzzCoverPool is Base {
    /// Payout is monotonic in the drop, never above the cap, never above the reserve.
    function testFuzz_payoutBounded(uint256 settlePx, uint8 tier, uint256 tokens) public {
        tier = uint8(bound(tier, 0, 2));
        tokens = bound(tokens, 1e18, 900e18);
        settlePx = bound(settlePx, 1, 1_000e8);
        _schedule();
        uint256 c = _buy(h1, tokens, tier);
        CoverPool.Cover memory cv = pool.getCover(sid, c);
        _closeAt(100e8);
        uint256 pay = pool.previewPayout(sid, c, settlePx);
        assertLe(pay, cv.maxPayout);
        if (settlePx >= 100e8) assertEq(pay, 0);
        // monotonic: a lower settle price never pays less
        if (settlePx > 1) assertGe(pool.previewPayout(sid, c, settlePx - 1), 0);
        assertGe(pay, pool.previewPayout(sid, c, settlePx + 1));
    }

    /// Premium is never below the exact rate and never more than one unit above.
    function testFuzz_premiumCeil(uint256 tokens, uint8 tier) public {
        tier = uint8(bound(tier, 0, 2));
        tokens = bound(tokens, 1e18, 900e18);
        _schedule();
        uint256 c = _buy(h1, tokens, tier);
        CoverPool.Cover memory cv = pool.getCover(sid, c);
        (, , uint16 pbps) = pool.tiers(tier);
        assertGe(uint256(cv.premium) * 10_000, uint256(cv.notional) * pbps);
        assertLt((uint256(cv.premium) - 1) * 10_000, uint256(cv.notional) * pbps);
    }

    /// Deposit then immediate withdraw never returns more than was put in.
    function testFuzz_noFreeShares(uint256 amt) public {
        amt = bound(amt, 1e6, 500_000e6);
        address u = makeAddr("fz");
        _fund(u, amt, 0);
        vm.startPrank(u);
        uint256 sh = pool.deposit(amt, u);
        uint256 out = pool.withdraw(sh, u);
        vm.stopPrank();
        assertLe(out, amt);
    }
}
