# Parser & pipeline coverage

Status of each ticker that has been run through `analyze-ticker.ts`. Use this to track which tickers have produced verified output and which exposed bugs that needed fixing.

Legend:
- ✓ — full pipeline completed: 10-K parsed, primary-source checklist ran, decision-card produced.
- ✓* — completed but with notes (incomplete content, missing fixtures, edge case handled).
- ✗ — pipeline failed; see notes for the specific bug.
- ⏳ — partial fixtures present (10-K, proxy, snapshot) but synthesis not yet attempted.

## Status table

| Ticker | Decision card | Verdict (score) | Analyst videos | Notes |
|---|---|---|---|---|
| META | ✓ | Watchlist (6.4) | 1 (Drew Cohen) | First reference ticker; cross-source synthesis path validated. |
| KO | ✓ | Pass (5.7) | 0 | First primary-source-only validation; surfaced the −9.4% FCF CAGR vs 19.9% implied signal. |
| CHD | ✓ | Pass (5.9) | 0 | Mid-cap consumer staples reference. |
| INTU | ✓ | Watchlist (6.4) | 1 | |
| AMD | ✓ | Pass (5.3) | 1 | |
| RDDT | ✓* | Insufficient Data (6.2) | 1 | Insufficient verdict — at least one dimension came back insufficient on this run; investigate which before relying on the verdict. |
| MSFT | ✓ (after schema fix) | Watchlist (7.1) | 1 (Scott Galloway interview) | First run failed at extract: analyst gave implied-return range without explicit price target. Schema fix made `valuation.impliedReturn`, `valuation.impliedPriceTarget`, `qualitativeFactors.insiderOwnership` all `nullable().optional()`. Re-ran successfully. |
| JPM | ⏳ | — | 0 | 10-K parsed (with bundled MD&A→Item 8 detection); decision card not yet produced. |
| BKNG | ⏳ | — | 0 | Partial fixtures; pipeline not completed. |
| FICO | ⏳ | — | 0 | Partial fixtures; pipeline not completed. |
| PLTR | ⏳ | — | 0 | Partial fixtures; pipeline not completed. |
| PYPL | ⏳ | — | 0 | Partial fixtures; pipeline not completed. |
| SE | ⏳ | — | 0 | Partial fixtures; pipeline not completed. |

## Bug log

Bugs that surfaced from running new tickers, and the fix.

### MSFT — schema rejected null `valuation.impliedPriceTarget`

**Root cause:** the LLM extraction returned `valuation.impliedPriceTarget: null` because Drew Cohen's analysis frames Microsoft in implied-return terms (14–36% over 3 years) rather than naming an explicit price target. The schema declared the field as `.optional()` only — Zod's `.optional()` accepts missing keys but rejects explicit `null`.

**Fix:** Make optional fields in `ExtractedAnalysis` accept `null` in addition to being missing, since LLMs vary in whether they omit or null-out absent fields. Updated:

- `valuation.impliedReturn`: `.nullable().optional()`
- `valuation.impliedPriceTarget`: `.nullable().optional()`
- `qualitativeFactors.insiderOwnership`: `.nullable().optional()` (was `.nullable()` only — could be missing too)

Already correctly nullable+optional from earlier fixes:

- `segments[].revenue`, `segments[].ebit`, `segments[].growthRate`

After the fix, all four pre-existing video-pipeline DecisionCards (META, AMD, INTU, RDDT) still validate against the looser schema — making validation more permissive doesn't break passing data.

## Adding a ticker

When you add a ticker to `data/tickers.json` and run it for the first time:

1. If it succeeds, append a `✓` row to the table above with verdict + score.
2. If it fails, append a `✗` row, capture the failure mode in the bug log, and attempt a fix. The most common failure modes so far:
   - LLM returns null where the schema expected optional-but-not-nullable (MSFT case).
   - 10-K parser misses a section because the filer uses a heading style we haven't seen (banks, insurers, foreign filers — see USAGE.md "Known limitations").
   - Citation grep-verify rate drops below ~80% — usually means the LLM is fabricating quotes; check whether a model change happened.

Keep this file in sync as you broaden the ticker set.
