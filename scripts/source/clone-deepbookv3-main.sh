#!/usr/bin/env bash
# Clone the main branch of deepbookv3.
# Use for: current Spot CLOB, Margin, and the REFACTORED Predict that will ship to mainnet.
# Usage: clone-deepbookv3-main.sh [DEST]
# DEST defaults to /tmp/deepbookv3.
# Example: clone-deepbookv3-main.sh
#          clone-deepbookv3-main.sh ~/sui-src/deepbookv3
set -euo pipefail

DEST="${1:-/tmp/deepbookv3}"
if [ -d "$DEST" ]; then
  echo "$DEST already exists, skipping clone"
else
  git clone --depth 1 https://github.com/MystenLabs/deepbookv3.git "$DEST"
fi
echo
echo "Top-level packages:"
ls "$DEST/packages"
