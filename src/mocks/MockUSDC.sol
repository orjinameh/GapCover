// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockERC20} from "./MockERC20.sol";

/// TESTNET MOCK. 6 decimals, public faucet with a per call cap, and a blocklist like real USDC.
contract MockUSDC is MockERC20 {
    uint256 public constant FAUCET_CAP = 1_000_000e6;
    mapping(address => bool) public blocked;

    constructor() MockERC20("Mock USDC", "mUSDC", 6) {}

    function faucet(address to, uint256 amount) external {
        require(amount <= FAUCET_CAP, "cap");
        _mint(to, amount);
    }

    function setBlocked(address who, bool b) external {
        blocked[who] = b;
    }

    function _move(address from, address to, uint256 v) internal override {
        require(!blocked[from] && !blocked[to], "blocked");
        super._move(from, to, v);
    }
}
