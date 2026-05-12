import type { MetaCard } from '@stock-vetter/schema';
import { UncertaintyDot } from './UncertaintyDot';

/**
 * Display order, human labels, a one-line blurb, and a "what to look for" hint
 * for each of the six value-checklist dimensions. The hint encodes the
 * value-investing nuance that's easy to forget over time (e.g. high FCF ≠
 * undervalued — harvester vs compounder) right where it's read.
 */
const DIMENSIONS: {
  key: keyof MetaCard['dimensions'];
  label: string;
  blurb: string;
  hint: string;
}[] = [
  {
    key: 'moatDurability',
    label: 'Moat durability',
    blurb: 'Can the competitive advantage last?',
    hint: 'Trajectory matters more than today’s strength: a high score on a moat that’s quietly eroding is misleading. Check whether the rationale argues the moat is widening, holding, or being chipped at — not just that it’s currently wide.',
  },
  {
    key: 'ownerEarningsQuality',
    label: 'Owner-earnings quality',
    blurb: 'How real is the reported cash flow?',
    hint: 'Are GAAP earnings backed by cash, or flattering economic reality? Watch the gap between net income and free cash flow, heavy stock-based comp, and one-time gains or accounting changes that prop up a year.',
  },
  {
    key: 'capitalAllocation',
    label: 'Capital allocation',
    blurb: 'Is retained capital reinvested well?',
    hint: 'Compounder or harvester? A compounder reinvests at high returns into more growth; a harvester returns cash because it’s run out of good places to put it — both can show high FCF. The tell is whether incremental capital produces commensurate earnings growth (watch ROIC trends).',
  },
  {
    key: 'debtSustainability',
    label: 'Debt sustainability',
    blurb: 'Can the balance sheet take a hit?',
    hint: 'Past “can they service it” — what is the leverage *funding*? Debt backing productive investment is one thing; debt funding buybacks (especially at high prices) is a red flag even when interest coverage looks comfortable.',
  },
  {
    key: 'insiderAlignment',
    label: 'Insider alignment',
    blurb: 'Is management invested alongside you?',
    hint: 'Real skin in the game, or paid regardless? Look for personal share purchases (not just RSU grants), performance-tied equity, and insider ownership that’s large relative to annual pay — not a token stake.',
  },
  {
    key: 'cyclicalityAwareness',
    label: 'Cyclicality awareness',
    blurb: 'How sensitive to the business cycle?',
    hint: 'Where in the cycle is this — trough, mid, or peak? The same numbers read very differently depending on the answer: a 25% ROIC in a peak year tells you far less than a 25% ROIC averaged across a full cycle.',
  },
];

function scoreColor(s: number): string {
  if (s >= 7.5) return 'text-emerald-700';
  if (s >= 5.5) return 'text-amber-700';
  if (s >= 4) return 'text-orange-700';
  return 'text-rose-700';
}

export function DimensionTable({ dimensions }: { dimensions: MetaCard['dimensions'] }) {
  return (
    <div>
      <p className="mb-2 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        Each dimension is scored 1–10 from the 10-K and proxy filings. The{' '}
        <strong className="font-medium text-slate-600">dot</strong> is scoring confidence from
        triple-sampling — <span className="text-emerald-700">●&nbsp;tight</span> = all three samples
        agreed, <span className="text-amber-700">●&nbsp;moderate</span> = varied by 0.5–1.0,{' '}
        <span className="text-rose-700">●&nbsp;high</span> = varied by more than 1.0. Tap{' '}
        <span className="text-slate-600">“what to look for”</span> on a row for the reading hint.
      </p>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {DIMENSIONS.map(({ key, label, blurb, hint }) => {
          const d = dimensions[key];
          return (
            <li key={key} className="px-3.5 py-2.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{label}</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-slate-400">{blurb}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                    {d.range != null && d.range > 0 && <span>range {d.range.toFixed(1)} ·</span>}
                    <UncertaintyDot uncertainty={d.uncertainty} withLabel range={d.range} />
                  </div>
                </div>
                <div className="flex shrink-0 items-baseline gap-1.5 pt-0.5">
                  <span className={`text-lg font-bold tabular-nums ${scoreColor(d.finalScore)}`}>
                    {d.finalScore.toFixed(1)}
                  </span>
                </div>
              </div>
              <details className="group mt-1.5">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600">
                  <span className="transition-transform group-open:rotate-90">›</span>
                  what to look for
                </summary>
                <p className="mt-1 rounded-md bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">
                  {hint}
                </p>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
