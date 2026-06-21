#!/usr/bin/env bash
# Usage: inspect-manager.sh <MANAGER_ID> [testnet|mainnet|URL]
# Decode a PredictManager shared object: owner, balance manager id,
# positions table id (drill into it with dynamic-fields.sh), range positions.
# Get MANAGER_IDs from manager-events.sh (manager_id field in parsedJson).
# Example: inspect-manager.sh 0xfb4881b75f25c97b3ab72dd14fcf5df4e35bc26a6e187cb952b9f9bb2205a9c7 testnet
set -euo pipefail
source "$(dirname "$0")/../sui-rpc/_rpc.sh"

ID="${1:?manager id required}"
NET="${2:-testnet}"
URL=$(rpc_url "$NET")

rpc_call "$URL" "sui_getObject" \
  "[\"$ID\",{\"showType\":true,\"showOwner\":true,\"showContent\":true}]" \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
d = r.get('result', {}).get('data', {}) or {}
f = d.get('content', {}).get('fields', {}) or {}
positions_tid = f.get('positions', {}).get('fields', {}).get('id', {}).get('id')
positions_size = f.get('positions', {}).get('fields', {}).get('size')
ranges_tid = f.get('range_positions', {}).get('fields', {}).get('id', {}).get('id')
ranges_size = f.get('range_positions', {}).get('fields', {}).get('size')
print(f'type             {d.get(\"type\")}')
print(f'owner            {f.get(\"owner\")}')
print(f'balance_manager  {f.get(\"balance_manager\", {}).get(\"fields\", {}).get(\"id\", {}).get(\"id\")}')
print(f'positions table  {positions_tid}  (size={positions_size})')
print(f'ranges table     {ranges_tid}  (size={ranges_size})')
print()
print(f'list positions:  scripts/sui-rpc/dynamic-fields.sh {positions_tid} {sys.argv[1] if len(sys.argv)>1 else \"testnet\"}')
" -- "$NET"
