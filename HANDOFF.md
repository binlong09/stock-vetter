# Handoff

What this is, where the parts live, and what's deliberately left undone.

## The shape of the thing

Two halves, one shared database:

1. **The pipeline (CLI, laptop only).** `scripts/analyze-ticker.ts <TICKER>` →
   - fetches the latest 10-K + 10-Q + DEF 14A from SEC EDGAR (parsed into Item sections), SEC companyfacts (10y annual data), current price (Yahoo);
   - computes historical valuation medians + a reverse DCF;
   - runs the 3-pass primary-source value checklist — Pass 1 (score, triple-sampled for variance), Pass 2 (skeptic), Pass 3 (judge);
   - optionally runs the per-video analyst pipeline for any YouTube URLs configured for the ticker;
   - synthesizes a meta-card (verdict + 1–10 weighted score + cross-source findings);
   - writes everything to `fixtures/<TICKER>/`;
   - **pushes the full card + checklist + financials + analyst cards into Turso** (best-effort — a push failure logs a warning, the local run still succeeds; a no-op if `TURSO_*` env vars aren't set).
   - Backfill of pre-existing fixtures: `pnpm push-fixtures`.

2. **The viewer (`apps/web/`, Vercel free tier, read-only).** Next.js 15 + React 19 + Tailwind v4. Magic-link login (Auth.js v5 + Resend) with a comma-separated `ALLOWED_EMAILS` allowlist; JWT sessions; a small custom libSQL Auth.js adapter (its tables live in our own migration). Routes:
   - `/` — dashboard: all tickers sorted by score, tappable verdict-bucket filter chips, 2-line summaries.
   - `/ticker/[ticker]` — **default view** (verdict, score, six-dimension table with uncertainty dots, valuation context, analyst-vs-primary findings, divergence commentary) followed by the **deep view** (collapsible sections: per-dimension 3-pass reasoning + citations with grep-match-tier badges + triple-sample spread; the reverse-DCF sensitivity grid; historical financials; analyst-video links; things-to-verify; source filings).
   - `/ticker/[ticker]/video/[videoId]` — one analyst video's DecisionCard: extracted thesis (with YouTube-timestamp citations), the pipeline's 5-dimension score of the video, the four critique angles.
   - Deep view shows only data already in the JSON — **no incremental LLM cost per page view**.

3. **Shared: Turso (hosted libSQL).** Schema in `packages/pipeline/migrations/*.sql`, applied idempotently by `migrate()` in `packages/pipeline/src/turso.ts`. Tables: `tickers` (meta-card JSON + the columns the dashboard filters/sorts on), `primary_source_runs` (the full 3-pass checklist JSON), `financials` (snapshot + reverse-DCF JSON), `videos` + `analyst_cards` (keyed `(ticker, video_id)`), plus the Auth.js tables (`auth_users`, `auth_accounts`, `auth_verification_tokens`). Large artifacts are JSON in `TEXT` columns; shape is guaranteed on read by the `@stock-vetter/schema` Zod types. Decision cards are keyed by `(ticker, videoId)` and `channelId` is stored separately from the channel name — per the Phase-2 forward-compat constraints in `SPEC.md`.

## Where to look

| You want to… | Look at |
|---|---|
| run / understand the CLI | `USAGE.md`, `scripts/analyze-ticker.ts` |
| add a ticker | `data/tickers.json`, then `analyze-ticker` (push is automatic) |
| add a web reader | `ALLOWED_EMAILS` in the Vercel env, then redeploy |
| deploy / redeploy the viewer | "Deploying the web viewer" in `USAGE.md`; Vercel auto-deploys on push to `main` |
| change the DB schema | add `packages/pipeline/migrations/000N_*.sql`; `migrate()` picks it up |
| understand the LLM passes / prompts | `prompts/`, `packages/pipeline/src/primary-source.ts`, `packages/pipeline/src/meta-card.ts` |
| understand the SEC parser | `packages/pipeline/src/sec-parser.ts`, `sec-constants.ts`, `data/parser-coverage.md` |
| see what types flow where | `packages/schema/src/types.ts` (single source of truth, used by both halves) |
| the original spec / build history | `SPEC.md`, `README.md` |

## Env vars

Repo-root `.env` (CLI): `ANTHROPIC_API_KEY` (required), `SEC_USER_AGENT` (optional), `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (optional — when both set, the CLI pushes to Turso).

`apps/web/.env` (and the Vercel project's env vars): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET` (must be set explicitly — a default breaks sessions on redeploy), `AUTH_URL` (production only — the deployed origin, so magic-link emails point at production), `AUTH_RESEND_KEY`, `EMAIL_FROM`, `ALLOWED_EMAILS` (comma-separated; fails closed if empty). See `apps/web/.env.example`.

## Deliberately not done

- **Styling pass — deferred indefinitely.** The default view, deep view, and analyst-card page work and are mobile-readable, but there's been no consolidated styling/typography/spacing pass. **Revisit after a month of real usage with specific friction observations** rather than speculative polish. Known rough edges already noted: dimension rows are tight on a 380px screen; `insufficient`-data dimensions show only via the summary text + verdict pill on the default view (no inline badge on those rows); there are several small color systems (verdict / score bands / uncertainty dots / agreement pills / severity pills / match-tier badges) that could be unified.
- **`videos.channel` / `videos.title` are NULL for the existing fixtures** — they predate the `channelName`/`videoTitle`/`publishedAt` additions to `DecisionCard`. New runs (and re-runs) populate them; until then the "Analyst videos" list shows the videoId as the title.
- **Triple-sample spread bars show "Single sample"** for the existing fixtures (empty `samples` arrays). Re-running a ticker with the adaptive triple-sampling populates them.
- **Deferred features from the original plan** (not built, schema leaves room): "company history / interesting facts" sections (need real prompt work — wait for a month of usage to know what's useful); cross-ticker side-by-side comparison; anything that requires the pipeline to be deployed.
- **No job queue / background workers / "trigger from phone"** — by design. The CLI runs on the laptop; the web app only reads.
