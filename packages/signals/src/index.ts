export {
  FmpTierError,
  // Low-level FMP fetchers (source-shaped).
  fetchTranscriptDates,
  fetchEarningsTranscript,
  fetchLatestTranscript,
  fetchConsensusEstimates,
  fetchEstimateRevisions,
  // SEC EDGAR.
  fetchRecentSecFilings,
  // Event normalization + the per-ticker convenience aggregator.
  toSecEvent,
  toEstimatesEvent,
  toRevisionEvent,
  toManualEvent,
  toTranscriptEvent,
  mostRecentQuarter,
  fetchTickerEvents,
  type EarningsTranscript,
  type ConsensusEstimate,
  type EstimateRevision,
  type SecFiling,
} from './feeds.js';

export {
  Cursor,
  emptyCursor,
  loadCursor,
  saveCursor,
  diffEvents,
  type DiffResult,
} from './diff.js';

export {
  collapseRevisionsForEval,
  eventMapsToWatchItem,
  mapEventsToWatchItems,
  summarizeBullIndexTrend,
  buildTickerReverseDcf,
  evaluatePair,
  type QuantInputs,
  type EvaluationOutcome,
} from './evaluate.js';

export { renderThesisCard, provisionalStatus } from './render.js';

export { computeThesisStatus } from './theses.js';

export {
  detectFlips,
  renderDigest,
  type WatchItemFlip,
} from './digest.js';

export {
  isTursoConfigured,
  loadCursorFromTurso,
  saveCursorToTurso,
  loadThesisStatus,
  saveThesisStatus,
  saveSignals,
  saveThesisDefinition,
  saveEvaluations,
  loadSignalsForThesis,
  loadEvaluationsForThesis,
  acquireRunLock,
  releaseRunLock,
} from './persistence.js';
