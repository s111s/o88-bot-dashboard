# o88 scripts

Reproducible shell + python helpers. Every entry below has a **real, working example** you can copy-paste.

---

## Conventions

- **Default network is testnet** for any script that touches RPC.
- Second positional arg (or `NET=...` env) overrides to: `testnet`, `mainnet`, or a full URL (e.g. `https://your-private-rpc/`).
- All scripts use `set -euo pipefail` (bash) or strict typing (python).
- Object IDs and addresses are always 32-byte hex with `0x` prefix.

---

## Known IDs cheat sheet

You'll see these used in examples below. All verified live as of 2026-06-20.

### Testnet — DeepBook Predict
| Role | ID |
|------|-----|
| Predict package | `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138` |
| Predict (shared) | `0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a` |
| Registry (shared) | `0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64` |
| Registry `oracle_ids` table | `0x5f8c40ec8a5056c8f1dbb0b2d3dee8bb1565cc38a1c261b647aedcdc025f5208` |
| Sample BTC OracleSVI (live BTC oracle from current set) | refresh via `scripts/predict/live-oracles.sh`; first column shows fresh IDs |
| Cap1 OracleSVICap | `0x0b8fb5c4514337dbd300ff2a49185a99433d8369670a23329126388364119817` |
| deepbookv3 admin (testnet) | `0xb3d277c50f7b846a5f609a8d13428ae482b5826bb98437997373f3a0d60d280e` |

### Mainnet — DeepBook Margin + Spot
| Role | ID |
|------|-----|
| Margin package | `0x97d9473771b01f77b0940c589484184b49f6444627ec121314fae6a6d36fb86b` |
| MarginRegistry (shared) | `0x0e40998b359a9ccbab22a98ed21bd4346abf19158bc7980c8291908086b3a742` |
| MarginPool<USDC> (shared) | `0xba473d9ae278f10af75c50a8fa341e9c6a1c087dc91a3f23e8048baf67d0754f` |
| DeepBook Spot package | `0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809` |
| DeepBook Pool DEEP/USDC | `0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce` |
| DeepBook Pool SUI/USDC | `0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407` |
| DeepBook Pool LZ-WBTC/USDC | `0xf5142aafa24866107df628bf92d0358c7da6acc46c2f10951690fd2b8570f117` |
| DeepBook Pool XBTC/USDC | `0x20b9a3ec7a02d4f344aa1ebc5774b7b0ccafa9a5d76230662fdc0300bb215307` |
| DeepBook Pool BWETH/USDC | `0x1109352b9112717bd2a7c3eb9a416fff1ba6951760f5bdd5424cf5e4e5b3e65c` |
| DEEP token type | `0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP` |
| USDC token type | `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC` |
| Cetus CLMM pkg (published-at) | `0xc6faf3703b0e8ba9ed06b7851134bbbe7565eb35ff823fd78432baa4cbeaa12e` |
| Cetus Global Config | `0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f` |
| Cetus SUI/USDC pool (top TVL) | `0xb8d7d9e66a60c239e7a60110efcf8de6c705580ed924d0dde141f4a0e2c90105` |
| Bluefin Spot pkg (published-at) | `0xd075338d105482f1527cbfd363d6413558f184dec36d9138a70261e87f486e9c` |
| Bluefin SUI/USDC pool (v1) | `0xcd8294c7507df2c5b21e065067d1e36ddbea41f273425019bd9f9935bce40b58` |
| Pyth package | `0x8d97f1cd6ac663735be08d1d2b6d02a159e711586461306ce60a2b7a6a565a9e` |
| Pyth State (shared) | `0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8` |
| Pyth PriceInfo DEEP/USD | `0x8c7f3a322b94cc69db2a2ac575cbd94bf5766113324c3a3eceac91e3e88a51ed` |
| Pyth PriceInfo USDC/USD | `0x5dec622733a204ca27f5a90d8c2fad453cc6665186fd5dff13a83d0b6c9027ab` |
| deepbookv3 admin (mainnet) | `0xd0ec0b201de6b4e7f425918bbd7151c37fc1b06c59b3961a2a00db74f6ea865e` |
| Active liquidator A | `0xdf7efdffbf183228108382c8e31491104be6d6ecfa66ed17743d627195ed4526` |
| Active liquidator B | `0x46328cac6eb3bef5e606912c9df4d1416f1e9086434c3f62f1010b86c768c893` |
| Sample LiquidationEvent tx digest | `252j2EQkwxrmJTRNDc2Jt5Gkb7zixZorQXB3ssFbaPP9` |
| Sample MarginManager<DEEP,USDC> | `0x365e740a1b90259e3afddf0327c1536d98cb99ac43e9936b3d53a4114b6303b7` |

---

## sui-rpc/ — generic Sui JSON-RPC helpers

### `sui-rpc/get-object.sh`
Fetch one object with type, owner, and content fields.
```
Usage: get-object.sh <OBJECT_ID> [testnet|mainnet|URL]
```
**Argument:** `OBJECT_ID` — any 32-byte Sui object ID (package, shared object, owned object, dynamic field, etc.)

**Example (testnet — read the Predict Registry):**
```sh
scripts/sui-rpc/get-object.sh 0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64 testnet
```

**Example (mainnet — read the MarginRegistry):**
```sh
scripts/sui-rpc/get-object.sh 0x0e40998b359a9ccbab22a98ed21bd4346abf19158bc7980c8291908086b3a742 mainnet
```

---

### `sui-rpc/owned-objects.sh`
First page (50) of objects owned by an address, optionally filtered by type substring.
For full pagination + grouping use `discover scan`.
```
Usage: owned-objects.sh <ADDRESS> [testnet|mainnet|URL] [TYPE_SUBSTR]
```
**Arguments:**
- `ADDRESS` — Sui account or object address (32-byte hex)
- `TYPE_SUBSTR` — case-insensitive substring; only types containing it are shown

**Example (mainnet — find Margin caps held by the deepbookv3 admin):**
```sh
scripts/sui-rpc/owned-objects.sh 0xd0ec0b201de6b4e7f425918bbd7151c37fc1b06c59b3961a2a00db74f6ea865e mainnet margin
```

**Example (testnet — every object an address owns, unfiltered):**
```sh
scripts/sui-rpc/owned-objects.sh 0xb3d277c50f7b846a5f609a8d13428ae482b5826bb98437997373f3a0d60d280e testnet
```

---

### `sui-rpc/dynamic-fields.sh`
List dynamic fields of a parent object (typically a Table or Bag). Returns up to 50 field metadata records.
```
Usage: dynamic-fields.sh <PARENT_OBJECT_ID> [testnet|mainnet|URL]
```
**Argument:** `PARENT_OBJECT_ID` — the inner `id` of a `Table` or `Bag` or any object with dynamic fields. (NOT the table-wrapper object; you usually have to drill into a field like `someTable.fields.id.id`.)

**Example (testnet — list the Predict Registry's `oracle_ids` table entries):**
```sh
scripts/sui-rpc/dynamic-fields.sh 0x5f8c40ec8a5056c8f1dbb0b2d3dee8bb1565cc38a1c261b647aedcdc025f5208 testnet
```

---

### `sui-rpc/dynamic-field.sh`
Fetch one specific dynamic field by name.
```
Usage: dynamic-field.sh <PARENT_ID> <NAME_JSON> [testnet|mainnet|URL]
```
**Arguments:**
- `PARENT_ID` — same as above
- `NAME_JSON` — the field's name as a JSON `{"type":..., "value":...}` literal (single-quote it in bash to preserve the JSON)

**Example (testnet — read one entry in the Predict Registry oracle_ids table):**
```sh
scripts/sui-rpc/dynamic-field.sh \
  0x5f8c40ec8a5056c8f1dbb0b2d3dee8bb1565cc38a1c261b647aedcdc025f5208 \
  '{"type":"0x2::object::ID","value":"0x0b8fb5c4514337dbd300ff2a49185a99433d8369670a23329126388364119817"}' \
  testnet
```

---

### `sui-rpc/events.sh`
Query events by fully-qualified Move event type.
```
Usage: events.sh <EVENT_TYPE> [testnet|mainnet|URL] [LIMIT]
```
**Argument:** `EVENT_TYPE` must be `<PACKAGE_ID>::<MODULE>::<EventName>`. Get module + event names from the Move source or `discover modules <pkg>`.

**Example (mainnet — recent Margin liquidations):**
```sh
scripts/sui-rpc/events.sh \
  '0x97d9473771b01f77b0940c589484184b49f6444627ec121314fae6a6d36fb86b::margin_manager::LiquidationEvent' \
  mainnet 20
```

**Example (testnet — Predict oracle settlements):**
```sh
scripts/sui-rpc/events.sh \
  '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::oracle::OracleSettled' \
  testnet 10
```

---

### `sui-rpc/txns.sh`
Recent transactions originating from an address (descending). Useful to spot recent publishes or active bot patterns.
```
Usage: txns.sh <ADDRESS> [testnet|mainnet|URL] [LIMIT]
```
**Argument:** `ADDRESS` — sender (any account).

**Example (mainnet — recent txs from an active liquidator):**
```sh
scripts/sui-rpc/txns.sh 0xdf7efdffbf183228108382c8e31491104be6d6ecfa66ed17743d627195ed4526 mainnet 10
```

---

### `sui-rpc/object-types.sh`
Resolve a list of object IDs to their Move types in one go. Useful for identifying unknown shared objects from a decoded PTB.
```
Usage: object-types.sh <ID1> [ID2 ...]
       NET=mainnet object-types.sh ...
```
**Argument:** one or more `OBJECT_ID`s as positional args. Override network via `NET=mainnet` env (defaults to testnet).

**Example (mainnet — identify a known liquidator-tx input list):**
```sh
NET=mainnet scripts/sui-rpc/object-types.sh \
  0x0e40998b359a9ccbab22a98ed21bd4346abf19158bc7980c8291908086b3a742 \
  0xba473d9ae278f10af75c50a8fa341e9c6a1c087dc91a3f23e8048baf67d0754f \
  0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce
```

---

## predict/ — DeepBook Predict (testnet)

### `predict/oracle-catalog.sh`
Raw JSON of the full oracle catalog from `predict-server.testnet.mystenlabs.com/oracles`. No auth.
```
Usage: oracle-catalog.sh
```
**No arguments.**

**Example (save the snapshot to a file for offline analysis):**
```sh
scripts/predict/oracle-catalog.sh > /tmp/oracles.json
jq '.[] | select(.status=="active") | .oracle_id' /tmp/oracles.json
```

---

### `predict/oracle-summary.sh`
Counts oracles by `underlying_asset` and `status`, plus the next 5 active markets by expiry.
```
Usage: oracle-summary.sh
```
**No arguments.**

**Example:**
```sh
scripts/predict/oracle-summary.sh
```

---

### `predict/live-oracles.sh`
Just the active oracles, sorted by expiry ascending. Includes oracle_id + cap_id per market.
```
Usage: live-oracles.sh
```
**No arguments.**

**Example:**
```sh
scripts/predict/live-oracles.sh
```

---

### `predict/inspect-oracle.sh`
Decode one `OracleSVI` shared object: underlying, expiry, spot/forward, SVI params, auth caps.
```
Usage: inspect-oracle.sh <ORACLE_ID> [testnet|mainnet|URL]
```
**Argument:** `ORACLE_ID` — the shared `OracleSVI` object ID (one per asset×expiry). Get fresh IDs from `live-oracles.sh`.

**Example (testnet — inspect a known recent BTC oracle):**
```sh
# First get a current ID:
ORACLE_ID=$(scripts/predict/live-oracles.sh | awk '/oracle=/{print $7}' | head -1 | cut -d= -f2)
# Then inspect:
scripts/predict/inspect-oracle.sh "$ORACLE_ID" testnet
```

Or hardcode any sample ID from the catalog:
```sh
scripts/predict/inspect-oracle.sh 0x75c2aec22ad83ee7461e6b8d6b06aad84bd68c2b154232328ec0c9a96112ea99 testnet
```

---

### `predict/inspect-registry.sh`
Dump the known testnet Predict Registry + its `oracle_ids` table contents.
```
Usage: inspect-registry.sh
```
**No arguments.** Hardcoded to read the canonical testnet Registry ID.

**Example:**
```sh
scripts/predict/inspect-registry.sh
```

---

### `predict/manager-events.sh`
Query recent `PredictManagerCreated` events to discover every shared `PredictManager`.
Bot K-redeem's input pipeline starts here.
```
Usage: manager-events.sh [LIMIT]
       PREDICT_PKG=0x... manager-events.sh [LIMIT]
```
**Argument:** `LIMIT` — default 20.

**Example:**
```sh
scripts/predict/manager-events.sh 50
```

---

### `predict/inspect-manager.sh`
Decode one `PredictManager` shared object: owner, balance manager id, the inner
`positions` table id (use `sui-rpc/dynamic-fields.sh` to enumerate positions), and
the range-positions table.
```
Usage: inspect-manager.sh <MANAGER_ID> [testnet|mainnet|URL]
```
**Argument:** `MANAGER_ID` — get from `manager-events.sh` output.

**Example:**
```sh
scripts/predict/inspect-manager.sh \
  0xfb4881b75f25c97b3ab72dd14fcf5df4e35bc26a6e187cb952b9f9bb2205a9c7 testnet
```

---

### `predict/k-redeem-watch.sh`
Bot K-redeem observability driver. Discovers every PredictManager, reads each
one's open positions, joins against currently-settled oracles, and prints every
position that's ready for `predict::redeem_permissionless<Quote>`. Pure read-only —
no tx submission.
```
Usage: k-redeem-watch.sh [--catalog-only] [LIMIT]
```
**Arguments:**
- `--catalog-only` — skip the slow per-manager position reads; just list managers + settled oracle count
- `LIMIT` — number of managers scanned, newest first; default 200

**Example (cheap, lists candidates fast):**
```sh
scripts/predict/k-redeem-watch.sh --catalog-only 100
```

**Example (full pipeline — slow, makes N+M RPC calls):**
```sh
scripts/predict/k-redeem-watch.sh 100
```

---

## margin/ — DeepBook Margin (mainnet)

### `margin/recent-liquidations.sh`
Recent `LiquidationEvent`s from the live mainnet Margin package.
```
Usage: recent-liquidations.sh [LIMIT]
       MARGIN_PACKAGE=0x... recent-liquidations.sh [LIMIT]
```
**Argument:** `LIMIT` — default 20. Override `MARGIN_PACKAGE` env if probing a newer/older deployment.

**Example:**
```sh
scripts/margin/recent-liquidations.sh 50
```

---

### `margin/recent-creations.sh`
Recent `MarginManagerCreatedEvent`s — use to enumerate every MarginManager.
```
Usage: recent-creations.sh [LIMIT]
```
**Argument:** `LIMIT` — default 50. Same `MARGIN_PACKAGE` env override.

**Example:**
```sh
scripts/margin/recent-creations.sh 100
```

---

### `margin/recent-borrows.sh`
Recent `LoanBorrowedEvent`s — live borrowing to watch for risk-ratio shifts.
```
Usage: recent-borrows.sh [LIMIT]
```
**Argument:** `LIMIT` — default 50.

**Example:**
```sh
scripts/margin/recent-borrows.sh 50
```

---

### `margin/inspect-margin-manager.sh`
Decode one `MarginManager<Base,Quote>`: type params, owner, deepbook pool, borrowed shares.
```
Usage: inspect-margin-manager.sh <MARGIN_MANAGER_ID> [testnet|mainnet|URL]
```
**Argument:** `MARGIN_MANAGER_ID` — get from `recent-creations.sh` (the `margin_manager_id` field in the parsedJson) or from a `LiquidationEvent`.

**Example (mainnet — known liquidated manager):**
```sh
scripts/margin/inspect-margin-manager.sh 0x365e740a1b90259e3afddf0327c1536d98cb99ac43e9936b3d53a4114b6303b7 mainnet
```

---

### `margin/decode-tx.sh`
Decode any transaction's PTB structure: inputs (shared/owned/pure) + the chain of MoveCall commands. Generic — works for any chain interaction, not just Margin.
```
Usage: decode-tx.sh <TX_DIGEST> [testnet|mainnet|URL]
```
**Argument:** `TX_DIGEST` — base58 digest from `txns.sh` output or any Sui explorer.

**Example (mainnet — reverse-engineer a live liquidator):**
```sh
scripts/margin/decode-tx.sh 252j2EQkwxrmJTRNDc2Jt5Gkb7zixZorQXB3ssFbaPP9 mainnet
```

---

## spot/ — DeepBook Spot + cross-DEX (mainnet)

### `spot/deepbook-pools.sh`
Raw JSON list of every DeepBook V3 mainnet pool from the official public indexer. No auth, no arguments.
```
Usage: deepbook-pools.sh
```

**Example:**
```sh
scripts/spot/deepbook-pools.sh > /tmp/deepbook.json
jq '.[] | select(.pool_name=="SUI_USDC") | .pool_id' /tmp/deepbook.json
```

---

### `spot/deepbook-pools-summary.sh`
Compact ASCII table of all DeepBook mainnet pools: `pool_name  pool_id  tick  lot  min`. No arguments.
```
Usage: deepbook-pools-summary.sh
```

**Example:**
```sh
scripts/spot/deepbook-pools-summary.sh
```

---

### `spot/cetus-pools.sh`
Raw Cetus stats_pools JSON (paginated). 43k+ Cetus pools exist; this is page-based.
```
Usage: cetus-pools.sh [PAGE] [SIZE]
```
**Arguments:**
- `PAGE` — page number (1-indexed), default 1
- `SIZE` — items per page (max ~200), default 200

**Example:**
```sh
scripts/spot/cetus-pools.sh 1 200 > /tmp/cetus-page1.json
```

---

### `spot/cetus-pools-top.sh`
Top Cetus mainnet pools by TVL, optionally filtered by symbol substring.
```
Usage: cetus-pools-top.sh [SYMBOL_SUBSTR] [LIMIT]
```
**Arguments:**
- `SYMBOL_SUBSTR` — case-insensitive symbol filter (e.g. `USDC`, `SUI`, `BTC`); default empty (show all)
- `LIMIT` — number of rows; default 30

**Example (top USDC-paired pools):**
```sh
scripts/spot/cetus-pools-top.sh USDC 20
```

**Example (BTC-related pools):**
```sh
scripts/spot/cetus-pools-top.sh BTC 10
```

---

### `spot/bluefin-pool-events.sh`
Discover live Bluefin Spot pool IDs by scanning recent events (no public REST pool list known).
```
Usage: bluefin-pool-events.sh [LIMIT]
        BLUEFIN_SPOT_ORIGIN=0x... bluefin-pool-events.sh [LIMIT]
```
**Arguments:**
- `LIMIT` — events to scan; default 50. Higher = more distinct pools surfaced.
- `BLUEFIN_SPOT_ORIGIN` env — defaults to the canonical Bluefin Spot original package address.

**Example:**
```sh
scripts/spot/bluefin-pool-events.sh 200
```

---

### `spot/inspect-deepbook-pool.sh`
Decode one DeepBook `Pool<Base,Quote>` shared object: type params, owner, top-level fields.
```
Usage: inspect-deepbook-pool.sh <POOL_ID> [testnet|mainnet|URL]
```
**Argument:** `POOL_ID` — any DeepBook spot pool object ID (get from `deepbook-pools.sh`).

**Example (mainnet — canonical SUI/USDC pool):**
```sh
scripts/spot/inspect-deepbook-pool.sh \
  0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407 mainnet
```

---

## source/ — clone helpers

### `source/clone-predict-testnet.sh`
Clone the `predict-testnet-4-16` branch — matches the deployed testnet Predict bytecode.
```
Usage: clone-predict-testnet.sh [DEST]
```
**Argument:** `DEST` — destination dir. Defaults to `/tmp/predict-testnet-4-16`.

**Example:**
```sh
scripts/source/clone-predict-testnet.sh
# or to a custom location:
scripts/source/clone-predict-testnet.sh ~/sui-src/predict
```

---

### `source/clone-deepbookv3-main.sh`
Clone the `main` branch — current Spot, Margin, and the refactored Predict (production target).
```
Usage: clone-deepbookv3-main.sh [DEST]
```
**Argument:** `DEST` — defaults to `/tmp/deepbookv3`.

**Example:**
```sh
scripts/source/clone-deepbookv3-main.sh
```

---

### `source/list-deepbookv3-branches.sh`
List `deepbookv3` remote branches matching a keyword.
```
Usage: list-deepbookv3-branches.sh [KEYWORD_REGEX]
```
**Argument:** extended-regex keyword filter. Defaults to `predict|testnet|deepbook`.

**Example:**
```sh
scripts/source/list-deepbookv3-branches.sh                # default
scripts/source/list-deepbookv3-branches.sh margin         # margin-only
scripts/source/list-deepbookv3-branches.sh 'main|testnet' # main + testnet
```

---

## python/ — multi-line parsers

### `python/scan_owned_objects.py`
Paginated scan of every object owned by an address. Groups by package, optionally filters by keyword.
```
Usage: scan_owned_objects.py <ADDRESS> [testnet|mainnet|URL] [keyword,keyword,...]
```
**Arguments:**
- `ADDRESS` — owner address
- 3rd arg: comma-separated keywords to filter types

**Example (mainnet — what Margin/liquidation things does the admin own?):**
```sh
scripts/python/scan_owned_objects.py \
  0xd0ec0b201de6b4e7f425918bbd7151c37fc1b06c59b3961a2a00db74f6ea865e \
  mainnet \
  margin,liquidation
```

---

### `python/summarize_oracles.py`
Reads the `/oracles` catalog JSON from stdin; prints summaries.
```
Usage: ... | summarize_oracles.py
```
**Argument:** none — consumes stdin.

**Example:**
```sh
scripts/predict/oracle-catalog.sh | scripts/python/summarize_oracles.py
```

---

### `python/inspect_oracle.py`
Fetch one `OracleSVI` and pretty-print decoded fields (pure-python alt to the bash inspect-oracle.sh).
```
Usage: inspect_oracle.py <ORACLE_ID> [testnet|mainnet|URL]
```
**Argument:** `ORACLE_ID` — shared OracleSVI ID.

**Example:**
```sh
scripts/python/inspect_oracle.py 0x75c2aec22ad83ee7461e6b8d6b06aad84bd68c2b154232328ec0c9a96112ea99 testnet
```

---

## Heavy lifting → `operator/discover` (Rust)

For anything paginated or repeated, use the Rust binary:

```sh
cd operator && cargo build --release --bin discover
./target/release/discover --help

# Reproduce Phase 0.1 (Predict cap probe on testnet)
./target/release/discover --net testnet scan \
  0xb3d277c50f7b846a5f609a8d13428ae482b5826bb98437997373f3a0d60d280e \
  --include predict,propbook,block_scholes

# Reproduce Phase 0.2 (Margin cap probe on mainnet)
./target/release/discover --net mainnet scan \
  0xd0ec0b201de6b4e7f425918bbd7151c37fc1b06c59b3961a2a00db74f6ea865e \
  --include margin_registry,liquidation,margin_pool

# List modules of any package
./target/release/discover --net mainnet modules \
  0x97d9473771b01f77b0940c589484184b49f6444627ec121314fae6a6d36fb86b

# Query events by fully-qualified type
./target/release/discover --net mainnet events \
  '0x97d9473771b01f77b0940c589484184b49f6444627ec121314fae6a6d36fb86b::margin_manager::LiquidationEvent' \
  --limit 50
```
