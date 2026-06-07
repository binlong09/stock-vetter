# Signal Tracker — Build Plan (for Claude Code)

A sibling tool to **stock-vetter**, living in the same monorepo. Where stock-vetter
vets a *company* on demand, the signal tracker watches a small set of *theses* on a
schedule and flags when new evidence meaningfully changes one. It reuses stock-vetter's
LLM engine, schemas, reverse-DCF, Turso push, and web viewer.

> **Design principle that governs every decision below:** this is a *noise filter*, not a
> news feed. Its job is to suppress the ~95% of market chatter that is noise and surface
> only events that move an explicitly-encoded thesis. A "signal" = information that is
> **predictive** (changes the probability of an outcome) **and non-consensus** (not already
> in the price). If a phase ever turns this into a generic headline firehose, it has failed,
> regardless of whether it runs. Build it to argue with the user, not to feed them.

---

## What we are reusing from stock-vetter (do NOT rebuild)

From `packages/pipeline/src/`:
- `llm.ts` — Anthropic client wrapper, cost tracking, prompt caching. Reuse as-is.
- `prompts.ts` — `.md` prompt loader. Reuse; point it at the new signal prompts too.
- `critique.ts` — the parallel-critique pattern (5 LLM calls in parallel). The signal
  evaluator's adversarial step is a direct adaptation of this.
- `score.ts` — final-synthesis pattern. The signal "judge" step adapts this.
- `render.ts` — decision-card → markdown. Adapt into thesis-status-card → markdown.
- `financials.ts` — Yahoo + SEC (EDGAR) fetch. Reuse the SEC path for 8-K/10-Q ingestion.
- the **reverse-DCF** module — import it directly for the "priced-in vs gravy" check.

From `packages/schema/src/`:
- `types.ts` — extend with `Thesis`, `Signal`, `ThesisStatus` Zod schemas. Same Zod-for-all-LLM-I/O discipline.

Infra patterns:
- Turso push from the CLI (same as `analyze-ticker.ts` pushes decision cards).
- `apps/web/` magic-link + `ALLOWED_EMAILS` allowlist + Resend — reuse for the new view and for email alerts.
- `scripts/eval.ts` + `eval-cases.json` agreement-table harness — reuse to eval signal classification.

**Decision point (do this):** extract the shared helpers (`llm.ts`, `prompts.ts`, the SEC
fetch in `financials.ts`, and the reverse-DCF) into a `packages/core` package that both
`packages/pipeline` and the new `packages/signals` import. If that's too invasive in one
pass, instead export them from `packages/pipeline`'s `index.ts` and have `signals` depend on
`pipeline`. Prefer `packages/core`; fall back to the export approach only if extraction
balloons the diff.

---

## New surface area (the only genuinely new work)

New package `packages/signals/src/`:
- `feeds.ts` — pull new events for a ticker since a cursor: SEC 8-K/10-Q/10-K (reuse SEC path),
  earnings-call transcripts (Financial Modeling Prep), analyst estimates + **estimate revisions**
  (FMP), price (Yahoo). One adapter function per source, normalized to a common `Event` type.
- `diff.ts` — "what changed since last check": compare fetched events against last-seen state
  (by filing accession no. / transcript date / estimate snapshot hash) and return only new events.
- `evaluate.ts` — the reused 3-step engine, per (Event × Thesis):
  1. **extract** — is there a candidate signal in this event relevant to this thesis? (LLM)
  2. **critique** — adversarial pass (adapt `critique.ts`): *Is this already priced in?
     Is it noise dressed as signal? What's the bear reading?* Run the priced-in check with
     two inputs: the estimate-revision trend (rising revisions ⇒ consensus catching up ⇒
     getting priced in) and the imported reverse-DCF ("does the current price already
     require this, or is it gravy?"). (LLM + numeric)
  3. **judge** — does it move the thesis probability enough to surface, and in which direction?
     (adapt `score.ts`) Output: direction (strengthens / weakens / neutral), magnitude, confidence,
     and citations to the exact filing/transcript line.
- `theses.ts` — thesis state model: status (`green` confirmed / `amber` watch / `red` tripped),
  the tripwire thresholds, and the update logic.
- `track.ts` — orchestrator: for each thesis, gather relevant new events via `diff.ts`,
  run `evaluate.ts`, update status, collect any tripped tripwires.

New data file:
- `data/theses.json` — the encoded theses (analogous to `data/tickers.json`). Each thesis:
  an id, a plain-English claim, the tickers/entities it depends on, the specific watch-items
  (e.g. "TSMC capex guide direction", "hyperscaler capex guide vs prior quarter",
  "Micron HBM sold-out window extends", "GOOGL TPU external revenue in consensus"), and a
  tripwire threshold per watch-item. Seed it with the theses from our analysis:
  NVDA-margin-durability, infra-cycle-still-accelerating, GOOGL-TPU-not-in-consensus.

Scheduling (no server needed):
- A **GitHub Actions cron** runs `pnpm tsx scripts/track.ts` on a schedule (e.g. daily +
  on a webhook if you add one later), writing results to Turso. This matches the existing
  "CLI does the work, web only reads" split and keeps Vercel/Turso on free tiers.

Web (last):
- `apps/web/app/theses/` — thesis dashboard with status chips (reuse the verdict-filter-chip
  component) and a per-thesis detail page showing the signals, their direction/magnitude,
  the evidence citations, and the reverse-DCF grid. Read-only, same as today.

Alerts (last):
- When a tripwire flips, send an email digest via Resend (reuse the magic-link mailer). One
  digest per run, listing only flips — never per-event noise.

---

## Phases (build in order; stop at each checkpoint and verify before continuing)

### Phase 0 — De-risk the paid data source (spike, ~½ day)
Wire **only** the FMP adapter in `feeds.ts`. Prove you can pull, for one ticker (NVDA):
the latest earnings-call transcript, current consensus estimates, and the estimate-revision
history. Print them to stdout. No theses, no LLM, no DB.
- **Checkpoint:** real transcript text + a revision time-series for NVDA print correctly.
  Confirm FMP tier covers all three before spending further effort.

### Phase 1 — Schema + ingestion + diff (CLI only, no LLM)
Define the Zod schemas (`Thesis`, `Event`, `Signal`, `ThesisStatus`) in `packages/schema`.
Build `feeds.ts` (all sources) and `diff.ts`. Encode 2–3 theses in `data/theses.json`.
`scripts/track.ts` runs ingestion + diff and prints "new events since last run" per thesis.
- **Checkpoint:** run it twice in a row; the second run correctly reports *no* new events.
  Then add a stale cursor and confirm it correctly reports the backlog.

### Phase 2 — The signal evaluator (the reused 3-step engine)
Build `evaluate.ts` and the new prompts (`prompts/signal-extract.md`,
`prompts/signal-critique.md`, `prompts/signal-judge.md`). For each new event × thesis,
classify and write a markdown thesis-status card to `fixtures/theses/<thesis-id>.md`.
Keep cost tracking + the warn/abort cost guards from `llm.ts`. Triple-sample the
guidance-direction judgment (reuse the variance-reduction approach) since it's fuzzy.
- **Checkpoint (the real gate):** hand-check on actual recent events. Feed it NVDA's last
  capex commentary and a real GOOGL TPU news item. Read each card and answer: did it read
  the direction the way you would? Are the citations real (point to actual transcript/filing
  lines)? Did it correctly resist calling already-consensus news a "signal"? If ~4 of 5 are
  right, Phase 2 is done. Wire these cases into `eval-cases.json`.

### Phase 3 — Persistence + tripwire state + scheduler
Persist thesis state and last-seen cursors in Turso (reuse the push pattern). Implement
tripwire flips in `theses.ts`. Add the GitHub Actions cron running `scripts/track.ts`.
- **Checkpoint:** let it run on schedule for a few days; confirm state advances correctly
  and a manually-lowered threshold produces a flip.

### Phase 4 — Web view + email alerts (only after the pipeline is trusted)
Add `apps/web/app/theses/`. Add the Resend digest on tripwire flips.
- **Checkpoint:** the phone view shows current thesis statuses with working citations; a
  forced flip sends exactly one digest email.

---

## Non-goals (explicit — these keep it a filter, not a feed)
- No trade execution, no buy/sell calls, no position sizing.
- No price-target or price-direction prediction.
- No generic news firehose: an event is only ingested if it maps to a watch-item in
  `data/theses.json`. Untracked headlines are dropped on purpose.
- No real-time / intraday. Daily (or event-triggered) cadence is the point — it should make
  you act *less*, not more.
- No new auth, no second web app, no second database. Reuse stock-vetter's.

---

## Data sources
- **SEC EDGAR** — 8-K / 10-Q / 10-K. Free. Reuse `financials.ts` SEC path. Covers earnings,
  guidance, and capex language.
- **Financial Modeling Prep** (paid, ~$30–50/mo) — earnings-call transcripts, analyst
  consensus estimates, **estimate revisions**, price targets. This is the one purchase.
- **Yahoo** — price. Free. Reuse existing path.
- **Koyfin** — NOT used in the build (no API; data export blocked by vendor). Optional human
  dashboard only.
- Macro/cycle watch-items (TSMC capex guide, hyperscaler capex guides) come from
  filings/transcripts/news parsed by the LLM, not a structured field — handled by `evaluate.ts`.

## Cost
- FMP subscription: ~$30–50/mo (the only fixed cost).
- LLM: only NEW events × relevant theses are evaluated, with the thesis context cached —
  cents per run. Keep `llm.ts`'s per-run warn/abort thresholds.
- Vercel / Turso / Resend / GitHub Actions: free tiers.

## Style (inherit stock-vetter's)
- Functional composition over classes. One file per concept, named after the concept.
- Zod for all LLM I/O. Throw on unrecoverable errors; do not return error objects. No `any`.
- All prompts as `.md` files loaded via `prompts.ts` — never inlined in code.
- Prettier defaults.

---

## For Claude Code — reading order
1. `SPEC.md` and `README.md` (existing) — learn the conventions and the existing pipeline.
2. This file (`SIGNAL-TRACKER-PLAN.md`) in full.
3. `packages/pipeline/src/llm.ts`, `prompts.ts`, `critique.ts`, `score.ts`, `render.ts`,
   `financials.ts`, and the reverse-DCF module — the code you will reuse.
4. `packages/schema/src/types.ts` — the schemas you will extend.
5. `data/tickers.json` and `scripts/analyze-ticker.ts` — the data-file + push pattern to mirror.

## Suggested first prompt to Claude Code
> Read SPEC.md and README.md to learn the existing conventions, then read
> SIGNAL-TRACKER-PLAN.md in full. Then read packages/pipeline/src/{llm,prompts,critique,score,render,financials}.ts,
> the reverse-DCF module, and packages/schema/src/types.ts. Do Phase 0 only: add a Financial
> Modeling Prep adapter in a new packages/signals/src/feeds.ts and prove you can fetch NVDA's
> latest earnings transcript, consensus estimates, and estimate-revision history to stdout.
> No theses, no LLM, no DB yet. Stop at the Phase 0 checkpoint so I can confirm the FMP tier
> covers all three before we go further.