/**
 * A transcript-timestamp citation from an analyst video: renders [m:ss–m:ss]
 * and links to the YouTube moment. (Analyst-card citations point at transcript
 * spans, not filings — different from primary-source citations.)
 */
function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function TranscriptCite({
  videoId,
  startSec,
  endSec,
}: {
  videoId: string;
  startSec: number;
  endSec: number;
}) {
  return (
    <a
      href={`https://www.youtube.com/watch?v=${videoId}&t=${Math.max(0, Math.round(startSec))}s`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[10px] text-slate-400 hover:text-slate-700 hover:underline"
      title="open this moment on YouTube"
    >
      [{fmt(startSec)}–{fmt(endSec)}]
    </a>
  );
}
