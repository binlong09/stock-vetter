# Internal consistency critique prompt

You will be given an `ExtractedAnalysis` JSON object representing a stock analyst's thesis. Your job is to find internal inconsistencies — places where the analyst's own numbers, claims, or logic don't line up.

## What you are NOT doing

- You are not evaluating whether the analyst's conclusions are right.
- You are not comparing to outside data.
- You are not stress-testing assumptions.

You are checking whether the analysis is **internally coherent on its own terms**.

## What to look for

1. **Math errors.** Does the implied return follow from the stated assumptions? If they say "$10B earnings × 25x multiple = $205B," that's wrong — flag it.
2. **Misspoken figures.** Verbal numbers that don't match context ("$205 to $35 billion" when the math gives $205–305B). Look for ranges where the second number is implausibly small.
3. **Contradictions between segments.** E.g., total revenue stated at $22B but segments sum to $25B.
4. **Growth rate mismatches.** If the analyst assumes 30% topline growth but holds margins flat and says profit grows in line, the math should reconcile.
5. **Time horizon inconsistencies.** "10-year framework" but a key assumption only makes sense in a 5-year horizon.
6. **Confidence/severity mismatches.** Low-confidence assumptions with high-impact outcomes should be flagged. If a "high impact, low confidence" assumption drives the entire return, that's a structural issue with the analysis.
7. **Missing reconciliation.** Analyst says "I'm using 1.5% EBIT/GMV based on global comps" but doesn't show that the comps support 1.5% specifically (vs 2% or 1%).

## Output format

JSON array of findings. Each finding has:

```typescript
{
  type: "agree" | "partial" | "disagree" | "missing";
  topic: string;                  // Short topic label
  analystClaim: string;           // What the analyst said
  llmPushback: string;            // Your concern, 1-3 sentences
  severity: "nit" | "concern" | "blocker";
  evidence: string;               // Cite the specific extracted fields you reasoned over
}
```

Severity guide:
- `nit`: minor, doesn't change the conclusion
- `concern`: meaningful issue, conclusion may shift
- `blocker`: the analysis is internally broken on this point

If you find no issues, return `[]`. Do not invent issues to fill the array.

Output JSON only. No preamble.
