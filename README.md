# Stock Vetter

Four research tools that share one codebase:

- **Stock Vetter** — type a ticker, get one decision card. Fetches the latest 10-K, DEF 14A proxy, 10-Q, SEC companyfacts, and current price; runs a three-pass primary-source value-investing checklist; computes a reverse DCF and historical valuation context; optionally folds in analyst-video or earnings-call analysis; and produces a verdict + 1–10 weighted score.
- **Signal Tracker** — write a one-line investment thesis with explicit tripwires, then let a daily cron watch SEC filings, consensus estimates, and earnings calls for the events that would confirm or break it. You get an email only when a tripwire actually flips.
- **Short-Side Scanner** — point a local GPU at the top ~2,000 US companies and read every 10-K, 10-Q, and 8-K they file, looking for the quantitative tells that precede a repricing downward. A local Qwen model does the bulk reading under a rigid schema with every claim quote-verified; a deterministic layer computes multi-quarter ratio trends straight from the companies' own XBRL; a gate then decides which ~15% of filings are worth the Claude API and your attention. Requires Ollama on a machine with a decent GPU.
- **Radar** — the always-on, no-GPU tier of the scanner, pointed at **small-cap tech** ($50M–$2B, liquidity-filtered) rather than the mega caps that quant desks already read within seconds of the wire. It sweeps EDGAR several times a day for the deterministic catalysts that actually move a company this size: shelf registrations and takedowns, listing and late-filing notices, activist stakes, open-market insider buying clusters, buybacks, uplistings, fundamental inflections (first profit or free cash flow after a loss run, revenue growth accelerating), share-count expansion, months of cash left, and 8-K items scored *relative to market cap*. No model and no GPU — EDGAR plus arithmetic — and each hit is enqueued for the scanner's deep-dive tier.

All four run as a CLI on your laptop (or a scheduled runner). A small read-only Next.js viewer (`apps/web/`, on Vercel free tier) reads the results on your phone. The pipelines are **not** deployed — only the viewer.

For operational depth — costs, web-viewer setup/deploy, cache management, reading the verdict — see **[USAGE.md](USAGE.md)**. For design rationale and build history see the spec docs: **[oldSPEC.md](oldSPEC.md)** (Stock Vetter), **[SPEC.md](SPEC.md)** (Signal Tracker build plan), **[SHORTSPEC.md](SHORTSPEC.md)** (Short-Side Scanner), and **[HANDOFF.md](HANDOFF.md)** (packaging overview). This file is the orientation: how to run it, then how each tool actually works.

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

### Short-Side Scanner

Needs [Ollama](https://ollama.com) running locally with a model pulled
(`ollama pull qwen3:32b && ollama pull nomic-embed-text`). See
**[SHORTSPEC.md](SHORTSPEC.md)** for the design and the tuning knobs.

```bash
# One company's latest 10-K, end to end
pnpm short-scan NVDA

pnpm short-scan NVDA --form=10-Q
pnpm short-scan NVDA --8k --since=2026-06-01   # every 8-K since a date
pnpm short-scan NVDA --no-synthesis            # local tier only, no cloud spend
pnpm short-scan NVDA --index-only              # fetch + index, no model calls

# Build the universe (slow, weekly at most), then sweep it
pnpm build-universe --top=2000
pnpm short-scan --universe=data/universe.json --since=2026-07-01

# Inspect the local index — the same retrieval the cloud model gets
pnpm lookback stats
pnpm lookback search "days sales outstanding" --ticker=NVDA
pnpm lookback verify "Days sales outstanding increased to 78 days"

# Check the chunk-size estimator against your actual model's tokenizer
pnpm calibrate-tokens

# Cross-filing trends for one company — no GPU needed, just EDGAR and arithmetic
pnpm trends NVDA
pnpm trends NVDA --as-of=2024-01-31   # what a filing that date would have seen
pnpm trends NVDA --metric=dso
```

Results land in `fixtures/short/<TICKER>/<accession>/` as `brief.md` (what the
local tier extracted plus the cross-filing trends), `triage.json` (why it did or
didn't escalate), and `assessment.md` (the thesis, if it escalated).

The trend detectors are tuned to be quiet — a healthy large cap should produce
few or no findings. If a name like KO lights up across six detectors, suspect a
concept mapping rather than a fraud.

### Radar (small-cap tech)

The always-on, no-GPU tier of the scanner: a deterministic sweep of a
small-cap tech watchlist for filing catalysts. No model, no Ollama — EDGAR and
arithmetic, so it runs on a plain cron.

```bash
# Build the universe (slow, weekly at most) — $50M–$2B tech, liquidity-filtered
pnpm build-smallcap
pnpm build-smallcap --min-cap=100e6 --max-cap=1e9   # a narrower band
pnpm build-smallcap --min-dollar-volume=2e6         # stricter tradability floor
pnpm build-smallcap --include-sic=4813,8731         # widen the sector set
pnpm build-smallcap --pin=RKLB,SPCX                 # always keep these names
pnpm build-smallcap --resume                        # continue from the caches

# Sweep it
pnpm radar                                   # since yesterday (the cron mode)
pnpm radar --days=30                         # a wider backfill window
pnpm radar --since=2026-07-01
pnpm radar --direction=bullish               # green flags only
pnpm radar --focus-only                      # only names you already know
pnpm radar --watchlist=data/watchlist.json   # the old large-cap list
pnpm radar --no-persist                      # compute + print only

# Drain the deep-dive queue on the GPU box (focus-list filings only)
pnpm radar-worker
```

New signals are deduped into Turso by key, so overlapping windows are free and
each one surfaces exactly once. `.github/workflows/short-radar.yml` runs the
sweep four times through the US session plus an overnight backstop;
`.github/workflows/smallcap-universe.yml` rebuilds and commits the watchlist
weekly. See [Radar — methodology](#radar--methodology) for what it looks for
and why.

**The two-tier workflow.** `data/watchlist-smallcap.json` (a few hundred names)
is the *discovery* funnel; the FOCUS list is what you actually act on. Focus is
manual entries in `data/focus-list.json` **∪ auto-focus**: every ticker a
deep-dive flagged `mispriced-long` in the last ~two quarters is promoted
automatically. That closes the discovery loop for a universe of companies you
have never heard of — focus membership is earned by a verdict, not curated by
familiarity. Focus signals sort first and get their own digest section.

Queueing follows the same split. Loud non-earnings signals (a 4.02
non-reliance, a restructuring, high XBRL deterioration, an inflection) queue a
deep-dive for the **whole universe** — that is discovery. Routine earnings
releases (Item 2.02, promoted to high at small-cap size) queue **only for
focus names** — which both keeps earnings season affordable and re-underwrites
every live long thesis once a quarter for ~$0.20. Tune auto-focus with
`RADAR_AUTO_FOCUS_DAYS` (default 180), `RADAR_AUTO_FOCUS_MIN_CONVICTION`
(default 0), or disable with `RADAR_AUTO_FOCUS=0`.

The view filters are views, never writes: `--direction=bullish` changes what
you read and what the digest emails, and the sweep still persists everything.

**Synthesis on a cheaper model.** The deep-dive's cloud pass defaults to
Claude; at universe-wide volume you can route it to DeepSeek V4 Pro (~12x
cheaper per report) via the OpenAI-compat adapter:

```bash
# On the GPU box:
DEEPSEEK_API_KEY=... RADAR_SYNTHESIS_MODEL=deepseek-v4-pro pnpm radar-worker
pnpm radar-worker --model=deepseek-v4-pro      # flag form; overrides the env
pnpm radar-worker --reanalyze=ACC1 --model=... # A/B one filing across models
```

Cost logs price each model at its own rates. Caveats: DeepSeek does not
enforce tool schemas server-side (malformed submissions cost a retry
iteration, handled automatically), and citation fidelity still rides on the
`verify_quote` tool rather than the model.

**Side-by-side comparison (default ON).** Every escalated filing runs the
cloud synthesis twice — once on the primary model (whose verdict drives the
feed, the digest, and auto-focus) and once on the other provider as a
challenger. Same brief, same tools, same as-of cap: the model is the only
variable. The worker logs both verdicts per job (`⚠ DISAGREE` when they
split), the `/radar` feed marks disagreements with a `⚖ models split` chip,
and the detail page renders the two assessments side by side with per-side
cost. The comparison never drives anything and its failure never fails a job
— a DeepSeek challenger without `DEEPSEEK_API_KEY` is skipped with a startup
note, so default-on is safe before the key exists.

```bash
pnpm radar-worker --no-compare          # or RADAR_COMPARE=0 — primary only
RADAR_COMPARE_MODEL=<model-id> …        # pick a specific challenger
```

With a Claude primary the comparison adds ~$0.02/report (the DeepSeek leg);
with a DeepSeek primary it adds the Claude leg (~$0.20), i.e. comparison mode
always costs about what Claude-only did. When the verdicts have agreed long
enough to convince you, set `RADAR_SYNTHESIS_MODEL=deepseek-v4-pro` to swap the
seats — the comparison then keeps auditing DeepSeek from the cheap side of
the bill, or turn it off and pocket the full saving.

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

## Radar — methodology

The radar started out pointed at the top ~100 large-cap tech names. That is the
wrong place for it, and the reason is not that the detectors were bad — it is
that those hundred securities are the most intensively analyzed assets in
existence. Every 8-K they file is read by a hundred funds within seconds of
hitting the wire, and by dozens of retail screeners that do exactly what this
does. A deterministic EDGAR scanner adds no information there.

Two orders of magnitude down the cap scale, that coverage collapses. A $250M
company typically has no sell-side analyst, no quant desk modelling its
inventory, and a filing that essentially nobody reads on the day. The
deterministic tells are all still there — and at that size they are *larger*
relative to the enterprise. That gap is the whole thesis.

Three things had to change to move down the cap scale. A straight universe swap
would have produced a worse feed, not a better one.

**1. The universe is cut on tradability, not just size.** `pnpm build-smallcap`
takes SEC's ~10,000 registrants, prices them all through Yahoo in batches
(market cap, price, 3-month average volume), keeps the ones inside the cap band
that also clear a price floor and an average-dollar-volume floor, and only
*then* spends one EDGAR request each classifying the survivors by SIC code.
The order is deliberate — the cheap filters run first — and the liquidity
filter is not optional. A $150M company with $200k of daily turnover is one
where a normal position is several days of volume to build, the spread eats the
edge, and there is usually no borrow to short against. A signal on a name like
that isn't an opportunity, it's a distraction.

**2. Materiality is cap-relative.** The 8-K item severity table implicitly
assumes a large enterprise: a new credit facility, an acquisition, an earnings
release are all rated `medium` and filtered out. That is right at $500B and
wrong at $200M, where a new $30M facility is a balance-sheet event and the
earnings print is the single largest scheduled repricing event of the quarter.
So below $2B the radar promotes the items whose materiality scales with size
(1.01, 2.01, 2.02, 2.03, 5.01, 5.03) one notch. Items already rated high or
critical are left alone — they were loud at any size. A watchlist that carries
no market caps gets the old large-cap behaviour unchanged.

**3. The detectors that matter at this size are different ones.** Multi-quarter
margin drift is a large-cap tell. Down here the events are financing and
survival, so the radar adds:

| Kind | What it is | Cost |
|---|---|---|
| `offering` | S-1/S-3/F-1/F-3 registrations, 424B3/B4/B5 prospectuses | none — the form type in the daily index *is* the signal |
| `late-filing` | NT 10-K, NT 10-Q, Form 25-NSE | none |
| `ownership` | SC 13D (activist, not the passive 13G), SC TO-T, SC 14D9 | none |
| `dilution` | diluted share count up ≥10% QoQ or ≥25% YoY | one companyfacts request |
| `runway` | cash ÷ trailing free-cash burn, under 6 quarters | shares that request |
| `insider-buy` | Form 4 open-market purchase clusters | one submission fetch per Form 4 |
| `buyback` | diluted share count *shrinking* ≥2% QoQ or ≥5% YoY | shares the companyfacts request |
| `inflection` | first operating profit / first positive FCF after a loss run; YoY revenue growth accelerating | shares it too |
| `uplisting` | Form 8-A12B (OTC → Nasdaq/NYSE), SC 13G | none — index-only |

The financing cycle reads end to end: shelf registered (S-3) → takedown pricing
(424B5) → share count jumps (`dilution`) → runway resets. And `runway` is what
makes the rest predictable — a company inside two quarters of cash is going to
raise, and that is most of why the shelf filing matters at all.

The same move also required *removing* a signal. Altman Z'' puts essentially
every pre-profit micro cap in the distress zone permanently: it is a
description of the business model, not news, and reporting it every quarter for
200 names is how a feed teaches its reader to ignore it. So below $2B the
distress screen fires only on the **transition** — outside the zone a year ago,
inside it now.

**Direction is now explicit.** As a short-only scanner it was implicit. On small
caps it can't be: a tender offer and a shelf takedown are both loud signals on
the same feed pointing opposite ways, and plenty of events (a material
agreement, a change of control) genuinely cannot be signed without reading the
terms. Every signal carries `bearish` / `bullish` / `ambiguous`, and the
viewer marks it. Note that "bearish" on a small cap is frequently *not* a short
— borrow is thin and squeezes are violent — it is more often a reason not to be
long.

**The green flags.** Adding a direction column didn't by itself make the feed
two-sided: the detector set was inherited from a short-side scanner and, once
counted, was ~20 bearish signals to 3 bullish. `insider-buy` is the correction,
and it is the one genuinely bullish *primary source* EDGAR offers. Everything
else the radar reads is a disclosure a company was compelled to make; a Form 4
coded `P` is an officer choosing to put their own money in at a known price.

Transaction code is the whole detector. Most Form 4s are noise for this purpose
— `A` is a grant, `M`/`X` are option exercises, `F` is tax withholding, `S` is a
sale — and a detector that counted "insider acquired shares" would fire on every
routine RSU vest in the market. Only `P` counts. Scoring is by concentration:
how many distinct buyers (three inside two weeks is a management team that saw
the same thing, one repeat buyer is a person averaging in), whether the CEO or
CFO participated, and the dollars both absolutely and as a fraction of market
cap. A cluster needs a window wider than one sweep, so purchases accumulate in
Turso and the detector reads the trailing 14 days back out.

One caveat worth being honest about: the radar detects *disclosure events*, not
mispricing. A Form 4 is public the instant it hits EDGAR. The edge at this cap
isn't information asymmetry — it's that nobody is watching these several hundred
names, and that a combination (insider cluster plus a runway extension plus a
revenue inflection) is a pattern no single-signal screener surfaces. That's a
coverage edge, not a secrecy one, and it is worth sizing positions accordingly.

The other bullish detectors read the same series as the bearish ones, looking
for the turn UP. The bar is deliberately "first in N quarters" rather than
"good number": a profitable company printing another profitable quarter is not
news and would fire every quarter forever — the TRANSITION is the event, which
is the Altman gate's principle in reverse. Two traps are handled explicitly. A
**reverse split** cuts the share count by 90% and is one of the most bearish
things a small cap does; read naively it is by far the largest "buyback" the
detector would ever see, so anything past a 30% single-quarter drop is rejected
as a split (Item 5.03 covers it, in the right direction). And **SC 13G
amendments are excluded** — every 13G holder re-files annually, so treating
amendments as new stakes would bury the feed one February a week each year.

**Focus list.** ~400 names is the right size for *discovery* and much too large
to trade: for a short-term catalyst you need the story before the filing lands.
So `data/focus-list.json` names the ~30–50 you have actually read, and that flag
is stamped on every signal. Focus signals sort first, get their own digest
section, and are the only ones queued for a deep-dive — which is also what keeps
the GPU queue finite, since a few hundred small caps generate more high-severity
filings per day than one box can read.

**Cadence follows the trade.** The trade in a small cap is same-day: a 424B5
prices overnight and the stock opens down; an Item 3.01 listing notice hits
mid-morning. A once-daily sweep finds those a day late, which for short-term
trading is the same as not finding them. So the radar runs four times through
the US session against the current day's index — which EDGAR regenerates
through the business day — plus an overnight 3-day-window backstop that
re-reads the completed day and self-heals any throttled run. Overlap is free:
signals dedup on `key`, so a filing seen three times is surfaced once.

Everything above is arithmetic over filer-tagged data. No model, no GPU. What
the radar produces is a *candidate list*; each flagged filing is enqueued for
the deep-dive tier (`pnpm radar-worker` on the GPU box), which is where a model
judges whether it's actually mispriced and on what catalyst.

---

## Repository layout

```
stock-vetter/
├── data/
│   ├── tickers.json               # tickers Stock Vetter analyzes
│   ├── theses.json                # theses + tripwires the Signal Tracker watches
│   ├── watchlist-smallcap.json    # small-cap tech universe the radar sweeps (pnpm build-smallcap)
│   ├── focus-list.json            # the ~30-50 names you actually trade
│   └── watchlist.json             # legacy large-cap radar watchlist
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
