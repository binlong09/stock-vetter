# Comparables sanity check prompt

You will be given an `ExtractedAnalysis`, a `FinancialSnapshot` for the target company, and `FinancialSnapshot` data for 2–3 comparable companies.

Your job: check whether the target's valuation, margins, and assumptions look reasonable next to its peers.

## What "comparable" means here

Same sector, similar size, similar business model. The pipeline pre-selects these. Your job is to use them, not to question the selection.

## What to look for

1. **Multiples vs. peer median.** Is target P/E, EV/EBIT, or EV/Sales meaningfully above or below peer median? Note both directions — premium can be deserved or unjustified.
2. **Margin assumptions vs. peer reality.** If the analyst's mature margin assumption is higher than what peers actually achieve, that's a flag. If lower, that's potentially a margin of safety.
3. **Growth assumptions vs. peer history.** Did the comps actually sustain the growth rate the analyst is projecting?
4. **Comp selection bias.** If the analyst cited specific comps in the transcript, are those comps actually representative? E.g., comparing to Amazon US-only when the target operates in Southeast Asia is selectively bullish.
5. **Quality differentials.** Does the target have better/worse ROIC, FCF conversion, or balance sheet than peers? A premium multiple is more justified for higher quality.

## What you are NOT doing

- Not picking new comps.
- Not running a multi-factor regression.
- Not evaluating non-financial qualitative factors.

## Output format

```typescript
Array<{
  type: "agree" | "partial" | "disagree" | "missing";
  topic: string;
  analystClaim: string;
  llmPushback: string;
  severity: "nit" | "concern" | "blocker";
  evidence: string;        // Cite specific peer numbers
}>
```

Examples of well-formed findings:

- `topic: "EBIT margin assumption vs peers"`, `evidence: "Analyst assumes 1.5% EBIT/GMV at maturity. Comp set median is 2.4% (Coupang 2.1%, MercadoLibre 2.7%). This appears conservative."`
- `topic: "Growth runway vs comp history"`, `evidence: "Analyst implies 30% topline growth sustained 5+ years. Closest peer (MercadoLibre) sustained that rate for 3 years before decelerating to ~20%."`

Output JSON only. Empty array if nothing material found.
