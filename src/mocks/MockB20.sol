// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockERC20} from "./MockERC20.sol";
import {IB20Stock} from "../interfaces/IB20Stock.sol";

/// TESTNET MOCK of a B20 stock token. Follows the documented multiplier API:
/// UI = raw * uiMultiplier / 1e18, a stored 0 reads as 1e18, scheduled updates flip silently at effectiveAt.
/// Open mint and open scheduleUIMultiplier exist only because this is a mock.
contract MockB20 is MockERC20 {
    uint256 internal constant WAD = 1e18;
    uint256 internal baseMult; // 0 reads as WAD
    uint256 internal pendingMult;
    uint256 internal _effectiveAt;

    constructor(string memory n, string memory s, uint8 d) MockERC20(n, s, d) {}

    function mint(address to, uint256 v) external {
        _mint(to, v);
    }

    function uiMultiplier() public view returns (uint256) {
        uint256 m = (_effectiveAt != 0 && block.timestamp >= _effectiveAt) ? pendingMult : baseMult;
        return m == 0 ? WAD : m;
    }

    function multiplier() external view returns (uint256) {
        return uiMultiplier();
    }

    function newUIMultiplier() external view returns (uint256) {
        return pendingMult == 0 ? WAD : pendingMult;
    }

    function effectiveAt() external view returns (uint256) {
        return _effectiveAt;
    }

    /// Mock of updateUIMultiplier(newMultiplier, effectiveAt).
    function scheduleUIMultiplier(uint256 newMultiplier, uint256 at) external {
        if (_effectiveAt != 0 && block.timestamp >= _effectiveAt) baseMult = pendingMult;
        pendingMult = newMultiplier;
        _effectiveAt = at;
    }

    function cancelUIMultiplierUpdate() external {
        require(_effectiveAt > block.timestamp, "none pending");
        pendingMult = 0;
        _effectiveAt = 0;
    }

    function balanceOfUI(address a) public view returns (uint256) {
        return (balanceOf[a] * uiMultiplier()) / WAD;
    }

    function scaledBalanceOf(address a) external view returns (uint256) {
        return balanceOfUI(a);
    }

    function totalSupplyUI() external view returns (uint256) {
        return (totalSupply * uiMultiplier()) / WAD;
    }

    function toUIAmount(uint256 raw) public view returns (uint256) {
        return (raw * uiMultiplier()) / WAD;
    }

    function fromUIAmount(uint256 ui) public view returns (uint256) {
        return (ui * WAD) / uiMultiplier();
    }
}
