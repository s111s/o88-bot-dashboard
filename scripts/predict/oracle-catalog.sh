#!/usr/bin/env bash
# Fetch the full DeepBook Predict oracle catalog from the official testnet server.
# No auth, no arguments. Returns a JSON array of every oracle ever created (active + settled).
# Each record: {predict_id, oracle_id, oracle_cap_id, underlying_asset, expiry,
#              min_strike, tick_size, status, activated_at, settlement_price, settled_at,
#              created_checkpoint}
# Example: oracle-catalog.sh > /tmp/oracles.json
#          jq '.[] | select(.status=="active") | .oracle_id' /tmp/oracles.json
set -euo pipefail

curl -sS --max-time 30 https://predict-server.testnet.mystenlabs.com/oracles
