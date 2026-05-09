#!/usr/bin/env tsx
/**
 * scripts/render-card.ts
 *
 * Renders a saved DecisionCard JSON file as markdown to stdout.
 * Lets workflows produce both JSON and markdown artifacts from a single
 * pipeline run instead of paying for two.
 *
 * Usage:
 *   pnpm tsx scripts/render-card.ts <path-to-card.json>
 *
 * Exit codes:
 *   0  success
 *   1  read or validation failure
 *   3  invalid arguments
 */

import { readFile } from 'node:fs/promises';
import { DecisionCard } from '@stock-vetter/schema';
import { renderMarkdown } from '../packages/pipeline/src/render.js';

async function main() {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write('Usage: pnpm tsx scripts/render-card.ts <path-to-card.json>\n');
    process.exit(3);
  }

  let body: string;
  try {
    body = await readFile(path, 'utf-8');
  } catch (e) {
    process.stderr.write(`[render-card] cannot read ${path}: ${(e as Error).message}\n`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    process.stderr.write(`[render-card] invalid JSON in ${path}: ${(e as Error).message}\n`);
    process.exit(1);
  }

  const result = DecisionCard.safeParse(parsed);
  if (!result.success) {
    process.stderr.write(`[render-card] ${path} does not match DecisionCard schema:\n`);
    process.stderr.write(result.error.toString() + '\n');
    process.exit(1);
  }

  process.stdout.write(renderMarkdown(result.data) + '\n');
}

main();
