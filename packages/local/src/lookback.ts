// Phase 3: the local lookback index.
//
// This is the thing that makes cloud verification cheap. Without it, checking
// one number means re-sending a 300,000-token filing to the cloud model. With
// it, the cloud model asks a question, this answers with the 500-token
// passage where the figure actually lives, and the cloud model sees only that.
//
// STORAGE. One SQLite file on the machine with the GPU, via `@libsql/client`
// in `file:` mode — the same client the repo already uses for Turso, so the
// code is one URL apart from the hosted store and needs no new dependency.
// It stays local on purpose: the corpus is tens of gigabytes of raw filing
// text, it is rebuildable from EDGAR at any time, and shipping it to a hosted
// database would reintroduce exactly the network round-trip this exists to
// remove. Turso holds the small finished artifacts; this holds the bulk.
//
// RETRIEVAL is hybrid, and that is not a hedge. Pure vector search is
// genuinely bad at the queries this system asks. "What was days sales
// outstanding in Q3?" and "What was days sales outstanding in Q2?" embed
// almost identically, and a query for the literal string "1,204.5" has no
// semantic content at all — but BM25 finds both instantly. Conversely
// "is management blaming external factors for the margin decline?" has no
// reliable keywords. Running both and fusing by reciprocal rank gets the
// behaviour of each where it is strong.

import { createClient, type Client, type InValue } from '@libsql/client';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { FilingChunk } from './chunk.js';
import { Embedder, packF32, unpackF32, cosineSimilarity } from './embed.js';
import { extractSnippet, type Snippet } from './snippet.js';

const DEFAULT_DB_PATH = process.env.LOOKBACK_DB_PATH ?? '.cache/lookback.db';

export type RetrievedPassage = {
  chunkId: string;
  ticker: string;
  accession: string;
  form: string;
  filingDate: string;
  sectionId: string;
  chunkIndex: number;
  headings: string[];
  snippet: Snippet;
  /** Fused rank score. Comparable within one query only. */
  score: number;
  matchedBy: Array<'keyword' | 'vector'>;
};

export type SearchFilters = {
  ticker?: string;
  accession?: string;
  /** Restrict to filings on or after this date, 'YYYY-MM-DD'. */
  since?: string;
  form?: string;
  sectionId?: string;
};

export type SearchOptions = SearchFilters & {
  limit?: number;
  /** Tokens per returned passage. Default 500. */
  snippetTokens?: number;
  /** Candidates pulled from each retrieval arm before fusion. Default 30. */
  candidatesPerArm?: number;
  /** Skip the vector arm (no embedder configured, or keyword-only by choice). */
  keywordOnly?: boolean;
};

// FTS5 treats bare punctuation and words like NEAR/AND/OR as syntax. A model-
// written query ("AR growth vs. revenue — is DSO up?") is a syntax error, and
// an unquoted user string is an injection vector into the query language. So
// every term is extracted and re-quoted; nothing from the caller reaches the
// FTS5 parser unquoted.
export function toFtsQuery(query: string): string {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9.]+/i)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length > 1 && !/^(and|or|not|near|the|for|was|were|are|its|this|that)$/.test(t));
  if (!terms.length) return '';
  // OR across terms: BM25 ranks by how many (and how rare) the matches are, so
  // recall-first is right. AND would return nothing for most real questions.
  return [...new Set(terms)].map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
}

export class LookbackIndex {
  private db: Client;
  private embedder: Embedder | null;
  private vectorSqlAvailable: boolean | null = null;

  private constructor(db: Client, embedder: Embedder | null) {
    this.db = db;
    this.embedder = embedder;
  }

  static async open(opts: { path?: string; embedder?: Embedder | null } = {}): Promise<LookbackIndex> {
    const path = opts.path ?? DEFAULT_DB_PATH;
    if (!path.startsWith(':memory:')) await mkdir(dirname(path), { recursive: true });
    const url = path.startsWith(':memory:') ? ':memory:' : `file:${path}`;
    const db = createClient({ url });
    const idx = new LookbackIndex(db, opts.embedder === undefined ? new Embedder() : opts.embedder);
    await idx.migrate();
    return idx;
  }

  private async migrate(): Promise<void> {
    await this.db.batch(
      [
        `CREATE TABLE IF NOT EXISTS filings (
           accession   TEXT PRIMARY KEY,
           ticker      TEXT NOT NULL,
           cik         TEXT NOT NULL,
           form        TEXT NOT NULL,
           filing_date TEXT NOT NULL,
           indexed_at  TEXT NOT NULL
         )`,
        `CREATE INDEX IF NOT EXISTS filings_ticker_date ON filings(ticker, filing_date DESC)`,
        `CREATE TABLE IF NOT EXISTS chunks (
           rowid       INTEGER PRIMARY KEY,
           id          TEXT NOT NULL UNIQUE,
           accession   TEXT NOT NULL,
           ticker      TEXT NOT NULL,
           form        TEXT NOT NULL,
           filing_date TEXT NOT NULL,
           section_id  TEXT NOT NULL,
           chunk_index INTEGER NOT NULL,
           headings    TEXT NOT NULL,
           text        TEXT NOT NULL
         )`,
        `CREATE INDEX IF NOT EXISTS chunks_accession ON chunks(accession)`,
        `CREATE INDEX IF NOT EXISTS chunks_ticker ON chunks(ticker, filing_date DESC)`,
        // External-content FTS: the text lives once, in `chunks`. A standalone
        // FTS table would double the on-disk size of the corpus.
        `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
           text, content='chunks', content_rowid='rowid'
         )`,
        `CREATE TABLE IF NOT EXISTS embeddings (
           chunk_rowid INTEGER PRIMARY KEY REFERENCES chunks(rowid) ON DELETE CASCADE,
           model       TEXT NOT NULL,
           dim         INTEGER NOT NULL,
           vec         BLOB NOT NULL
         )`,
        `CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
      ].map((sql) => ({ sql, args: [] })),
      'write',
    );
  }

  /** Does this libSQL build expose native vector SQL? Probed once. */
  private async hasVectorSql(): Promise<boolean> {
    if (this.vectorSqlAvailable !== null) return this.vectorSqlAvailable;
    try {
      await this.db.execute("SELECT vector_distance_cos(vector32('[1,0]'), vector32('[1,0]'))");
      this.vectorSqlAvailable = true;
    } catch {
      // Older libSQL builds lack the vector functions. Cosine in JS over a
      // ticker-scoped candidate set is a few thousand dot products — fine at
      // this scale, and it keeps the index working rather than failing.
      this.vectorSqlAvailable = false;
    }
    return this.vectorSqlAvailable;
  }

  async close(): Promise<void> {
    this.db.close();
  }

  // -------------------------------------------------------------------------
  // Indexing
  // -------------------------------------------------------------------------

  async isIndexed(accession: string): Promise<boolean> {
    const r = await this.db.execute({
      sql: 'SELECT 1 FROM filings WHERE accession = ? LIMIT 1',
      args: [accession],
    });
    return r.rows.length > 0;
  }

  /**
   * Index a filing's chunks. Re-indexing the same accession replaces it, so a
   * re-run after a parser fix doesn't leave two generations of chunks that
   * both answer the same query.
   */
  async indexFiling(
    chunks: FilingChunk[],
    opts: { embed?: boolean } = {},
  ): Promise<{ chunksIndexed: number; embedded: number }> {
    if (!chunks.length) return { chunksIndexed: 0, embedded: 0 };
    const first = chunks[0]!;
    await this.removeFiling(first.accession);

    await this.db.execute({
      sql: `INSERT INTO filings (accession, ticker, cik, form, filing_date, indexed_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [first.accession, first.ticker, first.cik, first.form, first.filingDate, new Date().toISOString()],
    });

    const rowids: number[] = [];
    for (const c of chunks) {
      const res = await this.db.execute({
        sql: `INSERT INTO chunks (id, accession, ticker, form, filing_date, section_id, chunk_index, headings, text)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          c.id,
          c.accession,
          c.ticker,
          c.form,
          c.filingDate,
          c.sectionId,
          c.index,
          JSON.stringify(c.headings),
          c.text,
        ],
      });
      const rowid = Number(res.lastInsertRowid);
      rowids.push(rowid);
      // External-content FTS requires the rowid to be supplied explicitly.
      await this.db.execute({
        sql: 'INSERT INTO chunks_fts(rowid, text) VALUES (?, ?)',
        args: [rowid, c.text],
      });
    }

    let embedded = 0;
    if (opts.embed !== false && this.embedder) {
      const vecs = await this.embedder.embed(chunks.map((c) => c.text));
      for (let i = 0; i < vecs.length; i++) {
        await this.db.execute({
          sql: 'INSERT OR REPLACE INTO embeddings (chunk_rowid, model, dim, vec) VALUES (?, ?, ?, ?)',
          args: [rowids[i]!, this.embedder.model, vecs[i]!.length, packF32(vecs[i]!)],
        });
        embedded++;
      }
      await this.db.execute({
        sql: 'INSERT OR REPLACE INTO index_meta (key, value) VALUES (?, ?)',
        args: ['embed_model', this.embedder.model],
      });
    }

    return { chunksIndexed: chunks.length, embedded };
  }

  async removeFiling(accession: string): Promise<void> {
    // FTS external-content tables don't cascade; rows must be withdrawn from
    // the index explicitly or deleted text keeps matching queries forever.
    const rows = await this.db.execute({
      sql: 'SELECT rowid, text FROM chunks WHERE accession = ?',
      args: [accession],
    });
    for (const r of rows.rows) {
      await this.db.execute({
        sql: "INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', ?, ?)",
        args: [r.rowid as number, r.text as string],
      });
    }
    await this.db.execute({ sql: 'DELETE FROM embeddings WHERE chunk_rowid IN (SELECT rowid FROM chunks WHERE accession = ?)', args: [accession] });
    await this.db.execute({ sql: 'DELETE FROM chunks WHERE accession = ?', args: [accession] });
    await this.db.execute({ sql: 'DELETE FROM filings WHERE accession = ?', args: [accession] });
  }

  // -------------------------------------------------------------------------
  // Retrieval
  // -------------------------------------------------------------------------

  private filterClause(f: SearchFilters, alias = 'c'): { sql: string; args: InValue[] } {
    const parts: string[] = [];
    const args: InValue[] = [];
    if (f.ticker) {
      parts.push(`${alias}.ticker = ?`);
      args.push(f.ticker.toUpperCase());
    }
    if (f.accession) {
      parts.push(`${alias}.accession = ?`);
      args.push(f.accession);
    }
    if (f.form) {
      parts.push(`${alias}.form = ?`);
      args.push(f.form);
    }
    if (f.sectionId) {
      parts.push(`${alias}.section_id = ?`);
      args.push(f.sectionId);
    }
    if (f.since) {
      parts.push(`${alias}.filing_date >= ?`);
      args.push(f.since);
    }
    return { sql: parts.length ? `AND ${parts.join(' AND ')}` : '', args };
  }

  private async keywordCandidates(query: string, opts: SearchOptions): Promise<Array<{ rowid: number }>> {
    const fts = toFtsQuery(query);
    if (!fts) return [];
    const f = this.filterClause(opts);
    const res = await this.db.execute({
      sql: `SELECT c.rowid AS rowid
            FROM chunks_fts
            JOIN chunks c ON c.rowid = chunks_fts.rowid
            WHERE chunks_fts MATCH ? ${f.sql}
            ORDER BY bm25(chunks_fts)
            LIMIT ?`,
      args: [fts, ...f.args, opts.candidatesPerArm ?? 30],
    });
    return res.rows.map((r) => ({ rowid: Number(r.rowid) }));
  }

  private async vectorCandidates(query: string, opts: SearchOptions): Promise<Array<{ rowid: number }>> {
    if (!this.embedder) return [];
    const qv = await this.embedder.embedOne(query);
    const f = this.filterClause(opts);
    const limit = opts.candidatesPerArm ?? 30;

    if (await this.hasVectorSql()) {
      const res = await this.db.execute({
        sql: `SELECT c.rowid AS rowid, vector_distance_cos(e.vec, vector32(?)) AS dist
              FROM embeddings e
              JOIN chunks c ON c.rowid = e.chunk_rowid
              WHERE e.dim = ? ${f.sql}
              ORDER BY dist ASC
              LIMIT ?`,
        args: [JSON.stringify(qv), qv.length, ...f.args, limit],
      });
      return res.rows.map((r) => ({ rowid: Number(r.rowid) }));
    }

    // Fallback: score in JS. Only viable because queries are almost always
    // scoped to one ticker (a few thousand vectors), which is exactly how the
    // verification tool calls it.
    const res = await this.db.execute({
      sql: `SELECT c.rowid AS rowid, e.vec AS vec
            FROM embeddings e JOIN chunks c ON c.rowid = e.chunk_rowid
            WHERE e.dim = ? ${f.sql}`,
      args: [qv.length, ...f.args],
    });
    return res.rows
      .map((r) => ({ rowid: Number(r.rowid), sim: cosineSimilarity(qv, unpackF32(r.vec as unknown as Uint8Array)) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, limit);
  }

  /**
   * Hybrid search. Returns passages, not whole chunks.
   *
   * Fusion is Reciprocal Rank Fusion: score = Σ 1/(k + rank). RRF combines
   * rankings without needing the two arms' scores to be commensurable — BM25
   * scores and cosine distances are not on any shared scale, and normalizing
   * them against each other invents a calibration that doesn't exist.
   */
  async search(query: string, opts: SearchOptions = {}): Promise<RetrievedPassage[]> {
    const limit = opts.limit ?? 5;
    const K = 60; // standard RRF damping

    const [keyword, vector] = await Promise.all([
      this.keywordCandidates(query, opts),
      opts.keywordOnly ? Promise.resolve([]) : this.vectorCandidates(query, opts).catch(() => []),
    ]);

    const scores = new Map<number, { score: number; matchedBy: Set<'keyword' | 'vector'> }>();
    const add = (list: Array<{ rowid: number }>, kind: 'keyword' | 'vector'): void => {
      list.forEach((row, rank) => {
        const cur = scores.get(row.rowid) ?? { score: 0, matchedBy: new Set<'keyword' | 'vector'>() };
        cur.score += 1 / (K + rank + 1);
        cur.matchedBy.add(kind);
        scores.set(row.rowid, cur);
      });
    };
    add(keyword, 'keyword');
    add(vector, 'vector');

    const top = [...scores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit);
    if (!top.length) return [];

    const placeholders = top.map(() => '?').join(',');
    const rows = await this.db.execute({
      sql: `SELECT rowid, id, ticker, accession, form, filing_date, section_id, chunk_index, headings, text
            FROM chunks WHERE rowid IN (${placeholders})`,
      args: top.map(([rowid]) => rowid),
    });
    const byRowid = new Map(rows.rows.map((r) => [Number(r.rowid), r]));

    const out: RetrievedPassage[] = [];
    for (const [rowid, s] of top) {
      const r = byRowid.get(rowid);
      if (!r) continue;
      out.push({
        chunkId: r.id as string,
        ticker: r.ticker as string,
        accession: r.accession as string,
        form: r.form as string,
        filingDate: r.filing_date as string,
        sectionId: r.section_id as string,
        chunkIndex: Number(r.chunk_index),
        headings: JSON.parse((r.headings as string) || '[]') as string[],
        snippet: extractSnippet(r.text as string, query, opts.snippetTokens ?? 500),
        score: s.score,
        matchedBy: [...s.matchedBy],
      });
    }
    return out;
  }

  /**
   * Does this exact text appear in the indexed corpus? Used to check a
   * citation before it goes in front of the user.
   *
   * Substring matching, not search — a citation either is in the filing or it
   * isn't, and a ranked approximate answer to that question is worthless.
   */
  async verifyQuote(
    quote: string,
    filters: SearchFilters = {},
  ): Promise<{ found: boolean; chunkId: string | null; accession: string | null }> {
    const needle = quote.toLowerCase().replace(/\s+/g, ' ').trim();
    if (needle.length < 12) return { found: false, chunkId: null, accession: null };
    const f = this.filterClause(filters);
    // Narrow with FTS first so this doesn't become a full-corpus table scan;
    // confirm with an exact substring test, since FTS matches terms, not spans.
    const fts = toFtsQuery(quote);
    const candidates = fts
      ? await this.db.execute({
          sql: `SELECT c.id, c.accession, c.text FROM chunks_fts
                JOIN chunks c ON c.rowid = chunks_fts.rowid
                WHERE chunks_fts MATCH ? ${f.sql}
                ORDER BY bm25(chunks_fts) LIMIT 50`,
          args: [fts, ...f.args],
        })
      : await this.db.execute({
          sql: `SELECT c.id, c.accession, c.text FROM chunks c WHERE 1=1 ${f.sql} LIMIT 200`,
          args: f.args,
        });

    for (const r of candidates.rows) {
      const hay = (r.text as string).toLowerCase().replace(/\s+/g, ' ');
      if (hay.includes(needle)) {
        return { found: true, chunkId: r.id as string, accession: r.accession as string };
      }
    }
    return { found: false, chunkId: null, accession: null };
  }

  async stats(): Promise<{ filings: number; chunks: number; embeddings: number; tickers: number }> {
    const q = async (sql: string): Promise<number> => Number((await this.db.execute(sql)).rows[0]!.n);
    return {
      filings: await q('SELECT COUNT(*) AS n FROM filings'),
      chunks: await q('SELECT COUNT(*) AS n FROM chunks'),
      embeddings: await q('SELECT COUNT(*) AS n FROM embeddings'),
      tickers: await q('SELECT COUNT(DISTINCT ticker) AS n FROM filings'),
    };
  }

  /** Most recent indexed filings for a ticker, newest first. */
  async filingsFor(ticker: string, limit = 12): Promise<
    Array<{ accession: string; form: string; filingDate: string }>
  > {
    const r = await this.db.execute({
      sql: `SELECT accession, form, filing_date FROM filings
            WHERE ticker = ? ORDER BY filing_date DESC LIMIT ?`,
      args: [ticker.toUpperCase(), limit],
    });
    return r.rows.map((x) => ({
      accession: x.accession as string,
      form: x.form as string,
      filingDate: x.filing_date as string,
    }));
  }
}
