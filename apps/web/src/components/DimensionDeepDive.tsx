import {
  isInsufficientPrimary,
  type MetaCard,
  type PrimaryDimensionScore,
  type SkepticRebuttal,
  type JudgedDimension,
  type PrimarySourceCitation,
} from '@stock-vetter/schema';
import { CitationCard } from './CitationCard';
import { SampleDistribution } from './SampleDistribution';
import { type MatchTier } from '@/lib/checklist';

const DECISION_LABEL: Record<JudgedDimension['decision'], string> = {
  'agreed-with-pass1': 'agreed with the initial score',
  'agreed-with-pass2': 'agreed with the skeptic',
  split: 'split the difference',
  'no-change': 'no change',
};

function Pass1Body({
  pass1,
  matchTiers,
  dimKey,
  metaDim,
}: {
  pass1: PrimaryDimensionScore;
  matchTiers: Map<string, MatchTier>;
  dimKey: string;
  metaDim: MetaCard['dimensions'][keyof MetaCard['dimensions']];
}) {
  if (isInsufficientPrimary(pass1)) {
    return (
      <p className="text-[12px] text-slate-500">
        Pass 1 returned <em>insufficient</em>: {pass1.reason}
      </p>
    );
  }
  return (
    <div className="space-y-2.5 text-[12px] leading-snug text-slate-600">
      <div>
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Initial score {pass1.score.toFixed(1)} — rationale
        </span>
        <p className="mt-0.5 text-slate-700">{pass1.rationale}</p>
      </div>
      {pass1.counterEvidence.trim().length > 0 && (
        <div>
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Counter-evidence the scorer weighed
          </span>
          <p className="mt-0.5 text-slate-700">{pass1.counterEvidence}</p>
        </div>
      )}
      <SampleDistribution
        samples={pass1.samples}
        median={pass1.score}
        range={pass1.range ?? metaDim.range}
        uncertainty={metaDim.uncertainty}
      />
      <div>
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Citations ({pass1.citations.length})
        </span>
        <div className="mt-1 space-y-1.5">
          {pass1.citations.map((c: PrimarySourceCitation, i: number) => (
            <CitationCard key={i} citation={c} matchTier={matchTiers.get(`${dimKey}:${i}`)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Pass2Body({
  rebuttal,
  matchTiers,
  dimKey,
}: {
  rebuttal: SkepticRebuttal;
  matchTiers: Map<string, MatchTier>;
  dimKey: string;
}) {
  const adj = rebuttal.recommendedAdjustment;
  return (
    <div className="space-y-2 text-[12px] leading-snug text-slate-600">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Recommended adjustment
        </span>
        <span
          className={`rounded-full border px-1.5 py-0.5 font-mono text-[11px] ${
            adj === 0
              ? 'border-slate-200 bg-slate-50 text-slate-600'
              : adj < 0
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {adj > 0 ? '+' : ''}
          {adj.toFixed(1)}
        </span>
      </div>
      <p className="text-slate-700">{rebuttal.rebuttal}</p>
      {rebuttal.citations.length > 0 && (
        <div>
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Skeptic citations ({rebuttal.citations.length})
          </span>
          <div className="mt-1 space-y-1.5">
            {rebuttal.citations.map((c: PrimarySourceCitation, i: number) => (
              <CitationCard
                key={i}
                citation={c}
                matchTier={matchTiers.get(`${dimKey}:${i}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function scoreColor(s: number): string {
  if (s >= 7.5) return 'text-emerald-700';
  if (s >= 5.5) return 'text-amber-700';
  if (s >= 4) return 'text-orange-700';
  return 'text-rose-700';
}

/**
 * One dimension's full three-pass story, as a <details>. Collapsed: name +
 * final score + the score-arc (initial → adjustment → final). Expanded: Pass 1
 * reasoning + samples + citations, Pass 2 skeptic rebuttal + citations, Pass 3
 * judge decision + justification.
 */
export function DimensionDeepDive({
  label,
  dimKey,
  metaDim,
  pass1,
  pass2,
  pass3,
  pass1Tiers,
  pass2Tiers,
}: {
  label: string;
  dimKey: string;
  metaDim: MetaCard['dimensions'][keyof MetaCard['dimensions']];
  pass1: PrimaryDimensionScore | undefined;
  pass2: SkepticRebuttal | undefined;
  pass3: JudgedDimension | undefined;
  pass1Tiers: Map<string, MatchTier>;
  pass2Tiers: Map<string, MatchTier>;
}) {
  const initial = pass1 && !isInsufficientPrimary(pass1) ? pass1.score : null;
  const adj = pass2?.recommendedAdjustment;
  const final = pass3?.finalScore ?? metaDim.finalScore;

  return (
    <details className="group rounded-md border border-slate-200">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
        <span className="text-slate-300 transition-transform group-open:rotate-90">›</span>
        <span className="min-w-0 flex-1 text-[13px] font-medium text-slate-800">{label}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
          {initial != null && <>{initial.toFixed(1)}</>}
          {adj != null && adj !== 0 && (
            <>
              {' '}
              <span className={adj < 0 ? 'text-rose-500' : 'text-emerald-600'}>
                {adj > 0 ? '+' : ''}
                {adj.toFixed(1)}
              </span>
            </>
          )}
          {initial != null && ' → '}
        </span>
        <span className={`shrink-0 text-base font-bold tabular-nums ${scoreColor(final)}`}>
          {final.toFixed(1)}
        </span>
      </summary>

      <div className="space-y-3 border-t border-slate-100 px-3 py-3">
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Pass 1 — initial scoring
          </h4>
          <div className="mt-1.5">
            {pass1 ? (
              <Pass1Body
                pass1={pass1}
                matchTiers={pass1Tiers}
                dimKey={dimKey}
                metaDim={metaDim}
              />
            ) : (
              <p className="text-[12px] text-slate-400">Not recorded.</p>
            )}
          </div>
        </section>

        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Pass 2 — skeptic
          </h4>
          <div className="mt-1.5">
            {pass2 ? (
              <Pass2Body rebuttal={pass2} matchTiers={pass2Tiers} dimKey={dimKey} />
            ) : (
              <p className="text-[12px] text-slate-400">Not recorded.</p>
            )}
          </div>
        </section>

        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Pass 3 — judge
          </h4>
          <div className="mt-1.5 text-[12px] leading-snug text-slate-600">
            {pass3 ? (
              <>
                <p>
                  <span className="text-slate-700">
                    Final {pass3.finalScore.toFixed(1)}
                  </span>{' '}
                  · the judge {DECISION_LABEL[pass3.decision]}.
                </p>
                <p className="mt-1 text-slate-700">{pass3.justification}</p>
              </>
            ) : (
              <p className="text-slate-400">Not recorded.</p>
            )}
          </div>
        </section>

        {metaDim.uncertainty === 'high' && (
          <p className="text-[11px] text-rose-600">
            This dimension was down-weighted in the overall score because the triple-sampling spread
            was wide{metaDim.range != null ? ` (range ${metaDim.range.toFixed(1)})` : ''}.
          </p>
        )}
      </div>
    </details>
  );
}
