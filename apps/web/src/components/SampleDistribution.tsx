import { UncertaintyDot } from './UncertaintyDot';
import type { Uncertainty } from '@/lib/verdict';

/**
 * Shows the spread of the 3 Pass-1 samples for one dimension: each sample
 * score, the median (bold), and a small bar spanning min→max. Only meaningful
 * when there's more than one sample (older single-sample fixtures get a quiet
 * "single sample" note instead).
 */
export function SampleDistribution({
  samples,
  median,
  range,
  uncertainty,
}: {
  samples?: number[];
  median: number;
  range?: number;
  uncertainty: Uncertainty;
}) {
  if (!samples || samples.length <= 1) {
    return (
      <p className="text-[11px] text-slate-400">
        Single sample (no triple-sampling recorded for this dimension).
      </p>
    );
  }
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  // Position the bar within a 1..10 track.
  const left = ((min - 1) / 9) * 100;
  const width = Math.max(((max - min) / 9) * 100, 1.5);
  const medianPos = ((median - 1) / 9) * 100;

  return (
    <div className="text-[11px] text-slate-500">
      <div className="flex items-center gap-2">
        <span className="font-medium text-slate-600">Triple-sample spread</span>
        <UncertaintyDot uncertainty={uncertainty} withLabel range={range} />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {samples.map((s, i) => (
          <span
            key={i}
            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono tabular-nums text-slate-600"
          >
            {s.toFixed(1)}
          </span>
        ))}
        <span className="ml-1">→ median</span>
        <span className="font-mono font-semibold tabular-nums text-slate-800">
          {median.toFixed(1)}
        </span>
        {range != null && <span>· range {range.toFixed(1)}</span>}
      </div>
      <div className="relative mt-1.5 h-2 w-full rounded bg-slate-100">
        <div
          className="absolute top-0 h-2 rounded bg-slate-300"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <div
          className="absolute top-[-2px] h-3 w-0.5 rounded bg-slate-700"
          style={{ left: `calc(${medianPos}% - 1px)` }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-slate-300">
        <span>1</span>
        <span>10</span>
      </div>
    </div>
  );
}
