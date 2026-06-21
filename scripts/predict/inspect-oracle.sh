#!/usr/bin/env bash
# Usage: inspect-oracle.sh <ORACLE_ID> [testnet|mainnet|URL]
# Pretty-print one OracleSVI shared object: underlying, expiry, status, prices, SVI, auth caps.
# ORACLE_ID is a shared `OracleSVI` object id (one per asset x expiry). Get fresh IDs from live-oracles.sh.
# Example: inspect-oracle.sh 0x75c2aec22ad83ee7461e6b8d6b06aad84bd68c2b154232328ec0c9a96112ea99 testnet
# Tip:     ID=$(scripts/predict/live-oracles.sh | grep -oE 'oracle=0x[0-9a-f]+' | head -1 | cut -d= -f2)
#          scripts/predict/inspect-oracle.sh "$ID" testnet
set -euo pipefail
source "$(dirname "$0")/../sui-rpc/_rpc.sh"

OID="${1:?oracle id required}"
NET="${2:-testnet}"
URL=$(rpc_url "$NET")

rpc_call "$URL" "sui_getObject" \
  "[\"$OID\",{\"showType\":true,\"showOwner\":true,\"showContent\":true}]" \
  | python3 -c "
import sys, json, datetime
r = json.load(sys.stdin)
d = r.get('result', {}).get('data', {})
f = d.get('content', {}).get('fields', {})
exp = int(f.get('expiry', 0))
ts  = int(f.get('timestamp', 0))
svi = f.get('svi', {}).get('fields', {})
caps = f.get('authorized_caps', {}).get('fields', {}).get('contents', [])
print(f\"type            {d.get('type')}\")
print(f\"owner           {d.get('owner')}\")
print(f\"underlying      {f.get('underlying_asset')}\")
print(f\"expiry          {exp}  ({datetime.datetime.fromtimestamp(exp/1000, datetime.UTC).isoformat() if exp else '-'})\")
print(f\"last update     {ts}    ({datetime.datetime.fromtimestamp(ts/1000, datetime.UTC).isoformat() if ts else 'never'})\")
print(f\"active          {f.get('active')}\")
print(f\"spot            {f.get('prices',{}).get('fields',{}).get('spot')}  (1e9 scaled)\")
print(f\"forward         {f.get('prices',{}).get('fields',{}).get('forward')}\")
print(f\"settled price   {f.get('settlement_price')}\")
print(f\"svi a/b/sigma   {svi.get('a')} / {svi.get('b')} / {svi.get('sigma')}\")
print(f\"svi rho         {svi.get('rho')}\")
print(f\"svi m           {svi.get('m')}\")
print(f\"auth caps ({len(caps)}):\")
for c in caps:
    print(f\"  {c}\")
"
