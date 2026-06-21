#!/usr/bin/env bash
# Usage: txns.sh <ADDRESS> [testnet|mainnet|URL] [LIMIT]
# Recent transactions from an address (descending). Use to find recent publishes or bot activity.
# Example: txns.sh 0xdf7efdffbf183228108382c8e31491104be6d6ecfa66ed17743d627195ed4526 mainnet 10
#          (last 10 txs from a known active mainnet Margin liquidator)
set -euo pipefail
source "$(dirname "$0")/_rpc.sh"

ADDR="${1:?address required}"
NET="${2:-testnet}"
LIMIT="${3:-20}"
URL=$(rpc_url "$NET")

rpc_call "$URL" "suix_queryTransactionBlocks" \
  "[{\"filter\":{\"FromAddress\":\"$ADDR\"},\"options\":{\"showInput\":true}},null,$LIMIT,true]" \
  | python3 -m json.tool
