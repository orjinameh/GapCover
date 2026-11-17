# Mainnet beta: setup and checklist

The beta is the same app and contract, run on Base mainnet with real USDC and a real stock token. It is unaudited.
Keep every limit small and say so on every page (the app does this when `NEXT_PUBLIC_CHAIN=base`).

## What changes in the app

With `NEXT_PUBLIC_CHAIN=base`: the demo wallet, the faucet buttons, the Demo page and the practice wording are off; a beta
banner shows on every page; the spot market and demo keeper addresses are not needed; the stock token uses 8 decimals;
the subscription approval is limited to 12 weekends of fees instead of unlimited.

## Environment (Vercel, a separate project from the practice site)

```
NEXT_PUBLIC_CHAIN=base
NEXT_PUBLIC_POOL=<pool address from the mainnet deploy>
NEXT_PUBLIC_STOCK=<stock token address on Base>
NEXT_PUBLIC_USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
NEXT_PUBLIC_FEED=<Chainlink 24/5 feed for the ticker>
NEXT_PUBLIC_TICKER=NVDAc
NEXT_PUBLIC_TOKEN_DECIMALS=8
NEXT_PUBLIC_RPC_URL=<a dedicated Base RPC url. The public one is rate limited and the app polls every 3 seconds>
```

## Order of work

1. Pick the keeper wallet (fresh, a little ETH, nothing else). Pick the deployer wallet (fresh, a little ETH).
2. Dry run the deploy:  `forge script script/DeployMainnet.s.sol --rpc-url $BASE_RPC > dry.log 2>&1`
3. Real deploy: add `--broadcast`. Record the pool address.
4. Team deposits first money by hand (stay under the deposit cap). The team takes the first losses.
5. Start the keeper in dry-run, then with `SEND=1` (see docs/keeper.md).
6. Put the site up with the environment above. Test with tiny amounts first: one subscription, one renewal, one close,
   one settle. Watch the first night by hand.

## Known gaps before real users

- Not audited. The real stock token cannot run inside Foundry, so tests use a stand-in. The first runs are the real test.
- No check that Base's sequencer is up, and no sanity bounds on prices. Add both before raising any limit.
- The Chainlink feed's behaviour on holidays is assumed, not measured.
- Legal and regulatory review has not been done. It looks like insurance in some places.
- One keeper wallet can schedule nights and pause new sales. A multisig is better.
- A night holds at most 100 covers (measured: 150 settle and void inside one transaction). Subscribers can fill a night before one-off buyers. One-off is closed in the beta.
