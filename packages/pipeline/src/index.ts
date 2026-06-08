export { runPipeline } from './orchestrate.js';
export type { PipelineOptions, PipelineStage } from './orchestrate.js';
export { renderMarkdown } from './render.js';
export { fetchEarningsTranscriptBundle } from './transcript.js';
export {
  runTenqDelta,
  type TenqDeltaResult,
  type TenqDeltaSourceText,
  type TenqDeltaVerification,
} from './tenq-delta.js';
export { classifyMatch } from './citation-verifier.js';
export {
  MissingCaptionsError,
  UnknownTickerError,
  LLMValidationError,
  CostCeilingError,
  InvalidYoutubeUrlError,
  PipelineError,
} from './errors.js';
export { TICKER_PEERS, getPeers } from './comps.js';
export {
  isTursoConfigured,
  getTursoClient,
  migrate,
  pushTicker,
  pushTickerFromFixtures,
  addAllowedEmail,
  removeAllowedEmail,
  listAllowedEmails,
  type PushTickerInput,
} from './turso.js';
export {
  loadTickerFixtures,
  hasDecisionCard,
  type LoadedTickerFixtures,
} from './fixture-loader.js';

// ---- Re-exports from @stock-vetter/core ----------------------------------
// These moved to core in the Phase 3 extraction. We re-export them from the
// pipeline barrel so existing `@stock-vetter/pipeline` consumers (scripts) keep
// working unchanged; new code (signals) should import from @stock-vetter/core
// directly.
export {
  llmCall,
  llmCallJson,
  newCostTracker,
  summarizeCost,
  loadPrompt,
  fetchAndParseFiling,
  fetchFinancialSnapshot,
  buildReverseDcf,
  renderReverseDcfMarkdown,
  type CostTracker,
  type CacheableSegment,
  type PromptName,
  type FilingMeta,
} from '@stock-vetter/core';
