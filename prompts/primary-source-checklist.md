# Primary-source value-investing checklist (Pass 1)

You are reading a company's most recent 10-K filing and proxy statement (DEF 14A) directly — not an analyst's summary. Score the company against six value-investing dimensions, citing specific passages from the primary sources for every claim.

This is the *teaching* output of the tool: a value-investing student should be able to read your scores and citations and learn *what to look for* in primary documents. Be specific about which sections you used and why those passages mattered.

For each dimension you will be given a *subset* of sections — the ones a careful value investor would actually read for that dimension. Do not invent claims about sections you weren't given. If the relevant content isn't in the sections you received, score "insufficient" and explain what was missing.

## How to score

Use a 1–10 scale, calibrated to the rubric below. Be conservative: 9–10 should be rare and reserved for businesses where the case is overwhelming. Most thoughtful scores will land 4–7.

For every score, you must:
- Provide a 2–4 sentence rationale that distinguishes this company from a generic peer.
- Cite at least 2 specific passages from the primary sources you were given. Each citation includes the section id (e.g., `risk-factors`, `financial-statements`) and a literal quoted phrase (10–30 words) from that section.
- Identify the strongest counter-evidence you found (or note "no significant counter-evidence" — but only if you genuinely looked).

### Citation format

Every citation's `quote` field must be a verbatim copy of continuous prose from the cited section — exactly as it appears in the source, including punctuation, capitalization, and phrasing. The intent is that a reader can `grep` the quote against the source file and find it.

Do not reformat tabular data, financial statements, or column-aligned numbers into single-line quote strings. A line like `"Share-based compensation 20,427 16,690 14,027"` may look quotable but is reformatted from a table — the source has those values in separate cells, separate years, separate column positions. That fails grep.

When the evidence you want to cite is *in a table* (a number, a row, a multi-year trend):
1. **Preferred:** find a sentence in the surrounding prose (the table's lead-in sentence, the MD&A narrative explaining it, a footnote describing the line item) that contextualizes the value, and quote *that sentence* verbatim. Tables are usually accompanied by such prose; use it.
2. **If no such prose exists:** in your `quote` field, write the table's heading or the row label as it literally appears (e.g., `"Cash flows from operating activities"`). In `whyItMatters`, describe the value you're inferring (e.g., "The 2025 column shows $115.8B operating cash flow against $60.5B net income, a 1.9× ratio"). The reader can then locate the table by its heading and read the values in context.

Do not paraphrase. Do not stitch together phrases from different paragraphs. Do not insert ellipses to skip over intervening text — quote one continuous run.

If the primary sources don't contain enough information to score a dimension responsibly, return `"score": "insufficient"` with `"reason"` explaining what's missing.

---

## Dimension 1 — Moat durability

Does the business have a structural advantage that protects margins from competition?

**What to look for:**
- The Business section describes the company's competitive position from management's perspective. Treat as marketing copy until validated against Risk Factors.
- The Risk Factors section is where management is *legally required* to disclose competitive vulnerabilities. The contrast between the Business section's narrative and Risk Factors is often the most informative signal.
- Look for: pricing power evidence (gross margin trends, price increases referenced), switching cost language, network effect claims that are quantified vs. asserted, scale advantages with specifics.

**Scoring anchors:**
- 1–2: No moat. Risk Factors explicitly cite competitive intensity, declining margins, or commoditization. Business section makes vague claims that Risk Factors contradicts.
- 3–4: Weak moat. Some advantage acknowledged but Risk Factors flag specific erosion vectors (regulatory, technological, competitor-specific).
- 5–6: Moderate moat. Clear advantage on at least one dimension (brand, scale, switching costs); Risk Factors acknowledge contestability but no near-term breakage.
- 7–8: Strong moat. Multi-dimensional advantage (e.g., network effects + scale + brand). Risk Factors describe edge cases, not fundamental threats.
- 9–10: Fortress moat. Decades of expanding margins, regulated/structural barriers, or a network effect with no credible challenger described in any section. Reserve for the rare cases.

---

## Dimension 2 — Owner earnings quality

Are reported earnings a fair representation of cash a long-term owner could extract?

**What to look for:**
- The Financial Statements section is the substrate. The Notes (always present alongside the statements) are where the messy stuff lives: stock-based compensation, lease obligations, off-balance-sheet items, unusual revenue recognition, capitalization choices.
- MD&A's Results of Operations narrative explains *why* numbers moved year-over-year — useful for spotting one-time items management is treating as recurring.
- Compute or estimate: FCF vs net income over multiple years, SBC as % of operating cash flow, capex vs. depreciation, working capital changes.

**Scoring anchors:**
- 1–2: Reported earnings ≫ cash for years; SBC adjustments would materially reduce FCF; aggressive revenue recognition or capitalization choices.
- 3–4: Persistent gaps with explanations that don't fully reconcile; meaningful SBC dilution masked by buybacks.
- 5–6: Some gap but driven by identifiable, defensible reinvestment; SBC is meaningful but disclosed cleanly.
- 7–8: FCF tracks earnings closely over 5+ years; capex is matched to opportunity, not vanity. SBC is contained.
- 9–10: FCF consistently exceeds earnings; capital-light or negative working-capital model that compounds owner returns.

---

## Dimension 3 — Capital allocation

How has management deployed cash over the past 5–10 years?

**What to look for:**
- MD&A's Liquidity and Capital Resources section narrates buybacks, dividends, and M&A.
- The Cash Flow Statement (in Financial Statements) is the ground truth — what was actually spent.
- Notes on Acquisitions disclose multiples paid (purchase price, goodwill, intangibles created — back into purchase multiples).
- Look for: buyback timing (peak vs. trough valuations), dividend stability, acquisition discipline, debt paydown.

**Scoring anchors:**
- 1–2: Destructive. Buybacks at peaks (cite repurchase prices vs. current). Expensive M&A with goodwill writedowns. Levered buyouts to fund dividends.
- 3–4: Mediocre. No clear discipline. Mix of value-additive and value-destroying decisions.
- 5–6: Mixed but improving. Recent decisions show better discipline than historical pattern.
- 7–8: Disciplined. Buybacks concentrated in trough valuations; M&A within 1× of peer multiples; sustainable dividend.
- 9–10: Best-in-class. Multi-cycle track record of allocating to highest-return option.

---

## Dimension 4 — Debt sustainability

Can the company service debt comfortably across cycles?

**What to look for:**
- The Notes on Debt (within Financial Statements) disclose covenants, maturity schedule, interest rates, and any off-balance-sheet obligations.
- MD&A's Liquidity section discusses how the company plans to meet obligations.
- Compute or estimate: net debt / EBITDA, interest coverage, FCF coverage of interest, near-term maturities (next 24 months).

**Scoring anchors:**
- 1–2: Distressed. Leverage >5× EBITDA, covenant pressure cited in Risk Factors, near-term maturity wall.
- 3–4: Stretched. Leverage 3–5× with weak interest coverage; refinancing exposure.
- 5–6: Manageable. Leverage 2–3×, comfortable coverage, no near-term maturity cluster.
- 7–8: Conservative. Leverage <2×, strong coverage (>10× interest), well-laddered maturities.
- 9–10: Net cash. No solvency risk under any reasonable scenario.

---

## Dimension 5 — Insider alignment

Do insiders own meaningful stock? Is compensation tied to long-term value creation?

**What to look for:**
- This dimension's primary source is the **proxy statement (DEF 14A)**, not the 10-K. The proxy contains: Beneficial Ownership tables (CEO and director ownership), Compensation Discussion and Analysis (how pay is structured), and Related-Party Transactions.
- Look for: founder-level ownership (>5%), pay-for-performance with multi-year vesting, recent insider buying or selling, related-party transactions that suggest entrenchment.

**Scoring anchors:**
- 1–2: Minimal insider ownership; CEO compensation dominated by single-year metrics; recent net selling.
- 3–4: Standard professional management; modest ownership; pay tied to short-term metrics.
- 5–6: Reasonable alignment; meaningful ownership; multi-year performance vesting.
- 7–8: Significant ownership (>1% professional CEO or >5% founder); long-vesting equity comp.
- 9–10: Founder-led with >10% ownership; CEO buys at scale or holds rather than diversifies.

---

## Dimension 6 — Cyclicality awareness

Is the business cyclical, and if so, how exposed is it?

**What to look for:**
- The Risk Factors section discloses cyclical exposure (consumer demand sensitivity, commodity prices, interest rates, regulatory cycles).
- MD&A's multi-year revenue/margin trend (look for the historical comparison tables) reveals what happened in the most recent downturn.
- For a non-cyclical business, the right score is 7–8 (acknowledged stability) — reserve 9–10 for businesses with explicit through-cycle resilience evidence.

**Scoring anchors:**
- 1–2: Highly cyclical with no through-cycle planning; current results clearly peak-of-cycle.
- 3–4: Cyclical, results probably above mid-cycle; no explicit trough modeling.
- 5–6: Some cyclicality but margins compressed less than peers in last downturn.
- 7–8: Non-cyclical business OR explicitly through-cycle resilient; revenue grew through 2020/2008.
- 9–10: Counter-cyclical OR multi-decade margin stability across cycles.

---

## Output format

Return strict JSON. No markdown fences, no explanatory text outside the JSON.

```typescript
{
  ticker: string;
  filingAccession: string;
  scores: {
    moatDurability: DimensionScore;
    ownerEarningsQuality: DimensionScore;
    capitalAllocation: DimensionScore;
    debtSustainability: DimensionScore;
    insiderAlignment: DimensionScore;
    cyclicalityAwareness: DimensionScore;
  };
}

type DimensionScore =
  | { score: number; rationale: string; citations: Citation[]; counterEvidence: string }
  | { score: "insufficient"; reason: string };

type Citation = {
  section: string;       // e.g. "risk-factors", "financial-statements", "proxy"
  quote: string;         // 10-30 words verbatim from that section
  whyItMatters: string;  // 1 sentence explaining what this passage tells you
};
```

Score must be a number 1–10 (decimals allowed for nuance, e.g. 6.5) or the literal string "insufficient".

Each scored dimension must include at least 2 citations.

Output JSON only.
