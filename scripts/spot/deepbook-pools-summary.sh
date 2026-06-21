#!/usr/bin/env bash
# Pull the DeepBook mainnet pool catalog and print a compact table:
#   pool_name  pool_id  tick_size  lot_size  min_size
# No arguments.
# Example: deepbook-pools-summary.sh
set -euo pipefail
curl -sS --max-time 30 https://deepbook-indexer.mainnet.mystenlabs.com/get_pools \
  | python3 -c "
import sys, json
pools = json.load(sys.stdin)
print(f'{\"name\":18}  {\"pool_id\":68}  {\"tick\":>9}  {\"lot\":>11}  {\"min\":>13}')
for p in sorted(pools, key=lambda x: x['pool_name']):
    print(f'{p[\"pool_name\"]:18}  {p[\"pool_id\"]}  {p[\"tick_size\"]:>9}  {p[\"lot_size\"]:>11}  {p[\"min_size\"]:>13}')
"
