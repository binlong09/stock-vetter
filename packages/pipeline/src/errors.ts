export class PipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipelineError';
  }
}

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

export class LLMValidationError extends PipelineError {
  constructor(
    public readonly stage: string,
    public readonly validationError: string,
    public readonly rawOutput?: string,
  ) {
    super(`LLM output failed validation in stage "${stage}": ${validationError}`);
    this.name = 'LLMValidationError';
  }
}

export class CostCeilingError extends PipelineError {
  constructor(public readonly costSoFar: number) {
    super(`Pipeline aborted: cost exceeded $1.50 (current: $${costSoFar.toFixed(3)})`);
    this.name = 'CostCeilingError';
  }
}
