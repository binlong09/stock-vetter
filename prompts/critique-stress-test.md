# Assumption stress test prompt

You will be given an `ExtractedAnalysis` and a `FinancialSnapshot`. Your job is to take each key valuation assumption and produce a bear/base/bull range, then show how the implied return changes.

## What you are doing

For each `valuation.keyAssumptions` entry, generate three scenarios:

- **Bear**: a plausible-but-pessimistic value (10th percentile outcome)
- **Base**: the analyst's stated value (or your best read of it)
- **Bull**: a plausible-but-optimistic value (90th percentile outcome)

Plausibility is grounded in:
- The financial snapshot you're given (10-year history of the actual company)
- Industry norms for established businesses
- The analyst's own framing — if they call something "conservative," your bear case shouldn't be drastically more pessimistic than what they already used

## What you are NOT doing

- Not evaluating whether the analyst is right overall.
- Not introducing assumptions the analyst didn't make.
- Not modeling a fully new DCF. Vary one assumption at a time, holding others equal.

## Output format

JSON array, one entry per assumption that materially affects the return:

```typescript
{
  assumption: string;               // From extraction
  baseValue: string;                // Analyst's stated value
  bearCase: {
    value: string;
    rationale: string;              // Why this is plausible
    impliedReturnDelta: number;     // E.g., -0.08 for 8 points lower annualized return
  };
  bullCase: {
    value: string;
    rationale: string;
    impliedReturnDelta: number;
  };
  sensitivity: "low" | "medium" | "high";   // How much the return moves with this assumption
}
```

Order findings by sensitivity descending. Skip assumptions that don't materially move the return.

The `impliedReturnDelta` should be your best estimate, not a precise calculation. Round to nearest percentage point. If you can't estimate it, mark sensitivity "high" and write "directional only" in the rationale.

Output JSON only.
