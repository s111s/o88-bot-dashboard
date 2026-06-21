#!/usr/bin/env bash
# Usage: get-object.sh <OBJECT_ID> [testnet|mainnet|URL]
# sui_getObject with showType, showOwner, showContent. Pipes JSON to python3 -m json.tool.
# Example: get-object.sh 0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64 testnet
#          (reads the testnet Predict Registry shared object)
set -euo pipefail
source "$(dirname "$0")/_rpc.sh"

OBJECT_ID="${1:?object id required}"
NET="${2:-testnet}"
URL=$(rpc_url "$NET")

rpc_call "$URL" "sui_getObject" \
  "[\"$OBJECT_ID\",{\"showType\":true,\"showOwner\":true,\"showContent\":true}]" \
  | python3 -m json.tool
