// Embeddings from the local Ollama server.
//
// Kept separate from `ollama.ts` because the embedding model is a different
// model with a different lifecycle: it is small, it stays resident cheaply,
// and swapping it invalidates every stored vector. That last point is why
// `Embedder` reports its model name and dimension — the index records them and
// refuses to mix vectors from two models, which would otherwise produce
// silently meaningless cosine distances.

export type EmbedOptions = {
  host?: string;
  model?: string;
  timeoutMs?: number;
  /** Texts per request. Ollama batches server-side; 16 keeps memory sane. */
  batchSize?: number;
};

const DEFAULTS = {
  host: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
  // nomic-embed-text is the most commonly pulled embedding model and handles
  // 8k contexts. bge-m3 (1024d) scores better on financial retrieval if you
  // have it; set OLLAMA_EMBED_MODEL to switch. Changing it requires a reindex.
  model: process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text',
  timeoutMs: Number(process.env.OLLAMA_EMBED_TIMEOUT_MS ?? 120_000),
  batchSize: Number(process.env.OLLAMA_EMBED_BATCH ?? 16),
};

export class Embedder {
  private readonly opts: Required<EmbedOptions>;
  private _dim: number | null = null;

  constructor(opts: EmbedOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts } as Required<EmbedOptions>;
  }

  get model(): string {
    return this.opts.model;
  }
  /** Known only after the first embed call. */
  get dimension(): number | null {
    return this._dim;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.opts.batchSize) {
      const batch = texts.slice(i, i + this.opts.batchSize);
      const res = await fetch(`${this.opts.host}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.opts.model, input: batch }),
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
      if (!res.ok) {
        throw new Error(
          `embedding request failed (${res.status}): ${(await res.text()).slice(0, 300)}. ` +
            `Is "${this.opts.model}" pulled? Run: ollama pull ${this.opts.model}`,
        );
      }
      const body = (await res.json()) as { embeddings?: number[][] };
      const vecs = body.embeddings ?? [];
      if (vecs.length !== batch.length) {
        throw new Error(`embedding count mismatch: sent ${batch.length}, got ${vecs.length}`);
      }
      for (const v of vecs) {
        if (this._dim === null) this._dim = v.length;
        else if (v.length !== this._dim) {
          throw new Error(`embedding dimension changed mid-run: ${this._dim} → ${v.length}`);
        }
        out.push(v);
      }
    }
    return out;
  }

  async embedOne(text: string): Promise<number[]> {
    const [v] = await this.embed([text]);
    if (!v) throw new Error('embedding returned no vector');
    return v;
  }
}

/**
 * Pack a vector as a little-endian Float32 blob, the layout libSQL's
 * `vector_distance_cos` expects for an F32_BLOB column.
 */
export function packF32(vec: number[]): Uint8Array {
  const buf = new ArrayBuffer(vec.length * 4);
  const view = new DataView(buf);
  for (let i = 0; i < vec.length; i++) view.setFloat32(i * 4, vec[i]!, true);
  return new Uint8Array(buf);
}

export function unpackF32(blob: Uint8Array | ArrayBuffer): number[] {
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: number[] = new Array(bytes.byteLength / 4);
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

/** Cosine similarity, for the fallback path when SQL vector functions are absent. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
