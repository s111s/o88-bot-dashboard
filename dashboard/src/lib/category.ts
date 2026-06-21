// Market cadence detection. The deployed Predict on testnet creates many oracles
// per expiry timestamp; cadence is implicit in the expiry's wall-clock minute/hour.
//
// 15m markets: expiries at :15, :30, :45 within an hour
//  1h markets: expiries at :00 of most hours
//  1d markets: expiries at :00 of one specific UTC hour (typically 08:00)
//  other:      anything that doesn't fit (weekly, monthly, edge cases)

export type Cadence = "15m" | "1h" | "1d" | "other";

const VALID_CADENCES: Cadence[] = ["15m", "1h", "1d", "other"];

export function cadenceOf(expiryMs: number): Cadence {
  const d = new Date(expiryMs);
  const min = d.getUTCMinutes();
  const sec = d.getUTCSeconds();
  if (sec !== 0) return "other";
  if (min === 15 || min === 30 || min === 45) return "15m";
  if (min === 0) {
    // Heuristic: 08:00 UTC is the conventional daily expiry. Hourly markets at
    // every other top-of-hour. We can't distinguish from a single expiry
    // alone, so prefer "1h" unless the hour clearly looks daily-only.
    const hour = d.getUTCHours();
    if (hour === 8) return "1d";
    return "1h";
  }
  return "other";
}

export function categorySlug(asset: string, cadence: Cadence): string {
  return `${asset.toLowerCase()}-${cadence}`;
}

/** Parse a slug like "btc-15m" → { asset: "BTC", cadence: "15m" }. */
export function parseCategorySlug(
  slug: string,
): { asset: string; cadence: Cadence } | null {
  const idx = slug.lastIndexOf("-");
  if (idx <= 0) return null;
  const asset = slug.slice(0, idx).toUpperCase();
  const cadence = slug.slice(idx + 1) as Cadence;
  if (!VALID_CADENCES.includes(cadence)) return null;
  return { asset, cadence };
}

/** Human-friendly label for headers and chips. */
export function cadenceLabel(c: Cadence): string {
  switch (c) {
    case "15m":
      return "15-minute";
    case "1h":
      return "hourly";
    case "1d":
      return "daily";
    case "other":
      return "other cadence";
  }
}
