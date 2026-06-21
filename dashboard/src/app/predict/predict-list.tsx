"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PulseDot } from "@/components/pulse-dot";
import { WalletButton } from "@/components/wallet-button";
import { cadenceOf, categorySlug } from "@/lib/category";
import { compactDuration, relTime, shortDateTime, shortId } from "@/lib/format";
import { STATUS_LABEL_LONG, STATUS_LABEL_SHORT } from "@/lib/labels";

export type RowStatus = "active" | "pending_settlement" | "settled" | "inactive";

export type Row = {
  oracleId: string;
  underlying: string;
  expiryMs: number;
  status: RowStatus;
  spot: number | null;
  forward: number | null;
  lastPushMs: number | null;
  settlementPrice: number | null;
  settledAtMs: number | null;
  minStrike: number;
  tickSize: number;
  authorizedCapCount: number | null;
};

type Filter = "all" | "active" | "pending_settlement" | "settled" | "inactive";
type SortKey = "expiry_asc" | "expiry_desc" | "recent";

const FILTERS: Array<{ key: Filter; label: string; countKey: keyof Counts }> = [
  { key: "active", label: "active", countKey: "active" },
  { key: "pending_settlement", label: "ready", countKey: "pending" },
  { key: "settled", label: "settled", countKey: "settled" },
  { key: "inactive", label: "inactive", countKey: "inactive" },
  { key: "all", label: "all", countKey: "all" },
];

export type Counts = {
  all: number;
  active: number;
  pending: number;
  settled: number;
  inactive: number;
};

const PAGE_SIZE = 50;

export function PredictList({
  rows,
  counts,
  renderedAtMs,
}: {
  rows: Row[];
  counts: Counts;
  renderedAtMs: number;
}) {
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("expiry_asc");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (filter !== "all") out = out.filter((r) => r.status === filter);
    if (q) {
      out = out.filter(
        (r) =>
          r.oracleId.toLowerCase().includes(q) ||
          r.underlying.toLowerCase().includes(q),
      );
    }
    const sorted = [...out];
    switch (sort) {
      case "expiry_asc":
        sorted.sort((a, b) => a.expiryMs - b.expiryMs);
        break;
      case "expiry_desc":
        sorted.sort((a, b) => b.expiryMs - a.expiryMs);
        break;
      case "recent":
        sorted.sort(
          (a, b) =>
            (b.settledAtMs ?? b.expiryMs) - (a.settledAtMs ?? a.expiryMs),
        );
        break;
    }
    return sorted;
  }, [rows, filter, query, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  function setFilterAndReset(f: Filter) {
    setFilter(f);
    setPage(1);
  }
  function setQueryAndReset(q: string) {
    setQuery(q);
    setPage(1);
  }
  function setSortAndReset(s: SortKey) {
    setSort(s);
    setPage(1);
  }

  return (
    <main className="relative flex-1 flex flex-col text-zinc-200">
      <header className="border-b border-zinc-800/80 px-6 md:px-8 py-4 flex items-center justify-between backdrop-blur-sm">
        <div className="flex items-baseline gap-4">
          <Link
            href="/"
            className="text-xl tracking-tight text-zinc-50 hover:text-zinc-300"
          >
            o88<span className="text-emerald-400">.gg</span>
            <span className="text-zinc-600">/dashboard</span>
          </Link>
          <span className="text-zinc-600 text-xs">→</span>
          <div className="text-zinc-300 text-sm uppercase tracking-widest">
            predict markets
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest text-zinc-500">
          <Link
            href="/glossary"
            className="hover:text-emerald-300 transition-colors"
          >
            glossary →
          </Link>
          <WalletButton />
          <div className="text-right">
            {counts.all.toLocaleString()} oracles ·{" "}
            <span className="text-emerald-300">
              {counts.active} active
            </span>
            {counts.pending > 0 && (
              <>
                {" · "}
                <span className="text-amber-300">{counts.pending} ready</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Category quick-links */}
      <CategoryNav rows={rows} />

      {/* Filter bar */}
      <section className="border-b border-zinc-800/80 px-6 md:px-8 py-4 flex flex-wrap items-center gap-3 backdrop-blur-sm">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const tone =
              f.key === "active"
                ? "emerald"
                : f.key === "pending_settlement"
                  ? "amber"
                  : "zinc";
            return (
              <button
                key={f.key}
                onClick={() => setFilterAndReset(f.key)}
                className={
                  "text-[10px] uppercase tracking-widest px-2.5 py-1 border transition-colors " +
                  (active
                    ? tone === "emerald"
                      ? "border-emerald-400/60 text-emerald-300 bg-emerald-500/10"
                      : tone === "amber"
                        ? "border-amber-400/60 text-amber-300 bg-amber-500/10"
                        : "border-zinc-500 text-zinc-200 bg-zinc-500/10"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300")
                }
              >
                {f.label}
                <span className="ml-1.5 text-zinc-600">
                  {counts[f.countKey].toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={query}
            onChange={(e) => setQueryAndReset(e.target.value)}
            placeholder="search oracle id or asset…"
            className="w-full bg-zinc-950/60 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 font-mono focus:outline-none focus:border-emerald-400/50"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => setSortAndReset(e.target.value as SortKey)}
          className="bg-zinc-950/60 border border-zinc-800 px-2 py-1.5 text-[10px] uppercase tracking-widest text-zinc-400 focus:outline-none focus:border-emerald-400/50"
        >
          <option value="expiry_asc">expiry ↑</option>
          <option value="expiry_desc">expiry ↓</option>
          <option value="recent">most recent</option>
        </select>
      </section>

      {/* Result count */}
      <div className="px-6 md:px-8 pt-4 text-[10px] uppercase tracking-widest text-zinc-600 flex items-center justify-between">
        <span>
          showing{" "}
          <span className="text-zinc-300">
            {filtered.length === 0
              ? 0
              : (page - 1) * PAGE_SIZE + 1}
            –{Math.min(page * PAGE_SIZE, filtered.length)}
          </span>{" "}
          of {filtered.length.toLocaleString()}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-0.5 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← prev
            </button>
            <span className="text-zinc-500">
              page {page}/{totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-0.5 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              next →
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <section className="px-6 md:px-8 py-3 pb-10">
        <div className="border border-zinc-800 bg-zinc-950/40 backdrop-blur-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-zinc-600 border-b border-zinc-800/80">
                <th className="text-left p-3 pr-3 font-normal">asset</th>
                <th className="text-left p-3 pr-3 font-normal">expiry</th>
                <th className="text-left p-3 pr-3 font-normal">status</th>
                <th className="text-left p-3 pr-3 font-normal">spot / settle</th>
                <th className="text-left p-3 pr-3 font-normal">forward</th>
                <th className="text-left p-3 pr-3 font-normal">last push</th>
                <th className="text-left p-3 pr-3 font-normal">caps</th>
                <th className="text-left p-3 pr-3 font-normal">oracle</th>
                <th className="text-left p-3 pr-3 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center py-8 text-zinc-600 italic"
                  >
                    no oracles match the current filter
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => (
                  <ListRow key={r.oracleId} r={r} now={renderedAtMs} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function CategoryNav({ rows }: { rows: Row[] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const slug = categorySlug(r.underlying, cadenceOf(r.expiryMs));
      m.set(slug, (m.get(slug) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  if (counts.length === 0) return null;
  return (
    <nav className="border-b border-zinc-800/80 px-6 md:px-8 py-3 flex flex-wrap items-center gap-1.5 backdrop-blur-sm">
      <span className="text-[10px] uppercase tracking-widest text-zinc-600 mr-2">
        cadence ·
      </span>
      {counts.map(([slug, count]) => (
        <Link
          key={slug}
          href={`/predict/${slug}`}
          className="text-[10px] uppercase tracking-widest px-2.5 py-1 border border-zinc-800 text-zinc-400 hover:border-emerald-400/50 hover:text-emerald-300 transition-colors"
        >
          {slug}
          <span className="ml-1.5 text-zinc-600">{count.toLocaleString()}</span>
        </Link>
      ))}
    </nav>
  );
}

function ListRow({ r, now }: { r: Row; now: number }) {
  const lastPush = r.lastPushMs ? now - r.lastPushMs : null;
  const stale = lastPush !== null && lastPush > 60_000;
  const pillStyle =
    r.status === "active"
      ? "border-emerald-400/50 text-emerald-300"
      : r.status === "pending_settlement"
        ? "border-amber-400/50 text-amber-300"
        : r.status === "settled"
          ? "border-zinc-700 text-zinc-400"
          : "border-zinc-800 text-zinc-600";
  return (
    <tr className="border-t border-zinc-900 group hover:bg-zinc-900/40 transition-colors">
      <td className="p-2.5 pr-3 text-zinc-300">{r.underlying}</td>
      <td className="p-2.5 pr-3 text-zinc-400">
        <div className="text-zinc-300">{shortDateTime(r.expiryMs)}</div>
        <div className="text-[10px] text-zinc-600">
          {relTime(r.expiryMs, now).text}
        </div>
      </td>
      <td className="p-2.5 pr-3">
        <span
          title={STATUS_LABEL_LONG[r.status]}
          className={
            "inline-flex items-center gap-1 px-1.5 py-0.5 border text-[10px] uppercase tracking-widest " +
            pillStyle
          }
        >
          {r.status === "active" && <PulseDot tone="emerald" size={5} />}
          {r.status === "pending_settlement" && (
            <PulseDot tone="amber" size={5} />
          )}
          {STATUS_LABEL_SHORT[r.status]}
        </span>
      </td>
      <td className="p-2.5 pr-3 tabular-nums text-zinc-200">
        {r.status === "settled" && r.settlementPrice !== null
          ? "$" + Math.round(r.settlementPrice).toLocaleString()
          : r.spot !== null
            ? "$" + Math.round(r.spot).toLocaleString()
            : "—"}
      </td>
      <td className="p-2.5 pr-3 tabular-nums text-zinc-500">
        {r.forward !== null ? "$" + Math.round(r.forward).toLocaleString() : "—"}
      </td>
      <td
        className={
          "p-2.5 pr-3 text-[11px] " +
          (stale ? "text-amber-400" : "text-zinc-500")
        }
      >
        {r.lastPushMs ? compactDuration(lastPush!) + " ago" : "—"}
      </td>
      <td className="p-2.5 pr-3 tabular-nums text-zinc-500 text-[11px]">
        {r.authorizedCapCount ?? "—"}
      </td>
      <td className="p-2.5 pr-3 font-mono text-[11px] text-zinc-500">
        {shortId(r.oracleId)}
      </td>
      <td className="p-2.5 pr-3 text-[11px]">
        <Link
          href={`/predict/o/${r.oracleId}`}
          className="text-zinc-600 group-hover:text-emerald-300 transition-colors"
        >
          analyze →
        </Link>
      </td>
    </tr>
  );
}
