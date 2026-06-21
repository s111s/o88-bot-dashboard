import Link from "next/link";
import { Aurora } from "@/components/aurora";
import { Countdown } from "@/components/countdown";
import { PulseDot } from "@/components/pulse-dot";
import {
  RedeemBatchButton,
  RedeemButton,
  type RedeemTarget,
} from "@/components/redeem-button";
import { WalletButton } from "@/components/wallet-button";
import { cadenceOf, categorySlug } from "@/lib/category";
import {
  QUOTE_SYMBOL,
  STATUS_HINT,
  STATUS_LABEL_LONG,
  STATUS_TONE,
} from "@/lib/labels";
import {
  compactDuration,
  formatDusdc,
  relTime,
  shortDateTime,
  shortId,
  toDusdc,
} from "@/lib/format";
import {
  fetchAllOpenPositions,
  fetchObjectFields,
  marketStatus,
  parseMarket,
  type Market,
  type Position,
} from "@/lib/sui-data";
import {
  sviIv,
  strikeGrid,
  type SVI,
} from "@/lib/svi";

export const revalidate = 30;

type PageProps = { params: Promise<{ oracleId: string }> };

export default async function PredictDetailPage({ params }: PageProps) {
  const { oracleId } = await params;
  const fields = await fetchObjectFields<Record<string, unknown>>(
    oracleId,
    "testnet",
  );
  const m = parseMarket(oracleId, fields);
  const now = Date.now();

  if (!m) {
    return (
      <>
        <Aurora />
        <main className="relative flex-1 flex flex-col items-center justify-center text-zinc-200 px-8">
          <h1 className="text-2xl text-zinc-100 mb-2">oracle not found</h1>
          <p className="text-sm text-zinc-500 mb-6">
            <span className="font-mono">{shortId(oracleId)}</span> — either the
            id is wrong or the object is not a Predict OracleSVI on testnet.
          </p>
          <Link
            href="/"
            className="text-emerald-300 underline underline-offset-4 hover:text-emerald-200"
          >
            ← back to dashboard
          </Link>
        </main>
      </>
    );
  }

  const status = marketStatus(m, now);
  const tYears = Math.max(0, (m.expiryMs - now) / (365 * 24 * 3600 * 1000));
  const grid = strikeGrid(m.svi as SVI, m.forward, m.spot, { range: 6 });
  const atmIv = sviIv(m.svi as SVI, 0, tYears);
  const lastPushAgo = m.timestampMs ? now - m.timestampMs : 0;
  const stale = lastPushAgo > 60_000;

  // Pull positions held on THIS market. Cached server-side (3min TTL) so the
  // 100-manager scan only runs once per Vercel function instance per window.
  const allPositions = await fetchAllOpenPositions(100);
  const positionsHere = allPositions.filter((p) => p.oracleId === oracleId);
  const upPositions = positionsHere.filter((p) => p.isUp);
  const dnPositions = positionsHere.filter((p) => !p.isUp);
  const upQty = upPositions.reduce((s, p) => s + p.quantity, 0);
  const dnQty = dnPositions.reduce((s, p) => s + p.quantity, 0);
  const uniqueOwners = new Set(positionsHere.map((p) => p.owner)).size;
  const cadence = cadenceOf(m.expiryMs);
  const slug = categorySlug(m.underlying, cadence);

  return (
    <>
      <Aurora />
      <main className="relative flex-1 flex flex-col text-zinc-200">
        <DetailHeader m={m} now={now} />

        <section className="px-6 md:px-8 pt-6 pb-4 grid lg:grid-cols-4 gap-3">
          <KpiCard
            label="status"
            value={STATUS_LABEL_LONG[status]}
            tone={STATUS_TONE[status]}
            pulse={status === "active" || status === "pending_settlement"}
            sub={
              status === "active" || status === "pending_settlement" ? (
                <Countdown targetMs={m.expiryMs} prefix="expires in " />
              ) : status === "settled" ? (
                `settled @ $${Math.round(m.settlementPrice ?? 0).toLocaleString()}`
              ) : (
                STATUS_HINT[status]
              )
            }
          />
          <KpiCard
            label="spot"
            value={`$${Math.round(m.spot).toLocaleString()}`}
            tone="emerald"
            sub={
              m.timestampMs
                ? `pushed ${compactDuration(lastPushAgo)} ago`
                : "no push yet"
            }
          />
          <KpiCard
            label="forward"
            value={`$${Math.round(m.forward).toLocaleString()}`}
            sub={`Δ ${(((m.forward - m.spot) / m.spot) * 100).toFixed(3)}%`}
          />
          <KpiCard
            label="ATM IV · annual"
            value={`${(atmIv * 100).toFixed(1)}%`}
            sub={`T = ${(tYears * 365).toFixed(1)} days`}
            tone="emerald"
          />
        </section>

        {/* Strike grid — the bot's view */}
        <section className="px-6 md:px-8 pb-4">
          <Panel
            title="SVI fair value grid · live"
            note="UP/DN probabilities computed from Block Scholes on-chain SVI — identical to predict::trade_prices"
          >
            <Table
              cols={[
                "strike",
                "% from spot",
                "UP price",
                "DN price",
                "UP @1 USDC pays",
                "edge",
              ]}
            >
              {grid.map((r) => (
                <StrikeRow key={r.strike} row={r} forward={m.forward} />
              ))}
            </Table>
            <p className="text-[10px] text-zinc-600 mt-3 uppercase tracking-widest leading-relaxed">
              UP = probability spot {">"} strike at expiry · DN = probability
              spot ≤ strike · live parity: UP + DN = 1 · post-settlement: UP =
              1 if settle &gt; strike else 0
            </p>
          </Panel>
        </section>

        <section className="px-6 md:px-8 pb-4 grid lg:grid-cols-2 gap-3">
          <Panel title="SVI surface · raw params" note="from on-chain push">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Param label="a" value={m.svi.a.toExponential(3)} />
              <Param label="b" value={m.svi.b.toExponential(3)} />
              <Param label="ρ" value={m.svi.rho.toFixed(6)} />
              <Param label="m" value={m.svi.m.toFixed(6)} />
              <Param label="σ" value={m.svi.sigma.toFixed(6)} />
              <Param label="auth caps" value={String(m.authorizedCapCount)} />
            </div>
            <div className="mt-3 text-[11px] text-zinc-600 leading-relaxed font-mono">
              w(k) = a + b · (ρ·(k−m) + √((k−m)² + σ²))
              <br />
              d₂ = −((k + w/2) / √w) · UP = N(d₂)
            </div>
          </Panel>

          <Panel title="freshness" note="cap-holder push cadence">
            <div className="text-sm leading-7 text-zinc-300">
              <div>
                last push:{" "}
                <span
                  className={stale ? "text-amber-300" : "text-emerald-300"}
                >
                  {m.timestampMs
                    ? compactDuration(lastPushAgo) + " ago"
                    : "never"}
                </span>
                {stale && (
                  <span className="ml-2 text-[10px] uppercase tracking-widest text-amber-400 border border-amber-400/50 px-1.5 py-0.5">
                    STALE
                  </span>
                )}
              </div>
              <div>
                pushed at:{" "}
                <span className="font-mono text-xs text-zinc-400">
                  {m.timestampMs
                    ? shortDateTime(m.timestampMs) + " UTC"
                    : "—"}
                </span>
              </div>
              <div>
                expiry:{" "}
                <span className="font-mono text-xs text-zinc-400">
                  {shortDateTime(m.expiryMs)} UTC
                </span>
                {" · "}
                <span
                  className={
                    m.expiryMs > now ? "text-emerald-300" : "text-amber-300"
                  }
                >
                  {relTime(m.expiryMs, now).text}
                </span>
              </div>
              <div className="text-zinc-500 text-xs mt-2">
                authorized caps: {m.authorizedCapCount} BS operator(s) can push
                this oracle. Settlement is gated by the same caps —
                cap-permissioned today; Bot K-prod targets the refactored
                permissionless model.
              </div>
            </div>
          </Panel>
        </section>

        {/* Positions on this market + settle actions */}
        <section className="px-6 md:px-8 pb-4 grid lg:grid-cols-[1fr_1.4fr] gap-3">
          <Panel
            title="open interest · sampled"
            note={`${positionsHere.length} positions · ${uniqueOwners} owners · 100 mgrs scanned · cached 3min`}
          >
            {positionsHere.length === 0 ? (
              <p className="text-xs text-zinc-600 italic py-3 text-center">
                no open positions on this market in the scan window
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="border border-emerald-400/30 bg-emerald-500/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-widest text-emerald-300">
                      UP · {upPositions.length} pos
                    </div>
                    <div className="mt-0.5 text-xl tabular-nums text-emerald-200">
                      {formatDusdc(upQty)}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      max payout if UP wins
                    </div>
                  </div>
                  <div className="border border-amber-400/30 bg-amber-500/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-widest text-amber-300">
                      DOWN · {dnPositions.length} pos
                    </div>
                    <div className="mt-0.5 text-xl tabular-nums text-amber-200">
                      {formatDusdc(dnQty)}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      max payout if DOWN wins
                    </div>
                  </div>
                </div>
                <DistBar upQty={upQty} dnQty={dnQty} />
              </>
            )}
            <div className="mt-3 text-[10px] uppercase tracking-widest text-zinc-600 border-t border-zinc-800/80 pt-2">
              cadence · {cadence}{" "}
              <Link
                href={`/predict/${slug}`}
                className="text-emerald-300/80 hover:text-emerald-300"
              >
                browse {slug} →
              </Link>
            </div>
          </Panel>

          <Panel
            title="open positions"
            note={
              positionsHere.length === 0
                ? "none in scan window"
                : status === "settled"
                  ? `${positionsHere.length} redeemable now`
                  : `${positionsHere.length} held · redeem unlocks at settlement`
            }
          >
            {positionsHere.length === 0 ? (
              <p className="text-xs text-zinc-600 italic py-3 text-center">
                no open positions on this market in the scan window
              </p>
            ) : (
              <>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-zinc-600">
                      <th className="text-left pb-1.5 pr-3 font-normal">side</th>
                      <th className="text-left pb-1.5 pr-3 font-normal">strike</th>
                      <th className="text-left pb-1.5 pr-3 font-normal">
                        max payout
                      </th>
                      <th className="text-left pb-1.5 pr-3 font-normal">owner</th>
                      <th className="text-right pb-1.5 pr-3 font-normal">action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positionsHere.slice(0, 12).map((p) => (
                      <PositionRow
                        key={`${p.managerId}:${p.strike}:${p.isUp}`}
                        p={p}
                        status={status}
                        settledPrice={m.settlementPrice ?? 0}
                        expiryMs={m.expiryMs}
                        oracleId={m.oracleId}
                      />
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                    {status === "settled"
                      ? `${positionsHere.length} eligible · keeper pays gas, no on-chain reward`
                      : `redeem unlocks after market settles`}
                  </div>
                  <RedeemBatchButton
                    marketStatus={status}
                    targets={positionsHere.slice(0, 12).map((p) => ({
                      managerId: p.managerId,
                      oracleId: m.oracleId,
                      expiryMs: m.expiryMs,
                      strike: p.strike,
                      isUp: p.isUp,
                      quantity: p.quantity,
                    }))}
                  />
                </div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 mt-3 leading-relaxed">
                  position quantity = max payout in {QUOTE_SYMBOL} (6 decimals).
                  wins pay 1× quantity, loses pay 0. payout flows to manager
                  balance; owner withdraws separately.
                </p>
              </>
            )}
          </Panel>
        </section>

        {/* Bot P mint UI — not built yet */}
        <section className="px-6 md:px-8 pb-4">
          <div className="relative border border-zinc-800 bg-zinc-950/40 overflow-hidden">
            {/* frosted overlay */}
            <div className="absolute inset-0 bg-zinc-950/70 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-3">
              <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 border border-zinc-700 px-3 py-1">
                coming soon
              </span>
              <span className="text-xs text-zinc-600 text-center px-4">
                Bot P vol-aware operator — SVI pricing live, mint executor building
              </span>
            </div>
            {/* ghost content behind overlay */}
            <div className="px-4 py-2.5 border-b border-zinc-800/80 flex items-baseline justify-between gap-3 opacity-30">
              <div className="text-[10px] uppercase tracking-widest text-zinc-400">
                bot P · mint position
              </div>
              <div className="text-[10px] text-zinc-600">
                predict::mint&lt;DUSDC&gt;
              </div>
            </div>
            <div className="p-6 opacity-20">
              <div className="flex gap-3">
                <div className="flex-1 border border-zinc-700 bg-zinc-900 px-4 py-3 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">Mint UP</div>
                  <div className="text-zinc-300 text-sm">strike · qty · sign</div>
                </div>
                <div className="flex-1 border border-zinc-700 bg-zinc-900 px-4 py-3 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-amber-400 mb-1">Mint DOWN</div>
                  <div className="text-zinc-300 text-sm">strike · qty · sign</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 md:px-8 pb-10">
          <Link
            href="/"
            className="text-[11px] uppercase tracking-widest text-emerald-300 hover:text-emerald-200"
          >
            ← back to dashboard
          </Link>
        </section>
      </main>
    </>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────────────

function DetailHeader({ m, now }: { m: Market; now: number }) {
  return (
    <header className="border-b border-zinc-800/80 px-6 md:px-8 py-5 flex items-baseline justify-between backdrop-blur-sm">
      <div className="flex items-baseline gap-4">
        <Link
          href="/"
          className="text-xl tracking-tight text-zinc-50 hover:text-zinc-300"
        >
          o88<span className="text-emerald-400">.gg</span>
          <span className="text-zinc-600">/dashboard</span>
        </Link>
        <span className="text-zinc-600 text-xs">→</span>
        <div className="text-xl text-zinc-100 tracking-tight">
          <span className="text-emerald-400">{m.underlying}</span>{" "}
          <span className="text-zinc-500">·</span>{" "}
          <span className="text-zinc-300">
            {shortDateTime(m.expiryMs)} UTC
          </span>
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
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 text-right">
          oracle
          <br />
          <a
            href={`https://testnet.suivision.xyz/object/${m.oracleId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-zinc-400 hover:text-emerald-300"
          >
            {shortId(m.oracleId)} ↗
          </a>
        </div>
      </div>
    </header>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone = "zinc",
  pulse,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: "zinc" | "emerald" | "amber";
  pulse?: boolean;
}) {
  const color =
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
      <div className={"mt-1 text-xl tabular-nums " + color}>{value}</div>
      {sub && (
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-600">
          {sub}
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
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

function StrikeRow({
  row,
  forward,
}: {
  row: { strike: number; up: number; dn: number; pctFromSpot: number };
  forward: number;
}) {
  // "Edge" placeholder: distance of the UP price from a naive 50/50 reference.
  // This is a hook for Bot P — once we have an off-chain IV oracle (Deribit) to
  // compare against, we replace this with the real divergence vs the SVI mark.
  const edge = (row.up - 0.5) * 100;
  // Payoff per 1 USDC at risk if UP wins.
  const upPays = row.up > 0 ? 1 / row.up : 0;
  const isOTM = row.strike > forward;
  return (
    <tr className="border-t border-zinc-900">
      <td className="py-1.5 pr-3 tabular-nums text-zinc-200">
        ${row.strike.toLocaleString()}
      </td>
      <td
        className={
          "py-1.5 pr-3 tabular-nums " +
          (isOTM ? "text-amber-300" : "text-emerald-300")
        }
      >
        {row.pctFromSpot > 0 ? "+" : ""}
        {row.pctFromSpot.toFixed(2)}%
      </td>
      <td className="py-1.5 pr-3 tabular-nums text-zinc-100">
        {(row.up * 100).toFixed(2)}%
      </td>
      <td className="py-1.5 pr-3 tabular-nums text-zinc-100">
        {(row.dn * 100).toFixed(2)}%
      </td>
      <td className="py-1.5 pr-3 tabular-nums text-zinc-300">
        ${upPays.toFixed(2)}
      </td>
      <td
        className={
          "py-1.5 pr-3 tabular-nums text-[11px] " +
          (Math.abs(edge) > 20
            ? "text-emerald-300"
            : Math.abs(edge) > 5
              ? "text-zinc-300"
              : "text-zinc-600")
        }
      >
        {edge > 0 ? "+" : ""}
        {edge.toFixed(1)}bp
      </td>
    </tr>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 bg-zinc-950/40 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 text-zinc-200 tabular-nums">{value}</div>
    </div>
  );
}

function PositionRow({
  p,
  status,
  settledPrice,
  expiryMs,
  oracleId,
}: {
  p: Position;
  status: "active" | "pending_settlement" | "settled" | "inactive";
  settledPrice: number;
  expiryMs: number;
  oracleId: string;
}) {
  const strikeUsd = p.strike / 1_000_000_000;
  // p.quantity is in DUSDC atomic units (6 decimals). Max payout if wins = qty / 1e6.
  const maxPayoutLabel = formatDusdc(p.quantity);
  const target: RedeemTarget = {
    managerId: p.managerId,
    oracleId,
    expiryMs,
    strike: p.strike,
    isUp: p.isUp,
    quantity: p.quantity,
  };

  return (
    <tr className="border-t border-zinc-900">
      <td
        className={
          "py-1.5 pr-3 " +
          (p.isUp ? "text-emerald-300" : "text-amber-300")
        }
      >
        {p.isUp ? "UP" : "DOWN"}
      </td>
      <td className="py-1.5 pr-3 tabular-nums text-zinc-200">
        ${strikeUsd.toLocaleString()}
      </td>
      <td className="py-1.5 pr-3 tabular-nums text-zinc-300">
        {maxPayoutLabel} <span className="text-zinc-600">{QUOTE_SYMBOL}</span>
      </td>
      <td className="py-1.5 pr-3 font-mono text-[11px] text-zinc-500">
        {shortId(p.owner)}
      </td>
      <td className="py-1.5 pr-3 text-right">
        <RedeemButton
          target={target}
          settledPrice={settledPrice}
          marketStatus={status}
        />
      </td>
    </tr>
  );
}

function DistBar({ upQty, dnQty }: { upQty: number; dnQty: number }) {
  const total = upQty + dnQty;
  if (total === 0) return null;
  const upPct = (upQty / total) * 100;
  return (
    <div className="mt-3">
      <div className="h-2 bg-zinc-900 border border-zinc-800 overflow-hidden flex">
        <div
          className="h-full bg-emerald-400"
          style={{ width: `${upPct}%` }}
        />
        <div
          className="h-full bg-amber-400"
          style={{ width: `${100 - upPct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] uppercase tracking-widest">
        <span className="text-emerald-300">{upPct.toFixed(0)}% UP</span>
        <span className="text-amber-300">{(100 - upPct).toFixed(0)}% DN</span>
      </div>
    </div>
  );
}

