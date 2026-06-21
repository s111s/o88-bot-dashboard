"use client";

// Real redeem_permissionless<DUSDC> PTB — wallet path. Mirrors what
// `k-redeem-bot` does in Rust, but signed by the user's wallet from the
// browser. Used as the manual backup when the bot is offline or for users who
// just want to redeem their own positions immediately.

import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useState } from "react";
import { formatDusdc } from "@/lib/format";
import { QUOTE_SYMBOL } from "@/lib/labels";

// Testnet Predict constants (kept in sync with sui-data.ts + k-redeem-bot env).
const PREDICT_PKG =
  "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
const PREDICT_OBJECT =
  "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";
const DUSDC_TYPE =
  "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC";
const CLOCK = "0x6";

const GAS_BASE = 50_000_000; // 0.05 SUI base
const GAS_PER_REDEEM = 5_000_000; // +0.005 SUI per extra position

export type RedeemTarget = {
  managerId: string;
  oracleId: string;
  expiryMs: number;
  strike: number; // 1e9-scaled
  isUp: boolean;
  quantity: number; // 6-decimal DUSDC atomic
};

/** Append the two MoveCalls required to redeem one position to an existing
 *  Transaction. Returns nothing — mutates `tx`. */
function appendRedeemToTx(tx: Transaction, t: RedeemTarget) {
  const key = tx.moveCall({
    target: `${PREDICT_PKG}::market_key::new`,
    arguments: [
      tx.pure.address(t.oracleId), // oracle_id passed as address
      tx.pure.u64(t.expiryMs),
      tx.pure.u64(t.strike),
      tx.pure.bool(t.isUp),
    ],
  });
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::redeem_permissionless`,
    typeArguments: [DUSDC_TYPE],
    arguments: [
      tx.object(PREDICT_OBJECT),
      tx.object(t.managerId),
      tx.object(t.oracleId),
      key,
      tx.pure.u64(t.quantity),
      tx.object(CLOCK),
    ],
  });
}

function buildRedeemTx(targets: RedeemTarget[]): Transaction {
  const tx = new Transaction();
  for (const t of targets) appendRedeemToTx(tx, t);
  const budget = GAS_BASE + GAS_PER_REDEEM * Math.max(0, targets.length - 1);
  tx.setGasBudget(budget);
  return tx;
}

// ── Single-position button ──────────────────────────────────────────────────────

export function RedeemButton({
  target,
  settledPrice,
  marketStatus,
}: {
  target: RedeemTarget;
  /** Settlement price in real DUSDC (not atomic). Used to label win/loss. */
  settledPrice: number;
  marketStatus: "active" | "pending_settlement" | "settled" | "inactive";
}) {
  const account = useCurrentAccount();
  const { mutate, isPending } = useSignAndExecuteTransaction();
  const [outcome, setOutcome] = useState<
    null | { kind: "ok"; digest: string } | { kind: "err"; msg: string }
  >(null);

  if (marketStatus !== "settled") {
    return (
      <ActionPill tone="zinc" label={waitLabel(marketStatus)} disabled />
    );
  }

  const strikeUsd = target.strike / 1_000_000_000;
  const wins = target.isUp ? settledPrice > strikeUsd : settledPrice <= strikeUsd;
  const payoutLabel = wins ? formatDusdc(target.quantity) : "zero";

  if (!account) {
    return (
      <ActionPill
        tone={wins ? "emerald" : "zinc"}
        label={wins ? `redeem ${payoutLabel}` : "redeem (zero)"}
        disabled
        sub="needs wallet"
      />
    );
  }

  function onClick() {
    setOutcome(null);
    const tx = buildRedeemTx([target]);
    mutate(
      { transaction: tx },
      {
        onSuccess: (res) => setOutcome({ kind: "ok", digest: res.digest }),
        onError: (e) =>
          setOutcome({
            kind: "err",
            msg: e.message?.split("\n")[0] ?? String(e),
          }),
      },
    );
  }

  if (outcome?.kind === "ok") {
    return <ActionPill tone="emerald" label="✓ redeemed" sub={shortDigest(outcome.digest)} disabled />;
  }
  if (outcome?.kind === "err") {
    return (
      <button
        onClick={onClick}
        className="text-[10px] uppercase tracking-widest px-2 py-0.5 border border-red-400/50 text-red-300 bg-red-500/10 hover:bg-red-500/20 transition-colors"
        title={outcome.msg}
      >
        retry · failed
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={isPending}
      className={
        "text-[10px] uppercase tracking-widest px-2 py-0.5 border transition-colors disabled:opacity-50 " +
        (wins
          ? "border-emerald-400/50 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20"
          : "border-zinc-700 text-zinc-400 hover:bg-zinc-900")
      }
    >
      {isPending
        ? "signing…"
        : wins
          ? `redeem ${payoutLabel}`
          : "redeem (zero)"}
    </button>
  );
}

// ── Batch button (multiple positions in one PTB) ────────────────────────────────

export function RedeemBatchButton({
  targets,
  marketStatus,
}: {
  targets: RedeemTarget[];
  marketStatus: "active" | "pending_settlement" | "settled" | "inactive";
}) {
  const account = useCurrentAccount();
  const { mutate, isPending } = useSignAndExecuteTransaction();
  const [outcome, setOutcome] = useState<
    null | { kind: "ok"; digest: string; count: number } | { kind: "err"; msg: string }
  >(null);

  if (marketStatus !== "settled") {
    return (
      <button
        disabled
        className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-zinc-700 text-zinc-500 cursor-not-allowed"
      >
        redeem unlocks at settlement
      </button>
    );
  }
  if (targets.length === 0) {
    return null;
  }
  if (!account) {
    return (
      <button
        disabled
        className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-emerald-400/40 text-emerald-300/80 bg-emerald-500/10 cursor-not-allowed inline-flex items-center gap-2"
      >
        redeem all {targets.length}
        <span className="text-[9px] text-emerald-400/60 normal-case tracking-normal">
          needs wallet
        </span>
      </button>
    );
  }

  const totalDusdc = targets.reduce((s, t) => s + t.quantity, 0);

  function onClick() {
    setOutcome(null);
    const tx = buildRedeemTx(targets);
    mutate(
      { transaction: tx },
      {
        onSuccess: (res) =>
          setOutcome({ kind: "ok", digest: res.digest, count: targets.length }),
        onError: (e) =>
          setOutcome({
            kind: "err",
            msg: e.message?.split("\n")[0] ?? String(e),
          }),
      },
    );
  }

  if (outcome?.kind === "ok") {
    return (
      <a
        href={`https://testnet.suivision.xyz/txblock/${outcome.digest}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-emerald-300 text-emerald-200 bg-emerald-500/15 inline-flex items-center gap-2"
      >
        ✓ redeemed {outcome.count} · {shortDigest(outcome.digest)} ↗
      </a>
    );
  }
  if (outcome?.kind === "err") {
    return (
      <button
        onClick={onClick}
        className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-red-400/50 text-red-300 bg-red-500/10 hover:bg-red-500/20 transition-colors"
        title={outcome.msg}
      >
        retry · failed
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={isPending}
      className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-emerald-400/60 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
    >
      {isPending
        ? `signing… (${targets.length})`
        : `redeem all ${targets.length} · ${formatDusdc(totalDusdc)} ${QUOTE_SYMBOL} potential`}
    </button>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────────

function waitLabel(s: "active" | "pending_settlement" | "settled" | "inactive") {
  if (s === "pending_settlement") return "awaiting settle";
  if (s === "active") return "redeem at expiry";
  return "—";
}

function shortDigest(d: string) {
  return d.length > 14 ? d.slice(0, 6) + "…" + d.slice(-6) : d;
}

function ActionPill({
  tone,
  label,
  sub,
  disabled,
}: {
  tone: "emerald" | "zinc";
  label: string;
  sub?: string;
  disabled?: boolean;
}) {
  const tones = {
    emerald:
      "border-emerald-400/40 text-emerald-300/80 bg-emerald-500/10",
    zinc: "border-zinc-700 text-zinc-500",
  };
  return (
    <button
      disabled={disabled}
      className={
        "text-[10px] uppercase tracking-widest px-2 py-0.5 border inline-flex items-center gap-1 cursor-not-allowed " +
        tones[tone]
      }
    >
      {label}
      {sub && (
        <span className="text-[9px] text-zinc-600 normal-case tracking-normal">
          {sub}
        </span>
      )}
    </button>
  );
}
