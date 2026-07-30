// @stock-vetter/core — shared infrastructure consumed by both the analysis
// pipeline and the signal tracker. No domain logic lives here; it reaches into
// nothing but @stock-vetter/schema and third-party libs (strictly acyclic).

// LLM client, cost tracking, prompt caching, JSON-with-retry.
export {
  llmCall,
  llmCallJson,
  newCostTracker,
  summarizeCost,
  stripJsonFence,
  type CacheableSegment,
  type CostEntry,
  type CostTracker,
  type LLMCallResult,
} from './llm.js';

// Shared error types (base + LLM/cost). Domain errors stay in pipeline.
export { PipelineError, LLMValidationError, CostCeilingError } from './errors.js';

// Prompt .md loader.
export { loadPrompt, type PromptName } from './prompts.js';

// Filesystem cache (LLM outputs, SEC sections/meta, snapshots, video cards).
export {
  readCache,
  writeCacheEntry,
  deleteCacheEntry,
  cacheEntryMtime,
  getVideoCard,
  putVideoCard,
  snapshotKey,
  getSnapshot,
  putSnapshot,
  getSecSection,
  putSecSection,
  getSecFilingMeta,
  putSecFilingMeta,
  llmCacheKey,
  getLlmOutput,
  putLlmOutput,
  hashInputs,
} from './cache.js';

// SEC EDGAR fetch + parse (filings, sections, proxy).
export {
  fetchAndParseFiling,
  fetchLatestProxy,
  listFilings,
  fetchExhibits,
  fetchEightK,
  fetchFilingSectionsWithLayout,
  resolveCik,
  allTickerCiks,
  type FilingForm,
  type FilingMeta,
  type FilingRef,
  type ListFilingsOptions,
  type FilingExhibit,
  type EightKFiling,
  type LayoutSection,
} from './sec-filings.js';

// Rate-limited EDGAR HTTP. Every SEC request in the monorepo should go through
// this so the 10 req/s fair-access limit is enforced in exactly one place.
export { secFetch, secFetchText, secFetchJson, secFetchTextOrNull, SecHttpError } from './sec-http.js';

// Layout-preserving filing rendering — keeps financial tables as tables.
export {
  renderFilingLayout,
  locateSectionBlocks,
  blocksToMarkdown,
  type LayoutBlock,
} from './sec-layout.js';

// 8-K parsing + deterministic short-side item severity.
export {
  parseEightK,
  criticalItems,
  maxSeverity,
  EIGHTK_ITEMS,
  type EightKItem,
  type EightKItemDef,
  type ParsedEightK,
  type ItemSeverity,
} from './sec-8k.js';

// EDGAR daily-index sweep — one request covers the whole market for a day.
export {
  sweepFilings,
  fetchDailyIndex,
  parseMasterIdx,
  type IndexEntry,
  type SweepOptions,
} from './edgar-index.js';
export {
  parseFiling,
  type AnchorCandidate,
  type ExtractedSection,
  type ParseOptions,
  type ParseResult,
} from './sec-parser.js';
export {
  TENK_ITEMS,
  TENQ_ITEMS,
  EXPECTED_SECTION_LENGTHS,
  lengthConfidence,
  type ItemDef,
  type LengthExpectation,
} from './sec-constants.js';

// Financial snapshot (Yahoo + SEC companyfacts) and historical multiples.
export {
  fetchFinancialSnapshot,
  fetchPeerSnapshots,
  fetchHistoricalYearEndCloses,
  computeHistoricalMultiples,
  median,
} from './financials.js';

// Reverse-DCF teaching module.
export { buildReverseDcf, renderReverseDcfMarkdown } from './reverse-dcf.js';

// Turso (libSQL) client + migration runner.
export { isTursoConfigured, getTursoClient, migrate } from './turso.js';

// Generic Resend email sender (cron digests; magic-link email stays in web).
export { isMailerConfigured, sendEmail, type SendEmailInput } from './mailer.js';

// Alpha Vantage earnings-call transcript adapter + normalized-transcript cache.
export {
  fetchEarningsTranscript,
  fetchEarningsTranscriptOrNull,
  transcriptToText,
  getNormalizedTranscript,
  type EarningsTranscript,
  type TranscriptTurn,
  type NormalizedTranscript,
} from './av-transcript.js';
