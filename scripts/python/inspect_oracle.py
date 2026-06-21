#!/usr/bin/env python3
"""
Fetch one OracleSVI shared object via sui_getObject and print decoded fields.

Arguments:
  ORACLE_ID             - shared OracleSVI object id (one per asset x expiry)
  [testnet|mainnet|URL] - network (default: testnet)

Usage:
  inspect_oracle.py <ORACLE_ID> [testnet|mainnet|URL]

Example:
  inspect_oracle.py 0x75c2aec22ad83ee7461e6b8d6b06aad84bd68c2b154232328ec0c9a96112ea99 testnet
"""
import sys
import json
import datetime
import urllib.request

URLS = {
    "testnet": "https://fullnode.testnet.sui.io:443",
    "mainnet": "https://fullnode.mainnet.sui.io:443",
}


def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    oid = sys.argv[1]
    net = sys.argv[2] if len(sys.argv) > 2 else "testnet"
    url = URLS.get(net, net)

    body = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sui_getObject",
        "params": [oid, {"showType": True, "showOwner": True, "showContent": True}],
    }).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read())

    d = res.get("result", {}).get("data", {}) or {}
    f = d.get("content", {}).get("fields", {})
    if not f:
        print(json.dumps(res, indent=2))
        sys.exit(2)
    exp = int(f.get("expiry", 0))
    ts = int(f.get("timestamp", 0))
    svi = f.get("svi", {}).get("fields", {})
    caps = f.get("authorized_caps", {}).get("fields", {}).get("contents", [])
    fmt = lambda ms: datetime.datetime.fromtimestamp(ms / 1000, datetime.UTC).isoformat() if ms else "-"
    print(f"type            {d.get('type')}")
    print(f"owner           {d.get('owner')}")
    print(f"underlying      {f.get('underlying_asset')}")
    print(f"expiry          {exp}  ({fmt(exp)})")
    print(f"last update     {ts}    ({fmt(ts)})")
    print(f"active          {f.get('active')}")
    print(f"spot            {f.get('prices',{}).get('fields',{}).get('spot')}  (1e9 scaled)")
    print(f"forward         {f.get('prices',{}).get('fields',{}).get('forward')}")
    print(f"settled price   {f.get('settlement_price')}")
    print(f"svi a/b/sigma   {svi.get('a')} / {svi.get('b')} / {svi.get('sigma')}")
    print(f"svi rho         {svi.get('rho')}")
    print(f"svi m           {svi.get('m')}")
    print(f"auth caps ({len(caps)}):")
    for c in caps:
        print(f"  {c}")


if __name__ == "__main__":
    main()
