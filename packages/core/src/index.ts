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
  type FilingForm,
  type FilingMeta,
} from './sec-filings.js';
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
