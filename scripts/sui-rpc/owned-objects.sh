#!/usr/bin/env bash
# Usage: owned-objects.sh <ADDRESS> [testnet|mainnet|URL] [TYPE_SUBSTR]
# First page only (50 objects). For full pagination + grouping use:
#   operator/target/release/discover --net <net> scan <ADDRESS> --include <kw>
# Example: owned-objects.sh 0xd0ec0b201de6b4e7f425918bbd7151c37fc1b06c59b3961a2a00db74f6ea865e mainnet margin
#          (lists Margin caps owned by the deepbookv3 mainnet admin)
set -euo pipefail
source "$(dirname "$0")/_rpc.sh"

ADDRESS="${1:?address required}"
NET="${2:-testnet}"
FILTER="${3:-}"
URL=$(rpc_url "$NET")

rpc_call "$URL" "suix_getOwnedObjects" \
  "[\"$ADDRESS\",{\"options\":{\"showType\":true}},null,50]" \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
data = r.get('result', {}).get('data', [])
flt = '${FILTER}'.lower()
shown = 0
for d in data:
    t = d.get('data', {}).get('type', '') or ''
    oid = d.get('data', {}).get('objectId', '')
    if not flt or flt in t.lower():
        print(f'{oid}  {t}')
        shown += 1
print(f'--- {shown}/{len(data)} objects shown, hasNextPage: {r[\"result\"].get(\"hasNextPage\")}', file=sys.stderr)
"
