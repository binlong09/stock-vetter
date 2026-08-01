import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRadarAssessment, edgarFilingUrl } from '@/radar-queries';
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

export default async function RadarDetailPage({ params }: { params: Promise<{ accession: string }> }) {
  const { accession } = await params;
  const job = await getRadarAssessment(decodeURIComponent(accession));
  if (!job) notFound();

  const a = job.assessment;
  return (
    <div>
      <Link href="/radar" className="text-xs text-slate-400 hover:text-slate-700">
        ← Radar
      </Link>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h1 className="text-base font-semibold text-slate-900">
          {job.ticker} <span className="font-normal text-slate-500">{job.form}</span>
        </h1>
        {job.verdict ? (
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${VERDICT_CLS[job.verdict] ?? VERDICT_CLS['no-edge']}`}
          >
            {job.verdict}
            {job.conviction != null ? ` ${job.conviction}/10` : ''}
          </span>
        ) : null}
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
      ) : a ? (
        <div className="mt-4 space-y-4">
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
      ) : (
        <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3.5 py-4 text-sm text-slate-600">
          Escalated, but the assessment could not be read back.
        </p>
      )}
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
