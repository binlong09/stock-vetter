// Pipeline-domain errors (YouTube transcript / ticker resolution). The shared
// base `PipelineError` and the LLM/cost-guard errors moved to
// @stock-vetter/core; we re-export them here so existing
// `import { PipelineError } from './errors.js'` and instanceof checks keep
// working unchanged.

import { PipelineError } from '@stock-vetter/core';

export { PipelineError, LLMValidationError, CostCeilingError } from '@stock-vetter/core';

export class MissingCaptionsError extends PipelineError {
  constructor(public readonly videoId: string) {
    super(`No English captions available for video ${videoId}.`);
    this.name = 'MissingCaptionsError';
  }
}

export class InvalidYoutubeUrlError extends PipelineError {
  constructor(url: string) {
    super(`Not a recognized YouTube URL: ${url}`);
    this.name = 'InvalidYoutubeUrlError';
  }
}

export class UnknownTickerError extends PipelineError {
  constructor(public readonly ticker: string) {
    super(`Unknown ticker: ${ticker}. No financial data available.`);
    this.name = 'UnknownTickerError';
  }
}
