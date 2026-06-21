#!/usr/bin/env bash
# Wrap the Rust k-redeem-watch binary. Discovers PredictManagers, reads each one's
# positions, and surfaces every position on a currently-settled oracle as a
# redemption candidate.
# Usage: k-redeem-watch.sh [LIMIT]
#        k-redeem-watch.sh --catalog-only [LIMIT]
# LIMIT defaults to 200 (managers scanned, newest first).
# Example: k-redeem-watch.sh 100
#          k-redeem-watch.sh --catalog-only 50
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec "$REPO_ROOT/operator/target/release/k-redeem-watch" "$@"
