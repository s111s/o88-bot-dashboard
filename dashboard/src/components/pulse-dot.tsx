// Tiny pulsing dot used as a "live" status indicator. Pure CSS animation.

import { cn } from "@/lib/cn";

type Tone = "emerald" | "amber" | "zinc";

const TONES: Record<Tone, { core: string; halo: string }> = {
  emerald: { core: "bg-emerald-400", halo: "bg-emerald-400/40" },
  amber: { core: "bg-amber-400", halo: "bg-amber-400/40" },
  zinc: { core: "bg-zinc-500", halo: "bg-zinc-500/40" },
};

export function PulseDot({
  tone = "emerald",
  size = 8,
  className,
}: {
  tone?: Tone;
  size?: number;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cn("relative inline-flex", className)}
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          "absolute inset-0 rounded-full animate-ping",
          t.halo
        )}
      />
      <span className={cn("relative inline-flex rounded-full", t.core)}
        style={{ width: size, height: size }}
      />
    </span>
  );
}
