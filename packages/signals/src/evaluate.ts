// evaluate.ts — the signal evaluator (Phase 2). For each (Event × Thesis)
// where the event maps to one of the thesis's watch-items, run a three-step
// LLM evaluation and emit a `Signal`:
//
//   1. extract  — is there a candidate signal here for this watch-item? null ⇒ stop.
//   2. critique — adversarial: priced-in? noise? contrary reading? Fed two
//                 quantitative inputs: the estimate-revision trend (bull-index
//                 MoM delta) and the imported reverse-DCF.
//   3. judge    — synthesize into a Signal (direction/magnitude/confidence/
//                 rationale/citation). Triple-sampled (the direction call is
//                 noisy) with a majority vote. A signal the critique judged
//                 already-priced-in resolves to neutral / low-magnitude.
//
// Reuse: llm.ts (client + cost tracking + prompt caching + the JSON-retry
// convention), prompts.ts (.md loader), the reverse-DCF + financial snapshot
// from the pipeline. Nothing here is inlined or rebuilt.
//
// Cost control: the (Event × WatchItem) mapping is a pure, zero-token filter
// applied BEFORE any LLM call (see eventMapsToWatchItem). An event that maps to
// no watch-item costs nothing.

import { load as loadHtml } from 'cheerio';
import {
  type Event,
  type Thesis,
  type WatchItem,
  type Signal,
  SignalExtractResult,
  SignalCritique,
  SignalJudgment,
  type SignalDirection,
  type ReverseDcfReport,
} from '@stock-vetter/schema';
import {
  llmCallJson,
  loadPrompt,
  fetchFinancialSnapshot,
  buildReverseDcf,
  renderReverseDcfMarkdown,
  getNormalizedTranscript,
  type CostTracker,
  type CacheableSegment,
} from '@stock-vetter/core';

// SEC filing bodies are large; cap what we feed the extractor. The relevant
// guidance/MD&A passage for a watch-item is near the top of an 8-K Ex-99.1 or
// an MD&A section, and the citation must be verbatim, so we send a generous but
// bounded window rather than the whole 10-K.
// Generous bound: a press release + CFO commentary (where 8-K guidance lives)
// together run ~30-50k chars. We keep exhibits ahead of the primary-doc shell
// in the concatenation so the substance survives truncation.
const SEC_BODY_CHAR_LIMIT = 70_000;

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? 'stock-vetter (https://example.com / contact@example.com)';

// Collapse the monthly fmp-revisions snapshots to the LATEST one per ticker
// before they become evaluation pairs. The older months are redundant for
// classification — the critique reads the whole trend (latest deltas) from
// summarizeBullIndexTrend regardless — so feeding each month as its own pair
// would be ~10× the cost for the same judgment. Pass the FULL event set
// (all months) to evaluatePair as `allEvents` so the trend summary still sees
// every month; only the evaluated PAIRs are collapsed.
export function collapseRevisionsForEval(events: Event[]): Event[] {
  const latestRevByTicker = new Map<string, Event>();
  const passthrough: Event[] = [];
  for (const e of events) {
    if (e.source !== 'fmp-revisions') {
      passthrough.push(e);
      continue;
    }
    const cur = latestRevByTicker.get(e.ticker);
    if (!cur || e.date > cur.date) latestRevByTicker.set(e.ticker, e);
  }
  return [...passthrough, ...latestRevByTicker.values()];
}

// ---- mapping (the zero-token cost filter) --------------------------------

// An event maps to a watch-item iff the watch-item declares the event's source.
// This is the gate that keeps cost proportional to *relevant* events.
export function eventMapsToWatchItem(event: Event, watchItem: WatchItem): boolean {
  return watchItem.sources.includes(event.source);
}

// All (event, watchItem) pairs for one thesis that warrant evaluation, plus a
// guard: the event's ticker must be one the thesis tracks (or a manual event
// explicitly tagged to it). Manual events tagged via payload.thesisId always map.
export function mapEventsToWatchItems(
  thesis: Thesis,
  events: Event[],
): Array<{ event: Event; watchItem: WatchItem }> {
  const pairs: Array<{ event: Event; watchItem: WatchItem }> = [];
  const tickers = new Set(thesis.tickers.map((t) => t.toUpperCase()));
  for (const event of events) {
    const taggedThesis =
      typeof event.payload.thesisId === 'string' ? event.payload.thesisId : null;
    const tickerOk = tickers.has(event.ticker.toUpperCase()) || taggedThesis === thesis.id;
    if (!tickerOk) continue;
    for (const watchItem of thesis.watchItems) {
      if (eventMapsToWatchItem(event, watchItem)) pairs.push({ event, watchItem });
    }
  }
  return pairs;
}

// ---- source-text loading -------------------------------------------------

function htmlToText(html: string): string {
  const $ = loadHtml(html);
  $('script, style, head, noscript').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': SEC_USER_AGENT } });
  if (!res.ok) return null;
  return res.text();
}

// For an 8-K, the substance (results + forward guidance) almost always lives in
// EXHIBITS — Ex-99.1 (press release) and Ex-99.2 (CFO commentary) — not the
// primary document, which is just an item-checkbox shell. So for SEC events we
// pull the filing's index.json and concatenate the primary doc with the exhibit
// .htm files (press release / commentary / earnings), which is where the
// gross-margin / capex / guidance language the watch-items care about actually
// appears. Without this, the extractor sees only boilerplate and (correctly)
// returns no-candidate for every earnings 8-K.
function edgarDirFromUrl(url: string): string | null {
  // .../Archives/edgar/data/<cik>/<accnodash>/<doc> → strip the doc.
  const m = url.match(/^(.*\/Archives\/edgar\/data\/\d+\/\d+)\//);
  return m ? m[1]! : null;
}

// Exhibit docs worth reading: .htm files that look like a press release / CFO
// commentary / earnings exhibit. We skip the XBRL/.xsd/index/image files.
function isExhibitWorthReading(name: string): boolean {
  if (!/\.htm$/i.test(name)) return false;
  if (/index|_htm\.xml|R\d+\.htm/i.test(name)) return false;
  return /pr|press|commentary|cfo|exhibit|ex-?99|earnings|q\dfy/i.test(name);
}

const SEC_FORM_LABEL: Record<string, string> = { 'sec-8k': '8-K', 'sec-10q': '10-Q', 'sec-10k': '10-K' };

// Returns the parsed body text AND an EFFECTIVE dataQuality describing what was
// actually parsed. The event's INGEST-time dataQuality says "filing metadata
// only (body not yet parsed)" because ingest only sees metadata — but here we
// fetch the primary document and exhibits (8-K Ex-99 earnings releases). Passing
// the stale string to the judge made it wrongly cap confidence ("body not yet
// parsed") even though it had the full text. So we recompute it.
async function loadSecContent(event: Event): Promise<{ text: string; dataQuality: string }> {
  const base = `source=SEC EDGAR ${SEC_FORM_LABEL[event.source] ?? event.source}`;
  if (!event.url) {
    return { text: `(${event.source} ${event.title} — no document URL available)`, dataQuality: `${base}; no document URL — metadata only` };
  }
  const primaryHtml = await fetchText(event.url);
  const primaryText = primaryHtml ? htmlToText(primaryHtml) : '';

  // Exhibits (8-K especially). Best-effort: a failure here just means we fall
  // back to the primary doc.
  const exhibitParts: string[] = [];
  const dir = edgarDirFromUrl(event.url);
  if (dir) {
    try {
      const indexRaw = await fetchText(`${dir}/index.json`);
      if (indexRaw) {
        const index = JSON.parse(indexRaw) as { directory?: { item?: Array<{ name: string }> } };
        const items = index.directory?.item ?? [];
        const primaryName = event.url.split('/').pop();
        for (const it of items) {
          if (it.name === primaryName) continue;
          if (!isExhibitWorthReading(it.name)) continue;
          const exHtml = await fetchText(`${dir}/${it.name}`);
          if (exHtml) exhibitParts.push(`[exhibit: ${it.name}]\n${htmlToText(exHtml)}`);
        }
      }
    } catch {
      // ignore — primary doc text is still used below.
    }
  }

  // Exhibits FIRST (that's where guidance lives), then the primary shell, so
  // the substance survives the char-limit truncation.
  const parts = [...exhibitParts];
  if (primaryText) parts.push(`[primary document]\n${primaryText}`);
  const joined = parts.join('\n\n').trim();
  if (!joined) {
    return { text: `(${event.source} ${event.title} — no readable content)`, dataQuality: `${base}; body fetch returned no readable text — metadata only` };
  }
  const text = joined.slice(0, SEC_BODY_CHAR_LIMIT);
  const exNote = exhibitParts.length
    ? ` + ${exhibitParts.length} exhibit(s) (incl. Ex-99 earnings release where present)`
    : '';
  const truncNote = joined.length > SEC_BODY_CHAR_LIMIT ? `; truncated to ${SEC_BODY_CHAR_LIMIT} chars` : '';
  return {
    text,
    dataQuality: `${base}; parsed ${primaryText ? 'primary document' : 'exhibits only'}${exNote}${truncNote}`,
  };
}

// What the extractor sees as "the event's content". For SEC events we fetch the
// primary doc + exhibits (bounded); for an av-transcript event we lazily load
// the normalized transcript (cache-checked — normalize cost is paid only on a
// miss); for FMP/manual events the payload IS the structured fact.
//
// Returns null content (a no-candidate signal) when an av-transcript has no
// transcript available for that quarter.
async function loadEventContent(
  event: Event,
  tracker: CostTracker,
  now: string,
): Promise<{ content: string; dataQuality: string } | null> {
  if (event.source === 'sec-8k' || event.source === 'sec-10q' || event.source === 'sec-10k') {
    try {
      const { text, dataQuality } = await loadSecContent(event);
      return { content: text, dataQuality };
    } catch (err) {
      return {
        content: `(SEC document fetch error: ${err instanceof Error ? err.message : String(err)})`,
        dataQuality: `${event.dataQuality}; body fetch ERRORED — metadata only`,
      };
    }
  }
  if (event.source === 'av-transcript') {
    const quarter = typeof event.payload.quarter === 'string' ? event.payload.quarter : null;
    if (!quarter) return null;
    const norm = await getNormalizedTranscript(event.ticker, quarter, tracker, now);
    if (!norm) return null; // AV has no transcript for this quarter → no candidate
    return { content: `${event.title}\n\n${norm.normalizedText}`, dataQuality: event.dataQuality };
  }
  // A manual event may carry a long free-text body (e.g. a transcript) under
  // payload.transcriptText — return it as RAW text, not a JSON-escaped blob.
  if (typeof event.payload.transcriptText === 'string') {
    return { content: `${event.title}\n\n${event.payload.transcriptText}`, dataQuality: event.dataQuality };
  }
  // FMP / manual: the payload is the fact.
  return { content: `${event.title}\n\n${JSON.stringify(event.payload, null, 2)}`, dataQuality: event.dataQuality };
}

// ---- quantitative inputs for the critique --------------------------------

// The two numeric inputs the critique requires. Bull-index trend comes from the
// fmp-revisions events already fetched for the ticker (most recent MoM delta);
// the reverse-DCF is built from a fresh financial snapshot.
export type QuantInputs = {
  bullIndexSummary: string; // human-readable revision trend
  reverseDcf: ReverseDcfReport | null;
};

// Summarize the estimate-revision trend for a ticker from the run's revision
// events (newest first). We surface the latest 3 monthly bull-index points and
// their deltas so the critique can judge "is consensus catching up?".
export function summarizeBullIndexTrend(ticker: string, events: Event[]): string {
  const revs = events
    .filter((e) => e.source === 'fmp-revisions' && e.ticker === ticker.toUpperCase())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  if (!revs.length) return 'No analyst-ratings revision data available for this ticker.';
  const parts = revs.map((e) => {
    const idx = e.payload.bullIndex;
    const delta = e.payload.bullIndexDelta;
    const deltaStr = delta == null ? 'n/a' : (delta as number) > 0 ? `+${delta}` : `${delta}`;
    return `${e.date}: bull-index ${idx} (Δ ${deltaStr} MoM)`;
  });
  return `Analyst-ratings bull-index trend (newest first): ${parts.join('; ')}.`;
}

// Build the reverse-DCF for a ticker. Best-effort: returns null when the
// snapshot or FCF history isn't available (the critique then reasons from the
// revision trend alone and the judge caps confidence).
export async function buildTickerReverseDcf(ticker: string): Promise<ReverseDcfReport | null> {
  try {
    const snapshot = await fetchFinancialSnapshot(ticker);
    return snapshot ? buildReverseDcf(snapshot) : null;
  } catch {
    return null;
  }
}

// ---- the three steps -----------------------------------------------------

// The thesis+watch-item context block, shared across all events for a thesis in
// a run and therefore cached (constant prefix, per the cost plan).
function thesisContextBlock(thesis: Thesis, watchItem: WatchItem): string {
  return [
    `THESIS (id: ${thesis.id})`,
    thesis.claim,
    `tickers: ${thesis.tickers.join(', ')}`,
    thesis.entities.length ? `entities: ${thesis.entities.join(', ')}` : '',
    ``,
    `WATCH_ITEM (id: ${watchItem.id})`,
    `label: ${watchItem.label}`,
    `tripwire: ${watchItem.tripwire}`,
    `tripwire direction (if crossed): ${watchItem.tripwireDirection}`,
  ]
    .filter(Boolean)
    .join('\n');
}

async function runExtract(opts: {
  thesis: Thesis;
  watchItem: WatchItem;
  event: Event;
  content: string;
  tracker: CostTracker;
}): Promise<SignalExtractResult> {
  const system = await loadPrompt('signal-extract');
  const context = thesisContextBlock(opts.thesis, opts.watchItem);
  const userMessage: CacheableSegment[] = [
    // Cache the thesis/watch-item context — constant across this thesis's events.
    { text: context, cache: true },
    {
      text: [
        ``,
        `EVENT`,
        `source: ${opts.event.source}`,
        `date: ${opts.event.date}`,
        `title: ${opts.event.title}`,
        opts.event.url ? `url: ${opts.event.url}` : '',
        ``,
        `EVENT_CONTENT:`,
        opts.content,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
  return llmCallJson({
    stage: `signal-extract-${opts.thesis.id}-${opts.watchItem.id}`,
    systemPrompt: [{ text: system, cache: true }],
    userMessage,
    schema: SignalExtractResult,
    maxTokens: 1024,
    tracker: opts.tracker,
  });
}

async function runCritique(opts: {
  thesis: Thesis;
  watchItem: WatchItem;
  candidate: NonNullable<SignalExtractResult['candidate']>;
  quant: QuantInputs;
  tracker: CostTracker;
}): Promise<SignalCritique> {
  const system = await loadPrompt('signal-critique');
  const context = thesisContextBlock(opts.thesis, opts.watchItem);
  const dcfBlock = opts.quant.reverseDcf
    ? renderReverseDcfMarkdown(opts.quant.reverseDcf)
    : '(reverse-DCF unavailable for this ticker — reason from the revision trend alone, and note the limitation.)';
  const userMessage: CacheableSegment[] = [
    { text: context, cache: true },
    {
      text: [
        ``,
        `CANDIDATE`,
        `fact: ${opts.candidate.fact}`,
        `citation: ${opts.candidate.citation}`,
        `sourceLocation: ${opts.candidate.sourceLocation}`,
        ``,
        `ESTIMATE_REVISION_TREND`,
        opts.quant.bullIndexSummary,
        ``,
        `REVERSE_DCF`,
        dcfBlock,
      ].join('\n'),
    },
  ];
  return llmCallJson({
    stage: `signal-critique-${opts.thesis.id}-${opts.watchItem.id}`,
    systemPrompt: [{ text: system, cache: true }],
    userMessage,
    schema: SignalCritique,
    maxTokens: 1536,
    tracker: opts.tracker,
  });
}

// One judge sample. The direction call is noisy, so we run this 3× and take the
// majority direction (see runJudgeTripleSampled).
async function runJudgeSample(opts: {
  thesis: Thesis;
  watchItem: WatchItem;
  candidate: NonNullable<SignalExtractResult['candidate']>;
  critique: SignalCritique;
  dataQuality: string;
  sampleIndex: number;
  totalSamples: number;
  tracker: CostTracker;
}): Promise<SignalJudgment> {
  const system = await loadPrompt('signal-judge');
  const context = thesisContextBlock(opts.thesis, opts.watchItem);
  const sharedPrefix = [
    context,
    ``,
    `CANDIDATE`,
    `fact: ${opts.candidate.fact}`,
    `citation: ${opts.candidate.citation}`,
    ``,
    `CRITIQUE`,
    `priced-in: ${opts.critique.pricedIn.verdict} — ${opts.critique.pricedIn.reasoning}`,
    `noise: ${opts.critique.noiseDressedAsSignal.verdict} — ${opts.critique.noiseDressedAsSignal.reasoning}`,
    `contrary reading: ${opts.critique.contraryReading}`,
    `survives: ${opts.critique.survives}`,
    ``,
    `DATA_QUALITY`,
    opts.dataQuality,
  ].join('\n');
  const sampleTail =
    opts.totalSamples > 1
      ? `\n\nThis is independent sample ${opts.sampleIndex + 1} of ${opts.totalSamples}. Output JSON only.`
      : `\n\nOutput JSON only.`;
  return llmCallJson({
    stage: `signal-judge-${opts.thesis.id}-${opts.watchItem.id}-s${opts.sampleIndex}`,
    systemPrompt: [{ text: system, cache: true }],
    // Cache the shared prefix so samples 1/2 hit cache for ~all input tokens;
    // the uncached sample marker is what produces the variance we average over.
    userMessage: [{ text: sharedPrefix, cache: true }, { text: sampleTail }],
    schema: SignalJudgment,
    maxTokens: 768,
    tracker: opts.tracker,
  });
}

function majorityDirection(samples: SignalJudgment[]): SignalDirection {
  const counts: Record<SignalDirection, number> = { strengthens: 0, weakens: 0, neutral: 0 };
  for (const s of samples) counts[s.direction]++;
  // Tie-break toward the more conservative answer (neutral > weakens > strengthens),
  // since the tool's bias is to resist calling things signals.
  const order: SignalDirection[] = ['neutral', 'weakens', 'strengthens'];
  let best: SignalDirection = 'neutral';
  let bestCount = -1;
  for (const dir of order) {
    if (counts[dir] > bestCount) {
      best = dir;
      bestCount = counts[dir];
    }
  }
  return best;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >>> 1;
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

// Triple-sample the judge, take the majority direction, and the median
// magnitude among samples that agree with the majority direction (so an
// outlier direction doesn't drag the magnitude). Sample 0 runs first to warm
// the cache; 1 and 2 run in parallel.
async function runJudgeTripleSampled(opts: {
  thesis: Thesis;
  watchItem: WatchItem;
  candidate: NonNullable<SignalExtractResult['candidate']>;
  critique: SignalCritique;
  dataQuality: string;
  tracker: CostTracker;
}): Promise<SignalJudgment> {
  const base = {
    thesis: opts.thesis,
    watchItem: opts.watchItem,
    candidate: opts.candidate,
    critique: opts.critique,
    dataQuality: opts.dataQuality,
    tracker: opts.tracker,
    totalSamples: 3,
  };
  const s0 = await runJudgeSample({ ...base, sampleIndex: 0 });
  const [s1, s2] = await Promise.all([
    runJudgeSample({ ...base, sampleIndex: 1 }),
    runJudgeSample({ ...base, sampleIndex: 2 }),
  ]);
  const samples = [s0, s1, s2];

  const direction = majorityDirection(samples);
  const agreeing = samples.filter((s) => s.direction === direction);
  const magnitude = median(agreeing.map((s) => s.magnitude));

  // Confidence: take the modal confidence among the agreeing samples; if the
  // three directions disagreed (no 2/3 majority), cap confidence at 'low'
  // (the judgment itself is unstable).
  const hadMajority = agreeing.length >= 2;
  const confCounts: Record<string, number> = {};
  for (const s of agreeing) confCounts[s.confidence] = (confCounts[s.confidence] ?? 0) + 1;
  let modalConf: SignalJudgment['confidence'] = 'low';
  let best = -1;
  for (const c of ['low', 'medium', 'high'] as const) {
    if ((confCounts[c] ?? 0) > best) {
      best = confCounts[c] ?? 0;
      modalConf = c;
    }
  }
  const confidence: SignalJudgment['confidence'] = hadMajority ? modalConf : 'low';

  // Representative rationale/citation: the agreeing sample whose magnitude is
  // closest to the chosen median.
  let rep = agreeing[0] ?? samples[0]!;
  let bestDist = Infinity;
  for (const s of agreeing) {
    const d = Math.abs(s.magnitude - magnitude);
    if (d < bestDist) {
      bestDist = d;
      rep = s;
    }
  }

  const rationale = hadMajority
    ? rep.rationale
    : `Unstable judgment (samples split ${samples.map((s) => s.direction).join('/')}); ` +
      `resolved conservatively to ${direction}. ${rep.rationale}`;

  return { direction, magnitude, confidence, rationale, citation: rep.citation };
}

// ---- the public entry point ----------------------------------------------

export type EvaluationOutcome =
  | { kind: 'no-candidate'; thesisId: string; watchItemId: string; eventDedupKey: string; reason: string }
  | { kind: 'signal'; signal: Signal };

// Evaluate ONE (event × watchItem) pair: extract → (critique → judge) → Signal,
// or a no-candidate outcome that cost exactly one LLM call. `allEvents` is the
// run's full event set for the ticker, used to summarize the revision trend.
export async function evaluatePair(opts: {
  thesis: Thesis;
  watchItem: WatchItem;
  event: Event;
  allEvents: Event[];
  reverseDcfByTicker: Map<string, ReverseDcfReport | null>;
  tracker: CostTracker;
  // Timestamp for any cache write (e.g. the normalized-transcript cache). Core
  // can't call Date.now safely, so callers pass it. Defaults to a fixed epoch
  // only as a guard — real callers (track.ts) pass the run's `now`.
  now?: string;
}): Promise<EvaluationOutcome> {
  const { thesis, watchItem, event } = opts;
  const now = opts.now ?? '1970-01-01T00:00:00.000Z';

  const loaded = await loadEventContent(event, opts.tracker, now);
  // Null content (e.g. an av-transcript with no transcript for that quarter) ⇒
  // nothing to evaluate, costing zero further LLM calls.
  if (loaded === null) {
    return {
      kind: 'no-candidate',
      thesisId: thesis.id,
      watchItemId: watchItem.id,
      eventDedupKey: event.dedupKey,
      reason: 'no transcript available for this ticker/quarter',
    };
  }
  // EFFECTIVE dataQuality reflects what was actually parsed at eval time (e.g.
  // the 8-K body + Ex-99 exhibits), not the event's ingest-time "metadata only"
  // — so the judge doesn't wrongly cap confidence on data it actually has.
  const { content, dataQuality } = loaded;
  const extract = await runExtract({ thesis, watchItem, event, content, tracker: opts.tracker });

  if (!extract.candidate) {
    return {
      kind: 'no-candidate',
      thesisId: thesis.id,
      watchItemId: watchItem.id,
      eventDedupKey: event.dedupKey,
      reason: extract.reason ?? 'no candidate signal',
    };
  }

  const quant: QuantInputs = {
    bullIndexSummary: summarizeBullIndexTrend(event.ticker, opts.allEvents),
    reverseDcf: opts.reverseDcfByTicker.get(event.ticker.toUpperCase()) ?? null,
  };
  const critique = await runCritique({
    thesis,
    watchItem,
    candidate: extract.candidate,
    quant,
    tracker: opts.tracker,
  });

  const judgment = await runJudgeTripleSampled({
    thesis,
    watchItem,
    candidate: extract.candidate,
    critique,
    dataQuality,
    tracker: opts.tracker,
  });

  const signal: Signal = {
    thesisId: thesis.id,
    watchItemId: watchItem.id,
    eventDedupKey: event.dedupKey,
    direction: judgment.direction,
    magnitude: judgment.magnitude,
    confidence: judgment.confidence,
    rationale: judgment.rationale,
    citation: judgment.citation,
    // Carry the EFFECTIVE dataQuality (what was actually parsed) onto the signal,
    // and note when the critique flagged it priced-in (audit trail).
    dataQuality:
      `${dataQuality}` +
      (critique.pricedIn.verdict === 'already-priced-in'
        ? '; critique=already-priced-in (magnitude capped)'
        : ''),
  };
  return { kind: 'signal', signal };
}
