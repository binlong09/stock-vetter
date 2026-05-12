import type { DecisionCard } from '@stock-vetter/schema';
import { DeepSection } from './DeepSection';
import { TranscriptCite } from './TranscriptCite';
import { VerdictBadge } from './VerdictBadge';
import { agreementMeta } from '@/lib/verdict';
import { signedPct, pct, isoDate } from '@/lib/format';

const SCORE_LABELS: Record<keyof DecisionCard['scored']['scores'], string> = {
  businessQuality: 'Business quality',
  financialHealth: 'Financial health',
  valuationAttractiveness: 'Valuation attractiveness',
  marginOfSafety: 'Margin of safety',
  analystRigor: 'Analyst rigor',
};

const CHECKLIST_LABELS: Record<keyof DecisionCard['critiques']['valueChecklist'], string> = {
  moatDurability: 'Moat durability',
  ownerEarningsQuality: 'Owner-earnings quality',
  capitalAllocation: 'Capital allocation',
  insiderAlignment: 'Insider alignment',
  debtSustainability: 'Debt sustainability',
  cyclicalityAwareness: 'Cyclicality awareness',
};

const SEV_PILL: Record<'nit' | 'concern' | 'blocker', string> = {
  nit: 'bg-slate-100 text-slate-600 border-slate-200',
  concern: 'bg-amber-50 text-amber-800 border-amber-200',
  blocker: 'bg-rose-50 text-rose-700 border-rose-200',
};

/**
 * Full view of one analyst-video DecisionCard: the analyst's extracted thesis,
 * the pipeline's 5-dimension score of *the video*, and the four critique angles.
 * All from data already in the JSON — bulky parts behind <details>.
 */
export function AnalystCardView({ card }: { card: DecisionCard }) {
  const { extraction: e, scored: s, critiques: c, videoId } = card;
  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-slate-900">{e.companyName}</h1>
          <span className="font-mono text-sm text-slate-400">{e.ticker}</span>
          <VerdictBadge verdict={s.verdict} />
          <span className="text-sm font-bold tabular-nums text-slate-700">
            {s.weightedScore.toFixed(1)} / 10
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-slate-400">
          {e.analyst}
          {e.videoDate ? ` · ${isoDate(e.videoDate)}` : ''} ·{' '}
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            ▷ watch on YouTube
          </a>
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-700">{e.thesisOneLiner}</p>
        <p className="mt-1 text-[11px] text-slate-400">
          This is the pipeline&apos;s read of one analyst&apos;s video — a secondary input to the
          ticker&apos;s meta-card, not the verdict itself.
        </p>
      </div>

      {/* Pipeline score of the video */}
      <DeepSection title="How this video scored" defaultOpen>
        <ul className="space-y-2.5 text-[12px] leading-snug text-slate-600">
          {(Object.keys(SCORE_LABELS) as (keyof typeof SCORE_LABELS)[]).map((k) => {
            const d = s.scores[k];
            return (
              <li key={k}>
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-slate-800">{SCORE_LABELS[k]}</span>
                  <span className="tabular-nums text-slate-500">
                    {d.value === 'insufficient' ? 'insufficient' : `${d.value}/10`}
                  </span>
                </div>
                <p className="mt-0.5 text-slate-700">
                  {d.value === 'insufficient' ? d.reason : d.rationale}
                </p>
                {d.value !== 'insufficient' && d.citations.length > 0 && (
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    cites: {d.citations.join('; ')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {s.realityCheck && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-[12px] leading-snug text-slate-600">
            <span className="font-medium text-slate-700">Reality check:</span> {s.realityCheck}
          </p>
        )}
      </DeepSection>

      {/* Pros / cons */}
      {s.prosConsTable.length > 0 && (
        <DeepSection title="Pros & cons vs the LLM" count={s.prosConsTable.length}>
          <ul className="space-y-2">
            {s.prosConsTable.map((row, i) => {
              const a = agreementMeta(row.agreement);
              return (
                <li key={i} className="text-[12px] leading-snug">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{row.topic}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${a.pill}`}>
                      {a.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-slate-600">
                    <span className="text-slate-400">analyst: </span>
                    {row.analystView}
                  </p>
                  <p className="mt-0.5 text-slate-600">
                    <span className="text-slate-400">LLM: </span>
                    {row.llmPushback}
                  </p>
                </li>
              );
            })}
          </ul>
        </DeepSection>
      )}

      {/* Extracted thesis: segments / competition / risks / valuation / qualitative */}
      <DeepSection title="The analyst's thesis (extracted)">
        <div className="space-y-3 text-[12px] leading-snug text-slate-600">
          {e.segments.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Segments
              </h4>
              <ul className="mt-1 space-y-1.5">
                {e.segments.map((seg, i) => (
                  <li key={i}>
                    <span className="font-medium text-slate-700">{seg.name}</span>{' '}
                    <TranscriptCite
                      videoId={videoId}
                      startSec={seg.citation.startSec}
                      endSec={seg.citation.endSec}
                    />
                    {(seg.revenue != null || seg.growthRate != null) && (
                      <span className="text-slate-400">
                        {' '}
                        {seg.revenue != null ? `rev ${seg.revenue}` : ''}
                        {seg.growthRate != null ? ` · growth ${pct(seg.growthRate)}` : ''}
                      </span>
                    )}
                    {seg.keyDrivers.length > 0 && (
                      <span className="text-slate-500"> — {seg.keyDrivers.join(', ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {e.competitiveLandscape.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Competitive landscape
              </h4>
              <ul className="mt-1 space-y-1.5">
                {e.competitiveLandscape.map((cm, i) => (
                  <li key={i}>
                    <span className="font-medium text-slate-700">{cm.competitor}</span>{' '}
                    <span className="text-slate-400">({cm.threatLevel} threat)</span>{' '}
                    <TranscriptCite
                      videoId={videoId}
                      startSec={cm.citation.startSec}
                      endSec={cm.citation.endSec}
                    />
                    <span className="text-slate-600"> — {cm.analystView}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {e.risks.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Risks the analyst named
              </h4>
              <ul className="mt-1 space-y-1.5">
                {e.risks.map((r, i) => (
                  <li key={i}>
                    <span className="font-medium text-slate-700">{r.risk}</span>{' '}
                    <span className="text-slate-400">({r.severity})</span>{' '}
                    {r.analystAddressedWell ? (
                      <span className="text-emerald-600">addressed</span>
                    ) : (
                      <span className="text-rose-600">not really addressed</span>
                    )}{' '}
                    <TranscriptCite
                      videoId={videoId}
                      startSec={r.citation.startSec}
                      endSec={r.citation.endSec}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Valuation ({e.valuation.method}, {e.valuation.timeHorizonYears}y)
            </h4>
            {e.valuation.impliedPriceTarget != null && (
              <p className="mt-0.5 text-slate-700">
                Implied price target: ${e.valuation.impliedPriceTarget}
              </p>
            )}
            {e.valuation.impliedReturn && (
              <p className="mt-0.5 text-slate-700">
                Implied return: {signedPct(e.valuation.impliedReturn.low)} to{' '}
                {signedPct(e.valuation.impliedReturn.high)}
              </p>
            )}
            {e.valuation.keyAssumptions.length > 0 && (
              <ul className="mt-1 space-y-1">
                {e.valuation.keyAssumptions.map((a, i) => (
                  <li key={i}>
                    <span className="text-slate-700">{a.assumption}</span>
                    {': '}
                    <span className="font-medium text-slate-800">{a.value}</span>{' '}
                    <span className="text-slate-400">({a.analystConfidence} conf.)</span>{' '}
                    <TranscriptCite
                      videoId={videoId}
                      startSec={a.citation.startSec}
                      endSec={a.citation.endSec}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Qualitative
            </h4>
            <dl className="mt-1 space-y-1">
              <div>
                <dt className="inline text-slate-400">Management: </dt>
                <dd className="inline text-slate-700">{e.qualitativeFactors.managementQuality}</dd>
              </div>
              <div>
                <dt className="inline text-slate-400">Moat: </dt>
                <dd className="inline text-slate-700">{e.qualitativeFactors.moat}</dd>
              </div>
              {e.qualitativeFactors.insiderOwnership && (
                <div>
                  <dt className="inline text-slate-400">Insider ownership: </dt>
                  <dd className="inline text-slate-700">{e.qualitativeFactors.insiderOwnership}</dd>
                </div>
              )}
              <div>
                <dt className="inline text-slate-400">Capital allocation: </dt>
                <dd className="inline text-slate-700">{e.qualitativeFactors.capitalAllocation}</dd>
              </div>
            </dl>
          </div>
        </div>
      </DeepSection>

      {/* Critiques */}
      <DeepSection title="Critique angles">
        <div className="space-y-3 text-[12px] leading-snug text-slate-600">
          <CritiqueList title="Internal-consistency findings" items={c.consistency} />
          <CritiqueList title="Comparable-company findings" items={c.comps} />
          <CritiqueList title="Missing-risk findings" items={c.missingRisks} />

          {c.stressTest.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Stress test
              </h4>
              <ul className="mt-1 space-y-1.5">
                {c.stressTest.map((st, i) => (
                  <li key={i}>
                    <span className="font-medium text-slate-700">{st.assumption}</span>{' '}
                    <span className="text-slate-400">(base {st.baseValue}, {st.sensitivity} sensitivity)</span>
                    <div className="ml-2 mt-0.5">
                      <span className="text-rose-600">
                        bear: {st.bearCase.value} → return {signedPct(st.bearCase.impliedReturnDelta)}
                      </span>
                      <br />
                      <span className="text-emerald-600">
                        bull: {st.bullCase.value} → return {signedPct(st.bullCase.impliedReturnDelta)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Value checklist (1–5, the analyst-pipeline&apos;s version)
            </h4>
            <ul className="mt-1 space-y-1.5">
              {(Object.keys(CHECKLIST_LABELS) as (keyof typeof CHECKLIST_LABELS)[]).map((k) => {
                const it = c.valueChecklist[k];
                return (
                  <li key={k}>
                    <span className="font-medium text-slate-700">{CHECKLIST_LABELS[k]}</span>{' '}
                    <span className="tabular-nums text-slate-500">{it.score}/5</span>
                    <span className="text-slate-600"> — {it.rationale}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </DeepSection>
    </div>
  );
}

function CritiqueList({
  title,
  items,
}: {
  title: string;
  items: DecisionCard['critiques']['consistency'];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <ul className="mt-1 space-y-1.5">
        {items.map((f, i) => (
          <li key={i}>
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-700">{f.topic}</span>
              <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${SEV_PILL[f.severity]}`}>
                {f.severity}
              </span>
              <span className="text-[10px] text-slate-400">({f.type})</span>
            </div>
            <p className="mt-0.5 text-slate-600">
              <span className="text-slate-400">analyst: </span>
              {f.analystClaim}
            </p>
            <p className="mt-0.5 text-slate-600">
              <span className="text-slate-400">pushback: </span>
              {f.llmPushback}
            </p>
            {f.evidence && <p className="mt-0.5 text-[11px] text-slate-400">evidence: {f.evidence}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
