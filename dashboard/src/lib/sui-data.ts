// Server-side data fetchers for the public dashboard.
// All sources are public, no auth: Sui mainnet RPC + the Predict testnet server.

const MAINNET_RPC = "https://fullnode.mainnet.sui.io:443";
const TESTNET_RPC = "https://fullnode.testnet.sui.io:443";
const PREDICT_SERVER = "https://predict-server.testnet.mystenlabs.com";

export const MARGIN_PKG =
  "0x97d9473771b01f77b0940c589484184b49f6444627ec121314fae6a6d36fb86b";
export const DEEPBOOK_PKG =
  "0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809";
export const PREDICT_PKG =
  "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";

/** Predict-server status field. We've seen "active" / "settled" / "inactive" /
 *  "created"; allow any string for forward-compatibility (new variants land
 *  silently as the catch-all). The dashboard only treats "active" + "settled"
 *  specially; everything else falls into "not yet trading / not yet
 *  redeemable" buckets. */
export type CatalogStatus = "active" | "settled" | "inactive" | "created" | (string & {});

export type OracleEntry = {
  predict_id: string;
  oracle_id: string;
  oracle_cap_id: string;
  underlying_asset: string;
  expiry: number;
  min_strike: number;
  tick_size: number;
  status: CatalogStatus;
  activated_at: number | null;
  settlement_price: number | null;
  settled_at: number | null;
  created_checkpoint: number;
};

export type SuiEvent = {
  id: { txDigest: string; eventSeq: string };
  packageId: string;
  transactionModule: string;
  sender: string;
  type: string;
  parsedJson: Record<string, unknown>;
  timestampMs: string;
};

async function rpc(
  method: string,
  params: unknown,
  url = MAINNET_RPC,
  revalidate = 30,
): Promise<unknown> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    next: { revalidate },
  });
  if (!r.ok) throw new Error(`rpc ${method} → ${r.status}`);
  const j = (await r.json()) as { result?: unknown; error?: unknown };
  if (j.error) throw new Error(`rpc ${method} error: ${JSON.stringify(j.error)}`);
  return j.result;
}

export async function fetchPredictOracles(): Promise<OracleEntry[]> {
  try {
    // Payload is ~3MB (exceeds Next.js 2MB data-cache cap), so opt out of the data
    // cache here. The page-level `revalidate = 60` still throttles re-fetches.
    const r = await fetch(`${PREDICT_SERVER}/oracles`, { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()) as OracleEntry[];
  } catch {
    return [];
  }
}

export async function fetchEvents(
  eventType: string,
  limit = 50,
): Promise<SuiEvent[]> {
  try {
    const res = (await rpc(
      "suix_queryEvents",
      [{ MoveEventType: eventType }, null, limit, true],
      MAINNET_RPC,
      30,
    )) as { data?: SuiEvent[] };
    return res?.data ?? [];
  } catch {
    return [];
  }
}

export async function fetchObjectFields<T = unknown>(
  objectId: string,
  net: "mainnet" | "testnet" = "testnet",
): Promise<T | null> {
  try {
    const url = net === "mainnet" ? MAINNET_RPC : TESTNET_RPC;
    const res = (await rpc(
      "sui_getObject",
      [objectId, { showContent: true }],
      url,
      30,
    )) as { data?: { content?: { fields?: T } } };
    return res?.data?.content?.fields ?? null;
  } catch {
    return null;
  }
}

/** Multi-get via `sui_multiGetObjects`. Returns an array aligned to input IDs;
 *  missing/failed entries are `null`. Max ~50 IDs per call. */
export async function fetchObjectsMulti(
  objectIds: string[],
  net: "mainnet" | "testnet" = "testnet",
): Promise<Array<Record<string, unknown> | null>> {
  if (objectIds.length === 0) return [];
  try {
    const url = net === "mainnet" ? MAINNET_RPC : TESTNET_RPC;
    const res = (await rpc(
      "sui_multiGetObjects",
      [objectIds, { showContent: true }],
      url,
      30,
    )) as Array<{ data?: { content?: { fields?: Record<string, unknown> } } }>;
    return res.map((row) => row?.data?.content?.fields ?? null);
  } catch {
    return objectIds.map(() => null);
  }
}

/** Convert 1e9-scaled atomic u64 (as string|number) to a JS number (real value). */
export function scale1e9(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === "string" ? Number(raw) : raw;
  return n / 1_000_000_000;
}

/** Decoded `OracleSVI` market with derived status. Sufficient for the dashboard. */
export type Market = {
  oracleId: string;
  underlying: string;
  expiryMs: number;
  active: boolean;
  spot: number;
  forward: number;
  timestampMs: number;
  settlementPrice: number | null;
  svi: { a: number; b: number; rho: number; m: number; sigma: number };
  authorizedCapCount: number;
};

export type MarketStatus = "active" | "pending_settlement" | "settled" | "inactive";

export function marketStatus(m: Market, nowMs: number): MarketStatus {
  if (m.settlementPrice !== null) return "settled";
  if (nowMs >= m.expiryMs) return "pending_settlement";
  if (!m.active) return "inactive";
  return "active";
}

type RawI64 = { fields?: { magnitude?: string; is_negative?: boolean } };
type RawFields = {
  underlying_asset?: string;
  expiry?: string;
  active?: boolean;
  prices?: { fields?: { spot?: string; forward?: string } };
  svi?: {
    fields?: {
      a?: string;
      b?: string;
      sigma?: string;
      rho?: RawI64;
      m?: RawI64;
    };
  };
  timestamp?: string;
  settlement_price?:
    | { fields?: { vec?: string[] } }
    | { vec?: string[] }
    | string
    | null;
  authorized_caps?: { fields?: { contents?: string[] } };
};

function signedI64(raw: RawI64 | undefined): number {
  const f = raw?.fields ?? {};
  const mag = Number(f.magnitude ?? 0);
  const isNeg = !!f.is_negative;
  return (isNeg ? -mag : mag) / 1_000_000_000;
}

/** Parse the `content.fields` of an OracleSVI object into our typed `Market`. */
export function parseMarket(
  oracleId: string,
  fields: Record<string, unknown> | null,
): Market | null {
  if (!fields) return null;
  const f = fields as RawFields;

  // settlement_price is Option<u64>; Sui RPC returns either {vec: [v]} or null.
  let settlementPrice: number | null = null;
  const sp = f.settlement_price;
  if (sp && typeof sp === "object") {
    const vec =
      (sp as { fields?: { vec?: string[] } }).fields?.vec ??
      (sp as { vec?: string[] }).vec;
    if (vec && vec.length > 0) settlementPrice = scale1e9(vec[0]);
  } else if (typeof sp === "string") {
    settlementPrice = scale1e9(sp);
  }

  return {
    oracleId,
    underlying: f.underlying_asset ?? "?",
    expiryMs: Number(f.expiry ?? 0),
    active: !!f.active,
    spot: scale1e9(f.prices?.fields?.spot),
    forward: scale1e9(f.prices?.fields?.forward),
    timestampMs: Number(f.timestamp ?? 0),
    settlementPrice,
    svi: {
      a: scale1e9(f.svi?.fields?.a),
      b: scale1e9(f.svi?.fields?.b),
      sigma: scale1e9(f.svi?.fields?.sigma),
      rho: signedI64(f.svi?.fields?.rho),
      m: signedI64(f.svi?.fields?.m),
    },
    authorizedCapCount: f.authorized_caps?.fields?.contents?.length ?? 0,
  };
}

// ── Bot K-redeem: redemption candidate pipeline ─────────────────────────────────

export type Manager = {
  managerId: string;
  owner: string;
  createdAtMs: number | null;
};

export type Position = {
  managerId: string;
  owner: string;
  oracleId: string;
  expiryMs: number;
  strike: number; // 1e9-scaled
  isUp: boolean;
  quantity: number;
};

export type RedemptionCandidate = {
  position: Position;
  settlementPrice: number; // real
  wins: boolean;
  settledAtMs: number | null;
};

/** Discover recent PredictManagerCreated events on testnet. */
export async function fetchManagers(limit: number): Promise<Manager[]> {
  try {
    const res = (await rpc(
      "suix_queryEvents",
      [
        { MoveEventType: `${PREDICT_PKG}::predict_manager::PredictManagerCreated` },
        null,
        limit,
        true,
      ],
      TESTNET_RPC,
      60,
    )) as { data?: Array<{ parsedJson?: Record<string, unknown>; timestampMs?: string }> };
    return (res?.data ?? []).map((e) => ({
      managerId: String(e.parsedJson?.manager_id ?? ""),
      owner: String(e.parsedJson?.owner ?? ""),
      createdAtMs: e.timestampMs ? Number(e.timestampMs) : null,
    })).filter((m) => m.managerId);
  } catch {
    return [];
  }
}

type ManagerFields = {
  owner?: string;
  positions?: {
    fields?: {
      id?: { id?: string };
      size?: number | string;
    };
  };
};

/** Get the positions-table object id + size for a manager. */
async function readManagerPositionsTable(
  managerId: string,
): Promise<{ owner: string; tableId: string | null; size: number }> {
  const f = (await fetchObjectFields<ManagerFields>(managerId, "testnet")) ?? {};
  const tableId = f.positions?.fields?.id?.id ?? null;
  const size = Number(f.positions?.fields?.size ?? 0);
  return { owner: f.owner ?? "", tableId, size };
}

type DynamicFieldRow = {
  name?: { value?: Record<string, unknown> };
  objectId?: string;
};

/** Read all positions for one manager. */
export async function readManagerPositions(manager: Manager): Promise<Position[]> {
  const { owner, tableId, size } = await readManagerPositionsTable(
    manager.managerId,
  );
  if (!tableId || size === 0) return [];

  // 1. List dynamic fields (50 max per page; positions tables rarely exceed this).
  let fields: DynamicFieldRow[] = [];
  try {
    const res = (await rpc(
      "suix_getDynamicFields",
      [tableId, null, 50],
      TESTNET_RPC,
      30,
    )) as { data?: DynamicFieldRow[] };
    fields = res?.data ?? [];
  } catch {
    return [];
  }

  // 2. For each field, fetch the value (u64 quantity). Parallel.
  const fieldIds = fields
    .map((f) => f.objectId)
    .filter((x): x is string => !!x);
  const fieldObjs = await Promise.all(
    fieldIds.map((id) => fetchObjectFields<{ value?: string }>(id, "testnet")),
  );

  return fields
    .map((f, i) => {
      const v = f.name?.value as
        | {
            oracle_id?: string;
            expiry?: string | number;
            strike?: string | number;
            direction?: string | number;
          }
        | undefined;
      if (!v?.oracle_id) return null;
      const quantity = Number(fieldObjs[i]?.value ?? 0);
      if (quantity === 0) return null;
      return {
        managerId: manager.managerId,
        owner: owner || manager.owner,
        oracleId: v.oracle_id,
        expiryMs: Number(v.expiry ?? 0),
        strike: Number(v.strike ?? 0),
        isUp: Number(v.direction ?? 0) === 0,
        quantity,
      };
    })
    .filter((p): p is Position => p !== null);
}

// ── Bot K-redeem: history (PositionRedeemed event scan) ────────────────────────

/** One row of the predict::PositionRedeemed event stream. */
export type RedemptionEvent = {
  txDigest: string;
  timestampMs: number;
  managerId: string;
  owner: string;
  executor: string;
  oracleId: string;
  expiryMs: number;
  strike: number; // 1e9-scaled
  isUp: boolean;
  quantity: number; // DUSDC atomic, 6 decimals
  payout: number; // DUSDC atomic, 6 decimals
  isSelfRedeem: boolean;
  latencyMs: number;
};

/** Scan recent permissionless / owner redemptions across all Predict markets. */
export async function fetchRedemptionHistory(
  limit = 30,
): Promise<RedemptionEvent[]> {
  const eventType = `${PREDICT_PKG}::predict::PositionRedeemed`;
  try {
    const res = (await rpc(
      "suix_queryEvents",
      [{ MoveEventType: eventType }, null, limit, true],
      TESTNET_RPC,
      30,
    )) as { data?: SuiEvent[] };
    const events = res?.data ?? [];
    return events
      .map((e) => parseRedemption(e))
      .filter((e): e is RedemptionEvent => e !== null);
  } catch {
    return [];
  }
}

function parseRedemption(e: SuiEvent): RedemptionEvent | null {
  const pj = e.parsedJson ?? {};
  const owner = String(pj.owner ?? "");
  const executor = String(pj.executor ?? "");
  if (!owner || !executor) return null;
  const expiryMs = Number(pj.expiry ?? 0);
  const timestampMs = Number(e.timestampMs ?? 0);
  return {
    txDigest: e.id?.txDigest ?? "",
    timestampMs,
    managerId: String(pj.manager_id ?? ""),
    owner,
    executor,
    oracleId: String(pj.oracle_id ?? ""),
    expiryMs,
    strike: Number(pj.strike ?? 0),
    isUp: Boolean(pj.is_up),
    quantity: Number(pj.quantity ?? 0),
    payout: Number(pj.payout ?? 0),
    isSelfRedeem: owner.toLowerCase() === executor.toLowerCase(),
    latencyMs: Math.max(0, timestampMs - expiryMs),
  };
}

// In-memory cache (shared per Vercel function instance). Position data is
// expensive (N + M*K RPC calls) but doesn't change between mints — 3 min TTL
// keeps the dashboard live without re-scanning on every render.
type PositionsCacheEntry = { ts: number; data: Position[] };
const positionsCache = new Map<number, PositionsCacheEntry>();
const POSITIONS_TTL_MS = 3 * 60 * 1000;

/** Scan + parallel-read all open positions across the N most-recent managers.
 *  Memoized per `limit` for [`POSITIONS_TTL_MS`] across requests. */
export async function fetchAllOpenPositions(limit: number): Promise<Position[]> {
  const cached = positionsCache.get(limit);
  if (cached && Date.now() - cached.ts < POSITIONS_TTL_MS) return cached.data;
  const managers = await fetchManagers(limit);
  const lists = await Promise.all(managers.map((m) => readManagerPositions(m)));
  const data = lists.flat();
  positionsCache.set(limit, { ts: Date.now(), data });
  return data;
}

/** Full Bot K-redeem candidate pipeline. Capped at `managerLimit` newest managers. */
export async function fetchRedemptionCandidates(
  oracles: OracleEntry[],
  managerLimit = 15,
): Promise<{
  managersScanned: number;
  openPositions: number;
  candidates: RedemptionCandidate[];
}> {
  // Build settled-oracle index for fast lookup.
  type SettledEntry = { price: number; settledAt: number | null };
  const settledIndex = new Map<string, SettledEntry>();
  for (const o of oracles) {
    if (o.status === "settled" && o.settlement_price !== null) {
      settledIndex.set(o.oracle_id, {
        price: scale1e9(o.settlement_price),
        settledAt: o.settled_at,
      });
    }
  }

  const managers = await fetchManagers(managerLimit);
  // Read positions for all managers in parallel — bounded by managerLimit.
  const positionsByManager = await Promise.all(
    managers.map((m) => readManagerPositions(m)),
  );
  const allPositions = positionsByManager.flat();

  const candidates: RedemptionCandidate[] = [];
  for (const p of allPositions) {
    const settled = settledIndex.get(p.oracleId);
    if (!settled) continue;
    const strikeReal = p.strike / 1_000_000_000;
    const wins = p.isUp ? settled.price > strikeReal : settled.price <= strikeReal;
    candidates.push({
      position: p,
      settlementPrice: settled.price,
      wins,
      settledAtMs: settled.settledAt,
    });
  }

  return {
    managersScanned: managers.length,
    openPositions: allPositions.length,
    candidates,
  };
}
