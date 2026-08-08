import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRadarAssessment, edgarFilingUrl } from '@/radar-queries';
import type { MispricingAssessment } from '@stock-vetter/schema';
import { isoDate } from '@/lib/format';

export const revalidate = 60;

const VERDICT_CLS: Record<string, string> = {
  'mispriced-long': 'border-emerald-300 bg-emerald-50 text-emerald-700',
  'mispriced-short': 'border-rose-300 bg-rose-50 text-rose-700',
  watchlist: 'border-amber-300 bg-amber-50 text-amber-700',
  'no-edge': 'border-slate-300 bg-slate-100 text-slate-600',
  'insufficient-data': 'border-slate-300 bg-slate-100 text-slate-600',
};
const SEV_CLS: Record<string, string> = {
  critical: 'text-rose-700',
  high: 'text-orange-700',
  medium: 'text-amber-700',
  low: 'text-slate-500',
};

function VerdictChip({ verdict, conviction }: { verdict: string; conviction: number | null }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${VERDICT_CLS[verdict] ?? VERDICT_CLS['no-edge']}`}
    >
      {verdict}
      {conviction != null ? ` ${conviction}/10` : ''}
    </span>
  );
}

export default async function RadarDetailPage({ params }: { params: Promise<{ accession: string }> }) {
  const { accession } = await params;
  const job = await getRadarAssessment(decodeURIComponent(accession));
  if (!job) notFound();

  const a = job.assessment;
  // Side-by-side only makes sense when both sides produced an assessment; a
  // comparison whose assessment failed to parse degrades to a single column
  // with the primary — the product — intact.
  const alt = job.alt?.assessment ? job.alt : null;
  const disagree = alt != null && job.verdict != null && alt.verdict !== job.verdict;

  return (
    <div>
      <Link href="/radar" className="text-xs text-slate-400 hover:text-slate-700">
        ← Radar
      </Link>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h1 className="text-base font-semibold text-slate-900">
          {job.ticker} <span className="font-normal text-slate-500">{job.form}</span>
        </h1>
        {job.verdict ? <VerdictChip verdict={job.verdict} conviction={job.conviction} /> : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400">
        <span>filed {isoDate(job.filingDate)}</span>
        {job.triageScore != null ? <span>triage {job.triageScore}</span> : null}
        <span>status {job.status}</span>
        <a
          href={edgarFilingUrl(job.cik, decodeURIComponent(accession))}
          target="_blank"
          rel="noreferrer"
          className="text-slate-500 underline hover:text-slate-800"
        >
          EDGAR filing ↗
        </a>
      </div>

      {job.status === 'pending' ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 px-3.5 py-4 text-sm text-amber-800">
          Queued. The deep-dive runs on the local box when the worker next drains the queue.
        </p>
      ) : job.status === 'running' ? (
        <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50/60 px-3.5 py-4 text-sm text-sky-800">
          Analyzing on the box…
        </p>
      ) : job.status === 'failed' ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50/60 px-3.5 py-4 text-sm text-rose-800">
          Analysis failed: {job.error ?? 'unknown error'}
        </p>
      ) : !job.escalated ? (
        <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3.5 py-4 text-sm text-slate-600">
          Read locally, but triage
          {job.triageScore != null ? ` (score ${job.triageScore})` : ''} did not clear the bar for a cloud
          synthesis — nothing here warranted the deeper read. This is the funnel working: the filing was
          flagged, checked, and set aside.
        </p>
      ) : a && alt ? (
        <div className="mt-4">
          {disagree ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-800">
              ⚠ The models disagree — {job.model ?? 'primary'} says {job.verdict}, {alt.model} says{' '}
              {alt.verdict}. This is the comparison earning its keep: read both and decide which
              reasoning holds.
            </p>
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
              Both models reached the same verdict. The left column is the primary — the one the
              radar acts on; the right is the challenger, recorded for evaluation.
            </p>
          )}
          <div className="mt-3 grid gap-6 md:grid-cols-2">
            <ModelColumn
              label={job.model ?? 'primary'}
              role="primary"
              verdict={job.verdict}
              conviction={job.conviction}
              cost={job.cost}
              assessment={a}
            />
            <ModelColumn
              label={alt.model}
              role="comparison"
              verdict={alt.verdict}
              conviction={alt.conviction}
              cost={alt.cost}
              assessment={alt.assessment!}
            />
          </div>
        </div>
      ) : a ? (
        <div className="mt-4">
          {job.model ? (
            <p className="text-[11px] text-slate-400">
              {job.model}
              {job.cost != null ? ` · $${job.cost.toFixed(4)}` : ''}
            </p>
          ) : null}
          <div className="mt-2">
            <AssessmentBody a={a} />
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3.5 py-4 text-sm text-slate-600">
          Escalated, but the assessment could not be read back.
        </p>
      )}
    </div>
  );
}

function ModelColumn({
  label,
  role,
  verdict,
  conviction,
  cost,
  assessment,
}: {
  label: string;
  role: 'primary' | 'comparison';
  verdict: string | null;
  conviction: number | null;
  cost: number | null;
  assessment: MispricingAssessment;
}) {
  return (
    <div className={role === 'comparison' ? 'md:border-l md:border-slate-200 md:pl-6' : ''}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div>
          <span className="font-mono text-xs font-medium text-slate-700">{label}</span>
          <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">{role}</span>
          {cost != null ? <span className="ml-2 text-[11px] text-slate-400">${cost.toFixed(4)}</span> : null}
        </div>
        {verdict ? <VerdictChip verdict={verdict} conviction={conviction} /> : null}
      </div>
      <div className="mt-3">
        <AssessmentBody a={assessment} />
      </div>
    </div>
  );
}

function AssessmentBody({ a }: { a: MispricingAssessment }) {
  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Thesis</h2>
        <p className="mt-1 text-sm text-slate-700">{a.thesis}</p>
      </section>

      {a.evidence.length > 0 ? (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Evidence</h2>
          <ul className="mt-1 space-y-2">
            {a.evidence.map((e, i) => (
              <li key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="text-sm text-slate-700">
                  <span className={`font-medium ${SEV_CLS[e.severity] ?? 'text-slate-500'}`}>
                    [{e.severity}]
                  </span>{' '}
                  {e.point}
                </div>
                {e.citation?.quote ? (
                  <p className="mt-1 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-500">
                    “{e.citation.quote}”
                    {e.citation.verified ? (
                      <span className="ml-1 not-italic text-emerald-600">✓ verified</span>
                    ) : (
                      <span className="ml-1 not-italic text-slate-400">unverified</span>
                    )}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {a.catalysts.length > 0 ? (
        <Bullets title="Catalysts" items={a.catalysts.map((c) => `${c.event} (${c.expectedWindow})`)} />
      ) : null}
      {a.counterThesis ? (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">The other side</h2>
          <p className="mt-1 text-sm text-slate-700">{a.counterThesis}</p>
        </section>
      ) : null}
      {a.whatWouldKillThis.length > 0 ? <Bullets title="What would kill this" items={a.whatWouldKillThis} /> : null}
      {a.executionRisks.length > 0 ? <Bullets title="Execution risks" items={a.executionRisks} /> : null}
      {a.unverifiedClaims.length > 0 ? <Bullets title="Could not verify" items={a.unverifiedClaims} /> : null}
    </div>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </section>
  );
}
