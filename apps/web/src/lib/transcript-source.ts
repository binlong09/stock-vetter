/**
 * An Alpha Vantage earnings-call transcript flows through the same analyst-video
 * pipeline as a YouTube video, so it lands as a DecisionCard with a synthetic
 * `videoId` of the form `av:<TICKER>:<quarter>` (see scripts/analyze-ticker.ts
 * processTranscript). Unlike a real video there is no YouTube URL — the actual
 * source is the normalized transcript we host in Turso (normalized_transcripts,
 * keyed by ticker+quarter). This module is the single place that recognizes that
 * id shape, so the UI can link to the hosted transcript instead of building a
 * dead youtube.com/watch?v=av:... link. Real YouTube cards do not match and are
 * left entirely untouched.
 */

export interface AvTranscriptRef {
  ticker: string;
  quarter: string; // calendar format, e.g. "2026Q1"
}

const AV_ID = /^av:([^:]+):([^:]+)$/;

/**
 * Parse an `av:<TICKER>:<quarter>` videoId. Returns null for any other id
 * (notably a genuine YouTube videoId), so callers can branch without affecting
 * the video path.
 */
export function parseAvTranscriptId(videoId: string): AvTranscriptRef | null {
  const m = AV_ID.exec(videoId);
  if (!m) return null;
  return { ticker: m[1]!.toUpperCase(), quarter: m[2]! };
}

/** True iff this card came from an Alpha Vantage earnings-call transcript. */
export function isAvTranscriptId(videoId: string): boolean {
  return AV_ID.test(videoId);
}
