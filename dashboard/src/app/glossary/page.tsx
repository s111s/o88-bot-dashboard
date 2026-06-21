import Link from "next/link";
import { Aurora } from "@/components/aurora";
import {
  STATUS_HINT,
  STATUS_LABEL_LONG,
  STATUS_LABEL_SHORT,
  STATUS_TONE,
  type MarketStatus,
} from "@/lib/labels";

export const metadata = {
  title: "o88 · glossary · what each word does",
  description:
    "Mapping from dashboard wording to the underlying DeepBook Predict Move calls. Who can call what, and what each action changes on-chain.",
};

const STATUSES: MarketStatus[] = [
  "inactive",
  "active",
  "pending_settlement",
  "settled",
];

type Actor =
  | "BS cap holder"
  | "Manager owner"
  | "Anyone"
  | "Anyone — Bot K-redeem, the user themselves, or a third party";

type Action = {
  ui: string;
  fn: string;
  who: Actor;
  needs: string;
  does: string;
  flips: string;
};

const ACTIONS: Action[] = [
  {
    ui: "Activate (oracle)",
    fn: "oracle::activate(oracle, &cap, clock)",
    who: "BS cap holder",
    needs: "OracleSVICap (1 of ~10 BS operator caps)",
    does: "Marks the oracle as active so it can take position mints. Doesn't push prices yet — that's a separate call.",
    flips: "INACTIVE → ACTIVE",
  },
  {
    ui: "Push price update",
    fn: "oracle::update_prices(oracle, &cap, prices, clock)",
    who: "BS cap holder",
    needs: "OracleSVICap + signed price payload (off-chain)",
    does: "Refreshes spot/forward. If the call lands AFTER expiry and the market isn't settled yet, this is the first post-expiry push and it ALSO freezes the settlement_price. That moment is what 'settling the market' means.",
    flips: "ACTIVE → ACTIVE (live update) · READY TO SETTLE → SETTLED (first post-expiry push)",
  },
  {
    ui: "Push SVI surface",
    fn: "oracle::update_svi(oracle, &cap, svi, clock)",
    who: "BS cap holder",
    needs: "OracleSVICap + new SVI params (a, b, ρ, m, σ)",
    does: "Updates the volatility surface used by predict::trade_prices to quote binary marks. Refused once the oracle is past expiry.",
    flips: "no status change",
  },
  {
    ui: "Open position (mint)",
    fn: "predict::mint<DUSDC>(predict, manager, oracle, key, qty, clock, ctx)",
    who: "Manager owner",
    needs: "Owned PredictManager with DUSDC balance",
    does: "Debits the live ask × qty from the manager's DUSDC balance. Adds (MarketKey → qty) to manager.positions table. Each contract pays up to 1 DUSDC at expiry if its side wins.",
    flips: "no market status change · creates / increments POSITION",
  },
  {
    ui: "Open vertical range",
    fn: "predict::mint_range<DUSDC>(predict, manager, oracle, key, qty, clock, ctx)",
    who: "Manager owner",
    needs: "Owned PredictManager with DUSDC balance",
    does: "Same as mint, but for a bounded range (lower, higher] — pays 1 DUSDC if spot lands in band at settlement.",
    flips: "no market status change · creates / increments RANGE POSITION",
  },
  {
    ui: "Close position (owner, pre-settle)",
    fn: "predict::redeem<DUSDC>(predict, manager, oracle, key, qty, clock, ctx)",
    who: "Manager owner",
    needs: "Owned PredictManager + open position on this market",
    does: "Closes the position at the current live bid. Payout deposits into the manager's DUSDC balance.",
    flips: "no market status change · decrements POSITION",
  },
  {
    ui: "Redeem position (anyone, post-settle)",
    fn: "predict::redeem_permissionless<DUSDC>(predict, manager, oracle, key, qty, clock, ctx)",
    who: "Anyone — Bot K-redeem, the user themselves, or a third party",
    needs: "Market must be SETTLED",
    does: "Pays the manager owner: 1 DUSDC per contract if the side won, 0 otherwise. The keeper (caller) gets nothing on-chain today — pure gas cost (~$0.0001 SUI). Emits PositionRedeemed with both `owner` and `executor` fields.",
    flips: "no market status change · POSITION → REDEEMED (entry removed from manager.positions)",
  },
  {
    ui: "Withdraw payout (owner)",
    fn: "predict_manager::withdraw<DUSDC>(manager, amount, ctx)",
    who: "Manager owner",
    needs: "Owned PredictManager with balance > 0",
    does: "Pulls DUSDC coins out of the manager's internal BalanceManager to the owner's wallet.",
    flips: "n/a",
  },
];

export default function GlossaryPage() {
  return (
    <>
      <Aurora />
      <main className="relative flex-1 flex flex-col text-zinc-200">
        <header className="border-b border-zinc-800/80 px-6 md:px-8 py-4 flex items-baseline justify-between backdrop-blur-sm">
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
              glossary
            </div>
          </div>
        </header>

        <section className="px-6 md:px-8 pt-8 pb-6 max-w-4xl">
          <h2 className="text-2xl text-zinc-100 mb-3">What each word does</h2>
          <p className="text-sm text-zinc-400 leading-7">
            Two distinct things were both called &ldquo;settle&rdquo; in earlier
            versions of this dashboard. They mean different things and need
            different people to do them. The vocabulary below is the canonical
            mapping from UI label → underlying{" "}
            <a
              href="https://github.com/MystenLabs/deepbookv3/tree/predict-testnet-4-16/packages/predict"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-300 underline underline-offset-4"
            >
              Move function ↗
            </a>{" "}
            on the deployed{" "}
            <code className="px-1 py-0.5 bg-zinc-900/60 border border-zinc-800 text-emerald-300/80 rounded">
              predict-testnet-4-16
            </code>{" "}
            bytecode.
          </p>
        </section>

        <section className="px-6 md:px-8 pb-8 max-w-4xl">
          <h3 className="text-[11px] uppercase tracking-widest text-zinc-500 mb-3">
            market lifecycle · status pill meaning
          </h3>
          <div className="border border-zinc-800 bg-zinc-950/40 backdrop-blur-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-zinc-600 border-b border-zinc-800/80">
                  <th className="text-left p-3 pr-3 font-normal">pill</th>
                  <th className="text-left p-3 pr-3 font-normal">full label</th>
                  <th className="text-left p-3 pr-3 font-normal">meaning</th>
                </tr>
              </thead>
              <tbody>
                {STATUSES.map((s) => (
                  <tr key={s} className="border-t border-zinc-900">
                    <td className="p-3 pr-3">
                      <span
                        className={
                          "inline-flex items-center gap-1 px-1.5 py-0.5 border text-[10px] uppercase tracking-widest " +
                          (STATUS_TONE[s] === "emerald"
                            ? "border-emerald-400/50 text-emerald-300"
                            : STATUS_TONE[s] === "amber"
                              ? "border-amber-400/50 text-amber-300"
                              : "border-zinc-700 text-zinc-400")
                        }
                      >
                        {STATUS_LABEL_SHORT[s]}
                      </span>
                    </td>
                    <td className="p-3 pr-3 text-zinc-300 uppercase tracking-widest">
                      {STATUS_LABEL_LONG[s]}
                    </td>
                    <td className="p-3 pr-3 text-zinc-400 leading-6">
                      {STATUS_HINT[s]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="px-6 md:px-8 pb-12 max-w-4xl">
          <h3 className="text-[11px] uppercase tracking-widest text-zinc-500 mb-3">
            actions · what each ui word triggers
          </h3>
          <div className="grid gap-3">
            {ACTIONS.map((a) => (
              <div
                key={a.fn}
                className="border border-zinc-800 bg-zinc-950/40 backdrop-blur-sm p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <div className="text-base text-zinc-100">{a.ui}</div>
                  <ActorBadge actor={a.who} />
                </div>
                <code className="block text-[11px] text-emerald-300/80 bg-zinc-900/60 border border-zinc-800 px-3 py-2 mb-3 overflow-x-auto">
                  {a.fn}
                </code>
                <div className="grid sm:grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-xs">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                    needs
                  </div>
                  <div className="text-zinc-300">{a.needs}</div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                    does
                  </div>
                  <div className="text-zinc-300 leading-6">{a.does}</div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                    transitions
                  </div>
                  <div className="text-zinc-400 leading-6 font-mono text-[11px]">
                    {a.flips}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 md:px-8 pb-10 max-w-4xl">
          <h3 className="text-[11px] uppercase tracking-widest text-zinc-500 mb-3">
            currency
          </h3>
          <div className="border border-zinc-800 bg-zinc-950/40 backdrop-blur-sm p-4 text-sm text-zinc-300 leading-7">
            <p>
              The only quote asset on the deployed Predict testnet is{" "}
              <code className="px-1 py-0.5 bg-zinc-900/60 border border-zinc-800 text-emerald-300/80 rounded">
                DUSDC
              </code>{" "}
              — a synthetic USDC pegged 1:1 to USD for the test environment, 6
              decimals.
            </p>
            <p className="mt-3">
              Position quantity is in <strong className="text-zinc-200">binary contracts</strong>.
              Each contract resolves to{" "}
              <strong className="text-emerald-300">1 DUSDC if its side wins</strong>{" "}
              at settlement, <strong className="text-zinc-500">0 DUSDC if it loses</strong>.
              So a position of 18 UP contracts at $63,000 has a max payout of
              18 DUSDC.
            </p>
            <p className="mt-3 text-xs text-zinc-500">
              On-chain coin type:{" "}
              <code className="px-1 py-0.5 bg-zinc-900/60 border border-zinc-800 text-zinc-400 rounded font-mono text-[11px] break-all">
                0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC
              </code>
            </p>
          </div>
        </section>

        <footer className="mt-auto border-t border-zinc-800/80 px-6 md:px-8 py-4 text-[10px] uppercase tracking-widest text-zinc-600">
          <Link href="/" className="hover:text-emerald-300">
            ← dashboard
          </Link>
        </footer>
      </main>
    </>
  );
}

function ActorBadge({ actor }: { actor: Actor }) {
  const isAnyone = actor.startsWith("Anyone");
  const style = isAnyone
    ? "border-emerald-400/50 text-emerald-300"
    : actor === "Manager owner"
      ? "border-zinc-700 text-zinc-400"
      : "border-amber-400/50 text-amber-300";
  return (
    <span
      className={
        "text-[10px] uppercase tracking-widest px-2 py-0.5 border " + style
      }
    >
      {actor}
    </span>
  );
}
