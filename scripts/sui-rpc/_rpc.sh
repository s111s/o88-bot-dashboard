#!/usr/bin/env bash
# Shared: select RPC URL from `net` arg (testnet|mainnet, default testnet).
set -euo pipefail

rpc_url() {
  local net="${1:-testnet}"
  case "$net" in
    testnet) echo "https://fullnode.testnet.sui.io:443" ;;
    mainnet) echo "https://fullnode.mainnet.sui.io:443" ;;
    http*)   echo "$net" ;;
    *) echo "unknown net: $net (use testnet, mainnet, or full URL)" >&2; return 1 ;;
  esac
}

rpc_call() {
  local url="$1" method="$2" params="$3"
  curl -sS --max-time 30 -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}"
}
