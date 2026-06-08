// av-transcript.ts — Alpha Vantage EARNINGS_CALL_TRANSCRIPT adapter.
//
// SPIKE STATUS: this measures viability + cost. It lives in core because both
// stock-vetter and signals would consume it later, but NOTHING wires it into a
// feed yet.
//
// Two things the raw AV data forces (confirmed against a real NVDA 2025Q4
// response):
//   (a) The transcript is auto-transcribed and mangles proper nouns —
//       "DeepSeq"→DeepSeek, "GV200"→GB200, "Grok"→Grace, "MP4"→FP4,
//       "Numitron"→Nemotron. So callers MUST route the text through the
//       existing normalize pass before extraction. This is NOT clean API text.
//   (b) Each turn carries a vendor `sentiment` float, but it is
//       non-discriminating (management ~always positive, analysts ~always
//       low/neutral — it tracks ROLE, not content). We carry it as metadata
//       only and stamp dataQuality accordingly; it must NOT feed scoring.
//
// The `title` field segments the call: prepared remarks (Operator / Moderator /
// CFO / CEO turns) precede the first Analyst turn; Q&A is everything from the
// first Analyst turn on. Q&A is where the thesis-relevant signal concentrates
// (analysts ask the custom-ASIC and gross-margin questions directly), and it's
// ~60% of the text — so a Q&A-only pass is the cost lever.

import { z } from 'zod';
import { getTursoClient, migrate } from './turso.js';
import { loadPrompt } from './prompts.js';
import { llmCall, type CostTracker } from './llm.js';

const AV_BASE = 'https://www.alphavantage.co/query';

function apiKey(): string {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  if (!key) {
    throw new Error(
      'ALPHAVANTAGE_API_KEY is not set. Add it to .env (get a key at ' +
        'https://www.alphavantage.co/support/#api-key).',
    );
  }
  return key;
}

// AV returns each turn as {speaker, title, content, sentiment}. sentiment is a
// stringified float. title is the role label used for segmentation.
const AvTurn = z.object({
  speaker: z.string(),
  title: z.string(),
  content: z.string(),
  sentiment: z.union([z.string(), z.number()]).optional(),
});
const AvResponse = z.object({
  symbol: z.string(),
  quarter: z.string(),
  transcript: z.array(AvTurn),
});

export type TranscriptTurn = {
  index: number;
  speaker: string;
  title: string;
  content: string;
  // Carried as metadata ONLY — never a scoring input (see header note (b)).
  sentiment: number | null;
  segment: 'prepared' | 'qa';
};

export type EarningsTranscript = {
  symbol: string;
  quarter: string; // calendar format, e.g. "2025Q4"
  turns: TranscriptTurn[];
};

// AV's plain-text "Error Message" / "Information" / "Note" bodies (rate limits,
// bad params, premium-gating) come back as a 200 with one of those keys.
function checkAvError(json: unknown, ctx: string): void {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const o = json as Record<string, unknown>;
    for (const k of ['Error Message', 'Information', 'Note']) {
      if (typeof o[k] === 'string') {
        throw new Error(`Alpha Vantage ${k} for ${ctx}: ${(o[k] as string).slice(0, 300)}`);
      }
    }
  }
}

// The first Analyst turn marks the prepared-remarks → Q&A boundary. Everything
// before it (Operator/Moderator/CFO/CEO prepared remarks) is `prepared`; from
// that turn on is `qa`.
function segmentTurns(turns: Array<z.infer<typeof AvTurn>>): TranscriptTurn[] {
  const firstAnalyst = turns.findIndex((t) => /analyst/i.test(t.title));
  return turns.map((t, i) => ({
    index: i,
    speaker: t.speaker,
    title: t.title,
    content: t.content,
    sentiment:
      t.sentiment == null || t.sentiment === ''
        ? null
        : Number.isFinite(Number(t.sentiment))
          ? Number(t.sentiment)
          : null,
    segment: firstAnalyst >= 0 && i >= firstAnalyst ? 'qa' : 'prepared',
  }));
}

export async function fetchEarningsTranscript(
  symbol: string,
  quarter: string, // calendar format, e.g. "2025Q4"
): Promise<EarningsTranscript> {
  const url = new URL(AV_BASE);
  url.searchParams.set('function', 'EARNINGS_CALL_TRANSCRIPT');
  url.searchParams.set('symbol', symbol.toUpperCase());
  url.searchParams.set('quarter', quarter);
  url.searchParams.set('apikey', apiKey());

  const res = await fetch(url);
  const body = await res.text();
  if (!res.ok) {
    const safe = url.toString().replace(/apikey=[^&]+/, 'apikey=***');
    throw new Error(`Alpha Vantage ${res.status} for ${safe}: ${body.slice(0, 300)}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`Alpha Vantage returned non-JSON for ${symbol} ${quarter}: ${body.slice(0, 200)}`);
  }
  checkAvError(json, `${symbol} ${quarter}`);

  const parsed = AvResponse.parse(json);
  if (!parsed.transcript.length) {
    throw new Error(`Alpha Vantage: no transcript turns for ${symbol} ${quarter}.`);
  }
  return {
    symbol: parsed.symbol.toUpperCase(),
    quarter: parsed.quarter,
    turns: segmentTurns(parsed.transcript),
  };
}

// Render turns to plain text for the normalize pass / extractor, tagged by turn
// so a downstream citation can point at a specific turn ("[turn 27 — Colette
// Kress, CFO]"). FULL transcript is the unit: the spike showed a Q&A-only pass
// saves only 23% but drops the prepared-remarks gross-margin guidance, flipping
// a correct `weakens` to a misleading `neutral`. (The per-turn `segment` field
// is still kept on the turns for context, just not used to truncate here.)
export function transcriptToText(t: EarningsTranscript): string {
  return t.turns
    .map((x) => `[turn ${x.index} — ${x.speaker}, ${x.title}]\n${x.content}`)
    .join('\n\n');
}

// Soft fetch: returns null when AV has no transcript for (symbol, quarter) or
// the endpoint reports it's unavailable — for the stock-vetter fallback path,
// which must keep working when AV has nothing.
export async function fetchEarningsTranscriptOrNull(
  symbol: string,
  quarter: string,
): Promise<EarningsTranscript | null> {
  try {
    return await fetchEarningsTranscript(symbol, quarter);
  } catch {
    return null;
  }
}

// ---- normalized-transcript cache -----------------------------------------
//
// Normalizing the auto-transcription proper-noun mangling is the dominant cost
// (~3-4× the engine). Both consumers read the same transcript and the cron
// re-checks each quarter, so we cache the cleaned text in Turso keyed by
// (ticker, quarter) and only pay normalize on a miss.

export type NormalizedTranscript = {
  ticker: string;
  quarter: string;
  normalizedText: string;
  turns: TranscriptTurn[]; // segmented turns (for per-turn citations)
  fromCache: boolean;
};

const CachedRow = z.object({
  normalized_text: z.string(),
  raw_turns_json: z.string(),
});

async function readCachedTranscript(
  ticker: string,
  quarter: string,
): Promise<{ normalizedText: string; turns: TranscriptTurn[] } | null> {
  const client = getTursoClient();
  if (!client) return null;
  await migrate();
  const res = await client.execute({
    sql: `SELECT normalized_text, raw_turns_json FROM normalized_transcripts
          WHERE ticker = ? AND quarter = ?`,
    args: [ticker.toUpperCase(), quarter],
  });
  const row = res.rows[0];
  if (!row) return null;
  const parsed = CachedRow.parse({
    normalized_text: String(row.normalized_text),
    raw_turns_json: String(row.raw_turns_json),
  });
  return {
    normalizedText: parsed.normalized_text,
    turns: JSON.parse(parsed.raw_turns_json) as TranscriptTurn[],
  };
}

async function writeCachedTranscript(
  ticker: string,
  quarter: string,
  normalizedText: string,
  turns: TranscriptTurn[],
  now: string,
): Promise<void> {
  const client = getTursoClient();
  if (!client) return;
  await migrate();
  await client.execute({
    sql: `INSERT INTO normalized_transcripts (ticker, quarter, normalized_text, raw_turns_json, normalized_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(ticker, quarter) DO UPDATE SET
            normalized_text=excluded.normalized_text,
            raw_turns_json=excluded.raw_turns_json,
            normalized_at=excluded.normalized_at`,
    args: [ticker.toUpperCase(), quarter, normalizedText, JSON.stringify(turns), now],
  });
}

// Run the existing `normalize` prompt over raw transcript text to fix the
// auto-transcription proper-noun mangling (DeepSeq→DeepSeek, GV200→GB200, …).
// The prompt is YouTube-framed but the task (fix garbled proper nouns, don't
// rewrite) transfers directly.
async function normalizeTranscriptText(
  raw: string,
  symbol: string,
  quarter: string,
  tracker: CostTracker,
): Promise<string> {
  const system = await loadPrompt('normalize');
  const userMessage = [
    `TITLE: ${symbol} ${quarter} earnings call transcript`,
    `CHANNEL: Alpha Vantage (auto-transcribed)`,
    `DESCRIPTION: ${symbol} earnings call. Proper nouns are mangled by auto-transcription; correct company/product/finance terms (e.g. Blackwell, Hopper, GB200, Grace, NVLink, FP4, Nemotron, DeepSeek, CUDA).`,
    `TAGS: ${symbol}, earnings, transcript`,
    '',
    'TRANSCRIPT:',
    raw,
  ].join('\n');
  const res = await llmCall({
    stage: 'av-normalize',
    systemPrompt: system,
    userMessage,
    maxTokens: 16384,
    tracker,
  });
  return res.text;
}

// Cache-checked normalize: returns the cleaned transcript, reading from the
// Turso cache when present (no normalize cost) and only normalizing on a miss.
// `now` is passed in (core can't call Date.now in a way that breaks resume —
// callers stamp it). Returns null when AV has no transcript for (symbol,
// quarter), so consumers can fall back.
export async function getNormalizedTranscript(
  symbol: string,
  quarter: string,
  tracker: CostTracker,
  now: string,
): Promise<NormalizedTranscript | null> {
  const upper = symbol.toUpperCase();

  // 1. Cache hit → no fetch, no normalize cost.
  const cached = await readCachedTranscript(upper, quarter);
  if (cached) {
    return {
      ticker: upper,
      quarter,
      normalizedText: cached.normalizedText,
      turns: cached.turns,
      fromCache: true,
    };
  }

  // 2. Miss → fetch from AV (null if AV has nothing).
  const transcript = await fetchEarningsTranscriptOrNull(upper, quarter);
  if (!transcript) return null;

  // 3. Normalize (the one expensive step) and persist for next time.
  const normalizedText = await normalizeTranscriptText(
    transcriptToText(transcript),
    upper,
    quarter,
    tracker,
  );
  await writeCachedTranscript(upper, quarter, normalizedText, transcript.turns, now);

  return { ticker: upper, quarter, normalizedText, turns: transcript.turns, fromCache: false };
}
