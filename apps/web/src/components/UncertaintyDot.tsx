import { uncertaintyMeta, type Uncertainty } from '@/lib/verdict';

/**
 * Colored dot + optional label for a dimension's sampling uncertainty.
 * `tight` = green, `moderate` = amber, `high` = rose. Shown in both the
 * default dimension table and (with the sample distribution) the deep view.
 */
export function UncertaintyDot({
  uncertainty,
  withLabel = false,
  range,
}: {
  uncertainty: Uncertainty;
  withLabel?: boolean;
  range?: number;
}) {
  const m = uncertaintyMeta(uncertainty);
  const title =
    range != null && range > 0
      ? `${m.label} — triple-sample range ${range.toFixed(1)}`
      : m.label;
  return (
    <span className="inline-flex items-center gap-1" title={title}>
      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${m.dot}`} aria-hidden />
      {withLabel && <span className={`text-[11px] ${m.text}`}>{m.label}</span>}
    </span>
  );
}
