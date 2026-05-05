#!/usr/bin/env tsx
/**
 * scripts/run-pipeline.ts
 *
 * CLI entry point. Runs the full pipeline on a single YouTube URL
 * and prints a markdown decision card to stdout.
 *
 * Usage:
 *   pnpm tsx scripts/run-pipeline.ts <youtube-url>
 *   pnpm tsx scripts/run-pipeline.ts <youtube-url> --json   # raw JSON output
 *   pnpm tsx scripts/run-pipeline.ts <youtube-url> --debug  # dump intermediates
 *
 * Exit codes:
 *   0  success
 *   1  pipeline error (missing captions, unknown ticker, validation failure)
 *   2  cost ceiling exceeded
 *   3  invalid arguments
 */

import 'dotenv/config';
import { runPipeline } from '../packages/pipeline/src/orchestrate.js';
import { renderMarkdown } from '../packages/pipeline/src/render.js';
import { CostCeilingError, InvalidYoutubeUrlError } from '../packages/pipeline/src/errors.js';

type Args = {
  url: string;
  json: boolean;
  debug: boolean;
};

const USAGE = `Usage: pnpm tsx scripts/run-pipeline.ts <youtube-url> [--json] [--debug]`;

function parseArgs(argv: string[]): Args {
  let url: string | null = null;
  let json = false;
  let debug = false;
  for (const a of argv) {
    if (a === '--json') json = true;
    else if (a === '--debug') debug = true;
    else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}\n${USAGE}`);
    else if (!url) url = a;
    else throw new Error(`Unexpected positional arg: ${a}\n${USAGE}`);
  }
  if (!url) throw new Error(USAGE);
  // Cheap pre-check; transcript.parseYoutubeUrl will validate properly.
  if (!/youtube\.com\/|youtu\.be\//.test(url)) {
    throw new Error(`Not a YouTube URL: ${url}\n${USAGE}`);
  }
  return { url, json, debug };
}

async function main() {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exit(3);
  }

  process.stderr.write(`[pipeline] starting: ${args.url}\n`);
  const startedAt = Date.now();

  try {
    const card = await runPipeline(args.url, {
      onProgress: (stage, costSoFar) => {
        process.stderr.write(`[pipeline] ${stage} (cost so far: $${costSoFar.toFixed(3)})\n`);
      },
      onCostWarning: (cost) => {
        process.stderr.write(`[pipeline] WARNING: cost exceeded $0.75 (current: $${cost.toFixed(3)})\n`);
      },
      onCostAbort: (cost) => {
        process.stderr.write(`[pipeline] ABORT: cost exceeded $1.50 (current: $${cost.toFixed(3)})\n`);
      },
      debug: args.debug,
    });

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    process.stderr.write(`[pipeline] done in ${elapsed}s\n`);

    if (args.json) {
      process.stdout.write(JSON.stringify(card, null, 2) + '\n');
    } else {
      process.stdout.write(renderMarkdown(card) + '\n');
    }
  } catch (err) {
    const e = err as Error;
    if (e instanceof CostCeilingError) {
      process.stderr.write(`[pipeline] ERROR: ${e.message}\n`);
      process.exit(2);
    }
    if (e instanceof InvalidYoutubeUrlError) {
      process.stderr.write(`[pipeline] ERROR: ${e.message}\n`);
      process.exit(3);
    }
    process.stderr.write(`[pipeline] ERROR: ${e.message}\n`);
    if (args.debug) {
      process.stderr.write((e.stack ?? '') + '\n');
    }
    process.exit(1);
  }
}

main();
