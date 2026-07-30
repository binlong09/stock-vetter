// @stock-vetter/local — the local-GPU short-side scanner.
//
// Four tiers, each doing only what it is best at:
//
//   1. Deterministic  — parse, render tables as tables, strip boilerplate,
//                       chunk. No model. `chunk.ts`, `boilerplate.ts`.
//   2. Local model    — per-chunk structured extraction on the RTX 5090 under
//                       a rigid schema, with every claim quote-verified
//                       against its source. `ollama.ts`, `extract.ts`.
//   3. Deterministic  — aggregate into one ~5k-token brief; score it and
//                       decide whether it is worth cloud spend and human
//                       attention. `brief.ts`, `triage.ts`.
//   4. Cloud model    — judgment, with the whole corpus reachable through
//                       local retrieval instead of the network.
//                       `synthesize.ts`, `lookback.ts`.

export { estimateTokens, truncateToTokens, tailToTokens } from './tokens.js';

export {
  stripBoilerplate,
  STRIP_RULES,
  type StripRule,
  type StripReport,
  type StripResult,
  type StripOptions,
} from './boilerplate.js';

export {
  chunkBlocks,
  chunkBodyOnly,
  OVERLAP_MARKER,
  OVERLAP_END_MARKER,
  TABLE_SPLIT_MARKER,
  type FilingChunk,
  type ChunkOptions,
  type ChunkSource,
} from './chunk.js';

export {
  OllamaClient,
  OllamaError,
  ContextOverflowError,
  stripFence,
  newLocalStats,
  summarizeLocalStats,
  type OllamaOptions,
  type LocalStats,
  type LocalUsage,
} from './ollama.js';

export { extractChunk, extractChunks, verifyQuotes, type ExtractOptions, type ExtractRunResult } from './extract.js';

export { buildFilingBrief, renderBriefMarkdown, type BriefSource, type BriefOptions } from './brief.js';

export { Embedder, packF32, unpackF32, cosineSimilarity, type EmbedOptions } from './embed.js';

export { extractSnippet, type Snippet } from './snippet.js';

export {
  LookbackIndex,
  toFtsQuery,
  type RetrievedPassage,
  type SearchFilters,
  type SearchOptions,
} from './lookback.js';

export { triage, CATEGORY_WEIGHT, SEVERITY_MULTIPLIER, type TriageDecision, type TriageOptions } from './triage.js';

export {
  synthesizeShortAssessment,
  buildVerificationTools,
  renderAssessmentMarkdown,
  type SynthesisOptions,
  type SynthesisResult,
} from './synthesize.js';

export {
  scanPrepared,
  scanLatestPeriodic,
  scanPeriodicByRef,
  scanEightK,
  preparePeriodicFiling,
  preparePeriodicFilingByRef,
  prepareEightK,
  markdownToBlocks,
  DEFAULT_SECTIONS,
  type ScanOptions,
  type ScanResult,
  type ScanDeps,
  type PreparedFiling,
} from './pipeline.js';
