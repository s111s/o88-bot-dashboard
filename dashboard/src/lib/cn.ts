// Tiny class-merge helper. No tailwind-merge dependency yet — we don't need it.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
