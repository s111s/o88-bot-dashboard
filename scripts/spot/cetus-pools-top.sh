#!/usr/bin/env bash
# Print the top Cetus mainnet pools by TVL (filterable by symbol substring).
# Usage: cetus-pools-top.sh [SYMBOL_SUBSTR] [LIMIT]
#   SYMBOL_SUBSTR — case-insensitive symbol filter (e.g. "USDC", "SUI", "BTC"); default ""
#   LIMIT          — number of rows; default 30
# Example: cetus-pools-top.sh USDC 20
#          cetus-pools-top.sh BTC 10
set -euo pipefail
FILTER="${1:-}"
LIMIT="${2:-30}"
curl -sS --max-time 30 \
  "https://api-sui.cetus.zone/v2/sui/stats_pools?display_all_pools=true&page=1&size=200" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
pools = d.get('data',{}).get('lp_list', [])
flt = '${FILTER}'.upper()
def keep(p): return not p.get('is_closed') and (not flt or flt in p.get('symbol','').upper())
pools = [p for p in pools if keep(p)]
pools.sort(key=lambda x: -float(x.get('pure_tvl_in_usd') or 0))
print(f'{\"symbol\":30}  {\"tvl_usd\":>14}  {\"fee\":>6}  {\"vol24h\":>14}  pool_id')
for p in pools[:${LIMIT}]:
    tvl = float(p.get('pure_tvl_in_usd') or 0)
    vol = float(p.get('vol_in_usd_24h') or 0)
    print(f\"{p['symbol']:30}  \${tvl:>13,.0f}  {p.get('fee','?'):>6}  \${vol:>13,.0f}  {p['address']}\")
"
