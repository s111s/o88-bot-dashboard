#!/usr/bin/env bash
# Usage: object-types.sh <ID1> [ID2 ...]
#        NET=mainnet object-types.sh <ID1> [ID2 ...]
# Resolve a list of object IDs to their Move types (testnet by default).
# Useful for identifying shared objects in unknown PTB inputs.
# Example: NET=mainnet object-types.sh \
#            0x0e40998b359a9ccbab22a98ed21bd4346abf19158bc7980c8291908086b3a742 \
#            0xba473d9ae278f10af75c50a8fa341e9c6a1c087dc91a3f23e8048baf67d0754f \
#            0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce
#          (identifies: MarginRegistry, MarginPool<USDC>, DeepBook Pool<DEEP,USDC>)
set -euo pipefail
source "$(dirname "$0")/_rpc.sh"

NET="${NET:-testnet}"
URL=$(rpc_url "$NET")

for id in "$@"; do
  t=$(rpc_call "$URL" "sui_getObject" "[\"$id\",{\"showType\":true}]" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['result'].get('data',{}).get('type','?'))")
  echo "$id  ->  $t"
done
