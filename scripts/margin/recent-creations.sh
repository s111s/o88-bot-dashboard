#!/usr/bin/env bash
# Query recent MarginManagerCreatedEvent emissions from the live mainnet Margin package.
# Use this to enumerate all active MarginManager objects (event scan).
# Usage: recent-creations.sh [LIMIT]
#        MARGIN_PACKAGE=0x... recent-creations.sh [LIMIT]
# LIMIT defaults to 50. Event JSON fields: margin_manager_id, balance_manager_id,
#   deepbook_pool_id, owner, timestamp.
# Example: recent-creations.sh 100
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKG="${MARGIN_PACKAGE:-0x97d9473771b01f77b0940c589484184b49f6444627ec121314fae6a6d36fb86b}"
LIMIT="${1:-50}"

exec "$REPO_ROOT/operator/target/release/discover" \
  --net mainnet events "${PKG}::margin_manager::MarginManagerCreatedEvent" --limit "$LIMIT"
