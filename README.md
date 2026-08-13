# Stock Vetter

Four research tools that share one codebase:

- **Stock Vetter** — type a ticker, get one decision card. Fetches the latest 10-K, DEF 14A proxy, 10-Q, SEC companyfacts, and current price; runs a three-pass primary-source value-investing checklist; computes a reverse DCF and historical valuation context; optionally folds in analyst-video or earnings-call analysis; and produces a verdict + 1–10 weighted score.
- **Signal Tracker** — write a one-line investment thesis with explicit tripwires, then let a daily cron watch SEC filings, consensus estimates, and earnings calls for the events that would confirm or break it. You get an email only when a tripwire actually flips.
- **Short-Side Scanner** — point a local GPU at the top ~2,000 US companies and read every 10-K, 10-Q, and 8-K they file, looking for the quantitative tells that precede a repricing downward. A local Qwen model does the bulk reading under a rigid schema with every claim quote-verified; a deterministic layer computes multi-quarter ratio trends straight from the companies' own XBRL; a gate then decides which ~15% of filings are worth the Claude API and your attention. Requires Ollama on a machine with a decent GPU.
- **Radar** — the always-on, no-GPU tier of the scanner, pointed at **small-cap tech** ($50M–$2B, liquidity-filtered) rather than the mega caps that quant desks already read within seconds of the wire. It sweeps EDGAR several times a day for the deterministic catalysts that actually move a company this size: shelf registrations and takedowns, listing and late-filing notices, activist stakes, open-market insider buying clusters, buybacks, uplistings, fundamental inflections (first profit or free cash flow after a loss run, revenue growth accelerating), share-count expansion, months of cash left, and 8-K items scored *relative to market cap*. No model and no GPU — EDGAR plus arithmetic — and each hit is enqueued for the scanner's deep-dive tier.

All four run as a CLI on your laptop (or a scheduled runner). A small read-only Next.js viewer (`apps/web/`, on Vercel free tier) reads the results on your phone. The pipelines are **not** deployed — only the viewer.

For operational depth — costs, web-viewer setup/deploy, cache management, reading the verdict — see **[USAGE.md](USAGE.md)**. For design rationale and build history see the spec docs: **[oldSPEC.md](oldSPEC.md)** (Stock Vetter), **[SPEC.md](SPEC.md)** (Signal Tracker build plan), and **[HANDOFF.md](HANDOFF.md)** (packaging overview). The Short-Side Scanner has no spec doc — its rationale lives in the header comment of each module under `packages/local/src/` (`pipeline.ts` for the ordering decisions, `triage.ts` for the gate, `lookback.ts` for the retrieval design) and in the [Radar — methodology](#radar--methodology) section below. This file is the orientation: how to run it, then how each tool actually works.

---

## Setup

### Prerequisites

| | Requirement | Why |
|---|---|---|
| **Node** | ≥ 20 (`engines` in `package.json`); the CI workflows run 22 | Everything runs TypeScript directly through `tsx` — there is no build step to run |
| **pnpm** | 9.15.0, pinned by `packageManager` | `corepack enable && corepack prepare pnpm@9.15.0 --activate` if you don't have it |
| **Turso CLI** | optional | Only needed to create the database the first time — see [First-time database setup](#first-time-database-setup) |
| **Ollama + a GPU** | optional; Short-Side Scanner and `pnpm radar-worker` only | The reference box is one 32GB-class card (RTX 5090) running `qwen3:32b`. Nothing else in the repo needs a GPU |
| **Disk** | a few hundred MB anywhere; **tens of GB** on the GPU box | `.cache/` holds SEC sections and LLM outputs and is safe to delete; `.cache/lookback.db` (the local filing index) is the one that grows, which is why `LOOKBACK_DB_PATH` exists |

Everything except the local-model tier runs on a plain laptop — including the
whole Radar, which is EDGAR plus arithmetic.

```bash
pnpm install
cp .env.example .env      # then fill in keys (see below)
pnpm typecheck            # tsc -b over packages/*/src + scripts/
pnpm test                 # tsx --test over packages/*/src/*.test.ts + apps/web
```

There is **no build step** — every CLI runs the TypeScript directly through
`tsx`, and `tsc` is only ever asked to typecheck (`noEmit`). The root
`tsconfig.json` covers `packages/*/src` and `scripts/`; `apps/web` has its own,
so typecheck it separately with `pnpm --filter @stock-vetter/web typecheck`.

**Environment** (`.env`):

| Variable | Required for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | all LLM passes | |
| `SEC_USER_AGENT` | SEC EDGAR fetches | `"Your Name your@email.com"` — SEC requires it |
| `FMP_API_KEY` | Signal Tracker | Financial Modeling Prep (Starter tier); consensus estimates + ratings-revision proxy |
| `ALPHAVANTAGE_API_KEY` | earnings-call transcripts | `--transcript` vetting + the AV transcript feed |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | web viewer + tracker state | Without these, the analyze CLI is fixtures-only and the tracker uses a local cursor cache |

The scheduled tracker cron (`.github/workflows/signal-tracker.yml`) reads these as GitHub Actions **secrets**, not from `.env`. Email-digest variables (`AUTH_RESEND_KEY`, `EMAIL_FROM`, `SIGNAL_DIGEST_TO`, `SIGNAL_TRACKER_BASE_URL`) are optional — without them the run still works, it just sends no email.

**Who needs what.** None of this is all-or-nothing. Each tool needs a different
slice of the setup, and you can stand one up without touching the others:

| | Keys | Turso | GPU / Ollama | Scheduled? |
|---|---|---|---|---|
| Stock Vetter (`analyze-ticker`) | `ANTHROPIC_API_KEY`, `SEC_USER_AGENT`; `ALPHAVANTAGE_API_KEY` for `--transcript` | optional — fixtures-only without it | no | no, you run it |
| Signal Tracker (`track`) | `ANTHROPIC_API_KEY`, `FMP_API_KEY`, `SEC_USER_AGENT` | recommended — it holds the authoritative cursors | no | yes, `signal-tracker.yml` daily |
| Radar (`radar`, `build-smallcap`) | `SEC_USER_AGENT` only | required — dedup + the signal feed | no | yes, `short-radar.yml` 5×/day |
| Radar deep-dive (`radar-worker`) | `ANTHROPIC_API_KEY` and/or `DEEPSEEK_API_KEY` | required — it drains a Turso queue | **yes** | no, you run it on the GPU box |
| Short-Side Scanner (`scan`) | `ANTHROPIC_API_KEY`, unless `--no-synthesis` | no | **yes** | no |
| Web viewer (`apps/web`) | `AUTH_SECRET`, `AUTH_RESEND_KEY`, `EMAIL_FROM`, `CRON_SECRET` | required — it reads nothing else | n/a | Vercel cron, EOD prices |

The Radar is by far the cheapest thing here to stand up: an SEC user-agent
string and a Turso database, no model of any kind, no GPU.

**The rest of the environment.** Every variable below has a working default;
`.env.example` documents each one inline with its footguns.

| Variable | Default | What it does |
|---|---|---|
| `DEEPSEEK_API_KEY` | — | Enables DeepSeek as a synthesis model, and as the default side-by-side challenger |
| `RADAR_SYNTHESIS_MODEL` | Claude | Primary model for the deep-dive's cloud pass |
| `RADAR_COMPARE`, `RADAR_COMPARE_MODEL` | on, "the other provider" | Side-by-side challenger (see below) |
| `RADAR_AUTO_FOCUS`, `RADAR_AUTO_FOCUS_DAYS`, `RADAR_AUTO_FOCUS_MIN_CONVICTION` | on, 180, 0 | Auto-promotion into the focus list |
| `RADAR_DIGEST_TO`, `RADAR_BASE_URL` | — | Radar digest email recipient and the link base for it |
| `OLLAMA_HOST`, `OLLAMA_MODEL`, `OLLAMA_NUM_CTX`, `OLLAMA_CONCURRENCY`, `OLLAMA_EMBED_MODEL` | `127.0.0.1:11434`, `qwen3:32b`, 16384, 1, `nomic-embed-text` | The local tier. `OLLAMA_NUM_CTX` is load-bearing: Ollama silently truncates an over-length prompt rather than erroring |
| `LOCAL_BACKEND` | `ollama` | Set to `openai` to talk to llama.cpp / vLLM / LM Studio's OpenAI-compatible surface instead |
| `LOOKBACK_DB_PATH` | `.cache/lookback.db` | The local filing index — tens of GB, keep it on the GPU box |
| `SEC_MIN_INTERVAL_MS` | 125 | EDGAR pacing. SEC's limit is 10 req/s and exceeding it earns a silent ten-minute IP block |
| `STOCK_VETTER_CACHE_DIR` | `.cache` | Root of the filesystem cache |

### First-time database setup

Only needed once, and only for the tools that want Turso (everything but a
fixtures-only `analyze-ticker` and a `--no-persist` radar sweep). There is no
separate migration command — `migrate()` in `packages/core/src/turso.ts` applies
`packages/core/migrations/*.sql` idempotently on every CLI that writes, so
creating the database and running one command is the whole bootstrap:

```bash
brew install tursodatabase/tap/turso      # or see https://docs.turso.tech
turso auth login
turso db create stock-vetter
turso db show stock-vetter --url          # → TURSO_DATABASE_URL
turso db tokens create stock-vetter       # → TURSO_AUTH_TOKEN
```

Put both in the repo-root `.env`, then:

```bash
pnpm push-fixtures                        # creates the schema, backfills any existing fixtures/
pnpm allow-email you@example.com "owner"  # seed the viewer's sign-in allowlist BEFORE you deploy
```

Both are idempotent. Skipping the second one is how you lock yourself out of
your own viewer — sign-in fails closed on an empty `allowed_emails` table.

---

## How the four tools connect

They share one repo, one set of SEC/market adapters, and one database — but
they answer four different questions, and only two of them are wired to each
other directly.

```
  EDGAR daily index ─▶  Radar               deterministic sweep, cloud cron
                        packages/local/src/radar.ts
                              │
                              │ enqueues each flagged filing (radar_jobs in Turso)
                              ▼
  EDGAR full text ──▶  Radar worker / Short-Side Scanner        ← needs the GPU
                        local model reads → triage → cloud synthesis
                        packages/local/src/pipeline.ts
                              │
                              │ every `mispriced-long` verdict auto-promotes its
                              └─▶ ticker into the FOCUS list, which changes what
                                  the next Radar sweep bothers to enqueue

  EDGAR + FMP + AV ─▶  Signal Tracker       cursor-gated daily cron
                        packages/signals/

  EDGAR + Yahoo ────▶  Stock Vetter         on demand, one ticker at a time
                        packages/pipeline/

  all four ─────────▶  Turso (libSQL) ─────▶ apps/web  (read-only viewer)
```

**The one real loop** is Radar → deep-dive → focus list → Radar. That is the
discovery funnel: a few hundred names you have never heard of get swept
cheaply, the loud ones get read by a model, and the ones a model says are
mispriced earn their way onto the short list that gets read every quarter.

**Stock Vetter and the Signal Tracker are coupled by you, not by code.** You
read a decision card, form a view, and write that view into `data/theses.json`
as a falsifiable claim with tripwires. They share machinery — the same reverse
DCF, the same extract → critique → judge shape, the same prompt-hashed LLM
cache — but no artifact flows automatically between them. (The tracker builds
its own reverse DCF from companyfacts at evaluation time; it does not read
`fixtures/<TICKER>/reverse-dcf.json`.)

**What each tool writes.** Turso is the shared bus. With one exception, each
table has a single producer:

| Tool | Filesystem | Turso tables |
|---|---|---|
| Stock Vetter | `fixtures/<TICKER>/` | `tickers`, `primary_source_runs`, `financials`, `videos`, `analyst_cards` |
| Signal Tracker | `fixtures/theses/` | `signal_cursors`, `thesis_status`, `signals`, `evaluations`, `theses`, `signal_run_lock` |
| Radar | — (prints; `--no-persist` to skip Turso) | `short_radar`, `radar_companies`, `radar_jobs`, `insider_purchases`, `insider_filings_seen` |
| Deep-dive / Scanner | `fixtures/short/<TICKER>/<accession>/`, `.cache/lookback.db` | `radar_jobs` (results + the comparison columns) |
| `pnpm allow-email` | — | `allowed_emails` (the viewer's sign-in allowlist) |
| Web viewer | — | reads all of the above; writes only `quotes` and the Auth.js tables |

The exception is `normalized_transcripts`, which lives in `core` and is written
by whichever tool normalized the call first — Stock Vetter's `--transcript`
pass or the tracker's `av-transcript` feed. Normalizing a transcript is the
expensive part, so it is deliberately done once and shared.

Schema lives in `packages/core/migrations/*.sql` and is applied idempotently by
`migrate()` in `packages/core/src/turso.ts` — every CLI that writes calls it, so
there is no separate migration step.

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

Adding a ticker is just: append it to `data/tickers.json`, run `analyze-ticker`, done — the push to the viewer is automatic. (See [Common tasks](#common-tasks-step-by-step) below for the step-by-step, and [USAGE.md](USAGE.md) for the full add-a-ticker / add-a-reader / deploy flows.)

**Cost:** ~$1.45 per fresh ticker (~$2 with an analyst video); $0 on cached re-runs. Cost is logged to stderr; the pipeline warns above $0.75 and aborts above $1.50 per run.

### Short-Side Scanner

Needs [Ollama](https://ollama.com) running locally with a model pulled
(`ollama pull qwen3:32b && ollama pull nomic-embed-text`) on a machine with a
32GB-class GPU. `scripts/scan.ts`'s header lists every flag; the design
rationale is in the module headers under `packages/local/src/`.

```bash
# One company's latest 10-K, end to end
pnpm scan NVDA

pnpm scan NVDA --form=10-Q
pnpm scan NVDA --8k --since=2026-06-01   # every 8-K since a date
pnpm scan NVDA --no-synthesis            # local tier only, no cloud spend
pnpm scan NVDA --index-only              # fetch + index, no model calls

# Build the universe (slow, weekly at most), then sweep it
pnpm build-universe --top=2000
pnpm scan --universe=data/universe.json --since=2026-07-01

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

**How one filing moves through it** (`packages/local/src/pipeline.ts`):

```
EDGAR → layout render → boilerplate strip → chunk       deterministic
      → index into the local lookback store             deterministic
      → per-chunk extraction under a rigid schema       LOCAL model (GPU)
      → cross-filing trends, composites, recurrence     deterministic (XBRL)
      → aggregate into one brief                        deterministic
      → triage: score the brief, escalate or don't      deterministic
      → synthesis, only if triage said so               CLOUD model ($)
```

Three orderings are deliberate and worth knowing before changing anything. The
filing is indexed **before** extraction and **even when triage declines** — the
index is what quote-verification reads, and this year's boring 10-K is next
year's comparison baseline. Triage runs **after** extraction, because there is
no way to know a filing is boring without reading it and reading it is the
nearly-free part; what triage saves is cloud spend and your attention. And every
cross-filing number is computed **as of the filing's date**, never today's, so a
backfill can't score historical filings against data that didn't exist yet.

Triage itself is plain arithmetic on purpose — auditable, stable between runs,
and impossible to talk out of its answer. It weights each flag by category and
escalates above a threshold (default 12, `--threshold=N`), which is what keeps
the cloud bill proportional to the interesting minority of filings rather than
to the universe.

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
```

The build also fetches each name's full company name and a short business
description (Yahoo assetProfile, cached like the other stages). The sweep
pushes those to Turso so the `/radar` feed and detail pages can say what each
unfamiliar ticker actually is; until the watchlist is rebuilt with
descriptions, the SIC industry label stands in.

```bash
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
cd apps/web
cp .env.example .env         # TURSO_*, AUTH_SECRET, AUTH_RESEND_KEY, EMAIL_FROM, CRON_SECRET
pnpm dev                     # http://localhost:3000
```

Generate `AUTH_SECRET` with `openssl rand -base64 32` and `CRON_SECRET` with
`openssl rand -hex 32`. Sign-in is magic-link email against an allowlist that
lives in the `allowed_emails` **Turso table**, not an env var — so seed yourself
first with `pnpm allow-email you@example.com` or you'll be locked out of your
own local dev server (it fails closed on an empty table). Local dev and
production read the same table, so adding a reader needs no redeploy.

**What it shows.** Everything is read-only: the viewer never calls a model,
never calls Yahoo on the request path, and costs nothing per page view because
every page renders JSON the CLIs already wrote.

| Route | What's on it |
|---|---|
| `/` | Dashboard — every analyzed ticker sorted by score, tappable verdict-bucket filter chips, 2-line summaries, and both prices per row ("$612 today · was $598 on May 10") |
| `/ticker/[ticker]` | The decision card: verdict, weighted score, the six-dimension table with uncertainty dots, valuation context, analyst-vs-primary findings — then a collapsible **deep view** with per-dimension 3-pass reasoning, citations with grep-match-tier badges, triple-sample spread, the reverse-DCF sensitivity grid, historical financials, and the 10-Q change section |
| `/ticker/[ticker]/video/[videoId]` | One analyst video's card: extracted thesis with YouTube-timestamp citations, the pipeline's score of the video, the four critique angles |
| `/theses` | Signal Tracker status — every thesis with a green/amber/red chip, tripped ones first, plus a **Run now** button that fires the tracker workflow via `workflow_dispatch` (needs `GH_DISPATCH_TOKEN`; refuses with 409 if a run already holds the Turso lock) |
| `/theses/[thesisId]` | One thesis: its claim, each watch-item with its tripwire and current state, the reverse DCF used as the quantitative anchor, and a "recent activity" log of the events that were evaluated |
| `/radar` | The radar feed with view chips — **All / ★ Focus / ▲ Green flags / ▼ Warnings** — plus ticker search. Each row carries direction, severity, cap, and the company's name and description; a `⚖ models split` chip marks a filing where the two synthesis models disagreed |
| `/radar/[accession]` | One deep-dive: the mispricing verdict and conviction, the thesis, and — when the comparison ran — the primary and challenger assessments side by side with per-side cost |
| `/signin` | The only unauthenticated page. Everything else redirects here |

Full deploy instructions (Vercel, magic-link auth, EOD-price cron) are in [USAGE.md](USAGE.md).

### Scheduled runs (GitHub Actions)

Two of the four tools are meant to run unattended, and they do it from a plain
checkout of this repo — nothing is deployed. If you fork or clone this, the
crons stay dormant until you add the secrets below under **Settings → Secrets
and variables → Actions**; a missing secret doesn't fail the run loudly, it
just makes the run smaller (no digest, no consensus data).

| Workflow | Cadence (UTC) | What it runs | Secrets it reads |
|---|---|---|---|
| `signal-tracker.yml` | daily 06:30 | `pnpm fetch-dram-price --days 45` (best-effort, never fails the job), then `pnpm track --holder cron --since <14 days ago>` | `ANTHROPIC_API_KEY`, `FMP_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SEC_USER_AGENT`; optional `AUTH_RESEND_KEY`, `EMAIL_FROM`, `SIGNAL_DIGEST_TO`, `SIGNAL_TRACKER_BASE_URL` |
| `short-radar.yml` | 07:00 backstop + 13/16/19/22 on weekdays | `pnpm radar` — `--days=3` overnight (authoritative, self-heals a throttled run), `--days=1` intraday | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SEC_USER_AGENT`; optional `AUTH_RESEND_KEY`, `EMAIL_FROM`, `RADAR_DIGEST_TO`, `SIGNAL_TRACKER_BASE_URL` (passed in as `RADAR_BASE_URL`) |
| `smallcap-universe.yml` | Sunday 06:00 | `pnpm build-smallcap`, then commits `data/watchlist-smallcap.json` back to the repo | `SEC_USER_AGENT` |

Four things about them are worth knowing before you wonder why nothing is
happening:

- **The intraday radar runs no-op until the universe exists.** Without
  `data/watchlist-smallcap.json`, `pnpm radar` falls back to the legacy
  large-cap watchlist — right for a manual run, wrong four times a day — so the
  intraday crons skip with a warning annotation. **Run "Rebuild small-cap
  universe" once** (`workflow_dispatch`) to start them. The 07:00 backstop
  always runs.
- **`smallcap-universe` needs `contents: write`** (it has it) because the
  watchlist has to be in the repo for the radar's checkout to see it. It skips
  the commit when only the `builtAt` timestamp moved, so the commit history is
  a real audit trail of what entered and left the universe.
- **Every workflow takes `workflow_dispatch` inputs** for the cases you'd
  otherwise need a laptop for: `since` / `allow_backlog` on the tracker,
  `since` / `watchlist` on the radar, and the three cap/liquidity filters on
  the universe build.
- **The viewer's "Run now" button** on `/theses` fires `signal-tracker.yml`
  through the same `workflow_dispatch`. It needs a fine-grained PAT with
  *Actions: write* on your fork, set as `GH_DISPATCH_TOKEN` in the **Vercel**
  project — server-side only, the browser never sees it. Unset, the route
  returns 503 and the button is inert; the cron still runs on schedule.

The GPU-side work (`pnpm scan`, `pnpm radar-worker`) is deliberately **not**
scheduled here: a hosted runner has no GPU, and the queue it drains is durable
in Turso, so the box can be off for a week without losing anything.

### The rest of the CLI

Everything above is what you run day to day. The remaining entry points in
`scripts/` are development, verification, and one-off harnesses — listed here
so you know they exist rather than because you'll need them on day one.

| Command | What it's for |
|---|---|
| `pnpm run-pipeline <youtube-url>` | The analyst-video pipeline on a single URL, printed to stdout (`--json`, `--debug`). This is the standalone form of what `analyze-ticker` runs per configured video |
| `pnpm tsx scripts/render-card.ts <card.json>` | Re-render a saved `DecisionCard` JSON as markdown — markdown and JSON from one paid run, not two |
| `pnpm eval` | Video-pipeline regression harness over `scripts/eval-cases.json`: runs each case and scores the verdict against the `yourView` you recorded (`✓` / `partial` / `✗`). Costs real money — it runs the pipeline |
| `pnpm evaluate-signals` | The tracker's offline evaluator: same extract → critique → judge, bounded to a `--since` window, writing `fixtures/theses/<id>.md`. **No persistence** — cursors and tripwire status are untouched, which is what makes it safe to run beside the cron |
| `pnpm fetch-dram-price` | Writes this month's DRAM price direction into `data/manual-events.json` (idempotent per month). The one automated `manual`-feed watch-item; the daily cron runs it |
| `pnpm test-coldstart-widen` | Deterministic proof of the cold-start auto-widen rule in `track.ts`. No network |
| `pnpm build-watchlist AAPL MSFT …` | Builds a `{tickers:[{ticker,cik}]}` watchlist from scratch. `add-watchlist` appends to an existing one; this one creates it |
| `pnpm tsx scripts/verify-citations.ts <TICKER>` | Grep-checks every quote in `fixtures/<TICKER>/primary-source-checklist.json` against the cited source file; exits non-zero if any quote can't be located |
| `pnpm tsx scripts/verify-parser.ts <TICKER> 10-K` | Parser byte-identity harness — a SHA256 over the parsed sections, so a parser change can be proven not to move existing output |
| `pnpm tsx scripts/compare-pass1-models.ts <TICKER>` | Pass-1 model comparison (score deltas, citation verify rate, counter-evidence depth) |
| `pnpm tsx scripts/probe-llamacpp.ts <TICKER> 10-K 5` | Temporary probe for OpenAI-compatible local servers, superseded by `LOCAL_BACKEND=openai` |

---

## The `data/` files

Everything you configure by hand lives in `data/`. Each file is plain JSON
carrying a leading `_doc` key that restates its own contract — the convention
throughout the repo. `data/theses.json` is Zod-validated on load (`ThesesFile`
in `packages/schema/src/types.ts`) and will fail loudly on a bad shape; the
others are read leniently.

| File | Hand-edited? | Read by |
|---|---|---|
| `tickers.json` | yes | `analyze-ticker` |
| `theses.json` | yes | `track` |
| `manual-events.json` | yes (and by `fetch-dram-price`) | `track` |
| `focus-list.json` | yes | `radar` |
| `watchlist-smallcap.json` | **no** — generated by `build-smallcap` | `radar` |
| `watchlist.json` | via `add-watchlist`/`build-watchlist` | `radar --watchlist=…` |
| `universe.json` | **no** — generated by `build-universe` | `scan --universe=…` |
| `parser-coverage.md` | yes | nothing — it's your notebook of which tickers parsed cleanly |

### `tickers.json` — what Stock Vetter analyzes

An object keyed by **uppercase ticker**. The minimum entry is an empty video
list. `notes` is a reminder for you and is never read by the pipeline.

```json
{
  "_doc": "Ticker → analyst content URLs. Hand-curated.",
  "KO": {
    "videos": [],
    "notes": "Coca-Cola — no analyst videos configured; primary-source only"
  },
  "MSFT": {
    "videos": ["https://www.youtube.com/watch?v=WtoMBbTkHjU"]
  }
}
```

Each configured video runs the per-video pipeline (~$0.60) and produces a card
the meta-card can synthesize against. Leave `videos: []` unless you actually
want the cross-source comparison — most tickers should start that way.

### `theses.json` — what the Signal Tracker watches

`{ "_doc": …, "theses": [ … ] }`. Every field below is required except `_doc`.

| Field | Meaning |
|---|---|
| `id` | Stable slug. It's the cursor key, the CLI argument (`pnpm track <id>`), and the `/theses/[thesisId]` URL — renaming it resets the thesis's history |
| `claim` | The falsifiable one-liner the tracker argues with |
| `tickers` | Uppercase; these are the tickers whose filings and estimates get fetched |
| `entities` | Non-ticker dependencies ("TSMC", "hyperscaler capex"). Documentation for the evaluator's prompt, not a feed |
| `watchItems[]` | At least one. See below |

A watch-item needs `id`, `label`, `sources`, `feed`, `tripwire`, and
`tripwireDirection`:

- `sources` — one or more of `sec-8k`, `sec-10q`, `sec-10k`, `fmp-estimates`, `fmp-revisions`, `av-transcript`, `manual`. This is the zero-token pre-filter: an event from a source not listed here never reaches the LLM.
- `feed` — `auto` (a feed adapter populates it) or `manual` (you hand-enter the event, for things our tier can't reach: foreign filers like TSMC, industry price prints).
- `tripwire` — free-form English. The threshold is deliberately prose, not a number; the judge reads it.
- `tripwireDirection` — `weakens`, `strengthens`, or `either`.

See the `NVDA-margin-durability` example in [Signal Tracker — methodology](#signal-tracker--methodology) below for a complete entry.

### `manual-events.json` — hand-entered events

A bare JSON **array** (no wrapper object). Used where no feed covers the
source. `payload.thesisId` routes the event to a specific thesis; without it,
the event matches on ticker.

```json
[
  {
    "id": "dram-price-2026-08",
    "ticker": "MU",
    "date": "2026-08-05",
    "title": "DRAM contract price Aug 2026: 3Q26 contract +13-18% QoQ (TrendForce)",
    "url": "https://www.trendforce.com/price/dram/dram_spot",
    "payload": { "thesisId": "DRAM-memory-growth", "direction": "up" },
    "note": "Optional provenance for your future self."
  }
]
```

`id` becomes the dedup key (`manual:<id>`), so an entry is evaluated exactly
once no matter how many runs see it. A missing or unreadable file is not an
error — the tracker treats it as "no manual events".

### `focus-list.json` — the names you actually act on

```json
{
  "_doc": "The MANUAL half of the focus list.",
  "tickers": ["RKLB", "POET"]
}
```

An empty `tickers` array is fine and is the right starting point: the other
half of the focus list is automatic — any ticker a deep-dive flagged
`mispriced-long` in the last `RADAR_AUTO_FOCUS_DAYS` is unioned in at sweep
time. Add a manual entry when you want earnings-quarter deep-dives on a name
regardless of what the model said about it.

### `watchlist-smallcap.json` / `watchlist.json` — what the Radar sweeps

Generated, not hand-written — but worth understanding, because two fields
change the Radar's behaviour:

```json
{
  "builtAt": "2026-08-07T22:23:41.817Z",
  "filters": { "marketCap": [50000000, 2000000000], "minPrice": 1, "minAvgDollarVolume": 1000000 },
  "count": 220,
  "tickers": [
    {
      "ticker": "POET",
      "cik": "0001437424",
      "name": "POET TECHNOLOGIES INC.",
      "marketCap": 1537776896,
      "avgDollarVolume": 278989269.57,
      "sic": "3674",
      "sicDescription": "Semiconductors & Related Devices",
      "sector": "Semiconductors & electronic components",
      "description": "…"
    }
  ]
}
```

- **`cik` is load-bearing.** It's the only field the EDGAR daily-index sweep joins on; `ticker` is for display. A wrong CIK means the name is silently never swept.
- **`marketCap` decides materiality.** Below $2B the Radar promotes the cap-relative 8-K items one severity notch. An entry with **no** `marketCap` (the legacy `watchlist.json` shape) gets the old large-cap behaviour unchanged — which is exactly what you want if you point the Radar at a hand-built list.
- `name` and `description` are what the `/radar` feed prints so an unfamiliar ticker means something; until a rebuild populates them the SIC label stands in.

---

## Common tasks, step by step

### Analyze a new ticker

1. Add it to `data/tickers.json` with `{"videos": []}` (see above).
2. `pnpm analyze-ticker AAPL` — 3–5 minutes, ~$1.45 on a cold ticker.
3. Read `fixtures/AAPL/decision-card.md`. The full artifact tree (checklist, reverse DCF, parsed 10-K sections, proxy text) is documented in [USAGE.md](USAGE.md).
4. If `TURSO_*` is set the push is automatic — it appears on the dashboard within ~5 minutes (pages cache for 300s). If it isn't, `pnpm push-fixtures AAPL` later does the same thing without re-analyzing.

The EOD price on the dashboard comes from a separate Vercel cron; a
just-analyzed ticker shows "analyzed at $X" until the next 22:00 UTC run, or
until you poke `/api/cron/eod-prices` by hand (see [USAGE.md](USAGE.md)).

### Add a new thesis

1. Append a thesis object to `theses` in `data/theses.json`. Give it watch-items whose `sources` you can actually feed — an item watching `fmp-estimates` needs `FMP_API_KEY`, and one watching `manual` needs you to write the events.
2. `pnpm track <thesis-id> --no-eval` first. This ingests and diffs without spending anything, and prints the events that *would* be evaluated — the cheapest way to find out that your `sources` list is wrong.
3. `pnpm track <thesis-id>` to evaluate for real.
4. A brand-new thesis has an empty cursor, so it auto-widens to a **one-year** backfill on purpose — a filing older than the steady-state window shouldn't be missed just because the thesis is new. If that produces more than **8** (event × watch-item) pairs the run **refuses and does not advance the cursor**, printing the estimated cost. That's the cold-start guard. Re-run with `--allow-backlog` to accept the bill deliberately, or with `--no-widen --since 2026-06-01` to take a narrower first bite (on a cold start `--since` alone is overridden by the widen).
5. Once it's healthy, leave it to the daily cron. Use `--reset` to clear a cursor and re-examine the backlog after editing a tripwire.

Watch the direction of the cursor: `--dry-run` evaluates without persisting
anything, which is what you want while you're still tuning the prose of a
tripwire.

### Add a name to the Radar

For the generated small-cap universe, you don't — you widen the filters and
rebuild (`pnpm build-smallcap --min-cap=…`), or pin the name so it survives
every rebuild:

```bash
pnpm build-smallcap --pin=RKLB,SPCX
```

For a hand-built list, append to it without rebuilding — this resolves the CIK
from EDGAR for you, skips names already present, and touches nothing else:

```bash
pnpm add-watchlist TSLA AMZN                          # → data/watchlist.json
pnpm add-watchlist RKLB --file=data/watchlist-smallcap.json
```

Then sweep it: `pnpm radar --watchlist=data/watchlist.json`.

One caveat on the second form: `add-watchlist` writes only `{ticker, cik}`, so
a name added this way to the small-cap file carries no `marketCap` and gets the
**large-cap** severity behaviour until the next `build-smallcap` rebuild
overwrites the file. `--pin` is the durable way to keep a name in that
universe.

### Promote a name to the focus list

Add the ticker to `tickers` in `data/focus-list.json`. It takes effect on the
next sweep — focus signals sort first, get their own digest section, and are
the only names whose routine earnings releases queue a deep-dive. You usually
*don't* need to do this: a `mispriced-long` verdict promotes a ticker
automatically for `RADAR_AUTO_FOCUS_DAYS` (180 by default).

### Add a reader to the web viewer

```bash
pnpm allow-email someone@example.com "optional note"
pnpm allow-email --list
pnpm allow-email --remove someone@example.com
```

No env change and no redeploy — the allowlist is a Turso table, and it takes
effect on their next sign-in attempt.

---

## What it costs

Every LLM call is priced at its model's own rates and logged to stderr. The two
CLIs that can run away — `analyze-ticker` and `track` — carry a hard cost guard:
**warn above $0.75, abort above $1.50 per run**.

| | Typical cost | Notes |
|---|---|---|
| Stock Vetter, fresh ticker | **~$1.45** | ~$2.05 with one analyst video. Pass 1 is ~$0.67 of it |
| Stock Vetter, cached re-run | **$0** | Filesystem cache; a prompt edit invalidates only the passes downstream of it |
| Signal Tracker, steady-state day | **cents** | Cursor-gated — a day with no new filings costs nothing |
| Signal Tracker, per evaluated pair | ~$0.06 | The cold-start guard uses this to estimate a backlog |
| Radar sweep | **$0** in model spend | EDGAR + arithmetic. Only GitHub Actions minutes |
| `build-smallcap` / `build-universe` | **$0** | Slow (minutes) but free; weekly at most |
| Deep-dive synthesis, Claude | ~$0.20/report | Only the ~15% of filings triage escalates |
| Deep-dive synthesis, DeepSeek V4 Pro | ~$0.02/report | ~12× cheaper; same brief, same tools |
| Side-by-side comparison (default on) | +~$0.02 or +~$0.20 | It adds *the other* model's leg — so comparison mode costs about what Claude-only did |
| Local model tier (`scan`, `radar-worker`) | electricity | Free once the GPU is bought — which is the entire reason it exists |
| Turso + Vercel + Resend | **$0** | All free tier at this scale; see [USAGE.md](USAGE.md) |

A 20–30 ticker Stock Vetter exploration budget is ~$30–45. The Radar plus a
Claude deep-dive tier is the expensive combination at universe scale, which is
what the triage gate and the focus-only earnings rule exist to bound.

---

## Troubleshooting

**`SEC fetch failed: 403`, or EDGAR requests hanging for ten minutes.** SEC's
fair-access limit is 10 req/s per IP and exceeding it earns a ten-minute block
that is invisible in the response body. Every EDGAR call goes through one
rate-limited chain paced at 125ms (`SEC_MIN_INTERVAL_MS`); if you're seeing
403s, another process on the same egress IP is probably also hitting EDGAR.
Also confirm `SEC_USER_AGENT` is set to a real `"Name email"` string — SEC
rejects requests without one, and the built-in fallback is a placeholder.

**The Radar workflow exits 2.** Not a failure. Exit 2 means one or more days
couldn't be fetched (throttling); the next run's overlapping window re-reads
them and the Turso dedup makes the overlap free. The workflow deliberately
warns rather than failing.

**The intraday Radar runs say they were skipped.** `data/watchlist-smallcap.json`
doesn't exist yet, so the sweep would have fallen back to the legacy large-cap
list — which is the thing the small-cap refocus moved away from. Run the
"Rebuild small-cap universe" workflow once (or `pnpm build-smallcap` locally and
commit the result). The 07:00 UTC backstop is unaffected.

**The "Run now" button on `/theses` returns 503.** `GH_DISPATCH_TOKEN` isn't set
on the Vercel project. It's a fine-grained PAT with *Actions: write* on your
fork of this repo — see [Scheduled runs](#scheduled-runs-github-actions). A 409
means something different: a run already holds the Turso lock.

**`pnpm track` refuses to evaluate a new thesis.** That's the cold-start guard,
not a bug — see "Add a new thesis" above. `--allow-backlog` overrides it.

**A manual `pnpm track` says the lock is held.** The daily cron is the
authoritative writer and takes a Turso run-lock so a manual run can't race it.
Wait for it, or use `--dry-run`, which doesn't persist.

**Nothing shows up in the web viewer.** Three things to check in order: are
`TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` set in the **repo-root** `.env` (the
CLI's push is a silent no-op without them — it logs a warning and the local run
still succeeds); did the push land (`pnpm push-fixtures <TICKER>` is idempotent
and safe to re-run); and are you inside the 300-second page cache. If sign-in
itself fails, the `allowed_emails` table is empty — it fails closed by design.

**Missing env var, generally.** The failure modes are deliberately different
per key: no `ANTHROPIC_API_KEY` fails immediately; no `TURSO_*` degrades to
fixtures-only and a local cursor cache; no `FMP_API_KEY` loses consensus and
revision events but not SEC ones; no email variables mean no digest and an
otherwise-normal run. Nothing silently produces a *wrong* answer — it produces
a smaller one, and says so.

**FMP says an endpoint is restricted.** The adapters raise a distinct
`FmpTierError` on a 402/403-with-tier-message so a plan limitation reports as
"this series is not in your FMP tier" rather than as a hard failure. Consensus
estimates are annual-only on the Starter tier, and the ratings bull-index is a
*proxy* for estimate revisions, not real revision data — the `dataQuality`
string on every affected Event says so, and it propagates into the Signal.

**Ollama returns confident nonsense.** Almost always `num_ctx`. Ollama's
default context is 4096 and it does **not** error on an over-length prompt — it
silently drops the front of it (where the table header and section heading
live) and answers anyway, schema-valid and wrong. Every request here pins
`OLLAMA_NUM_CTX` (default 16384) and refuses to send a prompt that wouldn't
fit; run `pnpm calibrate-tokens` to measure the real chars-per-token ratio for
your model rather than trusting the deliberately over-estimating default.

**Cache confusion.** The filesystem cache is under `.cache/` (override with
`STOCK_VETTER_CACHE_DIR`), keyed by namespace, and safe to delete wholesale.
LLM cache keys include a hash of the prompt text, so editing a file under
`prompts/` invalidates exactly the affected pass and everything downstream of
it — you do not need to clear anything by hand after a prompt edit. SEC data is
keyed by accession, so a newly filed 10-K re-fetches automatically. The one
directory worth keeping is `.cache/lookback.db` — rebuildable from EDGAR, but
slowly. Per-namespace clearing recipes are in [USAGE.md](USAGE.md).

**A healthy company lights up six trend detectors.** Suspect an XBRL concept
mapping before suspecting fraud. `pnpm trends <TICKER>` prints the underlying
series with no GPU and no model, which is the fastest way to see whether the
input or the detector is wrong.

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
│   ├── watchlist.json             # legacy large-cap radar watchlist
│   ├── manual-events.json         # hand-entered events for `manual` watch-items
│   └── parser-coverage.md         # which tickers have parsed cleanly, and what broke
├── prompts/                # every LLM prompt as a .md file (never inlined in code)
├── fixtures/<TICKER>/      # per-ticker analysis output (cards, SEC sections, DCF)
├── fixtures/short/<TICKER>/<accession>/   # deep-dive output: brief.md, triage.json, assessment.md
├── .cache/                 # gitignored: SEC sections, snapshots, LLM outputs, lookback.db
├── scripts/                # CLI entry points (analyze-ticker, track, radar, scan, …)
├── packages/
│   ├── schema/             # Zod schemas + inferred types (shared, depends on nothing)
│   ├── core/               # SEC/FMP/AV/Yahoo adapters, LLM + DeepSeek clients, cache,
│   │                       #   reverse DCF, XBRL, Turso client, mailer
│   │   └── migrations/     # the Turso schema — applied idempotently by migrate()
│   ├── pipeline/           # Stock Vetter passes: extract/critique/score/meta-card/delta,
│   │                       #   plus the radar job queue and Turso writers
│   ├── signals/            # Signal Tracker: feeds, diff, evaluate, theses, digest, persistence
│   └── local/              # Short-Side Scanner AND the Radar: chunking, local-model
│                           #   extraction, lookback index, triage, synthesis, detectors
├── apps/web/               # read-only Next.js viewer (Vercel) — the only deployed piece
├── .github/workflows/      # signal-tracker (daily), short-radar (5×/day), smallcap-universe (weekly)
├── README.md               # this file
├── USAGE.md                # operating guide: costs, deploy, cache, reading the verdict
├── oldSPEC.md              # Stock Vetter project spec (build history)
├── SPEC.md                 # Signal Tracker build plan
└── HANDOFF.md              # packaging / handoff overview
```

Dependency direction is acyclic: `schema ← core ← {pipeline, signals, local}`; `apps/web` reads from Turso only.

```
                    ┌──────────────────┐
                    │ @stock-vetter/   │   Zod schemas + inferred types.
                    │      schema      │   Depends on nothing but zod. The
                    └────────▲─────────┘   single source of truth for shapes,
                             │             imported by both halves.
                    ┌────────┴─────────┐
                    │ @stock-vetter/   │   Everything that talks to the outside
                    │       core       │   world: EDGAR (rate-limited), FMP,
                    └───▲────▲─────▲───┘   Alpha Vantage, Yahoo, Anthropic,
                        │    │     │       DeepSeek, Turso, the filesystem
        ┌───────────────┘    │     └──────────────┐   cache, the mailer.
        │                    │                    │
┌───────┴────────┐  ┌────────┴───────┐  ┌─────────┴──────┐
│    pipeline    │  │    signals     │  │     local      │
│  Stock Vetter  │  │ Signal Tracker │  │ Scanner + Radar│
│  + radar jobs  │  │                │  │                │
└───────┬────────┘  └────────┬───────┘  └────────┬───────┘
        │                    │                   │
        └────────────────────┴───────────────────┘
                             │
                    ┌────────┴─────────┐
                    │    scripts/      │   Every CLI. The only layer allowed to
                    │  (the CLI layer) │   read argv, print, or write fixtures.
                    └──────────────────┘

  apps/web ──▶ @stock-vetter/schema  (types only) ──▶ Turso  (read-only)
```

`apps/web` deliberately does **not** depend on `core`, `pipeline`, `signals`, or
`local` — it imports types from `schema` and reads rows from Turso, which is
what keeps the deployed surface incapable of spending money.

**Which prompt drives which pass.** Every file under `prompts/` is loaded by
name through `loadPrompt()` (`packages/core/src/prompts.ts`, where `PromptName`
is the exhaustive list). Nothing else in the repo contains a system prompt:

| Prompt file(s) | Loaded by |
|---|---|
| `primary-source-checklist.md`, `primary-source-skeptic.md`, `primary-source-judge.md` | Stock Vetter's three passes — extract/score, skeptic, judge (`pipeline/src/primary-source.ts`) |
| `meta-card.md` | The meta-card synthesis: verdict, weighted score, cross-source findings |
| `tenq-delta.md` | The additive 10-Q-vs-10-K change pass |
| `extract.md`, `score.md` | The analyst-video pipeline's extract and score stages |
| `critique-consistency.md`, `critique-stress-test.md`, `critique-comps.md`, `critique-missing-risks.md` | The four critique angles run against a video card (`pipeline/src/critique.ts`) |
| `critique-value-checklist.md` | The value-checklist critique of a video thesis |
| `normalize.md` | Earnings-call transcript normalization — shared by the vetter and the tracker's `av-transcript` feed |
| `signal-extract.md`, `signal-critique.md`, `signal-judge.md` | Signal Tracker evaluation of one (event × watch-item) pair |
| `local-chunk-extract.md` | The local model's per-chunk extraction under the rigid schema |
| `synthesis.md` | The deep-dive's cloud pass — the only prompt either synthesis model sees |

**Working on the code.** Tests are colocated (`packages/*/src/*.test.ts`) and
run under `tsx --test`; `pnpm test` runs all of them plus `apps/web`, and a
single file is `pnpm tsx --test packages/local/src/triage.test.ts`. The suite is
offline and free — pure functions over fixtures, and the local-model client's
tests stand up a throwaway HTTP server on localhost rather than calling a real
Ollama, so no key and no GPU are needed to run it. Two rules are worth knowing
before your first change: a new shared type goes in `packages/schema/src` (the
sibling packages import it from there, never from each other), and a database
change is a **new numbered file** in `packages/core/migrations/` — `migrate()`
sorts them, records applied versions in `schema_migrations`, and skips what's
already there, so editing an already-applied migration changes nothing on a
database that has run it.

A few conventions that explain why the code looks the way it does:

- **Prompts are files, never string literals.** Everything under `prompts/` is a `.md` file loaded at runtime, and the LLM cache key includes a hash of the prompt text. That makes a prompt edit a reviewable diff *and* an automatic, surgical cache invalidation.
- **Deterministic before probabilistic.** Every tool computes what arithmetic can compute before a model sees anything — the reverse DCF, the XBRL trends, the triage score, the radar detectors, the tripwire mapping. The model is asked only for the judgment that genuinely needs one, which is what makes the cost curves in the table above hold.
- **Zod at every boundary.** External responses and LLM outputs are both parsed, never trusted. A malformed LLM output raises `LLMValidationError` with the stage name rather than propagating a plausible-looking wrong object.
- **The cheap filter runs first.** In the universe builder (size → tradability → sector), in the tracker (cursor → zero-token mapping → LLM), in the scanner (index → local model → triage → cloud). The ordering is the cost model.
- **Cost guards are in the CLI, not the library.** `analyze-ticker` and `track` own the warn/abort thresholds, so a library caller can't inherit a surprise ceiling.
