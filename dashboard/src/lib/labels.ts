// Single source of truth for all status / button wording in the dashboard.
// Two distinct lifecycles — keep them separate or the UI starts collapsing them
// back into one ambiguous "settle" word:
//   - Market lifecycle = the oracle's status (cap-holder operation)
//   - Position lifecycle = per (manager, MarketKey) (owner or keeper operation)

import type { MarketStatus as RawMarketStatus } from "./sui-data";

export type MarketStatus = RawMarketStatus;

/** Full human label used in status sub-text and the glossary. */
export const STATUS_LABEL_LONG: Record<MarketStatus, string> = {
  inactive: "WAITING FOR ORACLE",
  active: "WAITING FOR EXPIRY",
  pending_settlement: "READY TO SETTLE",
  settled: "SETTLED · REDEEMABLE",
};

/** Compact label for status pills inside tables. */
export const STATUS_LABEL_SHORT: Record<MarketStatus, string> = {
  inactive: "INACTIVE",
  active: "ACTIVE",
  pending_settlement: "READY",
  settled: "SETTLED",
};

export const STATUS_TONE: Record<
  MarketStatus,
  "emerald" | "amber" | "zinc"
> = {
  inactive: "zinc",
  active: "emerald",
  pending_settlement: "amber",
  settled: "zinc",
};

/** One-line plain-English description of what each status means. */
export const STATUS_HINT: Record<MarketStatus, string> = {
  inactive: "cap holder hasn't activated this oracle yet",
  active: "trading is open; waiting for the expiry timestamp",
  pending_settlement:
    "expiry passed; cap holder needs to push the final price (settles the market)",
  settled:
    "price frozen; positions can be redeemed permissionlessly by anyone",
};

export const QUOTE_SYMBOL = "DUSDC";
export const QUOTE_DECIMALS = 6;

/** o88's own testnet keeper address. Redemptions where `executor` matches this
 *  are tagged as `o88` (not `KEEPER`) in the history panel. */
export const O88_KEEPER_ADDRESS =
  "0xfff8a4b92f06631e948aa20c77d6822bb3bf4191c3bb17f48bf78e13760d2fff";

export function isO88Keeper(addr: string): boolean {
  return addr.toLowerCase() === O88_KEEPER_ADDRESS.toLowerCase();
}

/** Position lifecycle (per manager × MarketKey). */
export type PositionStatus = "open" | "redeemable" | "redeemed";

export const POSITION_LABEL: Record<PositionStatus, string> = {
  open: "OPEN",
  redeemable: "REDEEMABLE",
  redeemed: "REDEEMED",
};
