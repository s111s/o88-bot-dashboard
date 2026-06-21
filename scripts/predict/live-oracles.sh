#!/usr/bin/env bash
# Print just the currently-active oracles, sorted by expiry ascending.
# No arguments. Output columns: asset, expiry, min_strike, tick_size, oracle_id, cap_id.
# Example: live-oracles.sh
# Pipe to extract IDs: live-oracles.sh | grep -oE 'oracle=0x[0-9a-f]+' | head -3
set -euo pipefail

curl -sS --max-time 30 https://predict-server.testnet.mystenlabs.com/oracles | python3 -c "
import sys, json, datetime
data = json.load(sys.stdin)
actives = sorted([x for x in data if x['status']=='active'], key=lambda x: x['expiry'])
print(f'{len(actives)} active oracles')
for o in actives:
    exp = datetime.datetime.fromtimestamp(o['expiry']/1000, datetime.UTC).isoformat()
    print(f\"{o['underlying_asset']:5}  exp {exp}  min_strike={o['min_strike']}  tick={o['tick_size']}  oracle={o['oracle_id']}  cap={o['oracle_cap_id']}\")
"
