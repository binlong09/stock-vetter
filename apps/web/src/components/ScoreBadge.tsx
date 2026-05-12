/** Big "6.4 / 10" used on the ticker page header. */
export function ScoreBadge({ value }: { value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">
        {value.toFixed(1)}
      </span>
      <span className="text-sm font-medium text-slate-400">/&nbsp;10</span>
    </span>
  );
}
