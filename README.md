# Stock Vetter

Tool for vetting stock analyses from YouTube. Input: a YouTube URL of a fundamental analysis video. Output: a quantified decision card with weighted pros/cons, scored 1–10 on five value-investing dimensions.

---

## Folder structure

### What you start with (this repo, before any code)

```
stock-vetter/
├── README.md              ← this file
├── SPEC.md                ← full project spec
├── prompts/               ← all 8 LLM prompts as .md files
│   ├── normalize.md
│   ├── extract.md
│   ├── critique-consistency.md
│   ├── critique-stress-test.md
│   ├── critique-comps.md
│   ├── critique-missing-risks.md
│   ├── critique-value-checklist.md
│   └── score.md
└── scripts/               ← CLI entry points (skeletons, Claude Code fills in)
    ├── run-pipeline.ts
    ├── eval.ts
    └── eval-cases.json
```

That's it. Drop these files in a fresh directory, `cd` into it, run `claude`, and start.

### What Claude Code builds out (Phase 1)

```
stock-vetter/
├── README.md
├── SPEC.md
├── package.json                    ← pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.json
├── .env.example
├── .gitignore
├── prompts/                        ← stays here OR moves to packages/pipeline/prompts/
│   └── ...
├── scripts/
│   ├── run-pipeline.ts
│   ├── eval.ts
│   └── eval-cases.json
└── packages/
    ├── schema/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       └── types.ts            ← Zod schemas + inferred TS types
    └── pipeline/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts
            ├── transcript.ts       ← YouTube transcript fetch
            ├── financials.ts       ← Yahoo + SEC data
            ├── normalize.ts        ← LLM call: clean garbled proper nouns
            ├── extract.ts          ← LLM call: structured extraction
            ├── critique.ts         ← Five LLM calls in parallel
            ├── score.ts            ← LLM call: final synthesis
            ├── orchestrate.ts      ← Top-level pipeline runner
            ├── render.ts           ← Decision card → markdown
            ├── llm.ts              ← Anthropic client wrapper, cost tracking
            └── prompts.ts          ← Loads .md files from disk
```

**Decision point:** keep `prompts/` at the repo root (treats them as project content, easy to edit) or move them into `packages/pipeline/prompts/` (treats them as package internals). The SPEC originally said the latter; the README skeleton at `scripts/run-pipeline.ts` doesn't care. Easier to keep them at root for editing — Claude Code, do this and update `prompts.ts` to load from `../../prompts/*.md` relative to the package.

### What gets added in Phase 3 (web app, later)

```
stock-vetter/
├── ... (everything above)
└── apps/
    └── web/
        ├── package.json
        ├── next.config.js
        ├── app/
        │   ├── page.tsx
        │   ├── new/
        │   ├── video/[id]/
        │   └── api/
        └── components/
```

Don't build this until Phase 1 is verified.

---

## For Claude Code

Read these files in order before writing any code:

1. `SPEC.md` — full project spec, architecture, build phases, schemas. **Pay particular attention to the "Future direction" section at the end** — it constrains five schema decisions that you must make correctly in Phase 1 even though the feature itself isn't built until later.
2. `prompts/normalize.md` — transcript cleanup
3. `prompts/extract.md` — structured extraction
4. `prompts/critique-consistency.md` — internal coherence check
5. `prompts/critique-stress-test.md` — assumption sensitivity
6. `prompts/critique-comps.md` — peer comparison
7. `prompts/critique-missing-risks.md` — risk gaps
8. `prompts/critique-value-checklist.md` — value-investing rubric
9. `prompts/score.md` — final scoring synthesis
10. `scripts/run-pipeline.ts` — CLI skeleton (fill in)
11. `scripts/eval.ts` — eval harness skeleton (fill in)

Then build Phase 1 only (CLI pipeline). Stop at the Phase 1 checkpoint. Do not start Phase 2 until I've verified the output on at least 5 videos.

## Phase 1 deliverables

- pnpm workspace, TypeScript end-to-end
- `packages/pipeline` runnable standalone via `pnpm tsx scripts/run-pipeline.ts <youtube-url>`
- Outputs a markdown decision card to stdout
- All prompts loaded from `prompts/*.md` (do not inline them in code)
- Zod schemas in `packages/schema`
- Cost per video logged to stderr; warn if >$0.75, abort if >$1.50
- Typed errors for: missing captions, unknown ticker, LLM JSON validation failure
- One retry on JSON validation failure with the error appended to the prompt
- `scripts/eval.ts` runs against `scripts/eval-cases.json` and prints a markdown agreement table

## Phase 1 non-goals

- No web app
- No database
- No caching layer (re-runs hit the API again — fine for now)
- No auth
- No multi-user

## Test stocks for Phase 1 verification

Run the pipeline on these and check the output makes sense:

1. The Sea Limited video already in `eval-cases.json` (Drew Cohen, https://www.youtube.com/watch?v=MOmmdN2y9L0) — known input, known reasonable output expected
2. Pick 4 other long-form fundamental analysis videos from similar channels

For each: read the decision card and answer:
- Do the scores make sense if you read the transcript yourself?
- Are citations real (point to actual transcript moments)?
- Does the verdict bucket match what you'd say?

If 4 of 5 look right, Phase 1 is done.

## Environment

`.env` requires:

```
ANTHROPIC_API_KEY=
```

`.env.example` should document this.

## Style

- Prefer functional composition over classes
- One file per concept, named after the concept
- Zod for all LLM I/O validation
- Throw on unrecoverable errors; do not return error objects
- No `any` types
- Format with prettier defaults

## Suggested first prompt to Claude Code

> Read README.md and SPEC.md. Then read all eight prompts in prompts/ and the two script skeletons in scripts/. Then build Phase 1 only — the pnpm workspace, packages/schema, packages/pipeline, and the two scripts. Stop after running `pnpm tsx scripts/run-pipeline.ts https://www.youtube.com/watch?v=MOmmdN2y9L0` produces a sensible markdown decision card. Do not start Phase 2.
