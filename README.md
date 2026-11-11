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
npm run dev
```

Deploy the demo stack to Base Sepolia (details in docs/deploy.md):

```bash
node scripts/setup-burner.mjs    # makes a burner, saves its key to .env, prints the address to fund
bash scripts/deploy-sepolia.sh   # deploys and writes app/.env.local
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
