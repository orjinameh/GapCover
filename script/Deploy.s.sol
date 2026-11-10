// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {CoverPool} from "../src/CoverPool.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IB20Stock} from "../src/interfaces/IB20Stock.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockB20} from "../src/mocks/MockB20.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";
import {MockSpotMarket} from "../src/mocks/MockSpotMarket.sol";
import {MockSessionKeeper} from "../src/mocks/MockSessionKeeper.sol";

/// Deploys the TESTNET demo stack: mock USDC, mock B20 stock, mock Chainlink feed, mock spot market,
/// a permissionless demo keeper, and one CoverPool with compressed timings, seeded with underwriter capital.
/// Reads only the env var name DEPLOYER_PRIVATE_KEY. Use a fresh burner wallet funded from a Base Sepolia faucet.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        MockUSDC usdc = new MockUSDC();
        MockB20 stock = new MockB20("NVDA mock", "NVDAm", 18);
        MockAggregator feed = new MockAggregator(8, "NVDA / USD (mock)");
        MockSpotMarket spot = new MockSpotMarket();
        MockSessionKeeper keeper = new MockSessionKeeper();

        feed.pushRound(100e8);
        spot.setPrice(address(stock), 100e8);

        CoverPool.Tier[] memory tiers = new CoverPool.Tier[](3);
        tiers[0] = CoverPool.Tier(500, 1500, 20); // Light:    5% deductible, 15% cap, 0.20%
        tiers[1] = CoverPool.Tier(200, 1000, 60); // Standard: 2% deductible, 10% cap, 0.60%
        tiers[2] = CoverPool.Tier(100, 500, 90); //  Tight:    1% deductible,  5% cap, 0.90%

        // Compressed demo timings (seconds). A real pool would use hours and days.
        CoverPool.Params memory p = CoverPool.Params({
            refMaxAge: 1 days,
            printWindow: 120,
            voidGrace: 600,
            buyCutoff: 0,
            lockWindow: 30,
            maxCovers: 32,
            minNotional: 10e6
        });

        CoverPool pool = new CoverPool(
            IERC20(address(usdc)), IB20Stock(address(stock)), IAggregatorV3(address(feed)), address(keeper), p, tiers
        );

        // seed underwriter capital
        usdc.faucet(deployer, 100_000e6);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(100_000e6, deployer);
        vm.stopBroadcast();

        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "pool", address(pool));
        vm.serializeAddress(k, "stock", address(stock));
        vm.serializeAddress(k, "usdc", address(usdc));
        vm.serializeAddress(k, "feed", address(feed));
        vm.serializeAddress(k, "spot", address(spot));
        string memory json = vm.serializeAddress(k, "keeper", address(keeper));
        vm.writeJson(json, string.concat("./deployments/", vm.toString(block.chainid), ".json"));

        console2.log("pool   ", address(pool));
        console2.log("stock  ", address(stock));
        console2.log("usdc   ", address(usdc));
        console2.log("feed   ", address(feed));
        console2.log("spot   ", address(spot));
        console2.log("keeper ", address(keeper));
    }
}
