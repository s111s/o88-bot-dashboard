#!/usr/bin/env bash
# Query recent PredictManagerCreated events on testnet.
# Each event payload: { manager_id, owner }.
# Use to discover every shared PredictManager Bot K-redeem can act against.
# Usage: manager-events.sh [LIMIT]
# Example: manager-events.sh 50
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIMIT="${1:-20}"
PREDICT_PKG="${PREDICT_PKG:-0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138}"

exec "$REPO_ROOT/operator/target/release/discover" \
  --net testnet events "${PREDICT_PKG}::predict_manager::PredictManagerCreated" --limit "$LIMIT"
