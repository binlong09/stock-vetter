# Value investing checklist prompt

You will be given an `ExtractedAnalysis` and a `FinancialSnapshot`. Score the company against six value-investing criteria. This is for a buy-and-hold value investor (Buffett/Munger/Greenblatt school), not a deep-value cigar-butt investor.

For each criterion, give a 1–5 score and a 1–2 sentence rationale. Be conservative — 5s should be rare.

## Criteria

### 1. Moat durability

Does the business have a structural advantage that protects margins from competition?

- 1: No moat. Commodity business or losing to competitors.
- 2: Weak moat. Brand or scale that's eroding.
- 3: Moderate moat. Some advantage but contestable.
- 4: Strong moat. Network effects, switching costs, or scale that competitors haven't cracked in years.
- 5: Fortress moat. Regulated monopoly, unbreakable network effect, or 20+ year track record of margin expansion.

### 2. Owner earnings quality

Are reported earnings a fair representation of cash that could be returned to shareholders?

Compare net income to FCF over multiple years. Big gaps in either direction are flags.

- 1: Reported earnings ≫ FCF for years. Earnings are accounting fiction.
- 2: Persistent gap >30% with weak explanation.
- 3: Some gap but explainable (heavy reinvestment phase).
- 4: FCF tracks earnings closely; capex is appropriate.
- 5: FCF consistently exceeds earnings (negative working capital, capital-light model).

### 3. Capital allocation

How has management deployed cash over the past 5–10 years? Look at: buybacks at reasonable prices, dividends sustained through cycles, acquisitions with reasonable multiples, debt paydown when appropriate.

- 1: Destructive. Buybacks at peaks, expensive M&A, leverage to fund dividends.
- 2: Mediocre. No clear discipline.
- 3: Mixed track record.
- 4: Disciplined. Returns capital appropriately, pays for assets thoughtfully.
- 5: Best-in-class. Consistently allocates to highest-return options.

### 4. Insider alignment

Do insiders (especially the CEO) own meaningful stock? Are they buying or selling?

- 1: Minimal insider ownership, persistent insider selling.
- 2: Low ownership (<1% for founder-led, <0.1% otherwise), neutral activity.
- 3: Moderate ownership, no notable trading.
- 4: Significant ownership (>5% founder or >0.5% professional CEO), occasional buying.
- 5: Founder-led with >10% ownership, recent insider buying.

### 5. Debt sustainability

Can the company service debt comfortably across cycles?

Look at: net debt / EBITDA, interest coverage, debt maturity schedule, FCF coverage of interest.

- 1: Distressed. Leverage >5x EBITDA, near-term maturities.
- 2: Stretched. Leverage 3–5x with weak coverage.
- 3: Manageable. Leverage 2–3x, comfortable coverage.
- 4: Conservative. Leverage <2x, strong coverage, well-laddered maturities.
- 5: Net cash. No solvency risk under any reasonable scenario.

### 6. Cyclicality awareness

Does the analyst recognize cyclicality (if present) and have they normalized through cycles?

- 1: Treats cyclical business as compounder, uses peak earnings.
- 2: Acknowledges cyclicality but uses optimistic mid-cycle.
- 3: Reasonable mid-cycle assumptions.
- 4: Conservative through-cycle, accounts for trough scenarios.
- 5: Explicit trough-case modeling, margin of safety based on bad-times earnings.

If the business isn't cyclical, score 4 and note "non-cyclical business."

## Output format

```typescript
{
  moatDurability: { score: 1|2|3|4|5; rationale: string };
  ownerEarningsQuality: { score: 1|2|3|4|5; rationale: string };
  capitalAllocation: { score: 1|2|3|4|5; rationale: string };
  insiderAlignment: { score: 1|2|3|4|5; rationale: string };
  debtSustainability: { score: 1|2|3|4|5; rationale: string };
  cyclicalityAwareness: { score: 1|2|3|4|5; rationale: string };
}
```

Each rationale must cite a specific number from the financial snapshot or a specific claim from the extraction. Output JSON only.
