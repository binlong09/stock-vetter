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
  Embedder,
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
  requeueFailedRadarJobs,
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

// A cloud-availability failure — out of credits, rate limit, overload, a network
// blip — is transient: the job should be requeued and retried once the cloud is
// usable again, not marked permanently failed. A schema/parse error is a real
// failure. Match by status where present and by message otherwise.
function isTransientCloudError(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  if (typeof status === 'number' && [429, 500, 502, 503, 529].includes(status)) return true;
  const msg = ((e as Error)?.message ?? String(e)).toLowerCase();
  return /credit|billing|quota|insufficient|too low|rate.?limit|overloaded|econnref|etimedout|fetch failed|socket hang|network|econnreset/.test(
    msg,
  );
}

async function runJob(
  job: ClaimedRadarJob,
  ollama: OllamaClient,
  index: LookbackIndex,
): Promise<void> {
  const tracker = newCostTracker();
  const refs: FilingRef[] = await listFilings(job.ticker, { forms: [job.form] });
  const ref = refs.find((r) => r.accession === job.accession);
  if (!ref) throw new Error('could not resolve the filing ref from EDGAR');
  const deps = { ollama, index, tracker };
  // Triage gates the cloud tier (no force-synthesis); force re-processes even if
  // the filing was indexed by an earlier scan. Errors propagate — the caller
  // classifies them (transient cloud/box → requeue; real error → fail).
  const opts = { noSynthesis: false, force: true, onProgress: (m: string) => err(`    ${m}`) };
  const result: ScanResult = job.form.startsWith('8-K')
    ? await scanEightK(ref, deps, opts)
    : await scanPeriodicByRef(ref, deps, opts);

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
  // A transient failure (out of credits, rate limit, box blip) backs off longer
  // so we don't hammer the failing dependency while it's down.
  const backoffMs = Math.max(pollMs, 5 * 60_000);

  if (arg('requeue-failed') != null) {
    const n = await requeueFailedRadarJobs();
    err(`requeued ${n} failed job(s)`);
  }
  err(`radar-worker: ${ollama.model} · ${watch ? `watching (poll ${pollMs / 1000}s)` : 'draining once'}`);

  // Embeddings improve retrieval — the model finds evidence in fewer, better-
  // targeted lookups, which means fewer synthesis turns (lower cost) with no
  // quality loss. Use them when the embed server is reachable; fall back to
  // keyword-only (BM25) so the worker still runs without one.
  let embedder: Embedder | null = new Embedder();
  try {
    await embedder.embedOne('radar embedder health check');
    err(`embeddings: ${embedder.model} (${embedder.dimension ?? '?'}d) via ${process.env.OLLAMA_EMBED_HOST ?? process.env.OLLAMA_HOST ?? 'default'}`);
  } catch (e) {
    err(`embeddings unavailable (${(e as Error).message.slice(0, 90)}) — keyword-only retrieval`);
    embedder = null;
  }
  const index = await LookbackIndex.open({ embedder });
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
      let backoff = false;
      let job: ClaimedRadarJob | null;
      while ((job = await claimNextRadarJob())) {
        err(`\nclaim ${job.ticker} ${job.form} ${job.accession}`);
        try {
          await runJob(job, ollama, index);
          processed += 1;
        } catch (e) {
          const boxDown = !(await ollama.health()).ok;
          if (boxDown || isTransientCloudError(e)) {
            // Transient — put it back and stop draining so we don't spin the rest
            // of the queue into the same failure; back off before retrying.
            await requeueRadarJob(job.accession);
            err(
              `  … ${boxDown ? 'box offline' : 'cloud unavailable (credits/rate/overload?)'} — requeued, ` +
                `backing off ${backoffMs / 60_000}m: ${(e as Error).message.slice(0, 90)}`,
            );
            backoff = true;
            break;
          }
          await failRadarJob(job.accession, (e as Error).message);
          err(`  ✗ FAILED: ${(e as Error).message}`);
          processed += 1;
        }
      }
      if (!watch) {
        err(`\ndrained ${processed} job(s)${backoff ? ' (stopped early on a transient error — re-run to continue)' : ''}`);
        return;
      }
      await sleep(backoff ? backoffMs : pollMs);
    }
  } finally {
    await index.close();
  }
}

main().catch((e) => {
  err(`${(e as Error).stack ?? e}`);
  process.exit(1);
});
