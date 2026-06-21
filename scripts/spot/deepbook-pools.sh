#!/usr/bin/env bash
# Fetch the canonical DeepBook V3 mainnet pool catalog from the official public indexer.
# No auth, no arguments. Returns a JSON array of every active mainnet pool.
# Each record: {pool_id, pool_name, base_asset_id, base_asset_decimals, base_asset_symbol,
#              base_asset_name, quote_asset_id, quote_asset_decimals, quote_asset_symbol,
#              quote_asset_name, min_size, lot_size, tick_size}
# Example: deepbook-pools.sh > /tmp/deepbook-pools.json
#          jq '.[] | select(.pool_name | test("USDC"))' /tmp/deepbook-pools.json
set -euo pipefail
exec curl -sS --max-time 30 https://deepbook-indexer.mainnet.mystenlabs.com/get_pools
