// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {CoverPool} from "../src/CoverPool.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IB20Stock} from "../src/interfaces/IB20Stock.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";

/// BETA deploy on Base mainnet: real USDC, the real Chainlink 24/5 feed and the real stock token. UNAUDITED.
/// Deploys one CoverPool with real market timings, small caps, and one-off buying closed (subscriptions only).
/// It does NOT seed the pool: the team deposits its own first money by hand afterwards.
///
/// Environment (all required):
///   DEPLOYER_PRIVATE_KEY   a fresh wallet with a little ETH on Base for gas
///   KEEPER_ADDRESS         the wallet the keeper script will use (it schedules nights and can pause NEW sales)
///   STOCK_TOKEN            the Base stock token address for the ticker
///   FEED                   the Chainlink 24/5 feed address for that ticker
/// Optional: DEPOSIT_CAP_USDC (whole dollars, default 2000)
///
/// Dry run (no broadcast):  forge script script/DeployMainnet.s.sol --rpc-url $BASE_RPC > dry.log 2>&1
/// Real:                    add  --broadcast
contract DeployMainnet is Script {
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // native USDC on Base

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address keeper = vm.envAddress("KEEPER_ADDRESS");
        address token = vm.envAddress("STOCK_TOKEN");
        address feed = vm.envAddress("FEED");
        uint256 capUsd = vm.envOr("DEPOSIT_CAP_USDC", uint256(2000));
        require(block.chainid == 8453, "not Base mainnet");

        // Light and Standard only. Tight is not offered.
        CoverPool.Tier[] memory tiers = new CoverPool.Tier[](2);
        tiers[0] = CoverPool.Tier(500, 1500, 40); // Light:    5% deductible, 15% cap, 0.40%
        tiers[1] = CoverPool.Tier(200, 1000, 60); // Standard: 2% deductible, 10% cap, 0.60%

        CoverPool.Params memory p = CoverPool.Params({
            refMaxAge: 2 days, // the feed prints at least every 24 hours while open
            printWindow: 2 hours, // first print after the open must land within this
            voidGrace: 6 hours, // after that, how long settle stays possible before anyone can void
            buyCutoff: 10 minutes,
            lockWindow: 1 hours,
            maxCovers: 32,
            minNotional: 50e6, // $50
            maxUseBps: 1500, // one night may reserve at most 15% of the pool
            maxHolderBps: 500, // one wallet at most 5% of the pool
            subscriptionOnly: true,
            depositCap: uint128(capUsd * 1e6)
        });

        vm.startBroadcast(pk);
        CoverPool pool = new CoverPool(IERC20(USDC), IB20Stock(token), IAggregatorV3(feed), keeper, p, tiers);
        vm.stopBroadcast();

        console2.log("pool   ", address(pool));
        console2.log("keeper ", keeper);
        console2.log("token  ", token);
        console2.log("feed   ", feed);
        console2.log("deposit cap (USDC)", capUsd);
    }
}
