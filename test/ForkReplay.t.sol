// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {CoverPool} from "../src/CoverPool.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IB20Stock} from "../src/interfaces/IB20Stock.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";
import {MockB20} from "../src/mocks/MockB20.sol";

/// Replays the real Nvidia weekend (6 to 9 Nov 2026) through the real pool code, using the REAL price rounds
/// from the Chainlink NVDA feed and REAL USDC on a Base mainnet fork. No real money moves.
///
/// How the replay works: the feed keeps its old rounds, so the test reads them with getRoundData. Time is moved
/// with vm.warp. Only closeSession and the purchase read "the latest round", so those two calls are pointed at
/// the real Friday round with a mock call. Settlement uses the real Monday round id with no mock.
///
/// As in ForkReal.t.sol, the token is a stand-in (the real NVDAc cannot run inside Foundry).
///
/// Run:  BASE_RPC=... forge test --match-path test/ForkReplay.t.sol -vv > replay.log 2>&1
contract ForkReplayTest is Test {
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant NVDA_FEED = 0x04689a41629776563E6822F76f2e57D148d28513;
    uint256 constant MEASURED_MULTIPLIER = 1000537939576369481;

    // Friday 6 Nov 2026 20:00 ET (feed goes quiet) = 7 Nov 01:00 UTC. ET is UTC-5 after the 1 Nov clock change.
    uint64 constant FRI_CLOSE = 1794013200;
    // Friday 12:00 ET, a time when sales are open.
    uint64 constant FRI_NOON = 1793984400;
    // Monday 9 Nov 09:30 ET = 14:30 UTC: the regular open (the settlement decision).
    uint64 constant MON_OPEN = 1794234600;
    // Sunday 8 Nov 20:00 ET = Monday 9 Nov 01:00 UTC: when the feed resumes (the alternative).
    uint64 constant SUN_RESUME = 1794186000;

    struct Round {
        uint80 id;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredIn;
    }

    bool skipAll;
    CoverPool pool;
    MockB20 token;
    address holder;
    address uw;

    function setUp() public {
        string memory rpc = vm.envOr("BASE_RPC", string(""));
        if (bytes(rpc).length == 0) {
            skipAll = true;
            console.log("Skipped: set BASE_RPC to run the replay tests.");
            return;
        }
        vm.createSelectFork(rpc);
        holder = makeAddr("holder");
        uw = makeAddr("underwriter");

        token = new MockB20("NVIDIA Corporation", "NVDAc", 8);
        token.scheduleUIMultiplier(MEASURED_MULTIPLIER, 1);
        token.mint(holder, 100e8);

        CoverPool.Tier[] memory t = new CoverPool.Tier[](3);
        t[0] = CoverPool.Tier(500, 1500, 20);
        t[1] = CoverPool.Tier(200, 1000, 60);
        t[2] = CoverPool.Tier(100, 500, 90);

        pool = new CoverPool(
            IERC20(USDC),
            IB20Stock(address(token)),
            IAggregatorV3(NVDA_FEED),
            address(this),
            CoverPool.Params(7 days, 2 hours, 6 hours, 10 minutes, 1 hours, 64, 10e6, 10_000, 10_000, false, 0),
            t
        );

        deal(USDC, uw, 100_000e6);
        deal(USDC, holder, 10_000e6);
        vm.prank(uw);
        IERC20(USDC).approve(address(pool), type(uint256).max);
        vm.prank(holder);
        IERC20(USDC).approve(address(pool), type(uint256).max);
        vm.prank(uw);
        pool.deposit(100_000e6, uw);
    }

    /// Monday 09:30 ET rule: the Nvidia weekend should pay about $713 on $10,000 of Standard cover.
    function test_replay_nvidia_weekend_settled_at_monday_open() public {
        if (skipAll) return;
        (uint256 pay, uint256 notional, uint256 fee) = _replay(MON_OPEN);
        console.log("notional", notional);
        console.log("fee", fee);
        console.log("payout at Monday open", pay);
        assertGt(pay, 705e6, "payout too low");
        assertLt(pay, 720e6, "payout too high");
    }

    /// Sunday 20:00 ET rule: the same weekend should pay about $62.
    function test_replay_nvidia_weekend_settled_at_sunday_resume() public {
        if (skipAll) return;
        (uint256 pay,,) = _replay(SUN_RESUME);
        console.log("payout at Sunday resume", pay);
        assertGt(pay, 55e6, "payout too low");
        assertLt(pay, 70e6, "payout too high");
    }

    function _replay(uint64 openTime) internal returns (uint256 pay, uint256 notional, uint256 fee) {
        (Round memory fri, Round memory first) = _findRounds(FRI_CLOSE, openTime);
        console.log("friday last round, price", uint256(fri.answer));
        console.log("first print at or after open, price", uint256(first.answer));

        uint256 usdcBefore;
        (notional, fee, usdcBefore) = _fridayBuy(fri, openTime);
        _closeAndSettle(fri, first);

        pay = IERC20(USDC).balanceOf(holder) + fee - usdcBefore;
        assertApproxEqAbs(pay, _expected(notional, uint256(fri.answer), uint256(first.answer)), 2e6, "payout versus independent maths");
    }

    /// Friday: schedule, then buy $10,000 of Standard protection at the real Friday price.
    function _fridayBuy(Round memory fri, uint64 openTime) internal returns (uint256 notional, uint256 fee, uint256 usdcBefore) {
        vm.warp(FRI_NOON);
        pool.scheduleSession(FRI_NOON, FRI_CLOSE, openTime);
        _pointLatestAt(fri);
        usdcBefore = IERC20(USDC).balanceOf(holder);
        vm.prank(holder);
        uint256 coverId = pool.buyCover(1, (10_000e6 * 1e10) / uint256(fri.answer), 1);
        CoverPool.Cover memory c = pool.getCover(1, coverId);
        notional = c.notional;
        fee = c.premium;
    }

    /// Close at the Friday shutdown (reference = real last Friday print), then settle with the real round id.
    /// No mock at settlement, so the pool proves it is the first print itself.
    function _closeAndSettle(Round memory fri, Round memory first) internal {
        vm.warp(uint256(FRI_CLOSE) + 1 minutes);
        pool.closeSession(1);
        assertEq(pool.getSession(1).refPrice, uint256(fri.answer), "reference price");

        vm.clearMockedCalls();
        vm.warp(first.updatedAt + 1);
        pool.settle(1, first.id);

        CoverPool.Session memory s = pool.getSession(1);
        assertEq(uint8(s.status), uint8(CoverPool.Status.Settled), "status");
        assertEq(s.settlePrice, uint256(first.answer), "settle price");
    }

    /// Independent maths: pay (drop - 2%) of the notional, up to 10%.
    function _expected(uint256 notional, uint256 ref, uint256 settlePrice) internal pure returns (uint256) {
        if (settlePrice >= ref) return 0;
        uint256 lost = ref - settlePrice;
        uint256 ded = (ref * 2) / 100;
        if (lost <= ded) return 0;
        uint256 part = lost - ded;
        uint256 cap = (ref * 10) / 100;
        if (part > cap) part = cap;
        return (notional * part) / ref;
    }

    function _pointLatestAt(Round memory r) internal {
        vm.mockCall(
            NVDA_FEED,
            abi.encodeWithSelector(IAggregatorV3.latestRoundData.selector),
            abi.encode(r.id, r.answer, r.startedAt, r.updatedAt, r.answeredIn)
        );
    }

    /// Walks back through the real rounds to find the last print at or before `close`
    /// and the first print at or after `open`.
    function _findRounds(uint256 close, uint256 open) internal view returns (Round memory last, Round memory first) {
        (uint80 id,,,,) = IAggregatorV3(NVDA_FEED).latestRoundData();
        bool haveFirst;
        for (uint256 i; i < 900; ++i) {
            Round memory r = _round(id - uint80(i));
            if (r.updatedAt >= open) {
                first = r; // keeps moving back, so it ends on the earliest print at or after open
                haveFirst = true;
            }
            if (r.updatedAt <= close) {
                last = r;
                require(haveFirst, "no print after open found");
                return (last, first);
            }
        }
        revert("rounds not found within 900 steps");
    }

    function _round(uint80 id) internal view returns (Round memory r) {
        (r.id, r.answer, r.startedAt, r.updatedAt, r.answeredIn) = IAggregatorV3(NVDA_FEED).getRoundData(id);
    }
}
