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
  isTranscript = false,
}: {
  videoId: string;
  startSec: number;
  endSec: number;
  // Alpha Vantage earnings-call card: there is no YouTube video to deep-link
  // into, so render the timestamp span as plain text instead of a dead link.
  isTranscript?: boolean;
}) {
  const label = `[${fmt(startSec)}–${fmt(endSec)}]`;
  if (isTranscript) {
    return <span className="font-mono text-[10px] text-slate-400">{label}</span>;
  }
  return (
    <a
      href={`https://www.youtube.com/watch?v=${videoId}&t=${Math.max(0, Math.round(startSec))}s`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[10px] text-slate-400 hover:text-slate-700 hover:underline"
      title="open this moment on YouTube"
    >
      {label}
    </a>
  );
}
