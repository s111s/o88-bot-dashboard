#!/usr/bin/env bash
# List deepbookv3 remote branches matching a keyword (default: predict|testnet|deepbook).
# Usage: list-deepbookv3-branches.sh [KEYWORD_REGEX]
# Argument is an extended regex (passed to grep -E).
# Example: list-deepbookv3-branches.sh                # default predict|testnet|deepbook
#          list-deepbookv3-branches.sh margin         # margin-only
#          list-deepbookv3-branches.sh 'main|testnet' # main + testnet
set -euo pipefail

KEYWORDS="${1:-predict|testnet|deepbook}"
git ls-remote --heads https://github.com/MystenLabs/deepbookv3.git \
  | grep -iE "$KEYWORDS" \
  | awk '{print $2}'
