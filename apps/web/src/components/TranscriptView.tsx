import type { TranscriptTurnRow } from '@/queries';
import { isoDate } from '@/lib/format';

/**
 * Renders the normalized earnings-call transcript we host in Turso for an
 * Alpha Vantage card. This is the actual source behind an `av:<TICKER>:<quarter>`
 * decision card (there is no YouTube video), so the card page links here instead
 * of to a dead youtube.com URL. Falls back to the flat normalized text when the
 * per-turn segmentation is unavailable.
 */
export function TranscriptView({
  quarter,
  normalizedText,
  turns,
  normalizedAt,
}: {
  quarter: string;
  normalizedText: string;
  turns: TranscriptTurnRow[];
  normalizedAt: string;
}) {
  const prepared = turns.filter((t) => t.segment === 'prepared');
  const qa = turns.filter((t) => t.segment === 'qa');
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-400">
        {quarter} earnings call · transcript from Alpha Vantage, normalized {isoDate(normalizedAt)}.
        Auto-transcribed proper nouns were corrected; wording is otherwise the analyst&apos;s own.
      </p>
      {turns.length > 0 ? (
        <div className="space-y-4 text-[13px] leading-relaxed text-slate-700">
          {prepared.length > 0 && (
            <TurnGroup label="Prepared remarks" turns={prepared} />
          )}
          {qa.length > 0 && <TurnGroup label="Q&A" turns={qa} />}
        </div>
      ) : (
        <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
          {normalizedText}
        </pre>
      )}
    </div>
  );
}

function TurnGroup({ label, turns }: { label: string; turns: TranscriptTurnRow[] }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</h3>
      <div className="mt-1.5 space-y-3">
        {turns.map((t, i) => (
          <div key={i}>
            <div className="text-[12px] font-medium text-slate-800">
              {t.speaker}
              {t.title ? <span className="font-normal text-slate-400"> · {t.title}</span> : ''}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap">{t.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
