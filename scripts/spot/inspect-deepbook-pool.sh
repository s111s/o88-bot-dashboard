#!/usr/bin/env bash
# Usage: inspect-deepbook-pool.sh <POOL_ID> [testnet|mainnet|URL]
# Decode one DeepBook V3 Pool<Base,Quote> shared object: type params, version, fees, sizes.
# Get POOL_IDs from scripts/spot/deepbook-pools.sh.
# Example: inspect-deepbook-pool.sh 0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407 mainnet
#          (canonical SUI/USDC pool)
set -euo pipefail
source "$(dirname "$0")/../sui-rpc/_rpc.sh"

POOL_ID="${1:?pool id required}"
NET="${2:-mainnet}"
URL=$(rpc_url "$NET")

rpc_call "$URL" "sui_getObject" \
  "[\"$POOL_ID\",{\"showType\":true,\"showOwner\":true,\"showContent\":true}]" \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
d = r['result'].get('data', {}) or {}
print(f\"type   {d.get('type')}\")
print(f\"owner  {d.get('owner')}\")
f = d.get('content', {}).get('fields', {}) or {}
# pool_inner is wrapped in a versioned struct; surface what we can
for k, v in f.items():
    s = json.dumps(v)
    print(f'  {k:25} {s[:120]}')
"
