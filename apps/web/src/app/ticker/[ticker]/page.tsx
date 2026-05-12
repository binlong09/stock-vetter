import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTickerDetail } from '@/queries';
import { VerdictBadge } from '@/components/VerdictBadge';
import { ScoreBadge } from '@/components/ScoreBadge';
import { DimensionTable } from '@/components/DimensionTable';
import { ValuationContext } from '@/components/ValuationContext';
import { CrossSourceFindings } from '@/components/CrossSourceFindings';
import { ThingsToVerify } from '@/components/ThingsToVerify';
import { Section } from '@/components/Section';
import { usd, isoDate } from '@/lib/format';

export const revalidate = 300;

export default async function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const detail = await getTickerDetail(ticker);
  if (!detail) notFound();

  const { metaCard: m, financialSnapshot } = detail;

  return (
    <div>
      <Link href="/" className="text-[12px] text-slate-400 hover:text-slate-700">
        ← all tickers
      </Link>

      {/* Header: ticker + verdict + score */}
      <div className="mt-2">
        <div className="flex items-center gap-2.5">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-slate-900">{m.ticker}</h1>
          <VerdictBadge verdict={m.verdict} size="lg" />
        </div>
        <div className="mt-1.5">
          <ScoreBadge value={m.weightedScore} />
          <span className="ml-2 text-[12px] text-slate-400">weighted across 6 dimensions</span>
        </div>
      </div>

      {/* Summary */}
      <p className="mt-3 text-[14px] leading-relaxed text-slate-700">{m.summary}</p>

      {/* Six dimensions */}
      <Section
        title="Six dimensions"
        hint="Each scored 1–10 from the 10-K/proxy. Dots show how confident the scoring was (triple-sampled)."
      >
        <DimensionTable dimensions={m.dimensions} />
      </Section>

      {/* Valuation context */}
      <Section title="Valuation context" hint="What today's price assumes vs what the business has done.">
        <ValuationContext inputs={m.inputs} snapshot={financialSnapshot} />
      </Section>

      {/* Cross-source findings — only when analyst videos fed the card */}
      {m.crossSourceFindings.length > 0 && (
        <Section
          title="Analyst vs primary source"
          hint="Where the analyst video and the filings agree or disagree. Tap a row to expand."
        >
          <CrossSourceFindings findings={m.crossSourceFindings} />
        </Section>
      )}

      {/* Divergence commentary, if any */}
      {m.divergenceCommentary.trim().length > 0 && (
        <Section title="Where to focus your own judgment">
          <p className="rounded-lg border border-slate-200 bg-white p-3.5 text-[13px] leading-snug text-slate-700">
            {m.divergenceCommentary}
          </p>
        </Section>
      )}

      {/* Things to verify */}
      <Section title="Verify these yourself" hint="The card is a starting point, not a recommendation.">
        <ThingsToVerify items={m.thingsToVerify} />
      </Section>

      {/* Footer */}
      <div className="mt-6 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-400">
        <div>
          Generated {isoDate(m.generatedAt)} · 10-K {m.inputs.primarySourceFiling}
          {m.inputs.proxyFiling ? ` · proxy ${m.inputs.proxyFiling}` : ''} ·{' '}
          {m.inputs.analystVideoCount} analyst video{m.inputs.analystVideoCount === 1 ? '' : 's'}
        </div>
        {m.totalLlmCost != null && (
          <div>
            LLM cost for this analysis: {usd(m.totalLlmCost)} · re-runs hit cache and cost $0.
          </div>
        )}
      </div>
    </div>
  );
}
