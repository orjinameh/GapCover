# Deploy to Base Sepolia (delivery D)

Testnet only. Base Sepolia chain id 84532. Mock tokens, mock feed, mock USDC. No real funds, no mainnet, never your main wallet.

## 1. Burner wallet

```bash
cd /workspaces/GapCover
cp .env.example .env
cast wallet new
```

`cast wallet new` prints an address and a private key. Put the private key in `.env` as `DEPLOYER_PRIVATE_KEY=` (the file is git ignored, check with `git status` that `.env` never appears). Send the address some Base Sepolia ETH from any Base Sepolia faucet. 0.02 ETH is plenty. Keep the default `BASE_SEPOLIA_RPC_URL`, or put your own provider URL.

## 2. Check the balance

```bash
set -a && source .env && set +a
cast balance $(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY") --rpc-url "$BASE_SEPOLIA_RPC_URL"
```

Must be above 0.

## 3. Dry run, then deploy

```bash
forge script script/Deploy.s.sol --rpc-url "$BASE_SEPOLIA_RPC_URL"
forge script script/Deploy.s.sol --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast
```

The first command simulates and sends nothing. If the second is interrupted, rerun it with `--resume`. It writes `deployments/84532.json` and prints six addresses: pool, stock, usdc, feed, spot, keeper.

## 4. Record the addresses

```bash
node scripts/write-env.mjs 84532
git add deployments/84532.json
git commit -m "Record Base Sepolia deployment"
git push
```

`app/.env.local` is git ignored on purpose, it is regenerated from the JSON.

## 5. Verify on chain

```bash
POOL=$(node -p "require('./deployments/84532.json').pool")
cast call $POOL "totalAssets()(uint256)" --rpc-url "$BASE_SEPOLIA_RPC_URL"   # expect 100000000000 (100,000 mUSDC)
cast call $POOL "tiersLength()(uint256)" --rpc-url "$BASE_SEPOLIA_RPC_URL"   # expect 3
cast call $POOL "activeSession()(uint256)" --rpc-url "$BASE_SEPOLIA_RPC_URL" # expect 0
```

Each address also opens at `https://sepolia.basescan.org/address/<address>`.

## 6. Run the dashboard

```bash
cd app
npm install
npm run dev
```

Open the forwarded port 3000. The demo wallet is a throwaway key the browser makes for itself. On first load the Simulator rail shows its address and asks for gas. Send that address a little Base Sepolia ETH (0.005 is plenty), then press Run the weekend. A run takes about 90 seconds on Base Sepolia (the session is compressed to 40s to close and 80s to open). The covered wallet should net -260.00, the uncovered one -600.00 at the default 6% gap and Standard tier.

If a run is interrupted, press Run the weekend again, it voids the stuck session when the rules allow, or tells you how long to wait.

## 7. Optional: demo URL on Vercel

1. Push the repo to GitHub (already done).
2. Vercel, Add New Project, import the repo.
3. Set Root Directory to `app`. Framework Next.js is detected.
4. Add the environment variables from `app/.env.local`: `NEXT_PUBLIC_CHAIN`, `NEXT_PUBLIC_POOL`, `NEXT_PUBLIC_STOCK`, `NEXT_PUBLIC_USDC`, `NEXT_PUBLIC_FEED`, `NEXT_PUBLIC_SPOT`, `NEXT_PUBLIC_KEEPER`. They are public addresses, no secrets.
5. Deploy. Open the URL once and run the weekend to confirm.

The demo wallet key lives in each visitor's own browser storage, never on the server. It is testnet only.

## Notes

- The deployed pool is the compressed demo pool. A real pool would use hours and days for the windows, and a real keeper instead of the open demo keeper.
- Real B20 token and feed addresses go in as constructor arguments to `CoverPool`. This repo does not deploy to mainnet.
- Refill the pool from the Underwrite desk after many runs.
