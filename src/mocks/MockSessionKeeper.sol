// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ISessionPool {
    function scheduleSession(uint64 saleStart, uint64 closeTime, uint64 openTime) external returns (uint256);
    function cancelSession(uint256 id) external;
}

/// TESTNET MOCK keeper. Lets anyone schedule a compressed session starting now, so the demo
/// does not need a real weekend. Use as the pool's keeper on demo pools only.
contract MockSessionKeeper {
    function scheduleNow(ISessionPool pool, uint32 closeIn, uint32 openIn) external returns (uint256) {
        return pool.scheduleSession(uint64(block.timestamp), uint64(block.timestamp + closeIn), uint64(block.timestamp + openIn));
    }

    function cancel(ISessionPool pool, uint256 id) external {
        pool.cancelSession(id);
    }
}
