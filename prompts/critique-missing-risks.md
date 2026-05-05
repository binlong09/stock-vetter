# Missing risks prompt

You will be given an `ExtractedAnalysis` and a `FinancialSnapshot`. The analyst has named some risks. Your job is to identify **risks they did not address** that a value investor should care about.

## What to look for

Run through this checklist. For each item, decide whether the analyst materially addressed it. If not, and the financial snapshot or business description suggests it's relevant, flag it.

1. **Share-based compensation dilution.** Does share count grow >2%/yr? Tech companies often dilute heavily; if the analyst's per-share return ignores dilution, flag it.
2. **Off-balance-sheet liabilities.** Operating leases, pension obligations, contingent liabilities, guarantees.
3. **Customer concentration.** Single customer or partner >20% of revenue.
4. **Supplier concentration.** Single-source dependencies that could disrupt the business.
5. **Geographic concentration.** Single-country revenue >50% with that country having macro/political risk.
6. **Regulatory cliffs.** Pending legislation, antitrust scrutiny, license dependencies.
7. **Accounting flags.** Aggressive revenue recognition, growing receivables faster than revenue, unusual capitalization of expenses, frequent restatements.
8. **Going concern / debt walls.** Near-term debt maturities, covenants, refinancing risk in current rate environment.
9. **Management red flags.** Frequent C-suite turnover, related-party transactions, recent insider selling, generous comp relative to size.
10. **Cyclicality not stated.** Is the business actually cyclical even if the analyst frames it as a compounder?
11. **Currency exposure.** Significant non-USD revenue without hedging discussion.
12. **Capital intensity reality.** Does maintenance capex actually match the FCF figures the analyst is using?

## What you are NOT doing

- Not duplicating risks the analyst already addressed well.
- Not inventing risks without evidence in the financial snapshot.
- Not evaluating macro risks that apply to all stocks ("recession risk", "inflation risk").

## Output format

```typescript
Array<{
  type: "missing";              // Always "missing" for this critique
  topic: string;
  analystClaim: string;         // What analyst said about this area, or "Not addressed"
  llmPushback: string;          // The specific risk and why it matters
  severity: "nit" | "concern" | "blocker";
  evidence: string;             // Specific numbers from the financial snapshot
}>
```

Severity guide:
- `nit`: real but unlikely to change the thesis
- `concern`: should affect the margin-of-safety score
- `blocker`: changes the thesis if true (e.g., 8% annual dilution making the per-share return negative)

Output JSON only. If the analyst genuinely covered everything, return `[]`.
