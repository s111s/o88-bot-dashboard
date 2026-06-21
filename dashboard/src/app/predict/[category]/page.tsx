import Link from "next/link";
import { notFound } from "next/navigation";
import { Aurora } from "@/components/aurora";
import { Countdown } from "@/components/countdown";
import { PulseDot } from "@/components/pulse-dot";
import {
  RedeemBatchButton,
  RedeemButton,
  type RedeemTarget,
} from "@/components/redeem-button";
import { WalletButton } from "@/components/wallet-button";
import {
  cadenceLabel,
  cadenceOf,
  categorySlug,
  parseCategorySlug,
  type Cadence,
} from "@/lib/category";
import { STATUS_LABEL_LONG, STATUS_LABEL_SHORT } from "@/lib/labels";
import {
  compactDuration,
  formatDusdc,
  shortDateTime,
  shortId,
} from "@/lib/format";
import { QUOTE_SYMBOL } from "@/lib/labels";
import {
  fetchAllOpenPositions,
  fetchObjectsMulti,
  fetchPredictOracles,
  fetchRedemptionCandidates,
  marketStatus,
  parseMarket,
  type Market,
  type OracleEntry,
  type RedemptionCandidate,
} from "@/lib/sui-data";

export const revalidate = 60;

type PageProps = { params: Promise<{ category: string }> };

export default async function CategoryPage({ params }: PageProps) {
  const { category } = await params;
  const parsed = parseCategorySlug(category);
  if (!parsed) notFound();

  const oracles = await fetchPredictOracles();
  const now = Date.now();

  // 1. Filter to the requested asset + cadence.
  const inCategory = oracles.filter(
    (o) =>
      o.underlying_asset.toUpperCase() === parsed.asset &&
      cadenceOf(o.expiry) === parsed.cadence,
  );

  // 2. Live state for active/pending in this category.
  const liveIds = inCategory
    .filter((o) => o.status === "active")
    .map((o) => o.oracle_id);
  const rawFields = await fetchObjectsMulti(liveIds, "testnet");
  const liveByOracle = new Map<string, Market>();
  liveIds.forEach((id, i) => {
    const m = parseMarket(id, rawFields[i]);
    if (m) liveByOracle.set(id, m);
  });

  // 3. Position distribution per oracle (best-effort: 15 most-recent managers).
  const distribution = await buildPositionDistribution();

  // 4. Settlement candidates already on this category's oracles.
  const candidates = await fetchRedemptionCandidates(oracles, 15);
  const candidatesInCategory = candidates.candidates.filter((c) =>
    inCategory.some((o) => o.oracle_id === c.position.oracleId),
  );

  const buckets = bucketByStatus(inCategory, liveByOracle, now);
  const totalReady = buckets.pending.length;

  // Aggregate position counts + quantity volume across every market in this
  // category. Driven by the same cached scan as the per-row distribution bars.
  const categoryOracleIds = new Set(inCategory.map((o) => o.oracle_id));
  let categoryUpCount = 0;
  let categoryDnCount = 0;
  let categoryUpQty = 0;
  let categoryDnQty = 0;
  const categoryOwners = new Set<string>();
  const marketsWithOI = new Set<string>();
  for (const [oid, d] of distribution) {
    if (!categoryOracleIds.has(oid)) continue;
    categoryUpCount += d.upCount;
    categoryDnCount += d.dnCount;
    categoryUpQty += d.upQty;
    categoryDnQty += d.dnQty;
    marketsWithOI.add(oid);
  }
  // owners require a fresh aggregation (Distribution flattens unique-owners per oracle)
  // — cheap O(positions) walk avoids needing another scan
  const allPositions = await fetchAllOpenPositions(100);
  for (const p of allPositions) {
    if (categoryOracleIds.has(p.oracleId)) categoryOwners.add(p.owner);
  }
  const totalPositions = categoryUpCount + categoryDnCount;
  const totalVolume = categoryUpQty + categoryDnQty;
  const upSharePct = totalVolume > 0 ? (categoryUpQty / totalVolume) * 100 : 0;

  return (
    <>
      <Aurora />
      <main className="relative flex-1 flex flex-col text-zinc-200">
        <Header asset={parsed.asset} cadence={parsed.cadence} />
        <CategoryNav active={category} oracles={oracles} />

        {/* Summary strip */}
        <section className="px-6 md:px-8 pt-6 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            label="active markets"
            value={buckets.active.length}
            tone="emerald"
            pulse
          />
          <Kpi
            label="ready to settle"
            value={buckets.pending.length}
            sub={buckets.pending.length > 0 ? "tap settle below" : "—"}
            tone={buckets.pending.length > 0 ? "amber" : "zinc"}
            pulse={buckets.pending.length > 0}
          />
          <Kpi
            label="settled · all-time"
            value={buckets.settled.length}
            sub={`${inCategory.length} total this cadence`}
          />
          <Kpi
            label="K-redeem candidates"
            value={candidatesInCategory.filter((c) => c.wins).length}
            sub={`${candidatesInCategory.length} settled positions`}
            tone={
              candidatesInCategory.filter((c) => c.wins).length > 0
                ? "emerald"
                : "zinc"
            }
          />
        </section>

        {/* Open interest totals strip */}
        <section className="px-6 md:px-8 pb-4">
          <OpenInterestStrip
            totalPositions={totalPositions}
            totalVolume={totalVolume}
            upQty={categoryUpQty}
            dnQty={categoryDnQty}
            upSharePct={upSharePct}
            owners={categoryOwners.size}
            marketsWithOI={marketsWithOI.size}
            totalMarkets={inCategory.length}
          />
        </section>

        {/* Batch keeper actions */}
        <section className="px-6 md:px-8 pb-4">
          <BatchRedeemBar
            readyCount={totalReady}
            candidates={candidatesInCategory}
          />
        </section>

        {/* Markets table */}
        <section className="px-6 md:px-8 pb-10">
          <div className="border border-zinc-800 bg-zinc-950/40 backdrop-blur-sm">
            <div className="px-4 py-2.5 border-b border-zinc-800/80 flex items-baseline justify-between">
              <div className="text-[10px] uppercase tracking-widest text-zinc-400">
                {parsed.asset} · {cadenceLabel(parsed.cadence)} markets
              </div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-600">
                {buckets.pending.length + buckets.active.length} live ·{" "}
                {buckets.settled.length} settled
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-zinc-600 border-b border-zinc-800/80">
                    <th className="text-left p-3 pr-3 font-normal">expiry</th>
                    <th className="text-left p-3 pr-3 font-normal">status / countdown</th>
                    <th className="text-left p-3 pr-3 font-normal">spot · settle price</th>
                    <th className="text-left p-3 pr-3 font-normal">UP / DN positions</th>
                    <th className="text-left p-3 pr-3 font-normal">open interest</th>
                    <th className="text-left p-3 pr-3 font-normal">oracle</th>
                    <th className="text-right p-3 pr-3 font-normal">action</th>
                  </tr>
                </thead>
                <tbody>
                  {[...buckets.pending, ...buckets.active, ...buckets.settled.slice(0, 50)].map(
                    (o) => (
                      <CategoryRow
                        key={o.oracle_id}
                        o={o}
                        live={liveByOracle.get(o.oracle_id)}
                        dist={distribution.get(o.oracle_id)}
                        now={now}
                      />
                    ),
                  )}
                  {inCategory.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center py-8 text-zinc-600 italic"
                      >
                        no {parsed.asset} {cadenceLabel(parsed.cadence)} markets in catalog
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <footer className="mt-auto border-t border-zinc-800/80 px-6 md:px-8 py-4 text-[10px] uppercase tracking-widest text-zinc-600">
          <Link href="/" className="hover:text-emerald-300">
            ← dashboard
          </Link>
          <span className="mx-3 text-zinc-700">·</span>
          <Link href="/predict" className="hover:text-emerald-300">
            all markets index
          </Link>
        </footer>
      </main>
    </>
  );
}

// ── data shaping ─────────────────────────────────────────────────────────────────

function bucketByStatus(
  oracles: OracleEntry[],
  live: Map<string, Market>,
  now: number,
): {
  active: OracleEntry[];
  pending: OracleEntry[];
  settled: OracleEntry[];
  inactive: OracleEntry[];
} {
  const out = {
    active: [] as OracleEntry[],
    pending: [] as OracleEntry[],
    settled: [] as OracleEntry[],
    inactive: [] as OracleEntry[],
  };
  for (const o of oracles) {
    if (o.status === "settled") {
      out.settled.push(o);
      continue;
    }
    const m = live.get(o.oracle_id);
    if (m) {
      const s = marketStatus(m, now);
      if (s === "active") out.active.push(o);
      else if (s === "pending_settlement") out.pending.push(o);
      else if (s === "settled") out.settled.push(o);
      else out.inactive.push(o);
    } else {
      if (o.expiry <= now) out.pending.push(o);
      else out.active.push(o);
    }
  }
  // Sort: pending → soonest expiry first; active → soonest first; settled → most recent first
  out.pending.sort((a, b) => a.expiry - b.expiry);
  out.active.sort((a, b) => a.expiry - b.expiry);
  out.settled.sort((a, b) => (b.settled_at ?? b.expiry) - (a.settled_at ?? a.expiry));
  return out;
}

type Distribution = {
  upCount: number;
  dnCount: number;
  upQty: number;
  dnQty: number;
  uniqueOwners: number;
};

async function buildPositionDistribution(): Promise<Map<string, Distribution>> {
  // 100-manager deep scan, cached server-side for 3 minutes. Catches positions
  // held by repeat traders whose manager objects sit outside the freshest 25.
  const positions = await fetchAllOpenPositions(100);
  const acc = new Map<
    string,
    { up: number; dn: number; upQty: number; dnQty: number; owners: Set<string> }
  >();
  for (const p of positions) {
    let bucket = acc.get(p.oracleId);
    if (!bucket) {
      bucket = { up: 0, dn: 0, upQty: 0, dnQty: 0, owners: new Set() };
      acc.set(p.oracleId, bucket);
    }
    if (p.isUp) {
      bucket.up += 1;
      bucket.upQty += p.quantity;
    } else {
      bucket.dn += 1;
      bucket.dnQty += p.quantity;
    }
    bucket.owners.add(p.owner);
  }
  const out = new Map<string, Distribution>();
  for (const [oid, b] of acc) {
    out.set(oid, {
      upCount: b.up,
      dnCount: b.dn,
      upQty: b.upQty,
      dnQty: b.dnQty,
      uniqueOwners: b.owners.size,
    });
  }
  return out;
}

// ── components ───────────────────────────────────────────────────────────────────

function Header({ asset, cadence }: { asset: string; cadence: Cadence }) {
  return (
    <header className="border-b border-zinc-800/80 px-6 md:px-8 py-4 flex items-center justify-between backdrop-blur-sm">
      <div className="flex items-baseline gap-3">
        <Link
          href="/"
          className="text-xl tracking-tight text-zinc-50 hover:text-zinc-300"
        >
          o88<span className="text-emerald-400">.gg</span>
          <span className="text-zinc-600">/dashboard</span>
        </Link>
        <span className="text-zinc-600 text-xs">→</span>
        <Link
          href="/predict"
          className="text-zinc-400 text-sm uppercase tracking-widest hover:text-zinc-200"
        >
          predict
        </Link>
        <span className="text-zinc-600 text-xs">→</span>
        <div className="text-zinc-100 text-sm uppercase tracking-widest">
          {asset}{" "}
          <span className="text-emerald-300">{cadenceLabel(cadence)}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Link
          href="/glossary"
          className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-emerald-300 transition-colors"
        >
          glossary →
        </Link>
        <WalletButton />
      </div>
    </header>
  );
}

function CategoryNav({
  active,
  oracles,
}: {
  active: string;
  oracles: OracleEntry[];
}) {
  // Build the set of categories that actually have markets in the catalog.
  const present = new Map<string, number>();
  for (const o of oracles) {
    const slug = categorySlug(o.underlying_asset, cadenceOf(o.expiry));
    present.set(slug, (present.get(slug) ?? 0) + 1);
  }
  const sorted = [...present.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <nav className="border-b border-zinc-800/80 px-6 md:px-8 py-3 flex flex-wrap gap-1.5 backdrop-blur-sm">
      {sorted.map(([slug, count]) => (
        <Link
          key={slug}
          href={`/predict/${slug}`}
          className={
            "text-[10px] uppercase tracking-widest px-2.5 py-1 border transition-colors " +
            (slug === active
              ? "border-emerald-400/60 text-emerald-300 bg-emerald-500/10"
              : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300")
          }
        >
          {slug}
          <span className="ml-1.5 text-zinc-600">{count.toLocaleString()}</span>
        </Link>
      ))}
    </nav>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone = "zinc",
  pulse,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "zinc" | "emerald" | "amber";
  pulse?: boolean;
}) {
  const valColor =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-300"
        : "text-zinc-100";
  return (
    <div className="relative border border-zinc-800 bg-zinc-950/40 backdrop-blur-sm px-3 py-2.5 overflow-hidden">
      <div className="absolute inset-0 scanline opacity-40 pointer-events-none" />
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
        {pulse && (
          <PulseDot tone={tone === "amber" ? "amber" : "emerald"} size={5} />
        )}
        {label}
      </div>
      <div className={"mt-1 text-2xl tabular-nums " + valColor}>{value}</div>
      {sub && (
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-600">
          {sub}
        </div>
      )}
    </div>
  );
}

function OpenInterestStrip({
  totalPositions,
  totalVolume,
  upQty,
  dnQty,
  upSharePct,
  owners,
  marketsWithOI,
  totalMarkets,
}: {
  totalPositions: number;
  totalVolume: number;
  upQty: number;
  dnQty: number;
  upSharePct: number;
  owners: number;
  marketsWithOI: number;
  totalMarkets: number;
}) {
  if (totalPositions === 0) {
    return (
      <div className="border border-zinc-800 bg-zinc-950/40 backdrop-blur-sm px-4 py-3 text-[11px] text-zinc-500 italic">
        no open positions across any market in this cadence (scanned 100
        managers · cached 3min)
      </div>
    );
  }
  return (
    <div className="border border-emerald-400/30 bg-emerald-500/[0.03] backdrop-blur-sm p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <div className="text-[10px] uppercase tracking-widest text-zinc-400">
          open interest · cadence total
        </div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-600">
          {marketsWithOI} of {totalMarkets} markets populated · {owners} unique
          owners
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            total positions
          </div>
          <div className="mt-0.5 text-2xl tabular-nums text-zinc-100">
            {totalPositions.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            total open interest
          </div>
          <div className="mt-0.5 text-2xl tabular-nums text-zinc-100">
            {formatDusdc(totalVolume)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-0.5">
            max payout in {QUOTE_SYMBOL}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald-300">
            UP exposure
          </div>
          <div className="mt-0.5 text-2xl tabular-nums text-emerald-200">
            {formatDusdc(upQty)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-0.5">
            {upSharePct.toFixed(1)}% share
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber-300">
            DOWN exposure
          </div>
          <div className="mt-0.5 text-2xl tabular-nums text-amber-200">
            {formatDusdc(dnQty)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-0.5">
            {(100 - upSharePct).toFixed(1)}% share
          </div>
        </div>
      </div>
      <div className="mt-3 h-2 bg-zinc-900 border border-zinc-800 overflow-hidden flex">
        <div
          className="h-full bg-emerald-400"
          style={{ width: `${upSharePct}%` }}
        />
        <div
          className="h-full bg-amber-400"
          style={{ width: `${100 - upSharePct}%` }}
        />
      </div>
    </div>
  );
}

function BatchRedeemBar({
  readyCount,
  candidates,
}: {
  readyCount: number;
  candidates: RedemptionCandidate[];
}) {
  const settledCandidates = candidates.length;
  if (readyCount === 0 && settledCandidates === 0) return null;

  // Group candidates by oracle — each `redeem_permissionless` PTB needs &mut on
  // a single oracle, so we render one RedeemBatchButton per oracle.
  const byOracle = new Map<string, RedeemTarget[]>();
  for (const c of candidates) {
    const arr = byOracle.get(c.position.oracleId) ?? [];
    arr.push({
      managerId: c.position.managerId,
      oracleId: c.position.oracleId,
      expiryMs: c.position.expiryMs,
      strike: c.position.strike,
      isUp: c.position.isUp,
      quantity: c.position.quantity,
    });
    byOracle.set(c.position.oracleId, arr);
  }

  return (
    <div className="grid lg:grid-cols-2 gap-3">
      {readyCount > 0 && (
        <div className="border border-amber-400/40 bg-amber-500/5 backdrop-blur-sm p-4">
          <div className="text-amber-300 text-sm font-medium">
            {readyCount} market{readyCount === 1 ? "" : "s"} waiting on a
            BS-operator price push
          </div>
          <div className="text-xs text-zinc-400 mt-1 leading-6">
            These markets have hit their expiry but are still cap-gated for
            settlement. Block Scholes operators push the final price; we can&apos;t
            do this step today. Once they do, the markets flip to{" "}
            <span className="text-emerald-300">SETTLED</span> and Bot K-redeem
            picks them up.
          </div>
        </div>
      )}
      {settledCandidates > 0 && (
        <div className="border border-emerald-400/40 bg-emerald-500/5 backdrop-blur-sm p-4">
          <div className="text-emerald-300 text-sm font-medium">
            {settledCandidates} settled position{settledCandidates === 1 ? "" : "s"}{" "}
            ready for redemption · {byOracle.size} market
            {byOracle.size === 1 ? "" : "s"}
          </div>
          <div className="text-xs text-zinc-400 mt-1 leading-6">
            Each button signs one{" "}
            <code className="text-emerald-300/80 bg-zinc-900/60 px-1 rounded">
              redeem_permissionless&lt;DUSDC&gt;
            </code>{" "}
            PTB scoped to a single oracle. Payouts go to the position owners; signer covers gas.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...byOracle.entries()].map(([oracleId, targets]) => (
              <RedeemBatchButton
                key={oracleId}
                marketStatus="settled"
                targets={targets}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryRow({
  o,
  live,
  dist,
  now,
}: {
  o: OracleEntry;
  live: Market | undefined;
  dist: Distribution | undefined;
  now: number;
}) {
  const status: "active" | "pending_settlement" | "settled" | "inactive" =
    live
      ? marketStatus(live, now)
      : o.status === "settled"
        ? "settled"
        : o.expiry <= now
          ? "pending_settlement"
          : "active";

  const settlePrice =
    live?.settlementPrice ??
    (o.settlement_price !== null && o.settlement_price !== undefined
      ? o.settlement_price / 1e9
      : null);

  const spotValue = live?.spot ?? null;

  const upQty = dist?.upQty ?? 0;
  const dnQty = dist?.dnQty ?? 0;
  const totalQty = upQty + dnQty;
  const upPct = totalQty > 0 ? (upQty / totalQty) * 100 : 0;

  return (
    <tr className="border-t border-zinc-900 group hover:bg-zinc-900/40 transition-colors">
      <td className="p-2.5 pr-3 text-zinc-300">
        <div>{shortDateTime(o.expiry)}</div>
        <div className="text-[10px] text-zinc-600">UTC</div>
      </td>
      <td className="p-2.5 pr-3">
        <StatusPill status={status} />
        <div className="mt-1 text-[11px] text-zinc-400">
          {status === "active" ? (
            <Countdown targetMs={o.expiry} prefix="ready " />
          ) : status === "pending_settlement" ? (
            <span className="text-amber-300">
              expired {compactDuration(now - o.expiry)} ago
            </span>
          ) : status === "settled" ? (
            <span className="text-zinc-500">
              settled{" "}
              {o.settled_at
                ? compactDuration(now - o.settled_at) + " ago"
                : "—"}
            </span>
          ) : (
            "—"
          )}
        </div>
      </td>
      <td className="p-2.5 pr-3 tabular-nums">
        {status === "settled" && settlePrice !== null ? (
          <span className="text-emerald-300">
            ${Math.round(settlePrice).toLocaleString()}
          </span>
        ) : spotValue !== null ? (
          <span className="text-zinc-200">
            ${Math.round(spotValue).toLocaleString()}
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="p-2.5 pr-3">
        {dist ? (
          <UpDnBar
            upCount={dist.upCount}
            dnCount={dist.dnCount}
            upPct={upPct}
            owners={dist.uniqueOwners}
          />
        ) : (
          <span className="text-zinc-600 text-[11px]">—</span>
        )}
      </td>
      <td className="p-2.5 pr-3 tabular-nums text-zinc-300">
        {totalQty > 0 ? (
          formatDusdc(totalQty)
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="p-2.5 pr-3 font-mono text-[11px] text-zinc-500">
        {shortId(o.oracle_id)}
      </td>
      <td className="p-2.5 pr-3 text-right text-[11px]">
        <Link
          href={`/predict/o/${o.oracle_id}`}
          className="text-zinc-600 group-hover:text-emerald-300 transition-colors mr-3"
        >
          analyze →
        </Link>
        {status === "settled" && (
          <Link
            href={`/predict/o/${o.oracle_id}`}
            className="text-[10px] uppercase tracking-widest px-2 py-0.5 border border-emerald-400/50 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors inline-flex items-center gap-1"
            title="open this market to redeem positions"
          >
            redeem →
          </Link>
        )}
        {status === "pending_settlement" && (
          <span
            title="Awaiting BS-operator price push to flip the market to SETTLED"
            className="text-[10px] uppercase tracking-widest text-amber-400/70"
          >
            waiting on operator
          </span>
        )}
      </td>
    </tr>
  );
}

function StatusPill({
  status,
}: {
  status: "active" | "pending_settlement" | "settled" | "inactive";
}) {
  const style =
    status === "active"
      ? "border-emerald-400/50 text-emerald-300"
      : status === "pending_settlement"
        ? "border-amber-400/50 text-amber-300"
        : status === "settled"
          ? "border-zinc-700 text-zinc-400"
          : "border-zinc-800 text-zinc-600";
  return (
    <span
      title={STATUS_LABEL_LONG[status]}
      className={
        "inline-flex items-center gap-1 px-1.5 py-0.5 border text-[10px] uppercase tracking-widest " +
        style
      }
    >
      {status === "active" && <PulseDot tone="emerald" size={5} />}
      {status === "pending_settlement" && <PulseDot tone="amber" size={5} />}
      {STATUS_LABEL_SHORT[status]}
    </span>
  );
}

function UpDnBar({
  upCount,
  dnCount,
  upPct,
  owners,
}: {
  upCount: number;
  dnCount: number;
  upPct: number;
  owners: number;
}) {
  return (
    <div className="min-w-[120px]">
      <div className="flex justify-between text-[10px] uppercase tracking-widest">
        <span className="text-emerald-300">UP {upCount}</span>
        <span className="text-amber-300">DN {dnCount}</span>
      </div>
      <div className="mt-1 h-1 bg-zinc-900 border border-zinc-800 overflow-hidden flex">
        <div
          className="h-full bg-emerald-400"
          style={{ width: `${upPct}%` }}
        />
        <div
          className="h-full bg-amber-400"
          style={{ width: `${100 - upPct}%` }}
        />
      </div>
      <div className="text-[10px] text-zinc-600 mt-0.5">{owners} owners</div>
    </div>
  );
}

