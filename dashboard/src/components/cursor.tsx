// Blinking terminal cursor used at the end of the tagline.
export function Cursor() {
  return (
    <span
      aria-hidden
      className="inline-block w-[0.55ch] h-[0.95em] translate-y-[0.15em] ml-1 bg-emerald-400 cursor-blink"
    />
  );
}
