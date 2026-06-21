#!/usr/bin/env bash
# Usage: events.sh <EVENT_TYPE> [testnet|mainnet|URL] [LIMIT]
# EVENT_TYPE must be a fully-qualified Move type: <PACKAGE>::<MODULE>::<EventName>
# Example: events.sh \
#            '0x97d9473771b01f77b0940c589484184b49f6444627ec121314fae6a6d36fb86b::margin_manager::LiquidationEvent' \
#            mainnet 20
#          (recent mainnet Margin liquidations)
set -euo pipefail
source "$(dirname "$0")/_rpc.sh"

EVENT_TYPE="${1:?event type required}"
NET="${2:-testnet}"
LIMIT="${3:-20}"
URL=$(rpc_url "$NET")

rpc_call "$URL" "suix_queryEvents" \
  "[{\"MoveEventType\":\"$EVENT_TYPE\"},null,$LIMIT,true]" \
  | python3 -m json.tool
