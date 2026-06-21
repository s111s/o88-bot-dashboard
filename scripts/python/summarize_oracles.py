#!/usr/bin/env python3
"""
Reads the Predict oracle catalog JSON from stdin (the array returned by
predict-server.testnet.mystenlabs.com/oracles) and prints summaries.

No arguments. Consumes stdin.

Usage:
  curl -s https://predict-server.testnet.mystenlabs.com/oracles | summarize_oracles.py

Example (via the oracle-catalog.sh wrapper):
  scripts/predict/oracle-catalog.sh | scripts/python/summarize_oracles.py
"""
import sys
import json
import datetime


def main():
    data = json.load(sys.stdin)
    print(f"total oracles: {len(data)}")
    under, status, active = {}, {}, {}
    for o in data:
        under[o["underlying_asset"]] = under.get(o["underlying_asset"], 0) + 1
        status[o["status"]] = status.get(o["status"], 0) + 1
        if o["status"] == "active":
            active[o["underlying_asset"]] = active.get(o["underlying_asset"], 0) + 1
    print("underlying counts:", under)
    print("status counts:    ", status)
    print("active by asset:  ", active)
    print("\n--- next 5 active oracles by expiry ---")
    actives = sorted([x for x in data if x["status"] == "active"], key=lambda x: x["expiry"])
    for o in actives[:5]:
        exp = datetime.datetime.fromtimestamp(o["expiry"] / 1000, datetime.UTC).isoformat()
        print(f"  {o['underlying_asset']:5}  expires {exp}  oracle={o['oracle_id']}")


if __name__ == "__main__":
    main()
