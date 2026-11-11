#!/usr/bin/env bash
# One command deploy of the demo stack to Base Sepolia. Reads the burner key from .env, never prints it.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "No .env yet. Run: node scripts/setup-burner.mjs"; exit 1; }
set -a; source .env; set +a
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is empty. Run: node scripts/setup-burner.mjs}"
RPC="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"

ADDR=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")
CHAIN=$(cast chain-id --rpc-url "$RPC")
if [ "$CHAIN" != "84532" ] && [ "${ALLOW_ANY_CHAIN:-0}" != "1" ]; then
  echo "RPC reports chain $CHAIN, expected 84532 (Base Sepolia). Check BASE_SEPOLIA_RPC_URL in .env."
  exit 1
fi
BAL=$(cast balance "$ADDR" --rpc-url "$RPC")
if [ "$BAL" = "0" ]; then
  echo "Burner $ADDR has no ETH yet. Fund it, then run this again."
  exit 1
fi
echo "Deploying from $ADDR on chain $CHAIN ..."

forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast
node scripts/write-env.mjs "$CHAIN"
echo ""
echo "Done. Addresses are in deployments/$CHAIN.json and app/.env.local."
echo "Next: cd app && npm install && npm run dev"
