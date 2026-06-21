import { Aurora } from "@/components/aurora";
import {
  fetchObjectsMulti,
  fetchPredictOracles,
  parseMarket,
  type Market,
  type OracleEntry,
} from "@/lib/sui-data";
import { PredictList, type Row } from "./predict-list";

export const revalidate = 60;

export default async function PredictIndexPage() {
  const oracles = await fetchPredictOracles();
  const now = Date.now();

  // Live state ONLY for active oracles (cheap), so the list shows fresh spot/forward
  // without fetching 4,000+ on-chain objects per render.
  const activeIds = oracles
    .filter((o) => o.status === "active")
    .map((o) => o.oracle_id);
  const rawFields = await fetchObjectsMulti(activeIds, "testnet");
  const liveByOracle = new Map<string, Market>();
  activeIds.forEach((id, i) => {
    const m = parseMarket(id, rawFields[i]);
    if (m) liveByOracle.set(id, m);
  });

  // Build a single flat row list the client component can filter on.
  const rows: Row[] = oracles.map((o) => buildRow(o, liveByOracle.get(o.oracle_id), now));
  // Counts pre-filter (so filter pills can show totals without re-walking).
  const counts = {
    all: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    pending: rows.filter((r) => r.status === "pending_settlement").length,
    settled: rows.filter((r) => r.status === "settled").length,
    inactive: rows.filter((r) => r.status === "inactive").length,
  };

  return (
    <>
      <Aurora />
      <PredictList rows={rows} counts={counts} renderedAtMs={now} />
    </>
  );
}

function buildRow(o: OracleEntry, live: Market | undefined, now: number): Row {
  // Derive status. For active/pending, prefer the live on-chain reading if we have it.
  let status: Row["status"];
  if (o.status === "settled") {
    status = "settled";
  } else if (live) {
    if (live.settlementPrice !== null) status = "settled";
    else if (now >= live.expiryMs) status = "pending_settlement";
    else if (live.active) status = "active";
    else status = "inactive";
  } else if (o.status === "active") {
    status = now >= o.expiry ? "pending_settlement" : "active";
  } else {
    status = "inactive";
  }

  return {
    oracleId: o.oracle_id,
    underlying: o.underlying_asset,
    expiryMs: o.expiry,
    status,
    spot: live?.spot ?? null,
    forward: live?.forward ?? null,
    lastPushMs: live?.timestampMs ?? null,
    settlementPrice:
      live?.settlementPrice ??
      (o.settlement_price !== null && o.settlement_price !== undefined
        ? o.settlement_price / 1e9
        : null),
    settledAtMs: o.settled_at ?? null,
    minStrike: o.min_strike,
    tickSize: o.tick_size,
    authorizedCapCount: live?.authorizedCapCount ?? null,
  };
}
