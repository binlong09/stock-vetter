#!/usr/bin/env tsx
/**
 * scripts/calibrate-tokens.ts
 *
 * Check `estimateTokens` against your actual model's tokenizer.
 *
 * The chunker sizes chunks with a heuristic, because shipping a tokenizer for
 * a model we don't control means either a wrong tokenizer (tiktoken is not
 * Qwen's) or a native dependency and a download. The heuristic is tuned to
 * over-estimate, since under-estimating overflows the context window and
 * Ollama truncates silently rather than erroring.
 *
 * This measures the real ratio: it sends sample text to your Ollama server and
 * compares the estimate against the `prompt_eval_count` the server reports.
 * If the estimator is under-counting on your model, lower the char-per-token
 * settings until it is not.
 *
 * Usage:
 *   pnpm calibrate-tokens
 *   pnpm calibrate-tokens --model=qwen3:32b
 */
import 'dotenv/config';
import { OllamaClient, estimateTokens } from '@stock-vetter/local';

const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit?.slice(hit.indexOf('=') + 1);
};

const SAMPLES: Array<{ name: string; text: string }> = [
  {
    name: 'prose (MD&A style)',
    text:
      'Net sales increased 1.6% to $6,203.2 million, driven by volume growth in the Consumer Domestic ' +
      'segment, partially offset by unfavorable product mix and higher trade promotion spending. ' +
      'Gross margin declined 100 basis points to 44.7%, reflecting elevated input costs that were only ' +
      'partially recovered through pricing actions taken in the second half of the year. '.repeat(6),
  },
  {
    name: 'markdown table (financial statements)',
    text:
      'Year Ended December 31,\n\n|  | 2025 | 2024 | 2023 |\n| --- | --- | --- | --- |\n' +
      Array.from(
        { length: 30 },
        (_, i) => `| Line item ${i} | ${(1000 + i * 37.4).toFixed(1)} | ${(900 + i * 31.2).toFixed(1)} | ${(850 + i * 29.8).toFixed(1)} |`,
      ).join('\n'),
  },
  {
    name: 'dense numeric (notes to financials)',
    text:
      'Accounts receivable, net of allowance of $41.2 and $38.0, were $1,204.5 and $987.1 at December 31, ' +
      '2025 and 2024. Inventories of $612.8 and $534.1 comprised raw materials of $188.4 and $161.9, ' +
      'work in process of $44.7 and $39.2, and finished goods of $379.7 and $333.0. '.repeat(5),
  },
];

async function main(): Promise<void> {
  const client = new OllamaClient({ model: flag('model'), numCtx: 32768 });
  const health = await client.health();
  if (!health.ok) {
    process.stderr.write(`Ollama not ready: ${health.detail}\n`);
    process.exit(1);
  }
  process.stdout.write(`calibrating against ${client.model}\n\n`);

  let worst = 0;
  for (const s of SAMPLES) {
    const estimated = estimateTokens(s.text);
    // One token of output is enough — we only want prompt_eval_count.
    const { usage } = await client.generate({ prompt: s.text, maxOutputTokens: 1 });
    const actual = usage.promptTokens;
    const ratio = actual > 0 ? estimated / actual : 0;
    worst = Math.max(worst, actual / Math.max(1, estimated));
    process.stdout.write(
      `${s.name}\n` +
        `  chars ${s.text.length}  estimated ${estimated}  actual ${actual}  ` +
        `estimate/actual ${ratio.toFixed(2)}× ${ratio >= 1 ? '(safe)' : '(UNDER-COUNTING)'}\n\n`,
    );
  }

  if (worst > 1) {
    process.stdout.write(
      `The estimator UNDER-COUNTS by up to ${((worst - 1) * 100).toFixed(0)}% on this model.\n` +
        `Chunks may overflow num_ctx, and Ollama truncates the front of an over-length prompt\n` +
        `silently. Lower the ratios in your environment, e.g.:\n` +
        `  LOCAL_CHARS_PER_TOKEN_TEXT=${(3.6 / worst).toFixed(2)}\n` +
        `  LOCAL_CHARS_PER_TOKEN_DIGIT=${(2.0 / worst).toFixed(2)}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write('Estimator over-counts on every sample — chunk sizing is safe on this model.\n');
  }
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
