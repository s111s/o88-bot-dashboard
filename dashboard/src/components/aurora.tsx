// CSS-only aurora background. Two slowly-drifting radial gradients in emerald +
// indigo against pure black. No JS runtime cost.

export function Aurora() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 bg-black" />
      <div
        className="absolute inset-0 opacity-40 mix-blend-screen aurora-a"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 30%, rgba(16,185,129,0.55), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-30 mix-blend-screen aurora-b"
        style={{
          background:
            "radial-gradient(50% 40% at 80% 70%, rgba(99,102,241,0.55), transparent 60%)",
        }}
      />
      {/* very subtle dot grid */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
    </div>
  );
}
