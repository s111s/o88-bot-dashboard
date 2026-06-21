"use client";

// Live-ticking countdown that updates every second client-side.
// Falls back to a static representation pre-hydration so server output matches.

import { useEffect, useState } from "react";
import { compactDuration } from "@/lib/format";

type Props = {
  targetMs: number;
  /** Render before the timer flips to "ready". Default: "in ". */
  prefix?: string;
  /** Render once delta ≤ 0. Default: "READY". */
  readyLabel?: string;
  /** Show how long it's been READY (ago). Default: true. */
  showElapsedWhenReady?: boolean;
  className?: string;
};

export function Countdown({
  targetMs,
  prefix = "in ",
  readyLabel = "READY",
  showElapsedWhenReady = true,
  className,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const delta = targetMs - now;
  const isReady = delta <= 0;
  const ready = (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-flex w-2 h-2">
        <span className="absolute inset-0 rounded-full bg-amber-400/40 animate-ping" />
        <span className="relative inline-flex w-2 h-2 rounded-full bg-amber-400" />
      </span>
      <span className="text-amber-300">{readyLabel}</span>
      {showElapsedWhenReady && (
        <span className="text-zinc-500">
          · {compactDuration(-delta)} ago
        </span>
      )}
    </span>
  );

  if (isReady) return <span className={className}>{ready}</span>;
  return (
    <span className={"tabular-nums " + (className ?? "")}>
      {prefix}
      {compactDuration(delta)}
    </span>
  );
}
