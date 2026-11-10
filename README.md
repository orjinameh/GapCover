# Gap Cover

On-chain parametric cover for the weekend gap on tokenized stocks on Base. Base Sepolia testnet only. Mock tokens and feeds, no real funds.

Status: contracts, tests, dashboard and deploy guide done. Submission pack follows. Deploy steps in docs/deploy.md. Design in docs/spec.md.

## Tests

```bash
forge test
```

## Dashboard

```bash
cd app && npm install
cp .env.example .env.local      # fill after deploying, see below
npm run dev
```

Deploy the demo stack (needs a fresh burner wallet funded from a Base Sepolia faucet, key in a local .env):

```bash
cp .env.example .env            # set DEPLOYER_PRIVATE_KEY and BASE_SEPOLIA_RPC_URL
set -a && source .env && set +a
forge script script/Deploy.s.sol --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast
node scripts/write-env.mjs 84532   # writes app/.env.local from deployments/84532.json
```

Repeated demo runs drain the seeded pool a little each time (underwriters pay the gap). Top it up from the Underwrite desk.

## Layout

```
src/CoverPool.sol         pool, cover, settlement (one pool per ticker)
src/mocks/                testnet mocks: B20 token, aggregator, USDC, spot market, session keeper
script/Deploy.s.sol       demo deployment with compressed timings
scripts/write-env.mjs     deployments json to app/.env.local
app/                      Next.js dashboard (viem, plain CSS)
test/                     unit, fuzz, invariant, mocks
```
