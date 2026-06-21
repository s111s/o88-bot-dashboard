#!/usr/bin/env bash
# Usage: inspect-margin-manager.sh <MARGIN_MANAGER_ID> [testnet|mainnet|URL]
# Decode a MarginManager: base/quote types, owner, deepbook pool, borrowed shares, balances.
# Get MARGIN_MANAGER_IDs from recent-creations.sh (margin_manager_id field) or LiquidationEvent.
# Example: inspect-margin-manager.sh 0x365e740a1b90259e3afddf0327c1536d98cb99ac43e9936b3d53a4114b6303b7 mainnet
#          (sample MarginManager<DEEP,USDC>)
set -euo pipefail
source "$(dirname "$0")/../sui-rpc/_rpc.sh"

ID="${1:?margin manager id required}"
NET="${2:-mainnet}"
URL=$(rpc_url "$NET")

rpc_call "$URL" "sui_getObject" \
  "[\"$ID\",{\"showType\":true,\"showOwner\":true,\"showContent\":true}]" \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
d = r.get('result', {}).get('data', {}) or {}
f = d.get('content', {}).get('fields', {}) or {}
print(f\"type            {d.get('type')}\")
print(f\"owner field     {f.get('owner')}\")
print(f\"deepbook_pool   {f.get('deepbook_pool')}\")
print(f\"margin_pool_id  {f.get('margin_pool_id')}\")
print(f\"borrowed_base   {f.get('borrowed_base_shares')}\")
print(f\"borrowed_quote  {f.get('borrowed_quote_shares')}\")
print(f\"balance_mgr_id  {f.get('balance_manager',{}).get('fields',{}).get('id',{}).get('id')}\")
"
