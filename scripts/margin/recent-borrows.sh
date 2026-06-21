#!/usr/bin/env bash
# Query recent LoanBorrowedEvent — live borrowing activity to watch for risk-ratio drops.
# Usage: recent-borrows.sh [LIMIT]
#        MARGIN_PACKAGE=0x... recent-borrows.sh [LIMIT]
# LIMIT defaults to 50.
# Example: recent-borrows.sh 50
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKG="${MARGIN_PACKAGE:-0x97d9473771b01f77b0940c589484184b49f6444627ec121314fae6a6d36fb86b}"
LIMIT="${1:-50}"

exec "$REPO_ROOT/operator/target/release/discover" \
  --net mainnet events "${PKG}::margin_manager::LoanBorrowedEvent" --limit "$LIMIT"
