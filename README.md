# Gap Cover

On-chain parametric cover for the weekend gap on tokenized stocks on Base. Base Sepolia testnet only.

Status: contracts and tests done (delivery B). Dashboard, deploy and submission pack follow. Design in docs/spec.md.

## Run the tests

```bash
forge test            # 81 tests: unit, fuzz, invariants
forge test -vv --match-contract CoverPoolSettle
```

Foundry pins solc 0.8.28 and downloads it on first run. forge-std is vendored in lib/ (no submodules).

## Layout

```
src/CoverPool.sol            pool, cover, settlement (one pool per ticker)
src/interfaces/              Chainlink V3 and B20 stock interfaces
src/mocks/                   testnet mocks: B20 token, aggregator, USDC, spot market, session keeper
test/                        Core, Settle, Invariant and fuzz, Mocks
```
