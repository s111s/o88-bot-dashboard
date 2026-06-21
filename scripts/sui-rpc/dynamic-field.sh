#!/usr/bin/env bash
# Usage: dynamic-field.sh <PARENT_ID> <NAME_JSON> [testnet|mainnet|URL]
# Fetch one dynamic field value by parent ID + name. NAME_JSON is a {"type":..,"value":..} pair.
# Single-quote the NAME_JSON so bash doesn't mangle the inner double quotes.
# Example: dynamic-field.sh \
#            0x5f8c40ec8a5056c8f1dbb0b2d3dee8bb1565cc38a1c261b647aedcdc025f5208 \
#            '{"type":"0x2::object::ID","value":"0x0b8fb5c4514337dbd300ff2a49185a99433d8369670a23329126388364119817"}' \
#            testnet
#          (reads one entry of the Predict Registry oracle_ids table, keyed by an OracleSVICap ID)
set -euo pipefail
source "$(dirname "$0")/_rpc.sh"

PARENT="${1:?parent id required}"
NAME="${2:?name json required}"
NET="${3:-testnet}"
URL=$(rpc_url "$NET")

rpc_call "$URL" "suix_getDynamicFieldObject" "[\"$PARENT\",$NAME]" \
  | python3 -m json.tool
