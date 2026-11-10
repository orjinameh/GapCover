// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "./IERC20.sol";

/// ERC-20 plus the documented B20 multiplier views.
/// UI balance = raw * uiMultiplier / 1e18. Raw balances and transfers stay raw.
interface IB20Stock is IERC20 {
    function uiMultiplier() external view returns (uint256);
    function multiplier() external view returns (uint256);
    function balanceOfUI(address account) external view returns (uint256);
    function scaledBalanceOf(address account) external view returns (uint256);
    function totalSupplyUI() external view returns (uint256);
    function toUIAmount(uint256 raw) external view returns (uint256);
    function fromUIAmount(uint256 ui) external view returns (uint256);
    function newUIMultiplier() external view returns (uint256);
    /// Flip time of the latest scheduled update. A live pending update exists iff effectiveAt() > block.timestamp.
    function effectiveAt() external view returns (uint256);
}
