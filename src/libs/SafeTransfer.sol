// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";

error TransferFailed();

library SafeTransfer {
    function trySend(IERC20 token, address to, uint256 value) internal returns (bool) {
        (bool ok, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transfer, (to, value)));
        return ok && _truthy(data);
    }

    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        if (!trySend(token, to, value)) revert TransferFailed();
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        (bool ok, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transferFrom, (from, to, value)));
        if (!ok || !_truthy(data)) revert TransferFailed();
    }

    function _truthy(bytes memory data) private pure returns (bool) {
        if (data.length == 0) return true;
        if (data.length < 32) return false;
        return abi.decode(data, (bool));
    }
}
