import Link from 'next/link';
import {
  PRIMARY_DIMENSION_KEYS,
  type MetaCard,
  type FinancialSnapshot,
  type ReverseDcfReport,
} from '@stock-vetter/schema';
import { DeepSection } from './DeepSection';
import { DimensionDeepDive } from './DimensionDeepDive';
import { ReverseDcfGrid } from './ReverseDcfGrid';
import { HistoricalFinancials } from './HistoricalFinancials';
import { ThingsToVerify } from './ThingsToVerify';
import { indexMatchTiers, type ChecklistBundle } from '@/lib/checklist';
import type { AnalystCardSummaryRow } from '@/queries';
import { isoDate } from '@/lib/format';

const DIM_LABELS: Record<(typeof PRIMARY_DIMENSION_KEYS)[number], string> = {
  moatDurability: 'Moat durability',
  ownerEarningsQuality: 'Owner-earnings quality',
  capitalAllocation: 'Capital allocation',
  debtSustainability: 'Debt sustainability',
  insiderAlignment: 'Insider alignment',
  cyclicalityAwareness: 'Cyclicality awareness',
};

/**
 * Everything below "Show the full analysis ↓" on the ticker page — a stack of
 * native <details> accordions. Built entirely from data already in the JSON
 * (no extra LLM calls): the 3-pass dimension drill-downs, the reverse-DCF grid,
 * the historical financials, the analyst-video list, and the things-to-verify
 * list (kept here, not surfaced as a top-level call to action).
 */
export function DeepView({
  ticker,
  metaCard,
  checklist,
  snapshot,
  reverseDcf,
  analystCards,
}: {
  ticker: string;
  metaCard: MetaCard;
  checklist: ChecklistBundle | null;
  snapshot: FinancialSnapshot | null;
  reverseDcf: ReverseDcfReport | null;
  analystCards: AnalystCardSummaryRow[];
}) {
  const pass1Tiers = indexMatchTiers(checklist?.pass1Verification);
  const pass2Tiers = indexMatchTiers(checklist?.pass2Verification);

  return (
    <div className="mt-7">
      <div className="mb-3 border-t border-slate-200 pt-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
          The full analysis
        </h2>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Everything behind the verdict — expand what you want to dig into.
        </p>
      </div>

      <div className="space-y-2.5">
        {checklist && (
          <DeepSection title="How each dimension was scored" count={PRIMARY_DIMENSION_KEYS.length}>
            <div className="space-y-2">
              {PRIMARY_DIMENSION_KEYS.map((key) => (
                <DimensionDeepDive
                  key={key}
                  label={DIM_LABELS[key]}
                  dimKey={key}
                  metaDim={metaCard.dimensions[key]}
                  pass1={checklist.pass1.scores[key]}
                  pass2={checklist.pass2?.rebuttals[key]}
                  pass3={checklist.pass3?.finalScores[key]}
                  pass1Tiers={pass1Tiers}
                  pass2Tiers={pass2Tiers}
                />
              ))}
            </div>
          </DeepSection>
        )}

        {reverseDcf && (
          <DeepSection title="Reverse DCF — the full sensitivity grid">
            <ReverseDcfGrid report={reverseDcf} />
          </DeepSection>
        )}

        {snapshot && (
          <DeepSection title="Historical financials">
            <HistoricalFinancials snapshot={snapshot} />
          </DeepSection>
        )}

        {analystCards.length > 0 && (
          <DeepSection title="Analyst videos" count={analystCards.length}>
            <ul className="divide-y divide-slate-100">
              {analystCards.map((c) => (
                <li key={c.videoId} className="py-2 text-[12px] first:pt-0 last:pb-0">
                  <Link
                    href={`/ticker/${ticker}/video/${c.videoId}`}
                    className="font-medium text-slate-800 hover:underline"
                  >
                    {c.title ?? c.channel ?? c.videoId}
                  </Link>
                  <span className="text-slate-400">
                    {c.channel && c.title ? ` · ${c.channel}` : ''}
                    {c.publishedAt ? ` · ${isoDate(c.publishedAt)}` : ''}
                    {c.weightedScore != null
                      ? ` · analyst-pipeline score ${c.weightedScore.toFixed(1)}`
                      : ''}
                    {c.verdict ? ` (${c.verdict})` : ''}
                  </span>
                  <a
                    href={`https://www.youtube.com/watch?v=${c.videoId}`}
                    className="ml-1.5 text-slate-500 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    ▷ watch
                  </a>
                </li>
              ))}
            </ul>
          </DeepSection>
        )}

        {metaCard.thingsToVerify.length > 0 && (
          <DeepSection title="Things to verify yourself" count={metaCard.thingsToVerify.length}>
            <ThingsToVerify items={metaCard.thingsToVerify} />
          </DeepSection>
        )}

        <DeepSection title="Source filings">
          <ul className="space-y-1.5 text-[12px] text-slate-600">
            <li>
              <span className="text-slate-400">10-K: </span>
              <a
                href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=10-K&dateb=&owner=include&count=40&search_text=`}
                className="font-mono text-slate-700 hover:underline"
              >
                {metaCard.inputs.primarySourceFiling}
              </a>{' '}
              <a
                href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&filenum=&type=10-K&search_text=&accession_number=${metaCard.inputs.primarySourceFiling}`}
                className="text-slate-400 hover:underline"
              >
                (EDGAR)
              </a>
            </li>
            {metaCard.inputs.proxyFiling && (
              <li>
                <span className="text-slate-400">DEF 14A: </span>
                <span className="font-mono text-slate-700">{metaCard.inputs.proxyFiling}</span>
              </li>
            )}
            <li className="text-[11px] text-slate-400">
              Primary sources for this card: the latest 10-K, the latest DEF 14A proxy (when one
              exists), SEC companyfacts, and the current price. Not 10-Qs, 8-Ks, earnings calls, or
              news.
            </li>
          </ul>
        </DeepSection>
      </div>
    </div>
  );
}
