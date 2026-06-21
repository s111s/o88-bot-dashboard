#!/usr/bin/env bash
# Query recent LiquidationEvent emissions from the live mainnet Margin package.
# Usage: recent-liquidations.sh [LIMIT]
#        MARGIN_PACKAGE=0x... recent-liquidations.sh [LIMIT]
# LIMIT defaults to 20. MARGIN_PACKAGE defaults to the current live mainnet pkg.
# Example: recent-liquidations.sh 50
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKG="${MARGIN_PACKAGE:-0x97d9473771b01f77b0940c589484184b49f6444627ec121314fae6a6d36fb86b}"
LIMIT="${1:-20}"

exec "$REPO_ROOT/operator/target/release/discover" \
  --net mainnet events "${PKG}::margin_manager::LiquidationEvent" --limit "$LIMIT"
