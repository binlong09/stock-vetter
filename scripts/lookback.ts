#!/usr/bin/env tsx
/**
 * scripts/lookback.ts
 *
 * Query the local lookback index by hand — the same retrieval the cloud model
 * gets through its tools. Useful for checking what the model would have seen
 * before blaming the model.
 *
 * Usage:
 *   pnpm lookback stats
 *   pnpm lookback search "days sales outstanding" --ticker=NVDA
 *   pnpm lookback verify "Days sales outstanding increased to 78 days"
 *   pnpm lookback filings NVDA
 *   pnpm lookback remove 0000320193-25-000073
 */
import 'dotenv/config';
import { Embedder, LookbackIndex } from '@stock-vetter/local';

const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit?.slice(hit.indexOf('=') + 1);
};
const positional = argv.filter((a) => !a.startsWith('--'));
const [command, ...rest] = positional;

async function main(): Promise<void> {
  // Keyword-only queries need no embedder, and not constructing one means the
  // command works with Ollama stopped.
  const keywordOnly = flag('keyword-only') != null || argv.includes('--keyword-only');
  const index = await LookbackIndex.open({ embedder: keywordOnly ? null : new Embedder() });

  try {
    switch (command) {
      case 'stats': {
        const s = await index.stats();
        process.stdout.write(
          `${s.filings} filings · ${s.tickers} companies · ${s.chunks} chunks · ${s.embeddings} embedded\n`,
        );
        if (s.chunks > 0 && s.embeddings === 0) {
          process.stdout.write(
            'No embeddings stored: retrieval is keyword-only. Re-index with Ollama running to add the vector arm.\n',
          );
        }
        break;
      }

      case 'search': {
        const query = rest.join(' ');
        if (!query) throw new Error('usage: pnpm lookback search "<query>" [--ticker=X] [--accession=Y]');
        const hits = await index.search(query, {
          ticker: flag('ticker'),
          accession: flag('accession'),
          sectionId: flag('section'),
          limit: Number(flag('limit') ?? 5),
          snippetTokens: Number(flag('tokens') ?? 500),
          keywordOnly,
        });
        if (!hits.length) {
          process.stdout.write('no matches\n');
          break;
        }
        for (const [i, h] of hits.entries()) {
          process.stdout.write(
            `\n[${i + 1}] ${h.ticker} ${h.form} ${h.filingDate} · ${h.sectionId} · chunk ${h.chunkIndex}\n` +
              `    accession ${h.accession} · matched by ${h.matchedBy.join('+')} · score ${h.score.toFixed(4)}\n` +
              (h.headings.length ? `    under: ${h.headings.join(' > ')}\n` : '') +
              (h.snippet.tableContextAdded ? '    (table header prepended)\n' : '') +
              `${'─'.repeat(60)}\n${h.snippet.text}\n`,
          );
        }
        break;
      }

      case 'verify': {
        const quote = rest.join(' ');
        if (!quote) throw new Error('usage: pnpm lookback verify "<exact quote>"');
        const r = await index.verifyQuote(quote, { ticker: flag('ticker'), accession: flag('accession') });
        process.stdout.write(
          r.found ? `VERIFIED — ${r.accession}, chunk ${r.chunkId}\n` : 'NOT FOUND in the indexed text\n',
        );
        process.exitCode = r.found ? 0 : 1;
        break;
      }

      case 'filings': {
        const ticker = rest[0];
        if (!ticker) throw new Error('usage: pnpm lookback filings <TICKER>');
        const list = await index.filingsFor(ticker, Number(flag('limit') ?? 20));
        if (!list.length) process.stdout.write(`nothing indexed for ${ticker}\n`);
        for (const f of list) process.stdout.write(`${f.filingDate}  ${f.form.padEnd(8)}  ${f.accession}\n`);
        break;
      }

      case 'remove': {
        const accession = rest[0];
        if (!accession) throw new Error('usage: pnpm lookback remove <ACCESSION>');
        await index.removeFiling(accession);
        process.stdout.write(`removed ${accession}\n`);
        break;
      }

      default:
        process.stderr.write(
          'Usage: pnpm lookback <stats|search|verify|filings|remove> [args] [--ticker=X] [--keyword-only]\n',
        );
        process.exit(1);
    }
  } finally {
    await index.close();
  }
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).message}\n`);
  process.exit(1);
});
