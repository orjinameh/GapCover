#!/usr/bin/env bash
# Reads the deployed pool from deployments/<chainId>.json and checks its state. No typing of addresses needed.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; source .env; set +a; }
RPC="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
CHAIN="${1:-84532}"
FILE="deployments/$CHAIN.json"
[ -f "$FILE" ] || { echo "No $FILE yet. Run: bash scripts/deploy-sepolia.sh"; exit 1; }
POOL=$(node -p "require('./$FILE').pool")
echo "pool            $POOL"
echo "chain id        $(cast chain-id --rpc-url "$RPC")   (expect $CHAIN)"
echo "totalAssets     $(cast call "$POOL" 'totalAssets()(uint256)' --rpc-url "$RPC")   (expect 100000000000 on a fresh deploy)"
echo "tiers           $(cast call "$POOL" 'tiersLength()(uint256)' --rpc-url "$RPC")   (expect 3)"
echo "activeSession   $(cast call "$POOL" 'activeSession()(uint256)' --rpc-url "$RPC")   (expect 0)"
echo "explorer        https://sepolia.basescan.org/address/$POOL"
