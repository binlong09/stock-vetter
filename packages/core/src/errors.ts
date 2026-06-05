// Shared error types for the stock-vetter monorepo. `PipelineError` is the
// common base (kept under this name for backward compatibility with existing
// `instanceof` checks). LLM and cost-guard errors live here because both the
// pipeline and the signal tracker raise them. Domain-specific errors
// (YouTube/ticker) stay in packages/pipeline.

export class PipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipelineError';
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
