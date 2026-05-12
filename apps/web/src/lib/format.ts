/** Small number/date formatters shared across views. */

export function pct(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  return `${(x * 100).toFixed(digits)}%`;
}

/** Signed percentage, e.g. "+14.3%" / "−9.4%". */
export function signedPct(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  const v = (x * 100).toFixed(digits);
  return x >= 0 ? `+${v}%` : `−${Math.abs(Number(v))}%`;
}

export function ratio(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  return x.toFixed(digits);
}

export function money(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  const abs = Math.abs(x);
  if (abs >= 1e12) return `$${(x / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(x / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(x / 1e6).toFixed(0)}M`;
  return `$${x.toFixed(0)}`;
}

export function usd(x: number | null | undefined, digits = 2): string {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  return `$${x.toFixed(digits)}`;
}

export function score(x: number): string {
  return x.toFixed(1);
}

/** "2026-05-10" from an ISO timestamp. */
export function isoDate(s: string): string {
  return s.length >= 10 ? s.slice(0, 10) : s;
}
