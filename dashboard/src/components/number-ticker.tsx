"use client";

// Spring-animated number. All props are serializable so this can be rendered
// directly from a server component without a wrapper.

import { useEffect, useRef } from "react";
import { motion, useInView, useMotionValue, useSpring } from "motion/react";

export type NumberTickerProps = {
  value: number;
  from?: number;
  /** Prepend to the formatted number (e.g. "$"). */
  prefix?: string;
  /** Append to the formatted number (e.g. "k", " SUI"). */
  suffix?: string;
  /** Decimal places. Defaults to 0. */
  decimals?: number;
  className?: string;
};

function fmt(v: number, decimals: number, prefix: string, suffix: string): string {
  const rounded = Number.isFinite(v) ? v : 0;
  return (
    prefix +
    rounded.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) +
    suffix
  );
}

export function NumberTicker({
  value,
  from = 0,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(from);
  const spring = useSpring(motionValue, { damping: 28, stiffness: 70 });
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (inView) motionValue.set(value);
  }, [inView, value, motionValue]);

  useEffect(() => {
    const unsub = spring.on("change", (latest) => {
      if (ref.current)
        ref.current.textContent = fmt(latest, decimals, prefix, suffix);
    });
    return () => unsub();
  }, [spring, decimals, prefix, suffix]);

  return (
    <motion.span ref={ref} className={className}>
      {fmt(from, decimals, prefix, suffix)}
    </motion.span>
  );
}
