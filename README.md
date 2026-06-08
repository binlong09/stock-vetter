# Stock Vetter

Two value-investing research tools that share one codebase:

- **Stock Vetter** — type a ticker, get one decision card. Fetches the latest 10-K, DEF 14A proxy, 10-Q, SEC companyfacts, and current price; runs a three-pass primary-source value-investing checklist; computes a reverse DCF and historical valuation context; optionally folds in analyst-video or earnings-call analysis; and produces a verdict + 1–10 weighted score.
- **Signal Tracker** — write a one-line investment thesis with explicit tripwires, then let a daily cron watch SEC filings, consensus estimates, and earnings calls for the events that would confirm or break it. You get an email only when a tripwire actually flips.

Both run as a CLI on your laptop (or a scheduled runner). A small read-only Next.js viewer (`apps/web/`, on Vercel free tier) reads the results on your phone. The pipelines are **not** deployed — only the viewer.

For operational depth — costs, web-viewer setup/deploy, cache management, reading the verdict — see **[USAGE.md](USAGE.md)**. For design rationale and build history see the spec docs: **[oldSPEC.md](oldSPEC.md)** (Stock Vetter), **[SPEC.md](SPEC.md)** (Signal Tracker build plan), and **[HANDOFF.md](HANDOFF.md)** (packaging overview). This file is the orientation: how to run it, then how each tool actually works.

---

## Setup

```bash
pnpm install
cp .env.example .env      # then fill in keys (see below)
pnpm typecheck            # tsc -b across the workspace
```

**Environment** (`.env`):

| Variable | Required for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | all LLM passes | |
| `SEC_USER_AGENT` | SEC EDGAR fetches | `"Your Name your@email.com"` — SEC requires it |
| `FMP_API_KEY` | Signal Tracker | Financial Modeling Prep (Starter tier); consensus estimates + ratings-revision proxy |
| `ALPHAVANTAGE_API_KEY` | earnings-call transcripts | `--transcript` vetting + the AV transcript feed |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | web viewer + tracker state | Without these, the analyze CLI is fixtures-only and the tracker uses a local cursor cache |

The scheduled tracker cron (`.github/workflows/signal-tracker.yml`) reads these as GitHub Actions **secrets**, not from `.env`. Email-digest variables (`AUTH_RESEND_KEY`, `EMAIL_FROM`, `SIGNAL_DIGEST_TO`, `SIGNAL_TRACKER_BASE_URL`) are optional — without them the run still works, it just sends no email.

---

## Commands

### Stock Vetter

```bash
# Analyze a ticker end-to-end: fetch filings + price, run the 3-pass checklist,
# reverse DCF, meta-card synthesis. Writes fixtures/<TICKER>/ and (if Turso is
# set) pushes the card to the web viewer.
pnpm analyze-ticker NVDA

# Useful flags:
pnpm analyze-ticker NVDA --transcript          # also vet the latest earnings call
pnpm analyze-ticker NVDA --transcript=2026Q1   # …a specific quarter
pnpm analyze-ticker NVDA --always-triple       # triple-sample every dimension (skip adaptive sampling)
pnpm analyze-ticker NVDA --no-tenq-delta       # skip the additive 10-Q-vs-10-K change pass
pnpm analyze-ticker NVDA --no-llm              # fetch + cache only, no LLM calls
pnpm analyze-ticker NVDA --debug

# Push existing fixtures to Turso without re-analyzing:
pnpm push-fixtures NVDA

# Add a reader to the web viewer's email allowlist (takes effect next sign-in):
pnpm allow-email someone@example.com
```

Adding a ticker is just: append it to `data/tickers.json`, run `analyze-ticker`, done — the push to the viewer is automatic. (See [USAGE.md](USAGE.md) for the full add-a-ticker / add-a-reader / deploy flows.)

**Cost:** ~$1.45 per fresh ticker (~$2 with an analyst video); $0 on cached re-runs. Cost is logged to stderr; the pipeline warns above $0.75 and aborts above $1.50 per run.

### Signal Tracker

```bash
# Evaluate every thesis in data/theses.json against newly-arrived events only
# (cursor-gated — steady-state runs are cents):
pnpm track

pnpm track NVDA-margin-durability   # one thesis
pnpm track --no-eval                # ingest + diff only, no LLM (just show new events)
pnpm track --dry-run                # don't persist cursors/status
pnpm track --reset                  # clear this thesis's cursor first (re-examine backlog)
pnpm track --since 2026-04-01       # bound the SEC query

# Phase-0 feed probe — what FMP can pull for one ticker (no theses, no LLM, no DB):
pnpm signals-spike NVDA

# Offline evaluation harness for the tracker:
pnpm evaluate-signals
```

### Web viewer (local)

```bash
cd apps/web && pnpm dev      # http://localhost:3000
```

Full deploy instructions (Vercel, magic-link auth, EOD-price cron) are in [USAGE.md](USAGE.md).

---

## Stock Vetter — methodology

The premise: an analyst video or a headline is a *secondary* source. The verdict has to come from **primary sources** — the company's own SEC filings and reported numbers — with everything else treated as a view to be reconciled against them, never as the basis.

For one ticker, the pipeline:

1. **Gathers primary sources.** Latest **10-K** (annual baseline), **DEF 14A** proxy (insider alignment / comp), latest **10-Q** (the quarter), **SEC companyfacts** (reported financials), and current price. Filings are fetched from EDGAR, parsed into Item-level sections (MD&A, risk factors, etc.), and cached by accession.

2. **Runs a three-pass value-investing checklist** over six dimensions — moat durability, owner-earnings quality, capital allocation, debt sustainability, insider alignment, cyclicality awareness:
   - **Pass 1 — extract / score.** Score each dimension 1–10 from the filings, every claim carrying a citation to the source passage. This is the largest cost line (see USAGE.md).
   - **Pass 2 — skeptic.** An adversarial pass that argues against Pass 1's reading.
   - **Pass 3 — judge.** Reconciles the two into the final per-dimension score.
   - Scoring is **triple-sampled with a majority vote** where the call is noisy; re-runs use *adaptive sampling* (only re-sample dimensions whose confidence was low) to save cost. The card shows per-dimension confidence dots so you can see where the model was unsure.

3. **Grounds valuation in numbers, not narrative.** A **reverse DCF** computes the FCF growth the current price *implies* across a discount-rate × terminal-multiple grid; a valuation-anomaly flag fires when the implied growth diverges from the actual historical FCF CAGR by more than ~10pp. Historical valuation medians give context for "is this cheap or dear versus its own history."

4. **Reconciles secondary sources (optional).** Analyst videos (YouTube) and **earnings-call transcripts** (Alpha Vantage) run through the same extract → critique → score pipeline, producing a per-source decision card. The meta-card then surfaces **cross-source findings** — where the analyst/call and the filings agree or disagree — and a "where to focus your own judgment" note. These never change the six dimension scores; the primary-source verdict stands on its own.

5. **Additive 10-Q change detection.** After the meta-card is built, an additive pass compares the latest 10-Q's MD&A and risk factors against the 10-K baseline and reports material qualitative changes ("Changes since annual baseline"), each with a **dual citation** — one to the 10-Q passage and one to the 10-K passage it diverges from, each kept attributed to its own filing. This pass is strictly additive: it never feeds the verdict, the dimension scores, or the reverse DCF. A coverage stamp flags any section that failed extraction so the change count stays honest.

6. **Synthesizes one meta-card** — verdict + 1–10 weighted score + plain-English summary — written to `fixtures/<TICKER>/decision-card.md` and pushed to the viewer. Every number traces back to a citation; the card also lists specific things you should verify yourself before acting.

The point is not to be told what to buy. It's to compress the primary-source legwork into a structured, cited starting point — and to make disagreements between sources explicit rather than averaged away.

---

## Signal Tracker — methodology

Stock Vetter answers "what do the filings say *today*." The Signal Tracker answers "tell me when something **changes** the answer." You hold a thesis; the world emits events; most are noise; you want to be paged only when an event moves a tripwire.

A **thesis** (`data/theses.json`) is a falsifiable one-liner plus the watch-items that would confirm or break it. Example:

```json
{
  "id": "NVDA-margin-durability",
  "claim": "NVIDIA sustains data-center gross margins in the low-to-mid 70s%…; compression below the low-70s breaks the premium-valuation case.",
  "tickers": ["NVDA"],
  "watchItems": [{
    "id": "nvda-gross-margin-guide",
    "label": "Forward gross-margin guidance direction",
    "sources": ["sec-8k", "sec-10q", "sec-10k", "av-transcript"],
    "tripwire": "Guided or reported non-GAAP gross margin falls below 72%, or guidance language flags sustained pricing pressure.",
    "tripwireDirection": "weakens"
  }]
}
```

Each daily run:

1. **Ingests events** from source-agnostic feeds, normalized into a common `Event` shape:
   - **SEC EDGAR** (free) — recent 8-K / 10-Q / 10-K. This is the company-reported primary-source half. (8-K guidance lives in the Ex-99.1 exhibit, fetched from the filing index.)
   - **FMP consensus estimates** (annual, on the Starter tier) and the **analyst-ratings bull-index** as the estimate-revision *proxy*.
   - **Earnings-call transcripts** (Alpha Vantage), normalized once and cached.

2. **Cursor-gates.** Each thesis keeps a per-source cursor in Turso (the authoritative store). The run diffs incoming events against the cursor and evaluates **only genuinely new** events. A day with no new filings or revisions costs effectively nothing — this is what makes a daily cron cheap.

3. **Maps before it spends.** A pure, zero-token filter decides whether a new event even maps to one of the thesis's watch-items. An event that maps to nothing never reaches the LLM.

4. **Evaluates the survivors** with the same extract → critique → judge shape as the vetter:
   - **extract** — is there a candidate signal here for this watch-item? (null ⇒ stop)
   - **critique** — adversarial: is it already priced in? noise? is there a contrary reading? Fed two quantitative anchors: the estimate-revision trend and the imported reverse DCF.
   - **judge** — synthesize into a `Signal` (direction / magnitude / confidence / rationale / citation), triple-sampled with a majority vote. A signal the critique judged priced-in resolves to neutral / low magnitude.

5. **Updates tripwire state and emails only on a flip.** A thesis's health (green / amber / red) is recomputed from its signals. The load-bearing rule: a **flip is a state transition** between the previously-persisted status and the new one — never the current state. A thesis that was red yesterday and is still red today has *not* flipped and is never re-emailed. The digest fires only when at least one tripwire transitions, so the daily cron pages you on change, not on standing conditions.

The cron (`.github/workflows/signal-tracker.yml`, daily at 06:30 UTC) is the **authoritative writer** — it takes a Turso run-lock so a manual `pnpm track` won't race it. Steady-state runs are cents; only a cold start (a brand-new thesis or ticker with a full backlog) is expensive, and that's gated behind an explicit opt-in rather than happening by accident.

---

## Repository layout

```
stock-vetter/
├── data/
│   ├── tickers.json        # tickers Stock Vetter analyzes
│   └── theses.json         # theses + tripwires the Signal Tracker watches
├── prompts/                # every LLM prompt as a .md file (never inlined in code)
├── fixtures/<TICKER>/      # per-ticker analysis output (cards, SEC sections, DCF)
├── scripts/                # CLI entry points (analyze-ticker, track, …)
├── packages/
│   ├── schema/             # Zod schemas + inferred types (shared, depends on nothing)
│   ├── core/               # SEC/FMP/AV adapters, LLM client, cache, reverse DCF, Turso
│   ├── pipeline/           # Stock Vetter passes: extract/critique/score/meta-card/delta
│   └── signals/            # Signal Tracker: feeds, diff, evaluate, theses, digest, persistence
├── apps/web/               # read-only Next.js viewer (Vercel) — the only deployed piece
├── README.md               # this file
├── USAGE.md                # operating guide: costs, deploy, cache, reading the verdict
├── oldSPEC.md              # Stock Vetter project spec (build history)
├── SPEC.md                 # Signal Tracker build plan
└── HANDOFF.md              # packaging / handoff overview
```

Dependency direction is acyclic: `schema ← core ← {pipeline, signals}`; `apps/web` reads from Turso only.
