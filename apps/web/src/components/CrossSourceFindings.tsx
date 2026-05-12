import type { CrossSourceFinding } from '@stock-vetter/schema';
import { agreementMeta } from '@/lib/verdict';

/**
 * Analyst-view vs primary-source-view comparison. Each finding is a native
 * <details> so the dashboard-quick reader sees just topic+agreement and can
 * expand the ones that matter. Only rendered when the ticker has analyst videos.
 */
export function CrossSourceFindings({ findings }: { findings: CrossSourceFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <ul className="divide-y divide-slate-200">
        {findings.map((f, i) => {
          const a = agreementMeta(f.agreement);
          return (
            <li key={i}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="min-w-0 flex-1 text-sm text-slate-800">{f.topic}</span>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${a.pill}`}
                  >
                    {a.label}
                  </span>
                  <span className="shrink-0 text-slate-300 transition-transform group-open:rotate-90">
                    ›
                  </span>
                </summary>
                <div className="space-y-2 px-3.5 pb-3 pt-0 text-[13px] leading-snug">
                  <p>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Analyst
                    </span>
                    <br />
                    <span className="text-slate-700">{f.analystView}</span>
                  </p>
                  <p>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Primary source
                    </span>
                    <br />
                    <span className="text-slate-700">{f.primarySourceView}</span>
                  </p>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
