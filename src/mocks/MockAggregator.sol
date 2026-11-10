// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAggregatorV3} from "../interfaces/IAggregatorV3.sol";

/// TESTNET MOCK of a Chainlink proxy. Round ids are phase << 64 | aggregatorRound, like the real proxy.
/// Anyone can push a round: demo only. A frozen feed is simply a feed nobody pushes to.
contract MockAggregator is IAggregatorV3 {
    struct Round {
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
    }

    uint8 public immutable override decimals;
    string public override description;
    uint256 public constant override version = 4;

    uint16 public phase = 1;
    uint64 public aggRound;
    mapping(uint80 => Round) internal rounds;

    constructor(uint8 d, string memory desc) {
        decimals = d;
        description = desc;
    }

    function pushRound(int256 answer) external returns (uint80) {
        return _push(answer, block.timestamp);
    }

    function pushRoundAt(int256 answer, uint256 updatedAt) external returns (uint80) {
        return _push(answer, updatedAt);
    }

    /// Simulates a proxy phase change: the next round has aggregator part 1.
    function bumpPhase() external {
        phase += 1;
        aggRound = 0;
    }

    function _push(int256 answer, uint256 at) internal returns (uint80 id) {
        aggRound += 1;
        id = (uint80(phase) << 64) | uint80(aggRound);
        rounds[id] = Round(answer, at, at);
    }

    function getRoundData(uint80 id) public view override returns (uint80, int256, uint256, uint256, uint80) {
        Round memory r = rounds[id];
        require(r.updatedAt != 0, "No data present");
        return (id, r.answer, r.startedAt, r.updatedAt, id);
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        require(aggRound != 0, "No data present");
        return getRoundData((uint80(phase) << 64) | uint80(aggRound));
    }
}
