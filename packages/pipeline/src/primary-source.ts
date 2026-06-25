// Primary-source value-investing checklist. Reads the latest 10-K and DEF
// 14A directly (not analyst extraction), routes the right sections to the
// right dimension, and runs three LLM passes:
//   Pass 1: scoring against the rubric, with citations
//   Pass 2: skeptic-mode rebuttal (separate prompt; sees only Pass 1 scores)
//   Pass 3: judge call that reconciles the two
// All three calls are cached via the LLM cache namespace, keyed by the
// prompt-text hash so editing a prompt invalidates only its pass.

import { z } from 'zod';
import {
  isInsufficientPrimary,
  PrimarySourceChecklist,
  PrimarySourceJudgment,
  PrimarySourceSkeptic,
  PRIMARY_DIMENSION_KEYS,
  type FinancialSnapshot,
  type PrimaryDimensionKey,
  type ReverseDcfReport,
} from '@stock-vetter/schema';
import { llmCallJson, newCostTracker, type CostTracker } from './llm.js';
import { loadPrompt } from './prompts.js';
import { fetchAndParseFiling, fetchLatestProxy, type FilingMeta } from './sec-filings.js';
import { fetchFinancialSnapshot } from './financials.js';
import { buildReverseDcf } from './reverse-dcf.js';
import { getLlmOutput, putLlmOutput, hashInputs } from './cache.js';
import {
  decideSampleCount,
  loadVarianceHistory,
  recordVariance,
  type DimensionVariance,
} from './variance-history.js';
import { createHash } from 'node:crypto';

// Dimensions where valuation context (current vs historical multiples,
// reverse DCF) materially informs reasoning. Insider-alignment, moat, and
// cyclicality are about business/governance characteristics — adding price
// context just dilutes them. Owner-earnings, capital-allocation, and
// debt-sustainability all benefit.
const VALUATION_AWARE_DIMENSIONS = new Set<PrimaryDimensionKey>([
  'ownerEarningsQuality',
  'capitalAllocation',
  'debtSustainability',
]);

// Render a compact "Financial context" block that gets prepended to
// valuation-aware dimensions' prompts. Numbers only — no LLM commentary,
// keeping it ground-truth substrate the model can reason against.
function renderFinancialContext(
  snapshot: FinancialSnapshot | null,
  dcf: ReverseDcfReport | null,
): string {
  if (!snapshot) return '';
  const parts: string[] = [];
  parts.push('### Financial context (computed from SEC + Yahoo, not LLM-generated)');
  parts.push('');
  parts.push(`- Price: $${snapshot.price.toFixed(2)}`);
  parts.push(`- Market cap: $${(snapshot.marketCap / 1e9).toFixed(1)}B`);
  parts.push(`- Enterprise value: $${(snapshot.enterpriseValue / 1e9).toFixed(1)}B`);
  parts.push(`- Net cash: $${(snapshot.netCash / 1e9).toFixed(1)}B`);
  parts.push(`- Trailing P/E: ${snapshot.peRatio?.toFixed(1) ?? 'n/a'}`);
  parts.push(`- 10y median P/E: ${snapshot.peRatio10yMedian?.toFixed(1) ?? 'n/a'}`);
  parts.push(`- Trailing EV/EBIT: ${snapshot.evEbit?.toFixed(1) ?? 'n/a'}`);
  parts.push(`- 10y median EV/EBIT: ${snapshot.evEbit10yMedian?.toFixed(1) ?? 'n/a'}`);
  parts.push(`- Trailing FCF yield: ${snapshot.fcfYield != null ? `${(snapshot.fcfYield * 100).toFixed(2)}%` : 'n/a'}`);
  if (dcf) {
    const central = dcf.grid.find((c) => Math.abs(c.discountRate - 0.10) < 1e-6 && c.terminalMultiple === 20);
    if (central?.impliedFcfCagr != null) {
      parts.push(`- Reverse DCF implied 10y FCF CAGR (10% disc, 20× terminal): ${(central.impliedFcfCagr * 100).toFixed(1)}%`);
    }
    if (dcf.actualFcfCagr5y != null) {
      parts.push(`- Actual 5y FCF CAGR: ${(dcf.actualFcfCagr5y * 100).toFixed(1)}%`);
    }
    if (dcf.actualFcfCagr3y != null) {
      parts.push(`- Actual 3y FCF CAGR: ${(dcf.actualFcfCagr3y * 100).toFixed(1)}%`);
    }
  }
  parts.push('');
  return parts.join('\n');
}

const SingleDimensionSchema = z.union([
  z.object({
    score: z.number().min(1).max(10),
    rationale: z.string(),
    citations: z
      .array(
        z.object({
          section: z.string(),
          quote: z.string(),
          whyItMatters: z.string(),
        }),
      )
      .min(2),
    counterEvidence: z.string(),
  }),
  z.object({
    score: z.literal('insufficient'),
    reason: z.string(),
  }),
]);

// Section routing: which sections feed which dimension. When a section is
// `bundled` into another, the bundled targets are also included so the
// LLM has the full content available.
//
// Special section ids:
//   "proxy" — the cleaned DEF 14A text (no Item-N structure)
const DIMENSION_SECTIONS: Record<PrimaryDimensionKey, string[]> = {
  moatDurability: ['business', 'risk-factors'],
  ownerEarningsQuality: ['financial-statements', 'mda'],
  capitalAllocation: ['mda', 'financial-statements'],
  debtSustainability: ['financial-statements', 'mda'],
  insiderAlignment: ['proxy'],
  cyclicalityAwareness: ['risk-factors', 'mda'],
};

type SectionLoader = (id: string) => Promise<string | null>;

// Lexical relevance selection. A routed section can be far larger than the
// per-dimension budget (e.g. a 281K-char financial-statements section), and
// the value-investing detail a dimension needs (debt-maturity schedules,
// segment notes, comp tables) often lives deep in the document where naive
// head-truncation drops it. Instead we chunk the section and keep the chunks
// most relevant to the dimension, by query-term frequency.
//
// Per-dimension query terms — substrings matched case-insensitively (so
// multi-word phrases like "free cash flow" work). Tuned to the rubric concerns.
const DIMENSION_QUERY_TERMS: Record<PrimaryDimensionKey, string[]> = {
  moatDurability: [
    'compet', 'market share', 'barrier', 'switching cost', 'proprietary', 'patent',
    'intellectual property', 'brand', 'scale', 'network effect', 'pricing power',
    'differentiat', 'ecosystem', 'customer concentration', 'substitute', 'moat',
  ],
  ownerEarningsQuality: [
    'cash flow', 'operating activities', 'free cash flow', 'net income', 'depreciation',
    'amortization', 'stock-based compensation', 'share-based', 'working capital',
    'capital expenditure', 'capex', 'accrual', 'non-recurring', 'one-time', 'impairment',
    'deferred revenue',
  ],
  capitalAllocation: [
    'repurchase', 'buyback', 'dividend', 'acquisition', 'capital expenditure',
    'investment', 'return on invested', 'return on equity', 'allocation', 'share count',
    'retained earnings', 'goodwill', 'divestiture', 'reinvest',
  ],
  debtSustainability: [
    'debt', 'long-term debt', 'maturit', 'interest expense', 'covenant', 'credit facility',
    'revolving', 'senior notes', 'principal', 'repayment', 'leverage', 'liquidity',
    'borrowing', 'indenture', 'default', 'current portion',
  ],
  insiderAlignment: [
    'ownership', 'beneficial', 'compensation', 'incentive', 'stock ownership',
    'related party', 'related-party', 'board', 'independence', 'insider', 'equity award',
    'vesting', 'executive', 'director', 'say-on-pay', 'parachute',
  ],
  cyclicalityAwareness: [
    'cyclical', 'cycle', 'seasonal', 'demand', 'downturn', 'recession', 'volatil',
    'commodity', 'inventory', 'backlog', 'capacity', 'fluctuat', 'macroeconomic',
    'end market',
  ],
};

// Split text into ~`size`-char chunks on paragraph boundaries; hard-split any
// single paragraph that exceeds 1.5× the target.
function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  let cur = '';
  for (const para of text.split(/\n\n+/)) {
    if (cur && cur.length + para.length + 2 > size) {
      chunks.push(cur);
      cur = '';
    }
    cur = cur ? `${cur}\n\n${para}` : para;
    while (cur.length > size * 1.5) {
      chunks.push(cur.slice(0, size));
      cur = cur.slice(size);
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// Relevance score: for each query term, count occurrences and add 1 + ln(count)
// (diminishing returns), so a chunk rich in many distinct terms ranks highest.
function scoreChunk(chunk: string, terms: string[]): number {
  const lc = chunk.toLowerCase();
  let score = 0;
  for (const term of terms) {
    let count = 0;
    let pos = lc.indexOf(term);
    while (pos !== -1) {
      count++;
      pos = lc.indexOf(term, pos + term.length);
    }
    if (count > 0) score += 1 + Math.log(count);
  }
  return score;
}


// Water-fill the budget across sources by size: small sources take what they
// need; the surplus redistributes to larger ones. Guarantees no routed section
// is starved to zero (the old greedy first-come loop could drop a whole
// section).
function allocateBudget(sizes: number[], total: number): number[] {
  const alloc = new Array<number>(sizes.length).fill(0);
  const done = new Array<boolean>(sizes.length).fill(false);
  let remaining = total;
  let active = sizes.length;
  while (active > 0 && remaining > 0) {
    const share = Math.floor(remaining / active);
    if (share <= 0) break;
    let progressed = false;
    for (let i = 0; i < sizes.length; i++) {
      if (done[i]) continue;
      if (sizes[i]! <= share) {
        remaining -= sizes[i]!;
        alloc[i] = sizes[i]!;
        done[i] = true;
        active--;
        progressed = true;
      }
    }
    if (!progressed) {
      for (let i = 0; i < sizes.length; i++) {
        if (done[i]) continue;
        alloc[i]! += share;
        remaining -= share;
      }
      break;
    }
  }
  return alloc;
}

// Hard ceiling on total context chars per dimension. Unlike the old fixed 80K
// budget, sections that fit under the ceiling are included WHOLE — only
// oversized routed content is triaged down. The ceiling is the rate-limit
// guardrail (≈ 37K tokens/dimension); content-relevance decides how much of it
// gets used, up to this cap.
const PER_DIMENSION_CEILING = Number(process.env.PER_DIMENSION_CEILING ?? 100_000);

// The triage pre-pass runs on a cheap hosted model via an OpenAI-compatible
// API (DeepSeek by default) — NOT the Anthropic scoring path. Triage is
// selection, not judgment, and is input-heavy, so a cheap fast model wins.
// Config falls back to the REMOTE_* vars already used for DeepSeek.
const TRIAGE_MODEL = process.env.TRIAGE_MODEL ?? 'deepseek-v4-flash';
const TRIAGE_BASE_URL = (
  process.env.TRIAGE_BASE_URL ?? process.env.REMOTE_BASE_URL ?? 'https://api.deepseek.com/v1'
).replace(/\/$/, '');
const TRIAGE_API_KEY =
  process.env.TRIAGE_API_KEY ?? process.env.REMOTE_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? '';
const TRIAGE_CHUNK_SIZE = 4_000;

// DeepSeek-v4-flash pricing (USD per 1M tokens), env-overridable. Triage is a
// small line item; these only affect the displayed cost number.
const TRIAGE_PRICE_IN = Number(process.env.TRIAGE_PRICE_IN ?? 0.28);
const TRIAGE_PRICE_CACHE = Number(process.env.TRIAGE_PRICE_CACHE ?? 0.028);
const TRIAGE_PRICE_OUT = Number(process.env.TRIAGE_PRICE_OUT ?? 0.42);

// Minimal OpenAI-compatible JSON call for the triage stage. Tracks DeepSeek
// cost on the shared tracker (the Anthropic priceCall path doesn't know
// DeepSeek rates, so we compute them here from the cache hit/miss split).
async function callTriageJson(
  stage: string,
  system: string,
  user: string,
  model: string,
  tracker: CostTracker | undefined,
): Promise<unknown> {
  if (!TRIAGE_API_KEY) throw new Error('triage: no API key (set TRIAGE_API_KEY or REMOTE_API_KEY)');
  const resp = await fetch(`${TRIAGE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TRIAGE_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 1024,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error(`triage ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: {
      prompt_cache_hit_tokens?: number;
      prompt_cache_miss_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };
  const u = data.usage ?? {};
  const cacheRead = u.prompt_cache_hit_tokens ?? 0;
  const input = u.prompt_cache_miss_tokens ?? Math.max(0, (u.prompt_tokens ?? 0) - cacheRead);
  const output = u.completion_tokens ?? 0;
  const cost =
    (input / 1e6) * TRIAGE_PRICE_IN + (cacheRead / 1e6) * TRIAGE_PRICE_CACHE + (output / 1e6) * TRIAGE_PRICE_OUT;
  if (tracker) {
    tracker.total += cost;
    tracker.byCall.push({ stage, inputTokens: input, outputTokens: output, cacheWriteTokens: 0, cacheReadTokens: cacheRead, cost });
    tracker.onAfterCall?.(tracker.total);
  }
  const content = data.choices?.[0]?.message?.content ?? '{}';
  return JSON.parse(content);
}

// One-line description of what content each dimension needs, for the triage
// prompt. Keep aligned with the rubric and DIMENSION_QUERY_TERMS.
const DIMENSION_CRITERIA: Record<PrimaryDimensionKey, string> = {
  moatDurability:
    'competitive advantages and threats: market position/share, switching costs, patents/IP, brand, scale, network effects, pricing power, competitive threats, customer concentration',
  ownerEarningsQuality:
    'quality of earnings vs cash: operating and free cash flow, net-income reconciliation, depreciation/amortization, stock-based compensation, working-capital swings, non-recurring/one-time items, accruals, impairments',
  capitalAllocation:
    'how capital is deployed: buybacks/repurchases, dividends, acquisitions, capex, investments, returns on capital, goodwill, divestitures',
  debtSustainability:
    'debt and liquidity: total and long-term debt, maturity schedules, interest expense and coverage, covenants, credit facilities, leverage ratios, liquidity and refinancing risk',
  insiderAlignment:
    'management/board alignment: beneficial ownership, executive compensation structure and incentives, related-party transactions, board independence, insider holdings and trading restrictions',
  cyclicalityAwareness:
    'cyclicality and through-cycle resilience: cyclical/seasonal demand, end-market exposure, inventory and backlog, capacity, commodity exposure, downturn sensitivity, demand volatility',
};

const TriageSchema = z.object({ relevant: z.array(z.number().int().nonnegative()) });

// LLM triage: split an oversized section into numbered chunks, ask a cheap
// model which chunks bear on this dimension, and return those chunk indices.
// We keep the ORIGINAL chunk text (the model only chooses indices), so quotes
// stay verbatim and grep-able. The result is cached keyed by content, so it
// runs ONCE per (section, dimension) and is reused across Pass 1/2/3 — keeping
// the downstream context byte-identical so the cross-pass prompt cache holds.
async function triageSection(
  sectionId: string,
  chunks: string[],
  dimension: PrimaryDimensionKey,
  tracker: CostTracker | undefined,
  triageModel: string,
): Promise<number[]> {
  const system =
    `You are selecting the parts of an SEC filing section that a value investor needs to score ONE specific ` +
    `dimension. The section is split into numbered chunks. Return ONLY the chunk numbers that materially bear ` +
    `on: ${DIMENSION_CRITERIA[dimension]}. A chunk qualifies if it contains the specific figures, tables, notes, ` +
    `disclosures, or discussion relevant to this dimension. Exclude boilerplate, signatures, safe-harbor/` +
    `forward-looking disclaimers, and chunks about unrelated topics. Aim for the genuinely relevant subset — ` +
    `usually a minority of the section — but never drop a chunk that carries decision-relevant detail. ` +
    `Output JSON only: {"relevant":[chunk numbers]}.`;
  const promptHash = createHash('sha1').update(system).digest('hex').slice(0, 12);
  const inputHash = hashInputs({
    sectionId,
    dimension,
    chunkCount: chunks.length,
    chunkSizes: chunks.map((c) => c.length),
    model: triageModel,
  });
  const cached = await getLlmOutput<number[]>(`triage-${dimension}`, inputHash, promptHash);
  if (cached) return cached;

  const numbered = chunks.map((c, i) => `[chunk ${i}]\n${c}`).join('\n\n');
  let indices: number[];
  try {
    const raw = await callTriageJson(
      `triage-${dimension}-${sectionId}`,
      system,
      `Section: ${sectionId} (${chunks.length} chunks)\n\n${numbered}\n\nReturn JSON: {"relevant": [chunk numbers]}`,
      triageModel,
      tracker,
    );
    const result = TriageSchema.parse(raw);
    indices = [...new Set(result.relevant.filter((i) => i >= 0 && i < chunks.length))].sort((a, b) => a - b);
    // Degenerate result (model returned nothing usable): keep everything rather
    // than silently dropping the section.
    if (indices.length === 0) indices = chunks.map((_, i) => i);
  } catch {
    // Triage failed (API/parse error) — fall back to keeping all chunks; the
    // caller's ceiling cap still bounds the size.
    indices = chunks.map((_, i) => i);
  }
  await putLlmOutput(`triage-${dimension}`, inputHash, promptHash, indices);
  return indices;
}

async function loadDimensionContext(
  filingMeta: FilingMeta,
  getSection: SectionLoader,
  proxyText: string | null,
  dimension: PrimaryDimensionKey,
  opts: { tracker?: CostTracker; triageModel?: string } = {},
): Promise<{ context: string; sourcesUsed: string[] }> {
  const requested = DIMENSION_SECTIONS[dimension];
  // Resolve bundled expansions: if a requested section is bundled into
  // another, include the bundled target's content too.
  const sectionLookup = new Map(filingMeta.sections.map((s) => [s.id, s]));
  const expanded = new Set<string>();
  for (const id of requested) {
    expanded.add(id);
    const sec = sectionLookup.get(id);
    if (sec?.bundled) {
      for (const b of sec.bundled) expanded.add(b);
    }
  }

  // Gather each routed source's full text.
  const sources: { id: string; text: string }[] = [];
  for (const id of expanded) {
    if (id === 'proxy') {
      if (proxyText) sources.push({ id: 'proxy', text: proxyText });
      continue;
    }
    const body = await getSection(id);
    if (body) sources.push({ id, text: body });
  }
  if (sources.length === 0) return { context: '', sourcesUsed: [] };

  // Fits whole under the ceiling — include everything, no triage call. This is
  // the common case (most filers, and any dimension whose routed sections are
  // modest), so it costs nothing extra.
  const totalSize = sources.reduce((n, s) => n + s.text.length, 0);
  if (totalSize <= PER_DIMENSION_CEILING) {
    const parts = sources.map((s) => `### ${s.id} (${s.text.length.toLocaleString()} chars)\n\n${s.text}`);
    return { context: parts.join('\n\n---\n\n'), sourcesUsed: sources.map((s) => s.id) };
  }

  // Oversized: triage each large source down to the chunks that bear on this
  // dimension. A source that already fits within half the ceiling is kept whole
  // (not worth a triage call); only the genuinely large ones are triaged.
  const triageModel = opts.triageModel ?? TRIAGE_MODEL;
  const queryTerms = DIMENSION_QUERY_TERMS[dimension];
  const selected: { id: string; chunks: string[]; kept: number[]; selectedLen: number; original: number }[] = [];
  for (const { id, text } of sources) {
    const chunks = chunkText(text, TRIAGE_CHUNK_SIZE);
    const keepWhole = text.length <= Math.floor(PER_DIMENSION_CEILING / 2);
    const kept = keepWhole
      ? chunks.map((_, i) => i)
      : await triageSection(id, chunks, dimension, opts.tracker, triageModel);
    const selectedLen = kept.reduce((n, i) => n + chunks[i]!.length, 0);
    selected.push({ id, chunks, kept, selectedLen, original: text.length });
  }

  // If the combined relevant content still exceeds the ceiling, water-fill the
  // ceiling across sources by their relevant size and keep each source's
  // highest-lexical-score chunks up to its allocation.
  const combined = selected.reduce((n, s) => n + s.selectedLen, 0);
  const allocations =
    combined <= PER_DIMENSION_CEILING
      ? selected.map((s) => s.selectedLen)
      : allocateBudget(selected.map((s) => s.selectedLen), PER_DIMENSION_CEILING);

  const parts: string[] = [];
  const used: string[] = [];
  for (let i = 0; i < selected.length; i++) {
    const s = selected[i]!;
    const alloc = allocations[i]!;
    if (alloc <= 0) continue;
    let keepIdx = s.kept;
    if (s.selectedLen > alloc) {
      const ranked = [...s.kept].sort(
        (a, b) => scoreChunk(s.chunks[b]!, queryTerms) - scoreChunk(s.chunks[a]!, queryTerms) || a - b,
      );
      const take: number[] = [];
      let usedChars = 0;
      for (const ci of ranked) {
        if (usedChars + s.chunks[ci]!.length > alloc) continue;
        take.push(ci);
        usedChars += s.chunks[ci]!.length;
      }
      keepIdx = take.sort((a, b) => a - b);
    }
    // Reassemble kept chunks in document order, marking elided gaps.
    const out: string[] = [];
    let prev = -1;
    for (const ci of keepIdx) {
      if (prev >= 0 && ci > prev + 1) out.push('\n\n[… non-relevant content omitted …]\n\n');
      out.push(s.chunks[ci]!);
      prev = ci;
    }
    if (prev >= 0 && prev < s.chunks.length - 1) out.push('\n\n[… non-relevant content omitted …]');
    const selText = out.join('');
    const note =
      selText.length < s.original
        ? `${selText.length.toLocaleString()} of ${s.original.toLocaleString()} chars, triage-selected`
        : `${s.original.toLocaleString()} chars`;
    parts.push(`### ${s.id} (${note})\n\n${selText}`);
    used.push(s.id);
  }
  return { context: parts.join('\n\n---\n\n'), sourcesUsed: used };
}

export type PrimarySourceRunOptions = {
  tracker?: CostTracker;
  onProgress?: (stage: string, costSoFar: number) => void;
};

// Build the dimension's primary-source context block. Pass 1, 2, and 3 each
// send this as the leading (cached) `system` block, IDENTICALLY, so all three
// passes share one cached copy of the ~18k-token context instead of every
// pass re-sending it at full input rate. The bytes must match exactly across
// passes for the cross-pass prompt cache to hit — keep this the single source
// of truth and never interpolate pass-specific text into it.
function buildSharedContextBlock(
  dimension: PrimaryDimensionKey,
  context: string,
  financialContext: string,
  includeFinancial: boolean,
): string {
  return (
    `Primary-source sections for the **${dimension}** dimension ` +
    `(do not invent content from sections not provided):\n\n${context}` +
    (includeFinancial ? `\n\n--- Financial context ---\n${financialContext}` : '')
  );
}

// Pass 1 only. Returns the parsed PrimarySourceChecklist. Each dimension is
// scored in its own LLM call so that (a) the model sees only the
// dimension-routed sections (avoiding the moat-laundering risk), and
// (b) we can cache per-dimension and skip re-running stable dimensions
// when only one dimension's prompt was edited.
export async function runPrimarySourcePass1(
  ticker: string,
  options: PrimarySourceRunOptions & {
    snapshot?: FinancialSnapshot | null;
    dcf?: ReverseDcfReport | null;
    // Force triple-sampling for every dimension regardless of variance
    // history. Default is adaptive: tight dimensions (range ≤ 0.5 in the
    // prior run with this prompt) drop to single-sample; everything else
    // triple-samples.
    forceTriple?: boolean;
    // Model override for Pass 1 only (defaults to Sonnet 4.6). Tested with
    // Haiku 4.5 — see `scripts/compare-pass1-models.ts` for the comparison
    // harness used to validate Haiku's quality before switching.
    pass1Model?: string;
  } = {},
): Promise<PrimarySourceChecklist> {
  const tracker = options.tracker ?? newCostTracker(options.onProgress
    ? (t) => options.onProgress!('primary-source', t)
    : undefined);
  const { meta, getSection } = await fetchAndParseFiling(ticker, '10-K');
  const proxy = await fetchLatestProxy(ticker);
  const proxyText = proxy?.cleanedText ?? null;
  const promptText = await loadPrompt('primary-source-checklist');
  const promptHash = createHash('sha1').update(promptText).digest('hex').slice(0, 12);
  // Load prior variance history for this ticker. Used to decide adaptive
  // sample counts per dimension. Null on the first run for a ticker.
  const varianceHistory = await loadVarianceHistory(ticker);
  const forceTriple = options.forceTriple === true;
  // Pre-load financial context if not provided (callers from analyze-ticker
  // already have it; standalone callers don't).
  const snapshot = options.snapshot ?? (await fetchFinancialSnapshot(ticker));
  const dcf = options.dcf ?? (snapshot ? buildReverseDcf(snapshot) : null);
  const financialContext = renderFinancialContext(snapshot, dcf);

  // Adaptive Pass 1 sampling: dimensions whose prior run had tight
  // variance (range ≤ 0.5) single-sample on subsequent runs; everything
  // else (uncertain, or no prior history, or prompt changed) triple-samples.
  // The returned value uses the median score and the rationale/citations
  // from the representative sample (closest to median; the only sample
  // when single-sampled). The range across numeric samples is surfaced as
  // a confidence indicator (range = 0 for single-sample dimensions).
  const MAX_SAMPLES = 3;

  type SingleSampleOutput = z.infer<typeof SingleDimensionSchema>;

  async function runOneSample(
    key: PrimaryDimensionKey,
    sampleIndex: number,
    totalSamples: number,
    context: string,
    sourcesUsed: string[],
    includeFinancial: boolean,
  ): Promise<SingleSampleOutput> {
    const inputHash = hashInputs({
      ticker: ticker.toUpperCase(),
      accession: meta.accession,
      proxyAccession: proxy?.accession ?? null,
      dimension: key,
      sourcesUsed,
      contextLength: context.length,
      financialContextDate: includeFinancial ? snapshot?.asOf : null,
      sampleIndex,
      totalSamples,
      model: options.pass1Model ?? 'default',
    });
    const cached = await getLlmOutput<SingleSampleOutput>(`ps1-${key}`, inputHash, promptText);
    if (cached) return cached;
    // System layout (shared across Pass 1/2/3 so the context caches once):
    //   block 1: the dimension context (cached, 5m TTL) — reused by Pass 2/3.
    //   block 2: the pass persona/rubric prompt (cached, default TTL).
    // The user message carries only the small, pass-specific framing + the
    // per-sample marker (the marker is what creates the variance we want —
    // samples 1/2/3 produce different outputs over identical cached context).
    const contextBlock = buildSharedContextBlock(key, context, financialContext, includeFinancial);
    const userMessage =
      `Score the following dimension only: **${key}**\n\n` +
      `Ticker: ${ticker.toUpperCase()}\n` +
      `Filing: 10-K accession ${meta.accession} (${meta.filingDate})\n` +
      (proxy ? `Proxy: DEF 14A accession ${proxy.accession} (${proxy.filingDate})\n` : '') +
      (totalSamples > 1
        ? `\nThis is independent sample ${sampleIndex + 1} of ${totalSamples}.\n\n`
        : `\n`) +
      `Return JSON for ONLY this dimension, in the shape:\n` +
      `{ "score": <1-10 number or "insufficient">, "rationale": "...", "citations": [{"section": "...", "quote": "...", "whyItMatters": "..."}], "counterEvidence": "..." }\n` +
      `(Or for insufficient: { "score": "insufficient", "reason": "..." })\n` +
      `Output JSON only.`;
    const result = await llmCallJson({
      stage: `primary-source-${key}-s${sampleIndex}`,
      systemPrompt: [
        { text: contextBlock, cache: true },
        { text: promptText, cache: true },
      ],
      userMessage,
      schema: SingleDimensionSchema,
      maxTokens: 4096,
      tracker,
      model: options.pass1Model,
    });
    await putLlmOutput(`ps1-${key}`, inputHash, promptText, result);
    return result;
  }

  // Median across an odd-length array (we always send 3 samples, but some may
  // come back insufficient — the numeric subset can be any length 1-3).
  function medianOf(nums: number[]): number {
    if (nums.length === 0) return Number.NaN;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = sorted.length >>> 1;
    return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  }

  const dimensionResults: Record<string, unknown> = {};
  // Track variance updates for persistence at the end of the run.
  const varianceUpdates: Record<string, DimensionVariance> = {};
  for (const key of PRIMARY_DIMENSION_KEYS) {
    options.onProgress?.(`primary-source:${key}`, tracker.total);
    const { context, sourcesUsed } = await loadDimensionContext(meta, getSection, proxyText, key, { tracker });
    if (!context.length) {
      dimensionResults[key] = { score: 'insufficient', reason: `No primary-source content available for ${key} (sections: ${DIMENSION_SECTIONS[key].join(', ')})` };
      continue;
    }
    const includeFinancial = VALUATION_AWARE_DIMENSIONS.has(key) && financialContext.length > 0;
    // Decide sample count. Tight prior history (range ≤ 0.5 with the same
    // prompt) → 1 sample. Otherwise (no history, prompt changed, or prior
    // wide variance) → 3 samples. forceTriple overrides to 3.
    const totalSamples = decideSampleCount(varianceHistory, key, promptHash, forceTriple);
    let samples: SingleSampleOutput[];
    if (totalSamples === 1) {
      samples = [await runOneSample(key, 0, 1, context, sourcesUsed, includeFinancial)];
    } else {
      // For triple-sampling: sample 0 runs first to populate the prompt
      // cache, then samples 1 and 2 run in parallel and read from cache.
      // Running all 3 in parallel would race to write the cache, defeating
      // the purpose. Serialization adds ~5s but halves Pass 1 input cost.
      const sample0 = await runOneSample(key, 0, MAX_SAMPLES, context, sourcesUsed, includeFinancial);
      const [sample1, sample2] = await Promise.all([
        runOneSample(key, 1, MAX_SAMPLES, context, sourcesUsed, includeFinancial),
        runOneSample(key, 2, MAX_SAMPLES, context, sourcesUsed, includeFinancial),
      ]);
      samples = [sample0, sample1, sample2];
    }
    // Partition samples into numeric scores vs insufficient.
    const numericIndices: number[] = [];
    const numericScores: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      if (typeof s.score === 'number') {
        numericIndices.push(i);
        numericScores.push(s.score);
      }
    }
    if (numericScores.length === 0) {
      // All 3 came back insufficient — collapse to the first one's reason.
      const first = samples[0]! as { score: 'insufficient'; reason: string };
      dimensionResults[key] = first;
      continue;
    }
    const median = medianOf(numericScores);
    const range = Math.max(...numericScores) - Math.min(...numericScores);
    // Pick the representative sample: numeric sample whose score is closest
    // to the median. This is the rationale/citations we surface to the user
    // and that Pass 2/Pass 3 use as Pass 1 reasoning.
    let bestIdx = numericIndices[0]!;
    let bestDist = Math.abs(numericScores[0]! - median);
    for (let i = 1; i < numericIndices.length; i++) {
      const d = Math.abs(numericScores[i]! - median);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = numericIndices[i]!;
      }
    }
    const representative = samples[bestIdx]! as Extract<SingleSampleOutput, { score: number }>;
    dimensionResults[key] = {
      score: median,
      rationale: representative.rationale,
      citations: representative.citations,
      counterEvidence: representative.counterEvidence,
      samples: numericScores,
      range,
      representativeSampleIndex: bestIdx,
    };
    // Record this dimension's variance for the persisted history. Even
    // single-sample dimensions are recorded (range = 0) — that's the
    // current "best estimate" of variance, and re-runs will keep using
    // single-sample as long as the score stays consistent.
    varianceUpdates[key] = {
      range,
      samples: numericScores,
      asOf: new Date().toISOString(),
    };
  }
  // Persist variance history so subsequent runs can adaptive-sample.
  if (Object.keys(varianceUpdates).length > 0) {
    await recordVariance(ticker, promptHash, varianceUpdates);
  }

  const checklist: PrimarySourceChecklist = {
    ticker: ticker.toUpperCase(),
    filingAccession: meta.accession,
    scores: dimensionResults as PrimarySourceChecklist['scores'],
  };
  // Validate the assembled object against the schema as a final sanity check.
  return PrimarySourceChecklist.parse(checklist);
}

// ---- Pass 2: skeptic ----

const SkepticDimensionSchema = z.object({
  rebuttal: z.string(),
  citations: z.array(
    z.object({
      section: z.string(),
      quote: z.string(),
      whyItMatters: z.string(),
    }),
  ),
  recommendedAdjustment: z.number().min(-3).max(1.5),
});

// Pass 2: per-dimension skeptic call. Sees ONLY the Pass 1 numerical score
// (not its reasoning/citations) plus the same primary-source sections. The
// "see only the score" constraint is structural: if the skeptic saw Pass 1's
// reasoning, it would just rebut the reasoning rather than building an
// independent counter-case from sources. Forcing it to start from sources
// produces genuinely different evidence.
export async function runPrimarySourcePass2(
  ticker: string,
  pass1: PrimarySourceChecklist,
  options: PrimarySourceRunOptions & {
    snapshot?: FinancialSnapshot | null;
    dcf?: ReverseDcfReport | null;
  } = {},
): Promise<PrimarySourceSkeptic> {
  const tracker = options.tracker ?? newCostTracker(options.onProgress
    ? (t) => options.onProgress!('primary-source-skeptic', t)
    : undefined);
  const { meta, getSection } = await fetchAndParseFiling(ticker, '10-K');
  const proxy = await fetchLatestProxy(ticker);
  const proxyText = proxy?.cleanedText ?? null;
  const promptText = await loadPrompt('primary-source-skeptic');
  const snapshot = options.snapshot ?? (await fetchFinancialSnapshot(ticker));
  const dcf = options.dcf ?? (snapshot ? buildReverseDcf(snapshot) : null);
  const financialContext = renderFinancialContext(snapshot, dcf);

  const rebuttalResults: Record<string, unknown> = {};
  for (const key of PRIMARY_DIMENSION_KEYS) {
    options.onProgress?.(`primary-source-skeptic:${key}`, tracker.total);
    const { context, sourcesUsed } = await loadDimensionContext(meta, getSection, proxyText, key, { tracker });
    if (!context.length) {
      rebuttalResults[key] = {
        rebuttal: 'No primary-source content available to evaluate.',
        citations: [],
        recommendedAdjustment: 0,
      };
      continue;
    }
    // Render the Pass 1 score and the counter-evidence Pass 1 already
    // articulated. The skeptic uses the counter-evidence section to
    // perform a no-counter-evidence pre-check: if Pass 1 already named
    // the concern the skeptic would raise, recommend 0. We deliberately
    // continue to omit Pass 1's rationale and citations so the skeptic's
    // own evidence-gathering remains independent.
    const pass1Dim = pass1.scores[key];
    const pass1ScoreOnly = isInsufficientPrimary(pass1Dim) ? 'insufficient' : pass1Dim.score;
    const pass1CounterEvidence = isInsufficientPrimary(pass1Dim) ? '' : pass1Dim.counterEvidence;

    const includeFinancial = VALUATION_AWARE_DIMENSIONS.has(key) && financialContext.length > 0;
    const inputHash = hashInputs({
      ticker: ticker.toUpperCase(),
      accession: meta.accession,
      proxyAccession: proxy?.accession ?? null,
      dimension: key,
      pass1ScoreOnly, // include in cache key so re-running with a different Pass 1 score invalidates
      pass1CounterEvidenceLen: pass1CounterEvidence.length,
      sourcesUsed,
      contextLength: context.length,
      financialContextDate: includeFinancial ? snapshot?.asOf : null,
    });
    const cached = await getLlmOutput<unknown>(`ps2-${key}`, inputHash, promptText);
    if (cached) {
      rebuttalResults[key] = cached;
      continue;
    }
    // The primary-source sections (+ financial context) are sent as the shared
    // cached system block — identical to Pass 1/3 so it reads from cache rather
    // than re-paying full input. The user message carries only pass-specific bits.
    const contextBlock = buildSharedContextBlock(key, context, financialContext, includeFinancial);
    const userMessage =
      `Audit the following dimension only: **${key}**\n\n` +
      `Ticker: ${ticker.toUpperCase()}\n` +
      `Filing: 10-K accession ${meta.accession} (${meta.filingDate})\n` +
      (proxy ? `Proxy: DEF 14A accession ${proxy.accession} (${proxy.filingDate})\n` : '') +
      `\nThe primary-source sections for this dimension are in the system context above.\n` +
      `\n--- Pass 1 score ---\n${pass1ScoreOnly}\n` +
      `\n--- Pass 1 counter-evidence (concerns already considered; do not re-raise these) ---\n` +
      (pass1CounterEvidence || '(none provided)') +
      `\n\nReturn JSON for ONLY this dimension, in the shape:\n` +
      `{ "rebuttal": "...", "citations": [{"section": "...", "quote": "...", "whyItMatters": "..."}], "recommendedAdjustment": <number from -3.0 to +1.5; default 0> }\n` +
      `Remember: 0 is the expected default. Only deviate if you have specific primary-source evidence Pass 1's counter-evidence section did not address.\n` +
      `Output JSON only.`;
    const result = await llmCallJson({
      stage: `primary-source-skeptic-${key}`,
      systemPrompt: [
        { text: contextBlock, cache: true },
        { text: promptText, cache: true },
      ],
      userMessage,
      schema: SkepticDimensionSchema,
      maxTokens: 3072,
      tracker,
    });
    await putLlmOutput(`ps2-${key}`, inputHash, promptText, result);
    rebuttalResults[key] = result;
  }

  const skeptic: PrimarySourceSkeptic = {
    ticker: ticker.toUpperCase(),
    filingAccession: meta.accession,
    rebuttals: rebuttalResults as PrimarySourceSkeptic['rebuttals'],
  };
  return PrimarySourceSkeptic.parse(skeptic);
}

// ---- Pass 3: judge ----

const JudgeDimensionSchema = z.object({
  finalScore: z.number().min(1).max(10),
  decision: z.enum(['agreed-with-pass1', 'agreed-with-pass2', 'split', 'no-change']),
  justification: z.string(),
});

// Pass 3 sees BOTH Pass 1 (full output: score + reasoning + citations) AND
// Pass 2 (rebuttal + citations + recommendedAdjustment), plus the original
// primary-source sections. Frames as judge: which side's evidence is
// stronger? Outputs final scores per dimension.
export async function runPrimarySourcePass3(
  ticker: string,
  pass1: PrimarySourceChecklist,
  pass2: PrimarySourceSkeptic,
  options: PrimarySourceRunOptions & {
    snapshot?: FinancialSnapshot | null;
    dcf?: ReverseDcfReport | null;
  } = {},
): Promise<PrimarySourceJudgment> {
  const tracker = options.tracker ?? newCostTracker(options.onProgress
    ? (t) => options.onProgress!('primary-source-judge', t)
    : undefined);
  const { meta, getSection } = await fetchAndParseFiling(ticker, '10-K');
  const proxy = await fetchLatestProxy(ticker);
  const proxyText = proxy?.cleanedText ?? null;
  const promptText = await loadPrompt('primary-source-judge');
  const snapshot = options.snapshot ?? (await fetchFinancialSnapshot(ticker));
  const dcf = options.dcf ?? (snapshot ? buildReverseDcf(snapshot) : null);
  const financialContext = renderFinancialContext(snapshot, dcf);

  const judgments: Record<string, unknown> = {};
  for (const key of PRIMARY_DIMENSION_KEYS) {
    options.onProgress?.(`primary-source-judge:${key}`, tracker.total);
    const { context, sourcesUsed } = await loadDimensionContext(meta, getSection, proxyText, key, { tracker });
    if (!context.length) {
      judgments[key] = {
        finalScore: 5.5,
        decision: 'no-change',
        justification: 'No primary-source content available; default to neutral midpoint.',
      };
      continue;
    }
    const pass1Dim = pass1.scores[key];
    const pass2Dim = pass2.rebuttals[key];

    const includeFinancial = VALUATION_AWARE_DIMENSIONS.has(key) && financialContext.length > 0;
    const inputHash = hashInputs({
      ticker: ticker.toUpperCase(),
      accession: meta.accession,
      dimension: key,
      pass1: pass1Dim,
      pass2: pass2Dim,
      sourcesUsed,
      contextLength: context.length,
      financialContextDate: includeFinancial ? snapshot?.asOf : null,
    });
    const cached = await getLlmOutput<unknown>(`ps3-${key}`, inputHash, promptText);
    if (cached) {
      judgments[key] = cached;
      continue;
    }
    // Render Pass 1 for the judge: full score, rationale, citations,
    // counter-evidence. The judge is supposed to see the whole picture.
    const pass1Render = isInsufficientPrimary(pass1Dim)
      ? `Pass 1 marked this dimension "insufficient": ${pass1Dim.reason}`
      : `Pass 1 score: ${pass1Dim.score}\n` +
        `Pass 1 rationale: ${pass1Dim.rationale}\n` +
        `Pass 1 citations:\n` +
        pass1Dim.citations
          .map((c, i) => `  [${i}] (${c.section}) "${c.quote}" — ${c.whyItMatters}`)
          .join('\n') +
        `\nPass 1 counter-evidence: ${pass1Dim.counterEvidence}`;
    const pass2Render =
      `Pass 2 rebuttal: ${pass2Dim.rebuttal}\n` +
      `Pass 2 citations:\n` +
      pass2Dim.citations
        .map((c, i) => `  [${i}] (${c.section}) "${c.quote}" — ${c.whyItMatters}`)
        .join('\n') +
      `\nPass 2 recommended adjustment: ${pass2Dim.recommendedAdjustment}`;
    // Same shared cached system block as Pass 1/2; the judge verifies citations
    // against those sections (now in the system context above) and the separate
    // deterministic citation-verifier double-checks every quote post-hoc.
    const contextBlock = buildSharedContextBlock(key, context, financialContext, includeFinancial);
    const userMessage =
      `Judge the following dimension only: **${key}**\n\n` +
      `Ticker: ${ticker.toUpperCase()}\n` +
      `Filing: 10-K accession ${meta.accession} (${meta.filingDate})\n` +
      `\nThe primary-source sections for this dimension are in the system context above; verify either side's citations against them.\n` +
      `\n--- Pass 1 (original) ---\n${pass1Render}\n` +
      `\n--- Pass 2 (skeptic) ---\n${pass2Render}\n` +
      `\nReturn JSON for ONLY this dimension:\n` +
      `{ "finalScore": <1-10>, "decision": "agreed-with-pass1"|"agreed-with-pass2"|"split"|"no-change", "justification": "..." }\n` +
      `Output JSON only.`;
    const result = await llmCallJson({
      stage: `primary-source-judge-${key}`,
      systemPrompt: [
        { text: contextBlock, cache: true },
        { text: promptText, cache: true },
      ],
      userMessage,
      schema: JudgeDimensionSchema,
      maxTokens: 1024,
      tracker,
    });
    await putLlmOutput(`ps3-${key}`, inputHash, promptText, result);
    judgments[key] = result;
  }

  const judgment: PrimarySourceJudgment = {
    ticker: ticker.toUpperCase(),
    filingAccession: meta.accession,
    finalScores: judgments as PrimarySourceJudgment['finalScores'],
  };
  return PrimarySourceJudgment.parse(judgment);
}

// Convenience wrapper: run all three passes sequentially. Loads the
// financial snapshot + reverse DCF once and threads them through all
// three passes so we don't re-fetch from Yahoo three times.
export async function runPrimarySourceFull(
  ticker: string,
  options: PrimarySourceRunOptions & {
    snapshot?: FinancialSnapshot | null;
    dcf?: ReverseDcfReport | null;
    forceTriple?: boolean;
  } = {},
): Promise<{
  pass1: PrimarySourceChecklist;
  pass2: PrimarySourceSkeptic;
  pass3: PrimarySourceJudgment;
}> {
  const snapshot = options.snapshot ?? (await fetchFinancialSnapshot(ticker));
  const dcf = options.dcf ?? (snapshot ? buildReverseDcf(snapshot) : null);
  const opts = { ...options, snapshot, dcf };
  const pass1 = await runPrimarySourcePass1(ticker, opts);
  const pass2 = await runPrimarySourcePass2(ticker, pass1, opts);
  const pass3 = await runPrimarySourcePass3(ticker, pass1, pass2, opts);
  return { pass1, pass2, pass3 };
}
