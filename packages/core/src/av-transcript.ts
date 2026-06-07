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
// Kress, CFO]"). `segment` filters to Q&A-only when measuring the cheaper pass.
export function transcriptToText(
  t: EarningsTranscript,
  opts: { segment?: 'all' | 'qa' } = {},
): string {
  const turns = opts.segment === 'qa' ? t.turns.filter((x) => x.segment === 'qa') : t.turns;
  return turns
    .map((x) => `[turn ${x.index} — ${x.speaker}, ${x.title}]\n${x.content}`)
    .join('\n\n');
}
