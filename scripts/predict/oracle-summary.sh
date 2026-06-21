#!/usr/bin/env bash
# Pull the oracle catalog and print counts by underlying_asset + status.
# No arguments.
# Example: oracle-summary.sh
#          (prints: total oracles, asset breakdown, status breakdown, next 5 active)
set -euo pipefail

curl -sS --max-time 30 https://predict-server.testnet.mystenlabs.com/oracles | python3 -c "
import sys, json, datetime
data = json.load(sys.stdin)
print(f'total oracles: {len(data)}')
under = {}
status = {}
active_by_asset = {}
for o in data:
    u = o['underlying_asset']
    s = o['status']
    under[u]  = under.get(u, 0) + 1
    status[s] = status.get(s, 0) + 1
    if s == 'active':
        active_by_asset[u] = active_by_asset.get(u, 0) + 1
print('underlying counts:', under)
print('status counts:', status)
print('active by asset:', active_by_asset)
print('--- next 5 active oracles by expiry ---')
actives = sorted([x for x in data if x['status']=='active'], key=lambda x: x['expiry'])
for o in actives[:5]:
    exp = datetime.datetime.fromtimestamp(o['expiry']/1000, datetime.UTC).isoformat()
    print(f\"  {o['underlying_asset']:5}  expires {exp}  oracle={o['oracle_id']}\")
"
