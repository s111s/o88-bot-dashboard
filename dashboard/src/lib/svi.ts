// SVI binary pricing — straight port of the deployed `oracle::compute_nd2`
// algorithm. Same math the on-chain contract uses, so the prices we display are
// what a mint would actually quote against (modulo per-pool exposure premium).
//
// Reference: packages/predict/sources/oracle.move:396-429 on the
// `predict-testnet-4-16` branch of MystenLabs/deepbookv3.
//
//   k    = ln(strike / forward)
//   w(k) = a + b * (ρ·(k-m) + √((k-m)² + σ²))      // SVI total variance (Gatheral)
//   d2   = -((k + w(k)/2) / √w(k))
//   UP   = N(d2)
//   DN   = 1 - UP
//
// All inputs are real numbers (not 1e9-scaled). The dashboard's SVI fields are
// already converted from on-chain u64 → JS number elsewhere.

export type SVI = {
  a: number;
  b: number;
  rho: number;
  m: number;
  sigma: number;
};

/** Standard normal CDF — Abramowitz & Stegun 26.2.17 (max error ≈ 7.5e-8). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const pdf = 0.39894228040143 * Math.exp((-x * x) / 2);
  const p =
    pdf *
    t *
    (0.319381530 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

/** SVI total variance at log-moneyness k. */
export function sviVariance(svi: SVI, k: number): number {
  const km = k - svi.m;
  return svi.a + svi.b * (svi.rho * km + Math.sqrt(km * km + svi.sigma * svi.sigma));
}

/** Implied volatility (annualized) at log-moneyness k for an expiry t years out. */
export function sviIv(svi: SVI, k: number, tYears: number): number {
  if (tYears <= 0) return 0;
  const w = sviVariance(svi, k);
  return w > 0 ? Math.sqrt(w / tYears) : 0;
}

/** Binary UP price (probability the underlying settles above `strike`) under SVI.
 *  Mirrors `oracle::compute_nd2` and `binary_price_pair` exactly. */
export function binaryUpPrice(
  svi: SVI,
  forward: number,
  strike: number,
): number {
  if (forward <= 0 || strike <= 0) return 0;
  const k = Math.log(strike / forward);
  const w = sviVariance(svi, k);
  if (w <= 0) return strike > forward ? 0 : 1;
  const sqrtW = Math.sqrt(w);
  const d2 = -((k + w / 2) / sqrtW);
  return normalCdf(d2);
}

/** Both sides of a binary at one strike. Live parity: UP + DN = 1. */
export function binaryPair(
  svi: SVI,
  forward: number,
  strike: number,
): { up: number; dn: number } {
  const up = binaryUpPrice(svi, forward, strike);
  return { up, dn: 1 - up };
}

/** A row in the strike grid we render. */
export type StrikeRow = {
  strike: number;
  up: number;
  dn: number;
  /** Distance from spot in % (+ = OTM call / ITM put). */
  pctFromSpot: number;
};

/** Build a strike ladder centered on `spot`. Default ±5 strikes at $1k spacing. */
export function strikeGrid(
  svi: SVI,
  forward: number,
  spot: number,
  opts: { step?: number; range?: number } = {},
): StrikeRow[] {
  const step = opts.step ?? 1000;
  const range = opts.range ?? 5;
  // Snap the center to the nearest step for clean strikes
  const center = Math.round(spot / step) * step;
  const rows: StrikeRow[] = [];
  for (let i = -range; i <= range; i++) {
    const strike = center + i * step;
    if (strike <= 0) continue;
    const { up, dn } = binaryPair(svi, forward, strike);
    rows.push({
      strike,
      up,
      dn,
      pctFromSpot: ((strike - spot) / spot) * 100,
    });
  }
  return rows;
}
