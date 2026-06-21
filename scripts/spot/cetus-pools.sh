#!/usr/bin/env bash
# Fetch Cetus CLMM mainnet pool stats (first page = top by display rank).
# Each pool record: {address (pool_id), coin_a_address, coin_b_address, fee, tick_spacing,
#                    pure_tvl_in_usd, vol_in_usd_24h, fee_24_h, total_apr, ...}
# Usage: cetus-pools.sh [PAGE] [SIZE]
# PAGE defaults to 1, SIZE defaults to 200. Cetus has 40k+ pools — use SIZE wisely.
# Example: cetus-pools.sh 1 200 > /tmp/cetus.json
set -euo pipefail
PAGE="${1:-1}"
SIZE="${2:-200}"
exec curl -sS --max-time 30 \
  "https://api-sui.cetus.zone/v2/sui/stats_pools?display_all_pools=true&page=${PAGE}&size=${SIZE}"
