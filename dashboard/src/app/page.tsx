import Link from "next/link";
import { Aurora } from "@/components/aurora";
import { FadeStack, FadeItem } from "@/components/fade-in";
import { WalletButton } from "@/components/wallet-button";
import { NumberTicker } from "@/components/number-ticker";
import { PulseDot } from "@/components/pulse-dot";
import {
  compactAtomic,
  compactDuration,
  formatDusdc,
  relTime,
  shortDateTime,
  shortId,
  shortType,
} from "@/lib/format";
import {
  QUOTE_SYMBOL,
  STATUS_LABEL_LONG,
  STATUS_LABEL_SHORT,
  isO88Keeper,
} from "@/lib/labels";
import {
  DEEPBOOK_PKG,
  MARGIN_PKG,
  fetchEvents,
  fetchObjectsMulti,
  fetchPredictOracles,
  fetchRedemptionCandidates,
  fetchRedemptionHistory,
  marketStatus,
  parseMarket,
  type Market,
  type RedemptionCandidate,
  type RedemptionEvent,
  type SuiEvent,
} from "@/lib/sui-data";

// Edge-cached page; re-render every 30s for fresh countdowns.
export const revalidate = 30;

export default async function Home() {
  const [oracles, liqs, flashes] = await Promise.all([
    fetchPredictOracles(),
    fetchEvents(`${MARGIN_PKG}::margin_manager::LiquidationEvent`, 20),
    fetchEvents(`${DEEPBOOK_PKG}::vault::FlashLoanBorrowed`, 20),
  ]);
  const now = Date.now();

  // Bot K-redeem candidate scan. Capped at 15 managers to stay inside the edge
  // timeout. Runs after `oracles` so we can use the settled set as the join key.
  const kRedeem = await fetchRedemptionCandidates(oracles, 15);

  // Bot K-redeem history — what's already been redeemed, by whom, how late.
  // Much more useful than the candidates queue (which is usually empty).
  const redemptionHistory = await fetchRedemptionHistory(30);

  // Catalog buckets — `pending` is post-expiry but not yet settled per catalog server.
  const activeIds = oracles
    .filter((o) => o.status === "active")
    .sort((a, b) => a.expiry - b.expiry)
    .map((o) => o.oracle_id);
  const recentSettled = oracles
    .filter((o) => o.status === "settled" && o.settled_at)
    .sort((a, b) => (b.settled_at ?? 0) - (a.settled_at ?? 0))
    .slice(0, 6);
  const settledToday = oracles.filter(
    (o) =>
      o.status === "settled" &&
      o.settled_at !== null &&
      o.settled_at !== undefined &&
      now - o.settled_at <= 24 * 3600 * 1000,
  ).length;

  // Pull on-chain state for every active oracle in one RPC call.
  const rawFields = await fetchObjectsMulti(activeIds, "testnet");
  const markets: Market[] = activeIds
    .map((id, i) => parseMarket(id, rawFields[i]))
    .filter((m): m is Market => m !== null);

  // Derive on-chain-status buckets.
  const activeMarkets = markets.filter(
    (m) => marketStatus(m, now) === "active",
  );
  const pendingMarkets = markets.filter(
    (m) => marketStatus(m, now) === "pending_settlement",
  );
  const nextExpiry = activeMarkets[0]?.expiryMs ?? 0;
  const oldestPendingAge = pendingMarkets.length
    ? now - Math.min(...pendingMarkets.map((m) => m.expiryMs))
    : 0;
  const liveMark = markets.find((m) => m.spot > 0)?.spot ?? 0;

  // Featured oracle for the BS panel: pick the freshest active BTC oracle.
  const featured =
    activeMarkets.find((m) => m.timestampMs > 0) ?? markets[0] ?? null;

  return (
    <>
      <Aurora />
      <main className="relative flex-1 flex flex-col text-zinc-200">
        <Header lastUpdateMs={now} />

        {/* Keeper-focused stat row */}
        <section className="px-6 md:px-8 pt-6 pb-4">
          <FadeStack className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <FadeItem>
              <Stat
                label="active markets"
                value={activeMarkets.length}
                sub="testnet · BTC"
                tone="emerald"
              />
            </FadeItem>
            <FadeItem>
              <Stat
                label="pending settlement"
                value={pendingMarkets.length}
                sub={
                  pendingMarkets.length
                    ? `oldest ${compactDuration(oldestPendingAge)}`
                    : "none waiting"
                }
                tone={pendingMarkets.length ? "amber" : "zinc"}
              />
            </FadeItem>
            <FadeItem>
              <NextExpiryCard nextExpiryMs={nextExpiry} now={now} />
            </FadeItem>
            <FadeItem>
              <Stat
                label="live BTC mark"
                value={liveMark}
                prefix="$"
                sub="from freshest oracle"
                tone="emerald"
              />
            </FadeItem>
            <FadeItem>
              <Stat
                label="K-redeem candidates"
                value={kRedeem.candidates.filter((c) => c.wins).length}
                sub={`${kRedeem.openPositions} positions · ${kRedeem.managersScanned} mgrs scanned`}
                tone={
                  kRedeem.candidates.filter((c) => c.wins).length > 0
                    ? "emerald"
                    : "zinc"
                }
              />
            </FadeItem>
            <FadeItem>
              <Stat
                label="mainnet liqs · 24h"
                value={countSince(liqs, 24 * 3600 * 1000)}
                sub={`${liqs.length} fetched · market monitoring`}
                tone="zinc"
              />
            </FadeItem>
          </FadeStack>
        </section>

        {/* Settlement queue — the centerpiece */}
        <section className="px-6 md:px-8 pb-4">
          <Panel
            title="settlement queue · live"
            note={
              <>
                {pendingMarkets.length} pending · {activeMarkets.length} active
                ·{" "}
                <Link
                  href="/predict"
                  className="text-emerald-300 hover:text-emerald-200 underline underline-offset-2"
                >
                  browse all →
                </Link>
              </>
            }
          >
            <Table cols={["asset", "expiry", "status", "spot", "forward", "last push", "caps", ""]}>
              {/* Pending first — they're the actionable items */}
              {pendingMarkets.map((m) => (
                <MarketRow key={m.oracleId} m={m} now={now} />
              ))}
              {activeMarkets.slice(0, 12).map((m) => (
                <MarketRow key={m.oracleId} m={m} now={now} />
              ))}
              {markets.length === 0 && (
                <EmptyRow cols={7} note="no live markets · rpc miss?" />
              )}
            </Table>
          </Panel>
        </section>

        {/* Bot K-redeem · history + pending queue */}
        <section className="px-6 md:px-8 pb-4">
          <KRedeemPanel
            history={redemptionHistory}
            kRedeem={kRedeem}
            now={now}
          />
        </section>

        {/* Block Scholes data panel + Recently settled */}
        <section className="px-6 md:px-8 pb-4 grid lg:grid-cols-[1.2fr_1fr] gap-3">
          <Panel
            title="block scholes · SVI surface"
            note={
              featured
                ? `${featured.underlying} · exp ${shortDateTime(featured.expiryMs)}`
                : "—"
            }
          >
            {featured ? (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm tabular-nums">
                <SviCell label="a" value={featured.svi.a} decimals={6} />
                <SviCell label="b" value={featured.svi.b} decimals={6} />
                <SviCell label="ρ" value={featured.svi.rho} decimals={6} />
                <SviCell label="m" value={featured.svi.m} decimals={6} />
                <SviCell label="σ" value={featured.svi.sigma} decimals={6} />
                <SviCell label="spot" value={featured.spot} prefix="$" />
                <SviCell label="forward" value={featured.forward} prefix="$" />
                <SviCell
                  label="caps"
                  value={featured.authorizedCapCount}
                />
                <SviCell
                  label="last push"
                  textValue={
                    featured.timestampMs
                      ? compactDuration(now - featured.timestampMs) + " ago"
                      : "—"
                  }
                />
                <SviCell
                  label="oracle id"
                  textValue={shortId(featured.oracleId)}
                  mono
                />
              </div>
            ) : (
              <p className="text-xs text-zinc-600 italic py-3 text-center">
                no oracle data
              </p>
            )}
          </Panel>

          <Panel
            title="recently settled"
            note={`${recentSettled.length} markets`}
          >
            <Table cols={["asset", "settled", "price", "expiry"]}>
              {recentSettled.map((o) => (
                <tr key={o.oracle_id} className="border-t border-zinc-900">
                  <td className="py-1.5 pr-3 text-zinc-300">
                    {o.underlying_asset}
                  </td>
                  <td className="py-1.5 pr-3 text-zinc-400">
                    {o.settled_at
                      ? compactDuration(now - o.settled_at) + " ago"
                      : "—"}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums text-emerald-300">
                    {o.settlement_price
                      ? "$" +
                        Math.round(o.settlement_price / 1e9).toLocaleString()
                      : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-zinc-500 text-[11px]">
                    {shortDateTime(o.expiry)}
                  </td>
                </tr>
              ))}
              {recentSettled.length === 0 && (
                <EmptyRow cols={4} note="none yet" />
              )}
            </Table>
          </Panel>
        </section>

        {/* Mainnet margin liquidations + flash loans */}
        <section className="px-6 md:px-8 pb-4 grid lg:grid-cols-2 gap-3">
          <Panel
            title="margin · recent liquidations"
            note={`${liqs.length} events · mainnet · monitoring only`}
          >
            <Table cols={["when", "size", "by"]}>
              {liqs.slice(0, 8).map((e) => {
                const amt = String(e.parsedJson?.liquidation_amount ?? "0");
                return (
                  <tr
                    key={e.id.txDigest + e.id.eventSeq}
                    className="border-t border-zinc-900"
                  >
                    <td className="py-1.5 pr-3 text-zinc-300">
                      {ago(e.timestampMs, now)}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-zinc-400">
                      {compactAtomic(amt)}
                    </td>
                    <td className="py-1.5 pr-3 text-zinc-500 font-mono text-[11px]">
                      {shortId(e.sender)}
                    </td>
                  </tr>
                );
              })}
              {liqs.length === 0 && <EmptyRow cols={3} note="rpc miss" />}
            </Table>
          </Panel>

          <Panel
            title="spot · recent flash loans"
            note={`${flashes.length} events · competitor signal`}
          >
            <Table cols={["when", "borrowed", "type", "by"]}>
              {flashes.slice(0, 8).map((e) => {
                const pj = e.parsedJson ?? {};
                return (
                  <tr
                    key={e.id.txDigest + e.id.eventSeq}
                    className="border-t border-zinc-900"
                  >
                    <td className="py-1.5 pr-3 text-zinc-300">
                      {ago(e.timestampMs, now)}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-zinc-400">
                      {compactAtomic(String(pj.borrow_quantity ?? "0"))}
                    </td>
                    <td className="py-1.5 pr-3 text-zinc-500 font-mono text-[11px]">
                      {shortType(pj.type_name)}
                    </td>
                    <td className="py-1.5 pr-3 text-zinc-500 font-mono text-[11px]">
                      {shortId(e.sender)}
                    </td>
                  </tr>
                );
              })}
              {flashes.length === 0 && <EmptyRow cols={4} note="rpc miss" />}
            </Table>
          </Panel>
        </section>

        <section className="px-6 md:px-8 pb-10">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">
            bot status · k-first priority
          </div>
          <div className="flex flex-wrap gap-2">
            <BotPill code="K-watch" name="settlement observability" status="LIVE" />
            <BotPill code="K-redeem" name="permissionless settled redeemer" status="LIVE" />
            <BotPill code="wallet redeem" name="browser-signed PTB demo path" status="LIVE" />
            <BotPill code="K-prod" name="prod-target settlement push" status="PLANNED" />
            <BotPill code="P" name="vol-aware operator" status="PLANNED" />
            <BotPill code="M" name="margin liquidator · entry point verified" status="BUILDING" />
            <BotPill code="S" name="spot flash arb · routes mapped" status="BUILDING" />
          </div>
        </section>

        <Footer />
      </main>
    </>
  );
}

// ── components ──────────────────────────────────────────────────────────────────

function Header({ lastUpdateMs }: { lastUpdateMs: number }) {
  const ts =
    new Date(lastUpdateMs).toISOString().replace("T", " ").slice(0, 19) +
    " UTC";
  return (
    <header className="border-b border-zinc-800/80 px-6 md:px-8 py-4 flex items-center justify-between backdrop-blur-sm">
      <div className="flex items-baseline gap-4">
        <h1 className="text-xl tracking-tight text-zinc-50">
          o88<span className="text-emerald-400">.gg</span>
          <span className="text-zinc-600">/dashboard</span>
        </h1>
        <div className="hidden sm:flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald-400/80">
          <PulseDot size={6} />
          live · public data
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
          last update<br />
          <span className="text-zinc-400">{ts}</span>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-zinc-800/80 px-6 md:px-8 py-4 text-[10px] uppercase tracking-widest text-zinc-600 flex justify-between backdrop-blur-sm">
      <span>o88 · bot K live · wallet redeem live · public read-only</span>
      <span>cache 30s · runtime vercel edge</span>
    </footer>
  );
}

function Stat({
  label,
  value,
  sub,
  prefix,
  suffix,
  decimals = 0,
  loading,
  tone = "zinc",
}: {
  label: string;
  value: number;
  sub?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  loading?: boolean;
  tone?: "zinc" | "emerald" | "amber";
}) {
  const dotTone = loading ? "amber" : tone === "amber" ? "amber" : "emerald";
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
        <PulseDot tone={dotTone} size={5} />
        {label}
      </div>
      <div
        className={
          "mt-1 text-xl tabular-nums " +
          valColor +
          (loading ? " text-zinc-700" : "")
        }
      >
        {loading ? (
          "—"
        ) : (
          <NumberTicker
            value={value}
            prefix={prefix}
            suffix={suffix}
            decimals={decimals}
          />
        )}
      </div>
      {sub && (
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-600">
          {sub}
        </div>
      )}
    </div>
  );
}

function NextExpiryCard({
  nextExpiryMs,
  now,
}: {
  nextExpiryMs: number;
  now: number;
}) {
  const delta = nextExpiryMs - now;
  const ready = nextExpiryMs > 0 && delta <= 0;
  const tone: "emerald" | "amber" | "zinc" = ready
    ? "amber"
    : delta > 0
      ? "emerald"
      : "zinc";
  return (
    <div className="relative border border-zinc-800 bg-zinc-950/40 backdrop-blur-sm px-3 py-2.5 overflow-hidden">
      <div className="absolute inset-0 scanline opacity-40 pointer-events-none" />
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
        <PulseDot tone={tone} size={5} />
        next expiry
      </div>
      <div
        className={
          "mt-1 text-xl tabular-nums " +
          (ready ? "text-amber-300" : "text-emerald-300")
        }
      >
        {nextExpiryMs > 0
          ? ready
            ? "READY"
            : compactDuration(delta)
          : "—"}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-600">
        {nextExpiryMs > 0 ? shortDateTime(nextExpiryMs) + " UTC" : "no active"}
      </div>
    </div>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-zinc-800 bg-zinc-950/40 backdrop-blur-sm">
      <div className="px-4 py-2.5 border-b border-zinc-800/80 flex items-baseline justify-between gap-3">
        <div className="text-[10px] uppercase tracking-widest text-zinc-400">
          {title}
        </div>
        {note && (
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 text-right">
            {note}
          </div>
        )}
      </div>
      <div className="p-3 overflow-x-auto">{children}</div>
    </div>
  );
}

function Table({
  cols,
  children,
}: {
  cols: string[];
  children: React.ReactNode;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-widest text-zinc-600">
          {cols.map((c) => (
            <th key={c} className="text-left pb-1.5 pr-3 font-normal">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function EmptyRow({ cols, note }: { cols: number; note: string }) {
  return (
    <tr>
      <td
        colSpan={cols}
        className="py-3 text-center text-[11px] text-zinc-600 italic"
      >
        {note}
      </td>
    </tr>
  );
}

function MarketRow({ m, now }: { m: Market; now: number }) {
  const status = marketStatus(m, now);
  const exp = relTime(m.expiryMs, now);
  const lastPush = m.timestampMs ? now - m.timestampMs : 0;
  const stale = lastPush > 60_000; // > 60s without an update
  const pillStyle =
    status === "active"
      ? "border-emerald-400/50 text-emerald-300"
      : status === "pending_settlement"
        ? "border-amber-400/50 text-amber-300"
        : status === "settled"
          ? "border-zinc-700 text-zinc-400"
          : "border-zinc-800 text-zinc-600";
  return (
    <tr className="border-t border-zinc-900 group hover:bg-zinc-900/40 transition-colors">
      <td className="py-1.5 pr-3 text-zinc-300">{m.underlying}</td>
      <td className="py-1.5 pr-3 text-zinc-400">
        <div className="text-zinc-300">{shortDateTime(m.expiryMs)}</div>
        <div className="text-[10px] text-zinc-600">{exp.text}</div>
      </td>
      <td className="py-1.5 pr-3">
        <span
          title={STATUS_LABEL_LONG[status]}
          className={
            "inline-flex items-center gap-1 px-1.5 py-0.5 border text-[10px] uppercase tracking-widest " +
            pillStyle
          }
        >
          {status === "pending_settlement" && (
            <PulseDot tone="amber" size={5} />
          )}
          {status === "active" && <PulseDot tone="emerald" size={5} />}
          {STATUS_LABEL_SHORT[status]}
        </span>
      </td>
      <td className="py-1.5 pr-3 tabular-nums text-zinc-200">
        ${Math.round(m.spot).toLocaleString()}
      </td>
      <td className="py-1.5 pr-3 tabular-nums text-zinc-500">
        ${Math.round(m.forward).toLocaleString()}
      </td>
      <td
        className={
          "py-1.5 pr-3 text-[11px] " +
          (stale ? "text-amber-400" : "text-zinc-500")
        }
      >
        {m.timestampMs ? compactDuration(lastPush) + " ago" : "—"}
      </td>
      <td className="py-1.5 pr-3 tabular-nums text-zinc-500 text-[11px]">
        {m.authorizedCapCount}
      </td>
      <td className="py-1.5 pr-3 text-[11px]">
        <Link
          href={`/predict/o/${m.oracleId}`}
          className="text-zinc-600 group-hover:text-emerald-300 transition-colors"
        >
          analyze →
        </Link>
      </td>
    </tr>
  );
}

function KRedeemPanel({
  history,
  kRedeem,
  now,
}: {
  history: RedemptionEvent[];
  kRedeem: {
    candidates: RedemptionCandidate[];
    managersScanned: number;
    openPositions: number;
  };
  now: number;
}) {
  // Stats on recent redemptions
  const total24h = history.filter(
    (r) => now - r.timestampMs <= 24 * 3600 * 1000,
  ).length;
  const o88Count = history.filter((r) => isO88Keeper(r.executor)).length;
  const selfCount = history.filter(
    (r) => r.isSelfRedeem && !isO88Keeper(r.executor),
  ).length;
  const otherKeeperCount = history.length - selfCount - o88Count;
  const keeperLatencies = history
    .filter((r) => !r.isSelfRedeem)
    .map((r) => r.latencyMs)
    .sort((a, b) => a - b);
  const medianKeeperLatency =
    keeperLatencies.length === 0
      ? null
      : keeperLatencies[Math.floor(keeperLatencies.length / 2)];
  const o88Latencies = history
    .filter((r) => isO88Keeper(r.executor))
    .map((r) => r.latencyMs)
    .sort((a, b) => a - b);
  const medianO88Latency =
    o88Latencies.length === 0
      ? null
      : o88Latencies[Math.floor(o88Latencies.length / 2)];

  const winningCandidates = kRedeem.candidates.filter((c) => c.wins).length;

  return (
    <Panel
      title="bot K-redeem · permissionless redemption activity"
      note={
        history.length === 0
          ? "no redemptions in scan window"
          : `${history.length} recent redemptions · ${total24h} in last 24h`
      }
    >
      {/* Pending candidate strip */}
      {winningCandidates > 0 ? (
        <div className="mb-3 border border-emerald-400/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
          <PulseDot tone="emerald" size={5} className="mr-2 align-middle" />
          {winningCandidates} winning position{winningCandidates === 1 ? "" : "s"} ready to redeem
          right now ·{" "}
          <span className="text-zinc-400">
            {kRedeem.managersScanned} managers scanned · {kRedeem.openPositions} open
          </span>
        </div>
      ) : (
        <div className="mb-3 text-[10px] uppercase tracking-widest text-zinc-600">
          queue empty · {kRedeem.managersScanned} managers scanned ·{" "}
          {kRedeem.openPositions} open positions
        </div>
      )}

      {/* History stats */}
      {history.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
          <Mini label="last 24h" value={`${total24h}`} />
          <Mini
            label="self-redeem"
            value={`${selfCount}`}
            sub={
              history.length > 0
                ? `${Math.round((selfCount / history.length) * 100)}%`
                : "—"
            }
            tone="zinc"
          />
          <Mini
            label="other keepers"
            value={`${otherKeeperCount}`}
            sub={
              history.length > 0
                ? `${Math.round((otherKeeperCount / history.length) * 100)}%`
                : "—"
            }
            tone="zinc"
          />
          <Mini
            label="o88 redeems"
            value={`${o88Count}`}
            sub={
              medianO88Latency !== null
                ? "median " + compactDuration(medianO88Latency)
                : "bot offline"
            }
            tone="emerald"
          />
          <Mini
            label="competitor latency"
            value={
              medianKeeperLatency !== null
                ? compactDuration(medianKeeperLatency)
                : "—"
            }
            sub={
              medianO88Latency !== null && medianKeeperLatency !== null
                ? medianO88Latency < medianKeeperLatency
                  ? "o88 faster ↓"
                  : "o88 slower ↑"
                : "median after expiry"
            }
          />
        </div>
      )}

      {history.length === 0 ? (
        <p className="text-xs text-zinc-600 italic py-3 text-center">
          no PositionRedeemed events yet
        </p>
      ) : (
        <Table
          cols={[
            "when",
            "side · strike",
            "payout",
            "owner",
            "executor",
            "latency",
          ]}
        >
          {history.slice(0, 12).map((r) => (
            <HistoryRow key={r.txDigest} r={r} now={now} />
          ))}
        </Table>
      )}
      <p className="text-[10px] uppercase tracking-widest text-zinc-600 mt-3 leading-relaxed">
        latency = time from market expiry → redemption tx. SELF means the position
        owner closed their own; KEEPER means someone else triggered{" "}
        <code className="text-emerald-300/80">redeem_permissionless</code> on their
        behalf.
      </p>
    </Panel>
  );
}

function HistoryRow({
  r,
  now,
}: {
  r: RedemptionEvent;
  now: number;
}) {
  const strikeUsd = r.strike / 1_000_000_000;
  const sideStyle = r.isUp ? "text-emerald-300" : "text-amber-300";
  const won = r.payout > 0;
  const isO88 = isO88Keeper(r.executor);
  const role = isO88
    ? {
        label: "o88",
        style: "border-emerald-300 text-emerald-200 bg-emerald-500/15",
      }
    : r.isSelfRedeem
      ? { label: "SELF", style: "border-zinc-700 text-zinc-400" }
      : { label: "KEEPER", style: "border-emerald-400/50 text-emerald-300" };
  return (
    <tr className="border-t border-zinc-900">
      <td className="py-1.5 pr-3 text-zinc-400 text-[11px]">
        {compactDuration(now - r.timestampMs)} ago
      </td>
      <td className="py-1.5 pr-3">
        <span className={sideStyle}>{r.isUp ? "UP" : "DOWN"}</span>{" "}
        <span className="text-zinc-500 tabular-nums">
          @ ${strikeUsd.toLocaleString()}
        </span>
      </td>
      <td className="py-1.5 pr-3 tabular-nums">
        {won ? (
          <span className="text-emerald-300">
            {formatDusdc(r.payout)} {QUOTE_SYMBOL}
          </span>
        ) : (
          <span className="text-zinc-600">zero</span>
        )}
      </td>
      <td className="py-1.5 pr-3 font-mono text-[11px] text-zinc-500">
        {shortId(r.owner)}
      </td>
      <td className="py-1.5 pr-3 font-mono text-[11px]">
        <span
          className={
            isO88
              ? "text-emerald-200"
              : r.isSelfRedeem
                ? "text-zinc-500"
                : "text-emerald-300/80"
          }
        >
          {shortId(r.executor)}
        </span>{" "}
        <span
          className={
            "ml-1 inline-flex items-center px-1.5 py-0.5 border text-[9px] uppercase tracking-widest " +
            role.style
          }
        >
          {role.label}
        </span>
      </td>
      <td className="py-1.5 pr-3 text-zinc-400 text-[11px] tabular-nums">
        {compactDuration(r.latencyMs)}
      </td>
    </tr>
  );
}

function Mini({
  label,
  value,
  sub,
  tone = "zinc",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "zinc" | "emerald";
}) {
  return (
    <div className="border border-zinc-800 bg-zinc-950/40 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div
        className={
          "mt-0.5 text-base tabular-nums " +
          (tone === "emerald" ? "text-emerald-300" : "text-zinc-100")
        }
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-0.5">
          {sub}
        </div>
      )}
    </div>
  );
}

function SviCell({
  label,
  value,
  textValue,
  prefix = "",
  decimals = 2,
  mono = false,
}: {
  label: string;
  value?: number;
  textValue?: string;
  prefix?: string;
  decimals?: number;
  mono?: boolean;
}) {
  const display =
    textValue !== undefined
      ? textValue
      : value !== undefined
        ? prefix +
          value.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : "—";
  return (
    <div className="border border-zinc-800 bg-zinc-950/40 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div
        className={
          "mt-0.5 text-zinc-200 truncate " +
          (mono ? "font-mono text-[11px]" : "tabular-nums")
        }
      >
        {display}
      </div>
    </div>
  );
}

function BotPill({
  code,
  name,
  status,
}: {
  code: string;
  name: string;
  status: "LIVE" | "BUILDING" | "PLANNED" | "DEFERRED";
}) {
  const styles: Record<
    typeof status,
    { border: string; text: string; tone: "emerald" | "amber" | "zinc" }
  > = {
    LIVE: {
      border: "border-emerald-400/60",
      text: "text-emerald-300",
      tone: "emerald",
    },
    BUILDING: {
      border: "border-amber-400/50",
      text: "text-amber-300",
      tone: "amber",
    },
    PLANNED: { border: "border-zinc-700", text: "text-zinc-400", tone: "zinc" },
    DEFERRED: {
      border: "border-zinc-800",
      text: "text-zinc-600",
      tone: "zinc",
    },
  };
  const s = styles[status];
  return (
    <div
      className={`flex items-center gap-2 border ${s.border} px-3 py-1.5 bg-zinc-950/40 backdrop-blur-sm`}
    >
      <span className={`text-sm font-bold ${s.text}`}>{code}</span>
      <span className="text-xs text-zinc-400">{name}</span>
      <span
        className={`text-[9px] uppercase tracking-widest ${s.text} flex items-center gap-1`}
      >
        {(status === "LIVE" || status === "BUILDING") && (
          <PulseDot tone={s.tone} size={5} />
        )}
        {status.toLowerCase()}
      </span>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────────

function countSince(events: SuiEvent[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return events.filter((e) => Number(e.timestampMs) >= cutoff).length;
}

function ago(timestampMs: string | number, now: number): string {
  const t = typeof timestampMs === "string" ? Number(timestampMs) : timestampMs;
  return compactDuration(now - t);
}
