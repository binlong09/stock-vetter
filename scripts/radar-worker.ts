#!/usr/bin/env tsx
/**
 * scripts/radar-worker.ts
 *
 * Drains the radar deep-dive queue on the GPU box. The radar (a cloud cron)
 * enqueues a job per newly-flagged filing into Turso; this worker claims pending
 * jobs, runs the short-scan deep-dive locally (tier-2 read + triage-gated cloud
 * synthesis), and writes the result back. The box being offline just means jobs
 * wait in the queue — nothing is lost.
 *
 * Needs the local model configured (LOCAL_BACKEND=openai + OLLAMA_HOST/MODEL) and
 * an Anthropic key for the synthesis a job may escalate to.
 *
 *   pnpm radar-worker              # claim + run every pending job, then exit
 *   pnpm radar-worker --watch      # keep running, polling every 60s
 *   pnpm radar-worker --watch --poll=120
 */
import 'dotenv/config';
import {
  LookbackIndex,
  OllamaClient,
  scanEightK,
  scanPeriodicByRef,
  type ScanResult,
} from '@stock-vetter/local';
import { listFilings, newCostTracker, summarizeCost, type FilingRef } from '@stock-vetter/core';
import {
  isTursoConfigured,
  claimNextRadarJob,
  completeRadarJob,
  requeueRadarJob,
  failRadarJob,
  type ClaimedRadarJob,
} from '@stock-vetter/pipeline';

const arg = (n: string): string | undefined => {
  const i = process.argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (i === -1) return undefined;
  const a = process.argv[i]!;
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : 'true';
};
const err = (m: string): void => void process.stderr.write(`${m}\n`);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function runJob(
  job: ClaimedRadarJob,
  ollama: OllamaClient,
  index: LookbackIndex,
): Promise<void> {
  const tracker = newCostTracker();
  const refs: FilingRef[] = await listFilings(job.ticker, { forms: [job.form] });
  const ref = refs.find((r) => r.accession === job.accession);
  if (!ref) {
    await failRadarJob(job.accession, 'could not resolve the filing ref from EDGAR');
    err(`  ✗ ${job.accession}: filing ref not found`);
    return;
  }
  const deps = { ollama, index, tracker };
  // Triage gates the cloud tier (no force-synthesis); force re-processes even if
  // the filing was indexed by an earlier scan.
  const opts = { noSynthesis: false, force: true, onProgress: (m: string) => err(`    ${m}`) };
  let result: ScanResult;
  try {
    result = job.form.startsWith('8-K')
      ? await scanEightK(ref, deps, opts)
      : await scanPeriodicByRef(ref, deps, opts);
  } catch (e) {
    // If the model box went offline mid-job, this is transient — return the job
    // to the queue so it's retried when the box is back, rather than marking it
    // failed. A genuine analysis error (bad parse, schema) is a real failure.
    if (!(await ollama.health()).ok) {
      await requeueRadarJob(job.accession);
      err(`  … box unreachable mid-job; requeued ${job.accession}`);
      return;
    }
    throw e;
  }

  const escalated = Boolean(result.assessment);
  await completeRadarJob(job.accession, {
    triageScore: result.decision?.score ?? null,
    escalated,
    verdict: result.assessment?.verdict ?? (result.decision?.escalate ? 'insufficient-data' : 'no-edge'),
    conviction: result.assessment?.conviction ?? null,
    assessmentJson: result.assessment ? JSON.stringify(result.assessment) : null,
  });
  const cost = summarizeCost(tracker).total;
  err(
    `  ✓ ${job.ticker} ${job.form}: ` +
      (escalated
        ? `${result.assessment!.verdict} (${result.assessment!.conviction}/10)`
        : `no-edge (triage ${result.decision?.score ?? '?'}/${result.decision?.threshold ?? '?'})`) +
      ` · $${cost.toFixed(4)}`,
  );
}

async function main(): Promise<void> {
  if (!isTursoConfigured()) {
    err('Turso not configured — set TURSO_DATABASE_URL/TURSO_AUTH_TOKEN so the worker can read the queue.');
    process.exit(1);
  }
  const ollama = new OllamaClient({ numCtx: Number(process.env.OLLAMA_NUM_CTX ?? 16384) });
  const watch = arg('watch') != null;
  const pollMs = Number(arg('poll') ?? 60) * 1000;
  err(`radar-worker: ${ollama.model} · ${watch ? `watching (poll ${pollMs / 1000}s)` : 'draining once'}`);

  // Keyword-only index — this box serves one (chat) model, no embeddings.
  const index = await LookbackIndex.open({ embedder: null });
  try {
    for (;;) {
      // Only claim work when the box is reachable. If it's offline, jobs stay
      // pending — in --watch we wait for it to come back; a one-shot exits.
      const health = await ollama.health();
      if (!health.ok) {
        if (!watch) {
          err(`box not reachable — nothing drained, jobs stay queued (${health.detail})`);
          return;
        }
        err(`waiting for the box… (${health.detail})`);
        await sleep(pollMs);
        continue;
      }

      let processed = 0;
      let job: ClaimedRadarJob | null;
      while ((job = await claimNextRadarJob())) {
        err(`\nclaim ${job.ticker} ${job.form} ${job.accession}`);
        try {
          await runJob(job, ollama, index);
        } catch (e) {
          await failRadarJob(job.accession, (e as Error).message);
          err(`  ✗ FAILED: ${(e as Error).message}`);
        }
        processed += 1;
      }
      if (!watch) {
        err(`\ndrained ${processed} job(s)`);
        return;
      }
      await sleep(pollMs);
    }
  } finally {
    await index.close();
  }
}

main().catch((e) => {
  err(`${(e as Error).stack ?? e}`);
  process.exit(1);
});
