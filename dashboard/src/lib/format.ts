// Human-friendly formatters used by the dashboard.

/** Convert a raw DUSDC atomic u64 (6 decimals) into a "$X.YZ" string. */
export function formatDusdc(atomicUnits: number): string {
  if (!Number.isFinite(atomicUnits)) return "$0";
  const dusdc = atomicUnits / 1_000_000;
  if (dusdc >= 1000) return "$" + dusdc.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (dusdc >= 1) return "$" + dusdc.toFixed(2);
  if (dusdc >= 0.01) return "$" + dusdc.toFixed(3);
  if (dusdc > 0) return "$" + dusdc.toFixed(6);
  return "$0";
}

/** Convert raw DUSDC atomic u64 to a plain number in DUSDC units. */
export function toDusdc(atomicUnits: number): number {
  return atomicUnits / 1_000_000;
}

/** "2h 14m" or "8m 03s" depending on magnitude. */
export function compactDuration(ms: number): string {
  const abs = Math.max(0, Math.abs(ms));
  const sec = Math.floor(abs / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

/** Sign-aware countdown: positive = "in 2h 14m", negative = "8m ago". */
export function relTime(targetMs: number, nowMs: number): { text: string; future: boolean } {
  const delta = targetMs - nowMs;
  const future = delta >= 0;
  return {
    future,
    text: future ? `in ${compactDuration(delta)}` : `${compactDuration(delta)} ago`,
  };
}

/** "06/20 14:30" UTC. */
export function shortDateTime(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace("T", " ")
    .slice(5, 16)
    .replace("-", "/");
}

/** "1.6m" / "12k" / "850". */
export function compactAtomic(raw: string | number): string {
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (!Number.isFinite(n)) return String(raw);
  if (n >= 1e15) return (n / 1e9).toFixed(0) + "B";
  if (n >= 1e12) return (n / 1e6).toFixed(0) + "M";
  if (n >= 1e9) return (n / 1e3).toFixed(0) + "k";
  return n.toLocaleString();
}

/** Short an object ID like `0x1234…abcd`. */
export function shortId(id: unknown): string {
  const s = typeof id === "string" ? id : "";
  if (!s || s.length < 12) return s;
  return s.slice(0, 6) + "…" + s.slice(-4);
}

/** "USDC" out of `0xpkg::usdc::USDC` or a TypeName-like object. */
export function shortType(tn: unknown): string {
  let s = "";
  if (typeof tn === "string") s = tn;
  else if (tn && typeof tn === "object") {
    const obj = tn as { name?: string; type?: string };
    s = obj.name ?? obj.type ?? "";
  }
  const parts = s.split("::");
  return parts[parts.length - 1] ?? s;
}
