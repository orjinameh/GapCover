// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// TESTNET MOCK stand-in for a DEX. Holds one settable spot price per token (8 decimals).
/// Used only by the dashboard simulator to show the weekend move. Not read by CoverPool.
contract MockSpotMarket {
    mapping(address => uint256) public price;

    event PriceSet(address indexed token, uint256 price);

    function setPrice(address token, uint256 p) external {
        price[token] = p;
        emit PriceSet(token, p);
    }
}
