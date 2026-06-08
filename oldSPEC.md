# Stock Vetter — Project Spec

## What this is

A tool that takes a YouTube video of a fundamental stock analysis, extracts the analyst's thesis, runs an LLM critique against current financials, and produces a single quantified "decision card" with a 1–10 score, weighted pros/cons, and a list of things to verify yourself.

Built for value investing on established companies. Not a stock recommender. A second-pass critic that compresses 3 hours of due diligence into 5 minutes of focused review.

## Stack

- **Runtime**: Node.js 20+ (TypeScript)
- **Frontend**: Next.js 14 (App Router) + Tailwind
- **Database**: Turso (SQLite at edge) — already familiar from reseller project
- **Hosting**: Vercel
- **LLM**: Anthropic API, `claude-sonnet-4-6` for extraction and critique
- **Transcripts**: `youtube-transcript-api` (Python script invoked from Node) OR `youtubei.js` (pure Node)
- **Financials**: `yahoo-finance2` (Node, free) for prices/multiples; SEC EDGAR API for 10-year history

Use TypeScript end-to-end. No Python services unless `youtube-transcript-api` is meaningfully more reliable than `youtubei.js` — try the Node option first.

## Repository layout

```
stock-vetter/
├── apps/
│   └── web/                    # Next.js app
│       ├── app/
│       │   ├── page.tsx        # Dashboard (list of decision cards)
│       │   ├── video/[id]/     # Detail view
│       │   ├── new/            # Submit new video URL
│       │   └── api/
│       │       ├── ingest/     # POST URL → kicks off pipeline
│       │       └── videos/     # CRUD on stored videos
│       └── components/
│           ├── DecisionCard.tsx
│           ├── ScoreBreakdown.tsx
│           └── ProsConsTable.tsx
├── packages/
│   ├── pipeline/               # Core pipeline (no Next.js deps)
│   │   ├── src/
│   │   │   ├── transcript.ts   # YouTube transcript fetch
│   │   │   ├── financials.ts   # Yahoo + SEC data
│   │   │   ├── extract.ts      # LLM pass 1: structured extraction
│   │   │   ├── critique.ts     # LLM pass 2: multi-angle critique
│   │   │   ├── score.ts        # Compute weighted score
│   │   │   ├── normalize.ts    # Clean garbled transcript proper nouns
│   │   │   └── orchestrate.ts  # Top-level pipeline runner
│   │   └── prompts/            # All prompts as .md files
│   │       ├── normalize.md
│   │       ├── extract.md
│   │       ├── critique-consistency.md
│   │       ├── critique-stress-test.md
│   │       ├── critique-comps.md
│   │       ├── critique-missing-risks.md
│   │       ├── critique-value-checklist.md
│   │       └── score.md
│   └── schema/
│       └── src/
│           └── types.ts        # Zod schemas + TS types
├── scripts/
│   ├── run-pipeline.ts         # CLI: run pipeline on a URL, print card
│   └── eval.ts                 # Run on known-opinion stocks, compare
├── .env.example
├── package.json
└── README.md
```

Use a pnpm workspace. The pipeline package must be runnable standalone (no Next.js coupling) so the CLI works without the web app.

## Build order (strict)

Do not skip ahead. Each phase has a checkpoint where you stop and verify before moving on.

### Phase 1: Pipeline core, CLI only

1. `transcript.ts` — given a YouTube URL, return `{ videoId, title, channel, channelId, publishedAt, description, tags, chapters[], transcript, durationSeconds }`. Chapters parsed from description timestamps. Handle missing captions gracefully (throw a typed `MissingCaptionsError`). `channelId` is captured separately from `channel` (name) per the Future direction constraint #5. Implementation: try `youtubei.js` first; if it fails on a video, fall back to spawning `yt-dlp --write-auto-sub --skip-download --sub-lang en` and parsing the resulting VTT.
2. `financials.ts` — given a ticker, return `FinancialSnapshot` (see schema). 10 years of annual data + last 4 quarters + current price/multiples. If ticker unknown, return null and let the pipeline degrade gracefully.
3. `normalize.ts` — single LLM call to fix garbled proper nouns using description + tags as context. Cheap. Skip if transcript was manually uploaded (heuristic: very few all-caps clusters, normal punctuation).
4. `extract.ts` — LLM call producing `ExtractedAnalysis` (see schema). Strict JSON output, validated with Zod.
5. `critique.ts` — five separate LLM calls, one per critique angle, each returning structured findings. Run in parallel. The comps critique requires a peer set; peers are configured in `comps.ts` as a hand-edited `TICKER_PEERS` map. When a ticker has no peers configured, the comps critique is skipped and a single "config gap" finding is surfaced rather than running with a guess.
6. `score.ts` — deterministic function: takes extraction + critiques + financials, calls LLM once to produce `ScoredAnalysis` with the rubric below. The LLM must cite for every score.
7. `orchestrate.ts` — wires the above into one pipeline. Returns the full `DecisionCard`.

**Checkpoint 1**: Run `scripts/run-pipeline.ts` against the Sea Limited video. Output should be a markdown decision card to stdout. Verify by reading it: do the scores make sense? Do citations point to real transcript moments?

### Phase 2: Storage + persistence

8. Turso schema + migrations. Tables: `videos`, `extractions`, `critiques`, `scores`, `decision_cards`. Store everything keyed by `videoId`. Pipeline writes once; UI reads many times.
9. `scripts/eval.ts` — run pipeline on 3 stocks where you have a prior opinion. Diff the verdict bucket against your prior. Log disagreements with the LLM's reasoning.

**Checkpoint 2**: At least 5 videos stored. Eval script shows where LLM agrees/disagrees with you. If disagreement rate is >50%, prompts need tuning before moving on.

### Phase 3: Web app

10. `app/new/page.tsx` — form: paste URL, submit, see progress.
11. `app/api/ingest/route.ts` — kicks off pipeline. Long-running, so use streaming response or a job queue. For v1, just block (videos are <60s to process) and stream status updates.
12. `app/page.tsx` — dashboard. List of decision cards sorted by score. Filter by channel, ticker, date, verdict bucket.
13. `app/video/[id]/page.tsx` — detail view. Full decision card with all score citations expandable.
14. Components: `DecisionCard`, `ScoreBreakdown`, `ProsConsTable`, `RealityCheck`.

**Checkpoint 3**: 10+ videos in dashboard, can submit new ones via UI, detail view shows everything.

### Phase 4: Watchlist re-run (later)

15. Cron job that re-runs the *critique + score* (not extraction — transcript doesn't change) against fresh financials weekly. Diff scores over time. Surface drift.

Skip this until Phases 1–3 are solid.

## Schemas

See `packages/schema/src/types.ts`. Highlights:

```typescript
type FinancialSnapshot = {
  ticker: string;
  asOf: string; // ISO date
  price: number;
  marketCap: number;
  enterpriseValue: number;
  netCash: number;
  // Current multiples
  peRatio: number | null;
  evEbit: number | null;
  evSales: number | null;
  fcfYield: number | null;
  // 10-year medians for comparison
  peRatio10yMedian: number | null;
  evEbit10yMedian: number | null;
  // Annual history (10 years)
  annual: Array<{
    year: number;
    revenue: number;
    ebit: number;
    netIncome: number;
    fcf: number;
    sharesOutstanding: number; // tracks dilution
    roic: number | null;
    debtToEquity: number | null;
  }>;
  // Quality flags
  isProfitable: boolean;
  hasPositiveFcf: boolean;
  // Computed over a 3-year window to smooth one-off events (single buyback, secondary).
  // CAGR > +2%/yr → growing, < −1%/yr → shrinking, else flat.
  shareCountTrend: 'shrinking' | 'flat' | 'growing';
};

type ExtractedAnalysis = {
  ticker: string;
  companyName: string;
  analyst: string;
  videoDate: string;
  thesisOneLiner: string;
  segments: Array<{
    name: string;
    revenue?: number;
    ebit?: number;
    growthRate?: number;
    keyDrivers: string[];
    citation: { startSec: number; endSec: number };
  }>;
  competitiveLandscape: Array<{
    competitor: string;
    threatLevel: 'low' | 'medium' | 'high';
    analystView: string;
    citation: { startSec: number; endSec: number };
  }>;
  risks: Array<{
    risk: string;
    severity: 'low' | 'medium' | 'high';
    analystAddressedWell: boolean;
    citation: { startSec: number; endSec: number };
  }>;
  valuation: {
    method: string; // "DCF" | "10-year compounding" | "comps" | etc.
    timeHorizonYears: number;
    keyAssumptions: Array<{
      assumption: string;
      value: string;
      analystConfidence: 'low' | 'medium' | 'high';
      citation: { startSec: number; endSec: number };
    }>;
    impliedReturn?: { low: number; high: number };
    impliedPriceTarget?: number;
  };
  qualitativeFactors: {
    managementQuality: string;
    moat: string;
    insiderOwnership: string | null;
    capitalAllocation: string;
  };
};

type CritiqueFinding = {
  type: 'agree' | 'partial' | 'disagree' | 'missing';
  topic: string;
  analystClaim: string;
  llmPushback: string;
  severity: 'nit' | 'concern' | 'blocker';
  evidence: string; // financial data or transcript citation
};

// Stress-test findings carry a richer structure than the prompt's bear/base/bull triple
// because the LLM emits per-direction rationale + per-direction return delta.
type StressTestFinding = {
  assumption: string;
  baseValue: string;
  bearCase: { value: string; rationale: string; impliedReturnDelta: number };
  bullCase: { value: string; rationale: string; impliedReturnDelta: number };
  sensitivity: 'low' | 'medium' | 'high';
};

type Critiques = {
  consistency: CritiqueFinding[];
  stressTest: StressTestFinding[];
  comps: CritiqueFinding[];                // Empty + a "config gap" finding when no peers configured.
  missingRisks: CritiqueFinding[];
  valueChecklist: {
    moatDurability: { score: 1|2|3|4|5; rationale: string };
    ownerEarningsQuality: { score: 1|2|3|4|5; rationale: string };
    capitalAllocation: { score: 1|2|3|4|5; rationale: string };
    insiderAlignment: { score: 1|2|3|4|5; rationale: string };
    debtSustainability: { score: 1|2|3|4|5; rationale: string };
    cyclicalityAwareness: { score: 1|2|3|4|5; rationale: string };
  };
};

// Each scored dimension is a discriminated union: either a numeric score with
// rationale + citations, OR a sentinel marking the dimension insufficient.
// Downstream code MUST pattern-match on the union explicitly. Any single
// dimension being insufficient flips the overall verdict to "Insufficient Data".
type ScoredDimension =
  | { value: number; rationale: string; citations: string[] }
  | { value: 'insufficient'; reason: string };

type ScoredAnalysis = {
  scores: {
    businessQuality: ScoredDimension;
    financialHealth: ScoredDimension;
    valuationAttractiveness: ScoredDimension;
    marginOfSafety: ScoredDimension;
    analystRigor: ScoredDimension;
  };
  weightedScore: number;
  verdict: 'Strong Candidate' | 'Watchlist' | 'Pass' | 'Insufficient Data';
  prosConsTable: Array<{
    topic: string;
    analystView: string;
    llmPushback: string;
    agreement: 'agree' | 'partial' | 'disagree';
  }>;
  thingsToVerify: string[];
  // Phase 1: always null. Phase 2 will wire up historical price data and
  // post-video event lookups alongside the database.
  realityCheck: string | null;
};

type DecisionCard = {
  videoId: string;
  ticker: string;       // Indexed in Phase 2 — decision cards are keyed by (ticker, videoId).
  channelId: string;    // Captured at ingest for future analyst-rigor weighting in meta-cards.
  generatedAt: string;
  extraction: ExtractedAnalysis;
  critiques: Critiques;
  scored: ScoredAnalysis;
  financialSnapshot: FinancialSnapshot | null;  // null when ticker is unknown.
};
```

## Scoring weights (config, not hardcoded)

```typescript
export const DEFAULT_WEIGHTS = {
  marginOfSafety: 0.30,
  valuationAttractiveness: 0.25,
  businessQuality: 0.20,
  financialHealth: 0.15,
  analystRigor: 0.10,
};
```

Surface these in a settings page eventually. For v1, hardcoded is fine.

## Verdict bucketing

`anyInsufficient` is computed by pattern-matching on the `ScoredDimension` union — any dimension whose `value` is `'insufficient'` flips the verdict regardless of weighted score.

```typescript
function isInsufficient(d: ScoredDimension): d is { value: 'insufficient'; reason: string } {
  return d.value === 'insufficient';
}

function verdict(scores: ScoredAnalysis['scores'], weighted: number): Verdict {
  if (Object.values(scores).some(isInsufficient)) return 'Insufficient Data';
  if (weighted >= 8.0) return 'Strong Candidate';
  if (weighted >= 6.0) return 'Watchlist';
  return 'Pass';
}
```

The weighted-score helper excludes insufficient dimensions from the sum (they re-route to "Insufficient Data" anyway).

## Cost ceiling per video

Target: under $0.50 per video on Sonnet 4.6.

Breakdown:
- Normalize: ~$0.03
- Extract: ~$0.10
- Critique × 5 (parallel): ~$0.20 total
- Score: ~$0.05
- Buffer: ~$0.10

If a single video exceeds $0.75, log a warning. If it exceeds $1.50, abort and surface to user.

## Caching rules

- Transcript: cache forever, keyed by `videoId`
- Financial snapshot: cache 24h, keyed by `ticker`
- Extraction: cache forever (transcript doesn't change)
- Critique: re-run when financial snapshot is stale (>7 days)
- Score: re-run whenever critique re-runs

## Error handling

Fail loudly with typed errors. The pipeline should never silently produce a half-formed decision card. If extraction fails Zod validation, retry once with the validation error appended to the prompt; on second failure, surface to user with the raw LLM output for debugging.

## Eval harness (don't skip this)

`scripts/eval.ts` takes a list of `{ ticker, your_view: 'buy' | 'avoid' | 'unsure', notes: string }`. Runs pipeline on 1–2 representative videos per ticker. Outputs:

```
Ticker | Your view | LLM verdict | Agreement | LLM's main pushback
SE     | unsure    | Watchlist   | ✓         | Lending book growth pace
KO     | avoid     | Pass        | ✓         | Limited growth runway
BRK.B  | buy       | Watchlist   | partial   | Succession risk weight
```

Run this every time you change a prompt. If a prompt change flips agreement on a stock, decide deliberately whether the new behavior is right.

## What NOT to build in v1

- Multi-user accounts. Single user (you).
- Auto-discovery of new videos from channels. Manual URL submission only.
- Slack/email alerts. Just the dashboard.
- Portfolio tracking. This is a vetting tool, not a portfolio manager.
- Backtesting LLM scores against actual stock returns. Tempting, but the sample size won't be meaningful for years.

## Open questions for you to resolve before coding

1. Are you OK with sending transcripts to Anthropic's API? (Probably yes given existing usage, but worth confirming.)
2. Turso vs. local SQLite for v1? Local is simpler; Turso is better if you want it on Vercel.
3. Do you want the dashboard public or behind auth? If public, no PII in transcripts is fine; if you add personal notes, add auth.

Ship Phase 1 first. Don't touch the web app until the CLI produces decision cards you trust on 5+ videos.

## Future direction (read before designing schema)

A future phase will add **per-ticker meta-cards**: a single view that aggregates multiple analysts' decision cards for the same stock and produces a consensus view, divergence highlights, a rigor-weighted aggregate score, and a primary-source freshness check that compares the analysts' factual claims against the latest 10-K and earnings calls.

This is not built in Phase 1 or Phase 2. But the schema decisions made now must not foreclose it. Specifically:

1. **Decision cards are keyed by `(ticker, videoId)`**, not by `videoId` alone. Phase 2's database schema must reflect this. A `videos` table is fine; a `decision_cards` table must include `ticker` as an indexed column. Eventually a `tickers` table will be added with a `meta_card` JSON column that's null until the meta-card feature ships.

2. **Extraction must capture quantitative claims with enough precision to fact-check later.** When the analyst says "Sea has $10B net cash" or "lending book grew 80% YoY", the extraction must store the specific number, not a paraphrase like "strong cash position" or "rapid lending growth". If Phase 1 extraction is too vague to fact-check against a future 10-K, the fact-check pass won't work. Validate this on the Sea Limited test video: the extracted thesis should contain concrete numbers, not just qualitative summaries.

3. **The `ExtractedAnalysis.valuation.keyAssumptions` field is the contract for future fact-checking.** Each assumption with a specific numeric value will become a checkable claim later. Make sure the extraction prompt produces specific, falsifiable values here ("30% topline growth for 10 years"), not abstract ones ("aggressive growth trajectory").

4. **No video-centric URL routing in the web app.** When Phase 3 builds the dashboard, organize routes around tickers first (`/ticker/SE`) and videos second (`/ticker/SE/video/:id`). This way meta-cards slot in naturally at `/ticker/SE` without a routing refactor.

5. **Channel metadata should be stored.** When ingesting, capture channel name and channel ID separately. The future feature weights aggregate scores by analyst rigor, which means the system needs to track which analyst said what. This is essentially free to capture now and expensive to backfill later.

These five decisions cost nothing in Phase 1 but save a refactor later. Do not build the meta-card feature itself — just don't paint into a corner that prevents it.
