#!/usr/bin/env python3
"""
Paginated scan of all owned objects of an address. Groups by package address
derived from object type, prints types optionally filtered by keyword.

Arguments:
  ADDRESS               - 32-byte Sui address (owner)
  [testnet|mainnet|URL] - network (default: testnet)
  [keyword,keyword,...] - comma-separated case-insensitive substrings to filter types

Usage:
  scan_owned_objects.py <ADDRESS> [testnet|mainnet|URL] [keyword,keyword,...]

Example (find Margin caps owned by the mainnet deepbookv3 admin):
  scan_owned_objects.py \\
      0xd0ec0b201de6b4e7f425918bbd7151c37fc1b06c59b3961a2a00db74f6ea865e \\
      mainnet \\
      margin,liquidation
"""
import sys
import json
import urllib.request

URLS = {
    "testnet": "https://fullnode.testnet.sui.io:443",
    "mainnet": "https://fullnode.mainnet.sui.io:443",
}


def call(url, method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    address = sys.argv[1]
    net = sys.argv[2] if len(sys.argv) > 2 else "testnet"
    keywords = [k.strip().lower() for k in (sys.argv[3] if len(sys.argv) > 3 else "").split(",") if k.strip()]
    url = URLS.get(net, net)

    cursor = None
    all_types = []
    pages = 0
    while True:
        pages += 1
        params = [address, {"options": {"showType": True}}, cursor, 50]
        res = call(url, "suix_getOwnedObjects", params)["result"]
        for d in res.get("data", []):
            t = d.get("data", {}).get("type")
            oid = d.get("data", {}).get("objectId")
            if t:
                all_types.append((oid, t))
        if not res.get("hasNextPage"):
            break
        cursor = res["nextCursor"]
        if pages > 100:
            print(f"[safety] hit 100 pages, truncating", file=sys.stderr)
            break

    matches = [(o, t) for (o, t) in all_types if not keywords or any(k in t.lower() for k in keywords)]
    print(f"pages: {pages}, total: {len(all_types)}, matched: {len(matches)}", file=sys.stderr)
    by_pkg = {}
    for oid, t in matches:
        pkg = t.split("::")[0]
        by_pkg.setdefault(pkg, {}).setdefault(t, []).append(oid)
    for pkg in sorted(by_pkg):
        print(f"\n{pkg}")
        for t, ids in sorted(by_pkg[pkg].items()):
            print(f"  {t}  ({len(ids)} obj)")
            for oid in ids:
                print(f"    {oid}")


if __name__ == "__main__":
    main()
