# Stock Vetter — Usage

Ticker-first value-investing research tool. Type a ticker, get a decision card synthesized from primary sources (10-K + DEF 14A) and optional analyst-video analyses.

## What "primary sources" means here

Be specific about what the tool reads, because the verdict is anchored to exactly these inputs and nothing else.

**The tool reads:**

- **Latest 10-K** (annual report) — full text, sectioned by Item (Business, Risk Factors, Properties, Legal Proceedings, MD&A, Quant Risk, Financial Statements). This is the substrate for the value-investing checklist's qualitative reasoning.
- **Latest DEF 14A** (proxy statement) — used for insider alignment scoring (executive compensation, beneficial ownership, related-party transactions, dual-class voting structure).
- **SEC EDGAR companyfacts** — 10 years of structured financial data (revenue, EBIT, net income, FCF components, shares outstanding, long-term debt). Drives historical valuation medians and the reverse DCF's actual-FCF-CAGR comparison.
- **Current price** (Yahoo Finance) — feeds market cap, current multiples, and the reverse DCF.

**The tool does *not* read:**

- **10-Qs** (quarterly reports) — fetched and parsed for the financial-snapshot's most-recent-period data, but *not* used as input to the primary-source value-investing checklist. The qualitative analysis ignores them.
- **8-Ks** (material-event filings) — not fetched at all.
- **Earnings call transcripts** — not fetched.
- **News articles, press releases, sell-side reports** — not fetched.

**What this means in practice:** the qualitative analysis is anchored to the latest annual 10-K. For companies in rapid transition since their last 10-K — recent M&A, strategy pivots, leadership changes, accounting restatements, regulatory developments — the analysis can miss material context captured only in interim filings or earnings commentary. The tool is best suited for value-investing analysis on **established large-caps with stable annual narratives**. For high-velocity situations (post-M&A integration, activist campaigns, recent guide-downs), treat the verdict as a stale-snapshot baseline and supplement with your own reading of the most recent 10-Q + 8-K filings.

The primary-source checklist explicitly cites which 10-K section a finding comes from. If a citation references stale information that's been superseded by an interim filing, that's a signal to re-read the relevant 8-K or 10-Q before acting.

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

## The web viewer (read cards on your phone)

The CLI runs on your laptop. A small read-only Next.js app — `apps/web/`, deployed on Vercel's free tier — lets you read the decision cards on your phone. **The pipeline is not deployed**; nothing about the analysis runs in the cloud. The web app only reads.

How it works:

- After a successful `analyze-ticker` run, the CLI **pushes the full decision card into Turso** (a hosted libSQL database, free tier) — but only if `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set in `.env`. If they're not set, the CLI works exactly as before (fixtures only). If the push fails, the run still succeeds locally — it just logs a warning.
- The web app reads from Turso and renders: a dashboard (all tickers, sorted by score, filterable by verdict bucket), a per-ticker **default view** (verdict + score + the six-dimension table + valuation context + analyst-vs-primary findings), and a **deep view** below it (per-dimension 3-pass reasoning + citations, the reverse-DCF grid, historical financials, the analyst-video detail pages).
- Login is magic-link email (Auth.js + Resend) with an allowlist — only addresses in `ALLOWED_EMAILS` can sign in.

**Deployed at: _<set after first deploy — see "Deploying the web viewer" below>_**

### One-time setup (already done if `.env` has `TURSO_*`)

1. Create a Turso database:
   ```
   brew install tursodatabase/tap/turso
   turso auth login
   turso db create stock-vetter
   turso db show stock-vetter --url        # → TURSO_DATABASE_URL
   turso db tokens create stock-vetter     # → TURSO_AUTH_TOKEN
   ```
   Put both in the repo-root `.env`.
2. Backfill existing analyses (also creates the schema on first run):
   ```
   pnpm push-fixtures
   ```
   Re-run anytime; it's idempotent. From then on, every `analyze-ticker` run pushes automatically.

### Adding a new ticker (end to end)

1. Add it to `data/tickers.json` (see "Adding a ticker" above).
2. `pnpm tsx scripts/analyze-ticker.ts <TICKER>` — analyzes it, writes `fixtures/<TICKER>/`, and pushes to Turso automatically (if configured). It appears in the web app within ~5 minutes (the pages use a 5-minute cache).

### Adding a new allowed email

The allowlist is the `ALLOWED_EMAILS` env var — comma-separated, e.g. `me@example.com,family@example.com`. To add someone:

- **Production**: edit `ALLOWED_EMAILS` in the Vercel project's environment variables, then redeploy (Vercel → Deployments → Redeploy, or just push any commit). New value takes effect on the next deploy.
- **Local dev**: edit `ALLOWED_EMAILS` in `apps/web/.env` and restart `pnpm dev`.

Fails closed: if `ALLOWED_EMAILS` is unset or empty, nobody can sign in.

### Running the web app locally

```
cd apps/web
cp .env.example .env     # fill in TURSO_*, AUTH_SECRET (openssl rand -base64 32),
                          #   AUTH_RESEND_KEY, EMAIL_FROM, ALLOWED_EMAILS
pnpm dev                  # http://localhost:3000
```

### Deploying the web viewer

The pipeline stays on your laptop; only `apps/web/` deploys. On Vercel:

1. **Import the GitHub repo** into a new Vercel project.
2. **Set the project's Root Directory to `apps/web`.** Vercel walks up to the repo's `pnpm-workspace.yaml`, so the workspace dependency (`@stock-vetter/schema`) installs and the Next build transpiles it from source (`next.config.ts` handles this). Framework auto-detects as Next.js.
3. **Add environment variables** (Production + Preview):
   - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` — the same database the CLI pushes to.
   - `AUTH_SECRET` — generate with `openssl rand -base64 32`. **Must be set explicitly** — a default-derived secret breaks sessions on every redeploy.
   - `AUTH_URL` — the deployed origin, e.g. `https://stock-vetter-<you>.vercel.app`. This makes magic-link callback URLs in emails point at production, not a per-deployment preview URL.
   - `AUTH_RESEND_KEY` — from https://resend.com/api-keys.
   - `EMAIL_FROM` — e.g. `Stock Vetter <onboarding@resend.dev>` (Resend's sandbox sender works without a verified domain).
   - `ALLOWED_EMAILS` — comma-separated allowlist.
4. Deploy. The default `*.vercel.app` subdomain is fine.
5. **Smoke-test on your phone**: visit the URL → bounced to `/signin` → enter an allowlisted email → magic link arrives → click → dashboard loads → close the browser, reopen, still signed in. Then try a non-allowlisted email → "not allowed" error, no email sent.

**Redeploys on code changes are automatic** — Vercel rebuilds on every push to `main`. The CLI on your laptop is unaffected by deploys.

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

### Adaptive sampling on re-runs

The first time a ticker is analyzed, every dimension triple-samples. After that, the variance from each dimension is persisted to `.cache/variance-history/<TICKER>.json`. On subsequent runs:

- Dimensions where the prior range was **tight (≤ 0.5)** drop to **single-sample** — the rubric was unambiguous, no need to pay 3× to confirm.
- Dimensions with **moderate or high prior range** still triple-sample — the system isn't confident, so it samples again.

This cuts re-run cost without sacrificing the variance signal where it matters. Override with `--always-triple` if you want the full triple-sampling for a particular run (e.g., after editing a prompt).

The persisted history is invalidated automatically when a Pass 1 prompt is edited (the prompt-text hash is part of the history payload).

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

Numbers below are post-optimization (Anthropic prompt caching + adaptive sampling, both deployed). Measured on META as the benchmark; KO and CHD are similar. Sonnet 4.6 throughout — Haiku 4.5 was tested and rejected for Pass 1 (30%+ citation fabrication and a systematic 2-point cyclicality miscalibration).

- **Fresh ticker, no analyst videos**: ~**$1.45** in LLM calls.
- **Fresh ticker with 1 analyst video**: ~$1.45 + ~$0.60 for the video pipeline ≈ $2.05.
- **Adaptive re-run** (5+ minutes after the prior run, prompts unchanged): ~**$1.30**. Pass 1 saves cost when prior dimensions had tight variance and drop to single-sample.
- **Cached re-run** (within session, source filings unchanged): **$0**. Filesystem LLM cache hits everything.
- **Re-run after editing a prompt**: only the affected pass re-runs. Cache keys include a hash of the prompt text, so editing `prompts/primary-source-skeptic.md` invalidates only Pass 2 (and Pass 3, which depends on Pass 2's output).
- **20–30 ticker exploration budget**: ~$30–45.

### Web-viewer infrastructure cost

All free-tier; effectively $0 at this scale:

- **Vercel** (hosting the read-only app): Hobby tier — fine for one user and a handful of readers.
- **Turso** (libSQL database): free tier is 500 DBs / 9 GB / 1B row-reads per month. This app stores ~30 tickers at a few KB–55 KB each — well under 5 MB. Reads are tiny (a few rows per page view).
- **Resend** (magic-link email): free tier is 3,000 emails/month, 100/day. Sign-ins are infrequent.
- No new API costs — the deep view shows data already in the JSON; there are no incremental LLM calls per page view.

### Where the money goes

Per-stage breakdown for a fresh-ticker run (~$1.45):

- **Pass 1 with triple-sampling: ~$0.67** (largest line item; 18 LLM calls = 3 samples × 6 dimensions).
- Pass 2 (skeptic): ~$0.38 (6 calls).
- Pass 3 (judge): ~$0.36 (6 calls).
- Meta-card synthesis: ~$0.04 (1 call).

### Why Pass 1 is the largest line item

Triple-sampling exists because individual LLM dimension scores have inherent variance (0.5–2.0 points run-to-run on the same primary sources). Surfacing that variance is what makes the meta-card honest about uncertainty — when 3 samples return 7, 7, 7, the rubric is unambiguous; when they return 4, 5.5, 7, the score is genuinely uncertain and should be weighted less in the composite. Single-sampling would hide the uncertainty and produce false-precision scores.

Two optimizations bring Pass 1 down from a notional $1.27 (no caching, parallel triple) to ~$0.67 (caching + serialized first-sample):

- **Anthropic prompt caching** (`cache_control` markers on the system prompt and the shared user-message prefix containing the source sections). The 80K-char source context is sent once per dimension and read from cache by samples 2 and 3.
- **Sample-1 serialization** to populate the cache before samples 2 and 3 fire in parallel. Without this, all three samples race to write the cache and miss on the first read, defeating the purpose.

On re-runs, **adaptive sampling** drops tight-variance dimensions to single-sample. After the first run on a ticker, ~4 of 6 dimensions typically drop, cutting Pass 1 calls from 18 to ~10 — about 23% Pass 1 savings on top of the caching wins.

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
