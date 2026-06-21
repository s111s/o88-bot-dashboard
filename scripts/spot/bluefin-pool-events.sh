#!/usr/bin/env bash
# Surface recent Bluefin Spot pool events to discover live pool IDs.
# Bluefin doesn't publish a public REST pool list (or we haven't found one), so we
# scan their `events` module emissions for pool_id references.
# Usage: bluefin-pool-events.sh [LIMIT]
# LIMIT defaults to 50.
# Example: bluefin-pool-events.sh 100
set -euo pipefail
LIMIT="${1:-50}"
BLUEFIN_SPOT_ORIGIN="${BLUEFIN_SPOT_ORIGIN:-0x3492c874c1e3b3e2984e8c41b589e642d4d0a5d6459e5a9cfc2d52fd7c89c267}"

curl -sS --max-time 30 -X POST https://fullnode.mainnet.sui.io:443 \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"suix_queryEvents\",\"params\":[{\"MoveEventModule\":{\"package\":\"${BLUEFIN_SPOT_ORIGIN}\",\"module\":\"events\"}},null,${LIMIT},true]}" \
  | python3 -c "
import sys, json
events = json.load(sys.stdin).get('result', {}).get('data', [])
pools = set()
for e in events:
    pj = e.get('parsedJson', {})
    for k, v in pj.items():
        if 'pool' in k.lower() and isinstance(v, str) and v.startswith('0x') and len(v) > 50:
            pools.add(v)
print(f'{len(events)} events scanned -> {len(pools)} distinct pool IDs')
for p in sorted(pools):
    print(p)
"
