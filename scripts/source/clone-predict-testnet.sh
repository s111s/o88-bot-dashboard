#!/usr/bin/env bash
# Clone the predict-testnet-4-16 branch of deepbookv3.
# This is the branch that matches the DEPLOYED testnet bytecode (older cap-gated model).
# NOT to be confused with main (refactored production target).
# Usage: clone-predict-testnet.sh [DEST]
# DEST defaults to /tmp/predict-testnet-4-16.
# Example: clone-predict-testnet.sh
#          clone-predict-testnet.sh ~/sui-src/predict
set -euo pipefail

DEST="${1:-/tmp/predict-testnet-4-16}"
if [ -d "$DEST" ]; then
  echo "$DEST already exists, skipping clone"
else
  git clone --branch predict-testnet-4-16 --depth 1 \
    https://github.com/MystenLabs/deepbookv3.git "$DEST"
fi
echo
echo "Predict modules:"
find "$DEST/packages/predict/sources" -name '*.move' -not -path '*/tests/*' | sort
