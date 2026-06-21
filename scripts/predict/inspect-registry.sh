#!/usr/bin/env bash
# Pull the known testnet Predict Registry shared object + list its oracle_ids table.
# No arguments. Hardcoded to the canonical testnet Registry ID.
# Example: inspect-registry.sh
set -euo pipefail
source "$(dirname "$0")/../sui-rpc/_rpc.sh"

# Testnet Registry (from docs.sui.io/onchain-finance/deepbook-predict/contract-information)
REGISTRY="0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64"
URL=$(rpc_url "testnet")

echo "=== Registry object ==="
rpc_call "$URL" "sui_getObject" \
  "[\"$REGISTRY\",{\"showType\":true,\"showOwner\":true,\"showContent\":true}]" \
  | python3 -m json.tool

# Get the oracle_ids inner table object id from the registry content, then list its dynamic fields.
TABLE=$(rpc_call "$URL" "sui_getObject" "[\"$REGISTRY\",{\"showContent\":true}]" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['data']['content']['fields']['oracle_ids']['fields']['id']['id'])")

echo
echo "=== oracle_ids table dynamic fields ($TABLE) ==="
rpc_call "$URL" "suix_getDynamicFields" "[\"$TABLE\",null,50]" | python3 -m json.tool
