import { usd, isoDate } from '@/lib/format';

/**
 * "$612 today · was $598 on May 10 (+2.3%)" — surfacing how stale the analysis
 * is and how the stock has moved since. Graceful when either price is missing:
 *   - current only: "$612 today"
 *   - analysis only (cron hasn't run yet): "Analyzed at $598 on May 10"
 *   - neither: render nothing.
 */
export function PriceRow({
  currentPrice,
  currentPriceAsOf,
  analysisPrice,
  analyzedAt,
  size = 'sm',
}: {
  currentPrice: number | null;
  currentPriceAsOf: string | null;
  analysisPrice: number | null;
  analyzedAt: string | null;
  size?: 'sm' | 'lg';
}) {
  if (currentPrice == null && analysisPrice == null) return null;

  const delta =
    currentPrice != null && analysisPrice != null && analysisPrice > 0
      ? (currentPrice - analysisPrice) / analysisPrice
      : null;
  const deltaPct = delta == null ? null : delta * 100;
  const deltaCls =
    deltaPct == null
      ? 'text-slate-400'
      : Math.abs(deltaPct) < 1
        ? 'text-slate-500'
        : deltaPct > 0
          ? 'text-emerald-700'
          : 'text-rose-700';

  const sizeCls = size === 'lg' ? 'text-[13px]' : 'text-[12px]';

  const todayLabel = currentPriceAsOf
    ? sameCalendarDay(currentPriceAsOf)
      ? 'today'
      : `as of ${shortDate(currentPriceAsOf)}`
    : 'today';

  const analysisLabel = analyzedAt ? shortDate(analyzedAt.slice(0, 10)) : null;

  return (
    <p className={`text-slate-600 tabular-nums ${sizeCls}`}>
      {currentPrice != null ? (
        <>
          <strong className="font-semibold">{usd(currentPrice)}</strong>{' '}
          <span className="text-slate-400">{todayLabel}</span>
        </>
      ) : null}
      {currentPrice != null && analysisPrice != null && (
        <span className="text-slate-300"> · </span>
      )}
      {analysisPrice != null && (
        <span className="text-slate-500">
          {currentPrice != null ? 'was ' : 'analyzed at '}
          {usd(analysisPrice)}
          {analysisLabel ? ` on ${analysisLabel}` : ''}
        </span>
      )}
      {deltaPct != null && (
        <span className={`ml-1 ${deltaCls}`}>
          ({deltaPct > 0 ? '+' : ''}
          {deltaPct.toFixed(1)}%)
        </span>
      )}
    </p>
  );
}

function shortDate(iso: string): string {
  // "2026-05-15" → "May 15". Render in UTC: these are date-only strings, and
  // `new Date("2026-05-15")` is midnight UTC — using local-timezone accessors
  // (toLocaleDateString without timeZone:'UTC') would shift it a day earlier
  // for anyone west of UTC.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return isoDate(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function sameCalendarDay(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}
