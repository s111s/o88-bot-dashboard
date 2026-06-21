#!/usr/bin/env bash
# Usage: dynamic-fields.sh <PARENT_OBJECT_ID> [testnet|mainnet|URL]
# List dynamic fields of a table/object. Returns up to 50 field metadata records.
# Note: PARENT_OBJECT_ID is the inner `id` of the Table/Bag, not the wrapper object.
# Example: dynamic-fields.sh 0x5f8c40ec8a5056c8f1dbb0b2d3dee8bb1565cc38a1c261b647aedcdc025f5208 testnet
#          (lists entries in the Predict Registry oracle_ids table)
set -euo pipefail
source "$(dirname "$0")/_rpc.sh"

PARENT="${1:?parent object id required}"
NET="${2:-testnet}"
URL=$(rpc_url "$NET")

rpc_call "$URL" "suix_getDynamicFields" "[\"$PARENT\",null,50]" \
  | python3 -m json.tool
