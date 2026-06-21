#!/usr/bin/env bash
# Usage: decode-tx.sh <TX_DIGEST> [testnet|mainnet|URL]
# Decode the PTB structure of a transaction: inputs (shared/owned/pure) + MoveCall commands.
# Useful for reverse-engineering live liquidator/arbitrageur txs.
# TX_DIGEST is the base58 digest from txns.sh output or any Sui explorer.
# Example: decode-tx.sh 252j2EQkwxrmJTRNDc2Jt5Gkb7zixZorQXB3ssFbaPP9 mainnet
#          (decodes a known live mainnet liquidation tx)
set -euo pipefail
source "$(dirname "$0")/../sui-rpc/_rpc.sh"

DIGEST="${1:?tx digest required}"
NET="${2:-mainnet}"
URL=$(rpc_url "$NET")

rpc_call "$URL" "sui_getTransactionBlock" \
  "[\"$DIGEST\",{\"showInput\":true,\"showEffects\":false}]" \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
tx = r['result'].get('transaction', {}).get('data', {}).get('transaction', {}) or {}
print(f\"sender: {r['result']['transaction']['data']['sender']}\")
inputs = tx.get('inputs', [])
print(f'inputs: {len(inputs)}')
for i, inp in enumerate(inputs):
    if inp.get('type') == 'object':
        shared = 'SHARED' if inp.get('initialSharedVersion') else 'OWNED'
        print(f'  [{i:2}] {shared:6}  obj={inp.get(\"objectId\")}')
    elif inp.get('type') == 'pure':
        v = str(inp.get('value'))[:60]
        print(f'  [{i:2}] pure   {v}')
txs = tx.get('transactions', [])
print(f'commands: {len(txs)}')
for i, t in enumerate(txs):
    k = list(t.keys())[0]
    v = t[k]
    if k == 'MoveCall':
        pkg = (v.get('package','?') or '?')[:18]
        print(f'  [{i}] MoveCall {pkg}..::{v.get(\"module\",\"?\")}::{v.get(\"function\",\"?\")}')
    else:
        print(f'  [{i}] {k}')
"
