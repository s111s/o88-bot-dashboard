"use client";

// Custom wallet connect/disconnect using dapp-kit hooks instead of the default
// <ConnectButton> so it matches our terminal-mono theme.

import {
  useConnectWallet,
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useWallets,
} from "@mysten/dapp-kit";
import { useState } from "react";
import { PulseDot } from "@/components/pulse-dot";
import { shortId } from "@/lib/format";
import { isO88Keeper } from "@/lib/labels";

export function WalletButton() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();

  if (account) {
    const o88 = isO88Keeper(account.address);
    return (
      <div className="flex items-center gap-2">
        <span
          className={
            "flex items-center gap-1.5 px-2 py-1 border text-[10px] uppercase tracking-widest " +
            (o88
              ? "border-emerald-300 text-emerald-200 bg-emerald-500/15"
              : "border-emerald-400/50 text-emerald-300 bg-emerald-500/5")
          }
        >
          <PulseDot tone="emerald" size={5} />
          {o88 ? "o88 keeper" : shortId(account.address)}
        </span>
        <button
          onClick={() => disconnect()}
          className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-200 transition-colors px-1"
          title="disconnect wallet"
        >
          ×
        </button>
      </div>
    );
  }

  return <ConnectButton />;
}

function ConnectButton() {
  const wallets = useWallets();
  const { mutate: connect, isPending } = useConnectWallet();
  const [open, setOpen] = useState(false);

  if (wallets.length === 0) {
    return (
      <span className="text-[10px] uppercase tracking-widest text-zinc-600">
        no wallets · install Slush
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        disabled={isPending}
        className="text-[10px] uppercase tracking-widest border border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/10 px-3 py-1 transition-colors disabled:opacity-50"
      >
        {isPending ? "connecting…" : "connect wallet"}
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 z-50 border border-zinc-700 bg-zinc-950 backdrop-blur-sm min-w-[200px]"
          onMouseLeave={() => setOpen(false)}
        >
          {wallets.map((w) => (
            <button
              key={w.name}
              onClick={() => {
                connect(
                  { wallet: w },
                  {
                    onSuccess: () => setOpen(false),
                    onError: (e) => console.error("connect error", e),
                  },
                );
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-900 transition-colors"
            >
              {w.icon && (
                <img src={w.icon} alt="" className="w-4 h-4" />
              )}
              {w.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tiny status pill — also exported for places that already render their own
 *  header layout but want the connected-state indicator. */
export function WalletStatus() {
  const wallet = useCurrentWallet();
  if (wallet.connectionStatus === "connected" && wallet.currentWallet) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-emerald-400/80">
        <PulseDot size={5} />
        wallet ready
      </div>
    );
  }
  return null;
}
