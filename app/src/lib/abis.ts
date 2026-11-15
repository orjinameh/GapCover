import { parseAbi } from "viem";

export const POOL_ABI = parseAbi([
  "error SessionNotActive()",
  "error SaleClosed()",
  "error BadTier()",
  "error ZeroAmount()",
  "error FeedFrozen()",
  "error NotHolder()",
  "error BelowMinNotional()",
  "error CapacityExceeded()",
  "error SalesPaused()",
  "error PoolUseLimit()",
  "error HolderLimit()",
  "error TooManyCovers()",
  "error PoolLocked()",
  "error NotClosable()",
  "error NotSettleable()",
  "error NotVoidable()",
  "error NothingToClaim()",
  "error InsufficientShares()",
  "function totalAssets() view returns (uint256)",
  "function sharePrice() view returns (uint256)",
  "function locked() view returns (bool)",
  "function activeSession() view returns (uint256)",
  "function sessionCount() view returns (uint256)",
  "function shares(address) view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function claimable(address) view returns (uint256)",
  "function tiers(uint256) view returns (uint16 deductibleBps, uint16 capBps, uint16 premiumBps)",
  "function getSession(uint256) view returns ((uint64 saleStart, uint64 closeTime, uint64 openTime, uint8 status, uint32 coverCount, uint128 reserved, uint128 premiums, uint256 refPrice, uint256 settlePrice, uint256 multiplierAtClose))",
  "function holderCoverCount(address) view returns (uint256)",
  "function holderCoverAt(address, uint256) view returns (uint256 sessionId, uint256 coverId)",
  "function getCover(uint256, uint256) view returns ((address holder, uint8 tier, uint128 notional, uint128 premium, uint128 maxPayout))",
  "function deposit(uint256 assets, address to) returns (uint256)",
  "function withdraw(uint256 shares, address to) returns (uint256)",
  "function buyCover(uint256 id, uint256 rawAmount, uint8 tier) returns (uint256)",
  "function closeSession(uint256 id)",
  "function settle(uint256 id, uint80 roundId)",
  "function voidSession(uint256 id)",
  "function claim() returns (uint256)",
  "error OneOffClosed()",
  "error AlreadySubscribed()",
  "error NotSubscribed()",
  "error OnlySelf()",
  "function subscribe(uint8 tier, uint256 rawAmount)",
  "function cancelSubscription()",
  "function subs(address) view returns (bool active, bool listed, uint8 tier, uint64 since, uint64 cancelAfter, uint256 rawAmount)",
  "function subscribersLength() view returns (uint256)",
  "function subscriberAt(uint256) view returns (address)",
  "function subscriptionDue(uint256 id, address who) view returns (bool)",
  "function renewMany(uint256 id, address[] who)",
]);

export const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

export const USDC_ABI = parseAbi([
  "function faucet(address to, uint256 amount)",
]);

export const STOCK_ABI = parseAbi([
  "function mint(address to, uint256 v)",
]);

export const FEED_ABI = parseAbi([
  "function pushRound(int256 answer) returns (uint80)",
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
]);

export const SPOT_ABI = parseAbi([
  "function price(address) view returns (uint256)",
  "function setPrice(address token, uint256 p)",
]);

export const KEEPER_ABI = parseAbi([
  "function scheduleNow(address pool, uint32 closeIn, uint32 openIn) returns (uint256)",
]);
