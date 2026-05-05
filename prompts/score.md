# Scoring prompt

You will be given the complete output of the analysis pipeline: `ExtractedAnalysis`, `FinancialSnapshot`, and all five `Critiques`. Your job is to produce the final `ScoredAnalysis` — five dimension scores, the weighted overall score, the verdict bucket, the pros/cons table, and the things-to-verify list.

This is the synthesis step. The user will read your output and decide whether to investigate the stock further. Be precise, be conservative, and cite everything.

## The five dimensions

### 1. Business Quality (1–10)

How good is the underlying business? This is the value-investing checklist (moat, owner earnings, capital allocation, cyclicality awareness) plus qualitative factors from the extraction.

- 1–3: Poor business. Weak moat, deteriorating fundamentals, bad capital allocation.
- 4–6: Average to decent. Some advantages, real challenges.
- 7–8: High quality. Strong moat, good unit economics, durable.
- 9–10: Exceptional. Reserved for businesses that look like compounders 20+ years out.

Drivers (in order of weight):
- `valueChecklist.moatDurability` (heaviest)
- `valueChecklist.ownerEarningsQuality`
- `valueChecklist.capitalAllocation`
- `valueChecklist.cyclicalityAwareness`
- Qualitative factors from extraction

### 2. Financial Health (1–10)

Balance sheet strength and earnings quality.

- 1–3: Distressed or near-distressed. Solvency questions.
- 4–6: Adequate. Manageable but not strong.
- 7–8: Strong. Net cash or low leverage, consistent FCF.
- 9–10: Fortress balance sheet, decade of FCF growth, no realistic solvency risk.

Drivers:
- `valueChecklist.debtSustainability` (heaviest)
- `financialSnapshot.isProfitable`, `hasPositiveFcf`
- `financialSnapshot.shareCountTrend` (dilution penalty)
- Annual history consistency

### 3. Valuation Attractiveness (1–10)

Is the current price attractive relative to fundamentals?

- 1–3: Expensive. Trading well above peer median and own historical median with no clear catalyst.
- 4–6: Fair. Roughly in line with history and peers.
- 7–8: Attractive. Trading meaningfully below peers/history with explainable reasons.
- 9–10: Deep value. Multiple compression appears excessive given fundamentals.

Drivers:
- Current multiples vs `peRatio10yMedian`, `evEbit10yMedian`
- Comp critique findings
- Analyst's implied return (sanity check, not authority)
- FCF yield

### 4. Margin of Safety (1–10)

How robust is the thesis to bad outcomes?

This is the most important dimension and gets the highest weight. A business and price can both look great, but if the thesis only works under a narrow set of assumptions, margin of safety is low.

- 1–3: Thesis breaks under modestly worse assumptions. Stress test shows large negative deltas.
- 4–6: Thesis holds for moderate downside but not severe.
- 7–8: Thesis works even under fairly bear cases.
- 9–10: Even pessimistic assumptions produce acceptable returns. Rare.

Drivers:
- `stressTest` results (impliedReturnDelta in bear cases)
- `missingRisks` findings (each "concern" or "blocker" reduces score)
- Number of high-confidence assumptions in the thesis vs low-confidence
- Whether bear case still produces positive return

### 5. Analyst Rigor (1–10)

How well-done is the analysis itself? This is meta — about the analyst's process, not the company.

- 1–3: Sloppy. Hand-wavy assumptions, no math, missing major risks.
- 4–6: Standard YouTube quality. Some rigor but gaps.
- 7–8: Strong. Explicit assumptions, sensitivity, cited comps, acknowledges uncertainty.
- 9–10: Exceptional. Multiple scenarios, well-defended assumptions, fair treatment of bear case.

Drivers:
- `consistency` findings (each blocker drops a point)
- Ratio of "addressedWell" risks to total risks
- Whether valuation method is appropriate for the business
- Whether analyst stated their confidence levels honestly

## The weighting

```
weighted = 
  0.30 * marginOfSafety +
  0.25 * valuationAttractiveness +
  0.20 * businessQuality +
  0.15 * financialHealth +
  0.10 * analystRigor
```

## The verdict bucket

- weighted >= 8.0 → "Strong Candidate"
- weighted >= 6.0 → "Watchlist"
- weighted < 6.0 → "Pass"
- Any single dimension marked "Insufficient Data" → "Insufficient Data" regardless of weighted score

A dimension is "Insufficient Data" if you cannot score it with reasonable confidence given the inputs. This happens when:
- Financial snapshot is null or incomplete (Financial Health, Valuation Attractiveness)
- The analyst didn't address business quality factors and you have no other source (Business Quality)
- The analyst didn't lay out a valuation framework with assumptions (Margin of Safety)

Mark insufficient liberally. False precision is worse than admitting you don't know.

## The pros/cons table

5–10 rows, each with:
- `topic`: short label
- `analystView`: 1 sentence, the analyst's position
- `llmPushback`: 1 sentence, your synthesis of the relevant critique findings
- `agreement`: "agree" | "partial" | "disagree"

Mix pros and cons. Order by importance to the thesis. The most useful rows are the disagreements — surface those prominently.

## Things to verify

3–7 bullet points. Specific things the user should check themselves. Each must be:
- Concrete (not "research the business")
- Actionable (the user knows what to do)
- Tied to a specific concern (not generic)

Good: "Verify share-based compensation as % of revenue from latest 10-K — analyst didn't address this and shares outstanding grew 4.2%/yr last 3 years"
Bad: "Look into management quality"

## Reality check

Phase 1: always set `realityCheck: null`. Historical price data and post-video event lookups will be wired up in Phase 2 alongside the database; until then the field is unused.

## Insufficient Data

When you cannot score a dimension with reasonable confidence (financial snapshot null/incomplete, analyst didn't address the area, valuation framework absent), emit the dimension as the **insufficient** variant of the score union:

```json
"businessQuality": { "value": "insufficient", "reason": "Analyst did not discuss moat or unit economics and no fallback signal in financial snapshot." }
```

When you can score it, emit the **scored** variant:

```json
"businessQuality": { "value": 7, "rationale": "...", "citations": ["..."] }
```

Mark insufficient liberally. False precision is worse than admitting you don't know. Any dimension marked insufficient flips the overall verdict to "Insufficient Data" regardless of `weightedScore`.

## Output format

Strict JSON matching `ScoredAnalysis`. Each dimension is a discriminated union — choose ONE shape per dimension:

```typescript
type Dim =
  | { value: number; rationale: string; citations: string[] }
  | { value: "insufficient"; reason: string };

{
  scores: {
    businessQuality: Dim;
    financialHealth: Dim;
    valuationAttractiveness: Dim;
    marginOfSafety: Dim;
    analystRigor: Dim;
  };
  weightedScore: number;             // Computed per formula above, rounded to 1 decimal.
                                     // If any dimension is insufficient, exclude it from
                                     // the weighted sum and still emit a number (the
                                     // verdict will be flipped anyway).
  verdict: "Strong Candidate" | "Watchlist" | "Pass" | "Insufficient Data";
  prosConsTable: Array<{
    topic: string;
    analystView: string;
    llmPushback: string;
    agreement: "agree" | "partial" | "disagree";
  }>;
  thingsToVerify: string[];
  realityCheck: null;                // Always null in Phase 1.
}
```

Each `rationale` must cite at least one specific input. `citations` is an array of strings, each pointing to a specific finding (e.g., "stressTest[2]: bear case for lending NIM compression drops return by 6%") or a financial data point (e.g., "financialSnapshot.shareCountTrend: 'growing'").

Output JSON only. No commentary, no preamble.
