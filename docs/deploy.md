# Deploy to Base Sepolia (delivery D)

Testnet only. Base Sepolia chain id 84532. Mock tokens, mock feed, mock USDC. No real funds, no mainnet, never your main wallet.

## 1. Burner wallet, saved to .env for you

```bash
node scripts/setup-burner.mjs
```

This creates a fresh wallet and writes its key into `.env` by itself. The key is never printed and never needs copying. It prints the public address and also saves it in `burner-address.txt`, so you can open that file and copy the address as real text. Re-running it keeps the same wallet.

Send that address some Base Sepolia ETH from any Base Sepolia faucet. 0.02 ETH is plenty.

To make the terminal wait until the money lands:

```bash
node scripts/setup-burner.mjs --wait
```

## 2. Deploy, one command

```bash
bash scripts/deploy-sepolia.sh
```

It checks the RPC is Base Sepolia (chain 84532) and the burner has ETH, deploys, writes `deployments/84532.json` and `app/.env.local`, and prints the six addresses. If it stops halfway, run the same command again.

## 3. Commit the addresses

```bash
git add deployments/84532.json
git commit -m "Record Base Sepolia deployment"
git push
```

`.env`, `app/.env.local` and `burner-address.txt` are git ignored on purpose. Check `git status` shows none of them.

## 4. Verify on chain

```bash
bash scripts/verify-deploy.sh
```

It reads the pool address from `deployments/84532.json` and prints the pool, chain id, total assets, tier count and active session, each with the value to expect. Each address also opens at `https://sepolia.basescan.org/address/<address>`.

## 5. Run the dashboard

```bash
cd app
npm install
npm run dev
```

Open the forwarded port 3000. The demo wallet is a throwaway key the browser makes for itself. On first load the Simulator rail shows its address and asks for gas. Send that address a little Base Sepolia ETH (0.005 is plenty), then press Run the weekend. A run takes about 90 seconds on Base Sepolia (the session is compressed to 40s to close and 80s to open). The covered wallet should net -260.00, the uncovered one -600.00 at the default 6% gap and Standard tier.

You can also run the weekend by hand from the Demo page, with the test wallet or a browser wallet. The banner says "No session scheduled" until someone opens one, that is normal. Press Open session on the Demo page, then on the Cover page buy within 40 seconds, press Close session once the banner says the market is closed, then Print open and settle once it says awaiting first print. Buttons only light up when the clock allows.

If a run is interrupted, press Run the weekend again, it voids the stuck session when the rules allow, or tells you how long to wait.

## 6. Optional: demo URL on Vercel

1. Push the repo to GitHub (already done).
2. Vercel, Add New Project, import the repo.
3. Set Root Directory to `app`. Framework Next.js is detected.
4. Add the environment variables from `app/.env.local`: `NEXT_PUBLIC_CHAIN`, `NEXT_PUBLIC_POOL`, `NEXT_PUBLIC_STOCK`, `NEXT_PUBLIC_USDC`, `NEXT_PUBLIC_FEED`, `NEXT_PUBLIC_SPOT`, `NEXT_PUBLIC_KEEPER`. They are public addresses, no secrets.
5. Deploy. Open the URL once and run the weekend to confirm.

The demo wallet key lives in each visitor's own browser storage, never on the server. It is testnet only.

## Pages

- Cover: the product page. Connect, get test funds, buy cover while a session is on sale, see it under My covers, claim if a payout could not be pushed.
- Underwrite: deposit mUSDC, withdraw when the pool is unlocked.
- Demo: the one click weekend and the manual session controls. Use it to open a session, since on this testnet nobody runs the keeper.

## Notes

- The deployed pool is the compressed demo pool. A real pool would use hours and days for the windows, and a real keeper instead of the open demo keeper.
- Real B20 token and feed addresses go in as constructor arguments to `CoverPool`. This repo does not deploy to mainnet.
- Refill the pool from the Underwrite desk after many runs.
