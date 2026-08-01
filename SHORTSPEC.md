# Short-Side Scanner — design and operation

A third tool in the monorepo, alongside Stock Vetter (vet one company on demand)
and the Signal Tracker (watch a few theses on a schedule). This one watches
**every filing from the top ~2,000 US companies** and looks for the quantitative
tells that precede a repricing downward.

The economics only work because most of the reading happens on a GPU you already
own. A frontier model reading 20,000 filings a year at 300,000 tokens each is not
a budget, it is a funding round. A local 30B-class model reading them is
electricity, and the cloud model is reserved for the ~15% of filings that survive
a deterministic triage gate.

---

## The five tiers

Each tier does only what it is best at, and nothing it is bad at.

| Tier | Runs on | Does | Never does |
|---|---|---|---|
| 1. Parse | CPU | Section extraction, table rendering, boilerplate removal, chunking | Interpret anything |
| 2. Extract | RTX 5090 | Per-chunk structured extraction under a rigid schema | Judge materiality |
| 3. Cross-filing | CPU | Ratio trends over quarters, composites, repetition across filings | Involve a model at all |
| 4. Aggregate | CPU | Dedupe, rank, score, decide what escalates | Call a model |
| 5. Synthesize | Claude API | Judgment, with the corpus reachable via local retrieval | Read whole filings |

The boundary that matters most is between 2 and 3. The local model is asked only
to *find and transcribe* — "what numbers are on this page, what does the text
say about them" — and never to decide whether something matters. Deciding is the
part small models are worst at and the part where a wrong answer is most
expensive.

**Tier 3 is where the actual short signals are.** A single filing showing
receivables up 22% is a quarter. Receivables outgrowing revenue for six
consecutive quarters while DSO lengthens 17 days is a thesis, and no amount of
care in tiers 1 and 2 can see it, because they only ever look at one filing.

---

## Tier 1 — deterministic parsing

### Tables stay tables

`packages/core/src/sec-layout.ts`.

The existing parser builds section bodies from `$('body').text()` with whitespace
collapsed. That's correct for anchor scoring, and it turns an income statement
into this:

```
Net Sales $ 6,203.2 $ 6,107.1 $ 5,867.9 Cost of sales 3,428.4 3,317.0 3,279.4
```

Three unlabeled year columns, with the header row that identified them stranded
hundreds of characters away. Frontier models mostly cope. A 30B model does not —
it binds figures to the wrong periods, and every YoY delta downstream inherits
the error with no indication anything went wrong.

`renderFilingLayout` re-renders the same HTML into ordered blocks with tables
intact:

```
(in millions)

|  | 2025 | 2024 | 2023 |
| --- | --- | --- | --- |
| Net Sales | $6,203.2 | $6,107.1 | $5,867.9 |
| Interest expense | (95.2) | (95.0) | (110.9) |
```

Handling the conventions real filers actually use: currency symbols and the
closing paren of a negative each in their own `<td>`, empty spacer columns
between every data column, stacked header rows, captions that span the table.
Cross-row column alignment is *not* assumed — filers are not consistent about
it, and any scheme keyed on source column index fits noise.

`locateSectionBlocks` joins this to `parseFiling`'s section boundaries and
returns `null` rather than guessing when the join fails; the caller falls back to
flat text and records `layoutDegraded`, so a section whose tables are flattened
is visible as a warning rather than silently worse.

### Boilerplate removal, with a safety valve

`packages/local/src/boilerplate.ts`.

Rule-based, and every removal is attributed to a named rule with a stated reason.
The rules were calibrated against the filings in `fixtures/` — the audit-scope
rule matches "standards of the PCAOB" because that is what Church & Dwight
actually writes, not the spelled-out form a rule written from memory would use.

The risk with any such rule is obvious: the most valuable sentence in a 10-K sits
inside a paragraph that looks like pure recital. "Management identified a
material weakness in internal control over financial reporting" lives in the ICFR
report. "Substantial doubt about our ability to continue as a going concern"
lives in the accounting-policies note.

So `PROTECTED_PHRASES` overrides every rule. A block containing one is never
removed, however much boilerplate surrounds it. The asymmetry is deliberate:
keeping a boilerplate paragraph costs a few hundred tokens; dropping a
material-weakness disclosure costs the entire analysis. Tables are never removed
at all.

`strippedFraction` is reported upward, and above 50% becomes a warning — an
over-aggressive rule shows up as a number rather than as a quietly worse answer.

### Chunking

`packages/local/src/chunk.ts`. Constraints in priority order:

1. **Never split a table.** A table cut in half yields numbers without row labels
   or labels without numbers, and extraction will confidently report whatever
   survived. A table too large for one chunk is split *by rows*, with the caption
   and header repeated in every piece so each stands alone.
2. **Prefer to start at a heading.** A chunk beginning "...which management
   attributes to the timing of shipments" gives the model nothing. One beginning
   "NOTE 7 — INVENTORIES" does.
3. **Hit the token budget** — 4,000–8,000 tokens, 200-token overlap. Last, not
   first.

Overlap is prose-only and delimited at **both** ends. Overlapping table rows
would make one figure appear in two chunks and be counted twice during
aggregation. Without a terminator the model cannot tell where carried-over
context stops, and reports it as a finding of this chunk — creating the exact
double-count the overlap was meant to prevent.

Token counts come from a heuristic in `tokens.ts`, tuned to **over**-estimate.
Financial text tokenizes far worse than prose ("6,203.2" is ~5 tokens for 7
characters), so the usual 4-chars-per-token rule under-counts a table by 40–60%
— and under-counting is the dangerous direction, because it overflows the
context window and Ollama truncates silently. `pnpm calibrate-tokens` measures
the real ratio against your model and tells you what to set if it's wrong.

---

## Tier 2 — local extraction

`packages/local/src/ollama.ts`, `extract.ts`.

### The num_ctx footgun

Ollama does not error when a prompt exceeds the context window. It silently
truncates from the front — dropping the table header and the section heading —
and generates a confident, well-formed, schema-valid answer about the remainder.
Its default `num_ctx` is 4096, so an 8,000-token chunk loses half itself with no
indication.

Every request pins `num_ctx` explicitly, and `assertContextFits` refuses to send
a prompt that wouldn't fit rather than letting the server quietly mangle it.

### Structured output

The Zod schema is compiled to JSON Schema and passed as Ollama's `format`, where
llama.cpp turns it into a GBNF grammar and constrains decoding. That makes
schema-invalid output impossible rather than merely unlikely — worth having when
the alternative is retry traffic across 20,000 filings. `$refStrategy: 'none'`
inlines everything, because llama.cpp does not resolve `$ref`/`$defs` and a
schema containing them under-constrains generation silently.

Grammar conformance still isn't validation (a grammar can't express "this string
must be a verbatim quote"), so output is validated against the same Zod schema,
with the error fed back for repair on failure.

### Quote verification — the hallucination filter

This is the part that makes local-model output usable.

A 30B model reading a dense financial table will sometimes emit a figure that is
not in the text: a plausible number, correctly formatted, attached to a real line
item, wrong. Across 2,000 companies this is not a rare event, and nothing about
the output looks wrong.

So the prompt requires a **verbatim quote** on every metric, flag, and management
claim, and `verifyQuotes` mechanically checks each against the chunk it came
from. Findings whose quotes cannot be found are dropped and counted. Matching is
whitespace- and curly-quote-insensitive (models straighten apostrophes; that
isn't a hallucination), and quotes under 12 characters are rejected outright
because a three-word quote matches something in any filing by chance.

This doesn't catch everything — a real quote can carry a wrong interpretation —
but it eliminates the fabricated-figure class entirely, and the drop rate is a
live quality signal. Above 25%, the brief says so rather than presenting the
survivors as if nothing happened.

Quotes are checked against the chunk **body** only, never the overlap window.

---

## Tier 3 — aggregation and triage

`packages/local/src/brief.ts`, `triage.ts`.

Aggregation is deterministic. A second model pass to "summarize the summaries"
would add a fresh chance to hallucinate on top of already-verified output and
cost GPU time proportional to the universe; dedup, counting, and ranking are
things plain code does exactly right.

Flags dedupe on category plus the figures in the claim, so the same finding
raised in four chunks merges and counts, while "DSO rose to 78 days" and "DSO
rose to 61 days" stay distinct findings.

The **triage gate** scores the brief and decides whether to spend cloud tokens
and human attention. It is plain arithmetic on purpose: auditable, stable between
runs, impossible to talk out of its answer. `reasons` records what earned each
point, so the threshold can be tuned against outcomes rather than vibes.

- **Category weights** encode which disclosures actually precede repricings, not
  which sound alarming. `going-concern`, `auditor`, and `internal-control` are
  weight 5; `customer-concentration` and `margin-compression` are weight 1.
  Weighting them equally is how the queue fills with things that were true and
  did not matter.
- **Corroboration is damped.** Repetition inside a filing usually means the same
  disclosure appears in both the MD&A and the notes — one fact stated twice, not
  two pieces of evidence. Eight mentions score 2.5×, not 8×.
- **Combination bonus.** Receivables *and* inventory *and* cash conversion at
  once is qualitatively different from one area shouting; any one alone is
  usually just a quarter.
- **Critical 8-K items bypass scoring entirely.** Item 4.02 is a company
  withdrawing its own financial statements. No aggregate of soft flags should
  outvote it, and no reassuring narrative should suppress it. This detection is
  purely deterministic — it reads the item number — which is why it also
  overrides the data-quality hold below.
- **Data-quality hold.** A filing we mostly failed to read is not a filing with
  nothing in it. Escalating burns cloud spend on a brief that is mostly holes;
  scoring it zero pretends we checked. It's held, and said so.

---

## Tier 3 — cross-filing analysis

`packages/core/src/xbrl.ts`, `packages/local/src/{ratios,trends,composite-scores,recurrence}.ts`.

### Why XBRL and not the extracted metrics

The local model's figures are quote-verified, but they are still a
transcription of a rendering of a number. Trend detection needs many periods
lined up on one basis, and a single mis-attributed period turns "receivables
rose four quarters running" into noise — or invents it.

The filer already tagged all of this. `companyfacts` returns machine-readable
values with explicit period boundaries, from XBRL the company certified. So
trends are computed from that, and a trend finding can be labelled **exact** in
a way nothing read off a page can be.

Three things make quarterly XBRL genuinely hard, and each is handled explicitly:

1. **Duration facts are often cumulative.** A Q3 10-Q reports both a 3-month and
   a 9-month figure, both tagged `fp: "Q3"`. Only ~90-day spans are admitted;
   admitting the cumulative one makes revenue appear to triple every Q3.
2. **Q4 is almost never disclosed** — the 10-K gives the full year — so it is
   derived as FY − (Q1+Q2+Q3) and labelled `derived: 'q4-residual'`, because
   that is arithmetic rather than disclosure. It is never derived when a quarter
   is missing, since the residual would just be wrong.
3. **Every period is reported many times** as comparatives. The most recently
   filed value wins, but when a later filing *changed* it, the prior value is
   kept in `restatedFrom` — a company quietly revising a number it already
   reported is itself a short signal.

### The two rules every detector follows

**Compare year over year, never sequentially.** A retailer's inventory always
spikes into the holiday quarter and always drains after it. A sequential
detector reports that as a finding every year for every retailer, which is
worse than useless — it trains you to ignore the output. There is a test for
exactly this: a business with a 2.5× Q4 produces zero findings.

**Require a run.** One bad quarter is noise: an acquisition closing near period
end inflates DSO once, an inventory build ahead of a launch is deliberate.
Detectors need three to five consecutive year-over-year deteriorations *and* a
material cumulative change before they say anything.

Year-over-year pairing matches on `(fy−1, fp)` rather than "four rows back",
which survives a missing quarter — common, since Q4 only exists once the 10-K
lands. Changes are reported in each metric's natural unit: days for DSO, basis
points for margins. Calling a 44.7%→43.7% gross-margin move "a 2.2% decline"
understates it and invites confusion with a 2.2-point decline.

Detectors: DSO, DIO, DPO and cash-conversion-cycle lengthening; gross-margin
erosion; CFO diverging from net income; rising Sloan accruals; SG&A
deleveraging; share-count growth; rising leverage; shrinking deferred revenue;
capex falling below depreciation; and prior-period restatement.

### Composite screens

Beneish M-score and Altman Z''-score. Their value over the trend detectors is
*calibration*: the detectors say "this got worse", while these thresholds were
fitted against known outcomes — Beneish against SEC enforcement targets, Altman
against companies that went bankrupt.

Neither is a verdict. Beneish's own paper reports ~76% detection at a ~17.5%
false-positive rate, which across 2,000 companies is roughly 350 false alarms a
year if you read the headline as an answer. So both emit their full component
breakdown, and the M-score reports **which index is driving it** — one pushed
entirely by SGI describes a fast-growing company, not a fraudulent one, and
that is invisible in the composite alone. In triage a composite flag
contributes points but can never escalate a filing on its own.

Altman uses the 1993 Z'' four-variable revision rather than the original 1968
Z: Z'' uses book equity instead of market cap, generalizes beyond
manufacturers, and keeps a market-data dependency out of a filing-analysis
pipeline.

### Repetition across filings

The numeric detectors catch deterioration in the figures. `recurrence.ts`
catches a different thing: an explanation that has stopped being an
explanation.

"The decline reflects the timing of distributor shipments" is reasonable once.
In the fourth consecutive quarter it is describing a trend management declines
to call a trend. Same with a "non-recurring" restructuring charge taken every
year for five years — the charge recurs, the label does not, and any non-GAAP
measure adding it back overstates run-rate earnings.

Matching is deterministic token overlap, not a model, and that is deliberate: a
model asked "is this the same excuse?" finds creative similarities everywhere,
and these detectors are only worth having if their false-positive rate is near
zero. The stopword list drops finance-generic vocabulary (revenue, increased,
prior, quarter), since matching on those makes every filing look like a repeat
of every other one. The one-time-charge detector requires the literal phrase in
the retrieved passage, not merely a BM25 hit, and requires the *current* filing
to use it — a company that restructured twice years ago and stopped is not a
finding.

### As-of correctness

Every cross-filing computation takes the filing's own date as a cutoff. XBRL
payloads and the lookback index both contain material filed later — a 2026
10-Q restates 2025 comparatives — so computing a trend "as of" a 2025 filing
against the full payload silently uses information that did not exist yet.
That is invisible in the output and fatal to any backtest: it looks like a
brilliant strategy and is not one.

### How this changes triage

Trends score at **2×** the equivalent single-filing flag and recurrence at 1.5×.
Both are exact, with no transcription step to go wrong, and both are
multi-period, so they have already survived the "was that just one odd quarter?"
test a single-filing flag has not.

A high-severity trend also **overrides the data-quality hold**. Cross-filing
findings don't come from the chunks, so a filing whose HTML failed to parse
says nothing about them; holding it would bury the strongest evidence in the
brief for a reason unrelated to that evidence.

---

## Tier 4 — cloud synthesis over a local index

`packages/local/src/lookback.ts`, `synthesize.ts`.

### The index

One SQLite file on the machine with the GPU, via `@libsql/client` in `file:`
mode — the same client the repo already uses for Turso, so the code is one URL
string away from the hosted store and needs no new dependency.

**Why local and not Turso.** These are two stores doing two different jobs, which
is already this repo's pattern (`.cache/` local, Turso for the viewer):

| | `.cache/lookback.db` | Turso |
|---|---|---|
| Holds | Raw chunk text + embeddings, 2,000 companies | Finished briefs, flags, assessments |
| Size | tens of GB, growing | a few KB per filing |
| Read by | the 5090, thousands of times per synthesis run | the web viewer, occasionally |
| If lost | rebuild from EDGAR | actually lost |

Putting the corpus in Turso would reintroduce the network round-trip the whole
design exists to eliminate, blow past the free tier, and charge per row read for
scratch data.

**Retrieval is hybrid, and that is not a hedge.** Pure vector search is genuinely
bad at the queries this system asks: "DSO in Q3" and "DSO in Q2" embed almost
identically, and the literal string "1,204.5" has no semantic content at all —
but BM25 finds both instantly. Conversely "is management blaming external
factors" has no reliable keywords. Both arms run and fuse by Reciprocal Rank
Fusion, which combines rankings without needing BM25 scores and cosine distances
to be on a shared scale (they aren't, and normalizing them invents a calibration
that doesn't exist).

FTS5 uses an external-content table, so filing text is stored once rather than
twice — at this corpus size that is tens of gigabytes of difference. Deleting a
filing withdraws its rows from the FTS index explicitly; external-content tables
keep matching deleted rows otherwise.

**Snippets carry their table header.** Returning
`| Accounts receivable, net | 1,204.5 | 987.1 |` alone is two numbers with no
periods, units, or scale — that is not a verification, it is an invitation to
read whichever value confirms the thesis. When a snippet window lands inside a
table, the caption, header row, and separator are prepended.

### The tools

Two, not one, because they answer different questions:

- `search_filings` — ranked retrieval. Returns candidates to read. Its
  description says so explicitly.
- `verify_quote` — exact substring matching. Settles whether a citation is real.

Collapsing them into one "search" tool is how a ranked near-miss ends up
presented as a confirmed citation. A search that finds nothing reports that the
text is not in the index and explicitly distinguishes that from the fact being
false — otherwise parser failures turn into findings.

### The prompt

`prompts/short-synthesis.md`. The default answer is `no-edge`, and
`actionable-short` requires all four of: a falsifiable numeric claim, quoted
evidence, a dated catalyst, and non-consensus. It also requires a `bullCase` a
holder would recognize as fair, and `mechanicalRisks` — borrow cost, squeeze
potential, takeover candidacy — the things that lose money even when the thesis
is right.

`verified: true` on a citation is only permitted after `verify_quote` returned
found for that exact string. An honest `false` is fine; an unearned `true`
destroys the reason the pipeline exists.

The prompt also opens by distinguishing the two kinds of evidence in the brief.
Computed evidence (cross-filing) is arithmetic on filer-tagged values;
transcribed evidence (flags, metrics) is a 30B model's reading of a page,
quote-verified for existence but not for interpretation. Conflicts resolve
toward the computed side. And an empty cross-filing section is explicitly *not*
exoneration — it means either no XBRL history or genuinely stable numbers, and
the brief says which.

---

## Operating it

```bash
# One company, latest 10-K
pnpm short-scan NVDA

# Every 8-K since a date
pnpm short-scan NVDA --8k --since=2026-06-01

# Build the universe (slow; weekly at most)
pnpm build-universe --top=2000

# Sweep everything filed since a date — one EDGAR request per calendar day
pnpm short-scan --universe=data/universe.json --since=2026-07-01

# Backfill the index without spending GPU time
pnpm short-scan --universe=data/universe.json --since=2025-01-01 --index-only

# Local tier only, no cloud spend
pnpm short-scan NVDA --no-synthesis

# Inspect what the cloud model would see
pnpm lookback search "days sales outstanding" --ticker=NVDA
pnpm lookback verify "Days sales outstanding increased to 78 days"
pnpm lookback stats

# Cross-filing trends — no GPU, no Ollama, just EDGAR and arithmetic
pnpm trends NVDA
pnpm trends NVDA --as-of=2024-01-31    # what a filing that date would have seen
pnpm trends NVDA --metric=dso          # one metric's full series
pnpm trends --detectors                # list the detectors
```

`pnpm trends` is the fastest way to sanity-check a name and the right place to
calibrate detector thresholds before a universe sweep depends on them.

### Configuration

| Variable | Default | Notes |
|---|---|---|
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | |
| `OLLAMA_MODEL` | `qwen3:32b` | |
| `OLLAMA_NUM_CTX` | `16384` | Must exceed chunk size + output. See the footgun above |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Changing it requires a reindex |
| `OLLAMA_CONCURRENCY` | `1` | Raise only if the server has `OLLAMA_NUM_PARALLEL > 1` |
| `LOOKBACK_DB_PATH` | `.cache/lookback.db` | |
| `LOCAL_CHARS_PER_TOKEN_*` | see `tokens.ts` | Set from `pnpm calibrate-tokens` |

### Throughput

A 10-K's Item 7 + Item 8 is roughly 250K characters after boilerplate removal —
about 15 chunks at 6K tokens. At a realistic 40 tok/s on a 30B model that is
~5 minutes per 10-K, ~2 minutes per 10-Q, ~20 seconds per 8-K.

For 2,000 companies that averages a bit over an hour of GPU time per day. The
average is not the problem: **filings cluster**. Several hundred companies report
in the same week, and a peak earnings day can queue 20+ GPU-hours. The scanner is
resumable — `isIndexed` skips filings already processed — so the practical
approach is to let it run behind and catch up, rather than sizing for the peak.

### Cost

Escalated filings cost roughly $0.05–0.08 each on Sonnet (≈5K-token brief, a
cached system prompt, a handful of 500-token tool results, ~2K output). At a
~15% escalation rate over 20,000 filings a year, that is a few hundred dollars
annually. The triage gate exists at least as much to protect your attention as
your budget.

---

## What is not built

- **No position sizing, no execution, no borrow-availability data.** The output
  is a research artifact.
- **The universe builder skips dual-class and unit tickers** (dots, hyphens, and
  carets don't map cleanly between SEC and Yahoo symbols). Losing a handful of
  B-shares beats silently pricing the wrong security.
- **`filings.recent` covers about a year.** Deep backfill needs the daily-index
  walk in `edgar-index.ts`, not `listFilings`.
- **No peer/industry comparison.** Every trend is measured against the company's
  own history, never against its sector. A 300bps gross-margin decline is a very
  different signal when the whole industry compressed 400bps, and the pipeline
  currently cannot tell those apart. This is the largest remaining gap.
- **No price or borrow data.** The pipeline cannot check whether a
  deterioration is already priced in, which is one of the four conditions the
  prompt requires for an actionable short — so that judgment rests entirely on
  the cloud model's priors.
- **Trend thresholds are hand-set, not fitted.** The consecutive-period and
  magnitude requirements are judgments, not calibrations against outcomes. Once
  the index holds a few years of history, they should be backtested — and the
  as-of machinery exists specifically so that backtest can be honest.
- **Not verified against live EDGAR.** See below.

## Verification status

Everything in this document is covered by tests that run without a GPU: 177
tests using a stand-in Ollama server, a stand-in Anthropic endpoint, a
deterministic fake embedder, and synthetic XBRL payloads reproducing the quirks
real company-facts responses contain.

The HTML-layer work — `sec-layout.ts`, `sec-8k.ts` — is tested against synthetic
fixtures reproducing the conventions observed in this repo's committed filings,
because **EDGAR is not reachable from the environment this was built in**
(`www.sec.gov` and `data.sec.gov` return 403 at the egress proxy). Before
trusting it on real data, run on a machine with EDGAR access:

```bash
pnpm short-scan CHD --index-only     # does layout join cleanly?
pnpm lookback search "net sales" --ticker=CHD
pnpm calibrate-tokens                # is the estimator safe on your model?
pnpm trends CHD                      # do the XBRL series look sane?
```

Check that no section reports `layoutDegraded`, that retrieved table snippets
carry their period headers, and — most importantly — that `pnpm trends` on a
few known-healthy large caps returns **few or no findings**. The detectors are
tuned to be quiet; a name like KO or CHD lighting up across six detectors means
a concept mapping is wrong for that filer, not that the company is a fraud.
