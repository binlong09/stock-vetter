# Stock Vetter — Usage

Ticker-first value-investing research tool. Type a ticker, get a decision card synthesized from primary sources (10-K + DEF 14A) and optional analyst-video analyses.

## The one command you'll use

```
pnpm tsx scripts/analyze-ticker.ts META
```

This runs the full pipeline: fetches the latest 10-K and proxy from EDGAR, computes historical valuation medians and a reverse DCF, runs the three-pass primary-source value-investing checklist (Pass 1 with triple sampling, Pass 2 skeptic, Pass 3 judge), and synthesizes everything into a meta-card.

Output lands in `fixtures/<TICKER>/decision-card.md`. Open that file to read the verdict.

The first run on a fresh ticker takes ~3–5 minutes and costs ~$2 in LLM calls. Re-runs hit cache and finish in seconds at $0.

## Adding a ticker

Edit `data/tickers.json`. The minimum entry is:

```json
"AAPL": {
  "videos": []
}
```

To wire up analyst videos for cross-source synthesis, add YouTube URLs:

```json
"AAPL": {
  "videos": [
    "https://www.youtube.com/watch?v=...",
    "https://www.youtube.com/watch?v=..."
  ],
  "notes": "Optional: a reminder for yourself"
}
```

Each video runs through the existing per-video pipeline (~$0.60, ~5 min) and produces a `DecisionCard` that the meta-card can synthesize against. Without videos the meta-card uses primary sources only and adds a header note saying so — both modes produce a verdict.

If you want to use the tool without curating videos, leave `videos: []`. Most tickers should start this way.

## Reading the verdict

The headline of `decision-card.md`:

```
**Verdict:** 🟡 Watchlist  •  **Weighted score:** 6.4 / 10
```

Verdict buckets, applied deterministically by code:

- **🟢 Strong Candidate** — weighted score ≥ 8.0 AND no high-uncertainty dimension AND reverse DCF doesn't imply egregiously high growth. The rare case where the rubric says "act."
- **🟡 Watchlist** — 6.0–7.9 weighted, OR criteria met for Strong Candidate but with a high-uncertainty dimension, OR the price embeds growth meaningfully above what the company has delivered. Worth tracking, not yet acting.
- **🔴 Pass** — weighted score < 6.0 OR a single dimension scored below 4.0 with high confidence. The argument hasn't been made.
- **⚪ Insufficient Data** — at least one dimension came back insufficient (rare; usually means the proxy or relevant 10-K section couldn't be parsed).

The weighted score uses 6 dimensions with default weights:

- Moat durability: 0.20
- Owner earnings quality: 0.20
- Capital allocation: 0.20
- Debt sustainability: 0.15
- Insider alignment: 0.10
- Cyclicality awareness: 0.15

These can be edited in `packages/pipeline/src/meta-card.ts` (`BASE_WEIGHTS`) if you want to retune for your own framework.

## Reading the uncertainty flags

Each dimension is scored three independent times by the LLM. The card shows:

- **`tight`** (range ≤ 0.5) — the rubric is unambiguous for this case. Trust the score.
- **`moderate`** (range 0.5–1.5) — typical LLM variance, no special handling.
- **`⚠️ high`** (range > 1.5) — the rubric is genuinely ambiguous. The dimension's weight is reduced to 0.7× in the composite, and the rationale section gets a callout box. Treat the score as a rough range, not a point estimate.

When you see a high-uncertainty dimension, that's where to focus your own judgment — the system is telling you it can't decide.

## Reading the decision-card sections

Reading top-to-bottom:

1. **Header** — verdict, score, generated date, 10-K accession, analyst video count. If videos = 0, a header note says so.
2. **Summary** — 2-4 sentences explaining the verdict in plain English. The single most important paragraph. Read this first; if you have 30 seconds, this is what to read.
3. **Dimension scores** — table with the 6 dimensions, scores, range/uncertainty, and effective weight.
4. **Dimension reasoning** — the Pass 3 judge's per-dimension justification. This is *what* drove each score. Skip on first read; come back when you want to interrogate a specific score.
5. **Valuation context** — reverse DCF implied 10-year FCF CAGR vs actual delivered, and the gap between them. The most informative single signal in the card. A +29pp gap (KO) means the price embeds growth far above the historical track record; a "roughly aligned" gap (META) means the price assumes continuation.
6. **Cross-source findings** — only present when analyst videos are configured. Surfaces where the analyst's view agrees, partially agrees, or disagrees with the primary-source analysis. Disagree rows are usually the most informative.
7. **What the disagreements mean** — only present when there are disagreements. One paragraph telling you which side to trust on each contested point.
8. **Things to verify before acting** — 3–7 concrete actions. At least one targets the highest-uncertainty dimension. These are not generic; they're the specific items a careful retail value investor should check.

The `decision-card.md` file is one of several artifacts. The complete set:

```
fixtures/<TICKER>/
  decision-card.md             ← the main output, read this first
  decision-card.json           ← same content, machine-readable
  primary-source-checklist.md  ← full per-dimension reasoning + citations
  primary-source-checklist.json
  reverse-dcf.md               ← sensitivity grid + narrative
  reverse-dcf.json
  financial-snapshot.json      ← raw SEC + Yahoo data
  videos/<videoId>.json        ← per-video DecisionCard (when videos configured)
  sec/<accession>/
    _meta.json                 ← parser metadata, warnings, anchor scores
    business.md                ← Item 1
    risk-factors.md            ← Item 1A
    properties.md              ← Item 2
    legal-proceedings.md       ← Item 3
    mda.md                     ← Item 7
    quant-risk.md              ← Item 7A
    financial-statements.md    ← Item 8
  proxy/<accession>.txt        ← cleaned DEF 14A text
```

Citations in `decision-card.md` and `primary-source-checklist.md` reference these section files by id. You can grep any quote against the corresponding `.md` file to verify it.

## Cost

- **Fresh ticker, no analyst videos**: ~$2 in LLM calls. Breakdown: 18 Pass 1 calls (3 samples × 6 dimensions) ≈ $1.20, 6 Pass 2 calls ≈ $0.40, 6 Pass 3 calls ≈ $0.35, 1 meta-card synthesis ≈ $0.04.
- **Fresh ticker with 1 analyst video**: ~$2 + ~$0.60 for the video pipeline ≈ $2.60.
- **Re-run on same ticker**: $0. Cache hits across the board.
- **Re-run after editing a prompt**: only the affected pass re-runs. Cache keys include a hash of the prompt text, so editing `prompts/primary-source-skeptic.md` invalidates only Pass 2 (and Pass 3, which depends on Pass 2's output).

## Known limitations

- **Bank 10-Ks**: JPM-class filers split MD&A across exhibits and use less-bold heading conventions. The parser handles JPM specifically (bundled-content detection ties Item 7 to Item 8) but other large banks may surface novel parsing patterns. If a bank's `_meta.json` shows multiple `confidence: "failed"` sections that aren't tagged `bundled`, the parser hit a new pattern.
- **Foreign filers (20-F)**: untested. The parser is keyed for 10-K item structure and `WeightedAverageNumberOfDilutedSharesOutstanding`-style US-GAAP concepts. A foreign filer might parse but the financial snapshot may be incomplete.
- **REITs and BDCs**: untested. Their financial statements include items (FFO, NAV, NII) the value-investing rubric doesn't currently weigh — the rubric assumes industrial-style FCF and net income. Use cautiously.
- **Insurance / reinsurance specialists**: untested for the same reason — their financial statements have reserve disclosures and float dynamics the rubric doesn't model.
- **10-Q parsing is weaker than 10-K**: 10-Qs aren't currently used as standalone synthesis input (the Weekend-2 design call). They're fetched and parsed but the meta-card draws from the 10-K.
- **Calibration drift on cyclicality dimension**: across the three test tickers, cyclicality consistently shows the highest variance in triple-sampling. The rubric anchors may need sharpening — for now, treat cyclicality scores as approximate and rely more on the rationale text.
- **Reverse DCF assumes equity-FCF ≈ FCF-to-firm**: simplification that's fine for low-leverage filers, less accurate for highly leveraged businesses. The teaching value (the question "what's the market pricing in?") is intact regardless.
- **No portfolio context**: the tool scores tickers in isolation. It doesn't know what else you own, sector concentration, correlation, position sizing. Those are your call.
- **No regime awareness**: the rubric is static. In a regime that's punishing value (post-GFC tech-led market), the tool will systematically rate growth-at-a-reasonable-price stocks lower than they perform. Don't expect it to outperform indices in all regimes.

## Cache management

The cache lives at `.cache/` (gitignored). It's structured by namespace:

```
.cache/
  sec/<accession>_<section>.json     ← parsed 10-K section text
  sec-meta/<accession>.json          ← parser metadata
  snapshot/<TICKER>_YYYY-MM-DD.json  ← financial snapshot (24h TTL via date bucket)
  video-card/<videoId>.json          ← per-video DecisionCards (cached forever)
  llm/<stage>_<inputHash>_p<promptHash>.json  ← all LLM outputs
```

Common operations:

```bash
# Clear everything for a specific ticker (forces re-fetch + re-run)
rm -rf fixtures/META/
rm .cache/snapshot/META_*.json
# SEC cache is by accession, not ticker — easier to leave it; it'll re-hit
# automatically once the same accession appears.

# Force fresh LLM calls without re-fetching SEC docs
rm .cache/llm/*

# Clear everything (fresh start)
rm -rf .cache/ fixtures/
```

To force-refresh SEC data when EDGAR has a new filing: the parser checks the latest accession on each run. If a new 10-K has been filed, the new accession key won't be in cache and the section data re-fetches automatically. No manual intervention needed.

## What this tool is, and isn't

It's a value-investing **bullshit detector** and **teaching artifact**. Use it to:

- Sanity-check a stock pitch (run on the ticker, read the cross-source findings, see what the analyst missed in primary sources).
- Build a watchlist by running tickers you're curious about and reading the rationales.
- Learn the value-investing framework by reading primary-source-grounded analyses with citations.
- Catch obvious red flags (KO's −9.4% FCF CAGR vs 19.9% implied is the kind of thing an investor needs to see before buying).

It is **not**:

- An oracle. The verdict is one input to your judgment, not a buy/sell signal.
- A backtest. The rubric isn't validated on historical returns yet.
- A substitute for understanding the business. Reading the 10-K yourself is still the highest-value thing you can do.
- Calibrated for non-US, non-industrial businesses. See known limitations.

Use it as a complement to your own work, with an index core (e.g., VOO) doing the actual wealth-building. Run it on watchlist candidates before acting; treat anything below "Strong Candidate" as "interesting, keep watching"; treat the cited primary-source passages as your reading list, not as the LLM's final word.
