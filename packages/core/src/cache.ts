// Filesystem-based cache. Each entry is one JSON file under .cache/
// keyed by namespace + key components. Invalidation strategies vary by
// namespace (see comments inline). All writes are atomic via write-to-temp +
// rename; all reads tolerate corrupt entries by treating them as misses.
//
// Why filesystem and not a database: the meta-card workflow needs at most
// a few hundred entries per ticker (cards, snapshots, sections). Filesystem
// is debuggable (you can `ls .cache/`), portable (no schema migration), and
// avoids introducing a database dependency before storage is its own concern
// in a later weekend.

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CACHE_ROOT = process.env.STOCK_VETTER_CACHE_DIR ?? '.cache';

type CacheEnvelope<T> = {
  key: string;
  cachedAt: string; // ISO timestamp
  payload: T;
};

function pathFor(namespace: string, key: string): string {
  // Sanitize key for filesystem use. Hash if too long to avoid path-length issues.
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_');
  const final = safe.length > 180 ? createHash('sha1').update(key).digest('hex') : safe;
  return join(CACHE_ROOT, namespace, `${final}.json`);
}

async function ensureDir(p: string): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
}

export async function readCache<T>(namespace: string, key: string): Promise<CacheEnvelope<T> | null> {
  const p = pathFor(namespace, key);
  try {
    const body = await readFile(p, 'utf-8');
    return JSON.parse(body) as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

export async function writeCacheEntry<T>(namespace: string, key: string, payload: T): Promise<void> {
  const p = pathFor(namespace, key);
  await ensureDir(p);
  const envelope: CacheEnvelope<T> = {
    key,
    cachedAt: new Date().toISOString(),
    payload,
  };
  // Atomic write: temp file + rename.
  const tmp = `${p}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify(envelope, null, 2), 'utf-8');
  await rename(tmp, p);
}

export async function deleteCacheEntry(namespace: string, key: string): Promise<void> {
  const p = pathFor(namespace, key);
  await rm(p, { force: true });
}

// ---- Higher-level helpers per namespace ----

// Per-video cards. Cache forever; key by videoId. Manual delete to invalidate.
export async function getVideoCard<T>(videoId: string): Promise<T | null> {
  const e = await readCache<T>('video-card', videoId);
  return e?.payload ?? null;
}
export async function putVideoCard<T>(videoId: string, card: T): Promise<void> {
  await writeCacheEntry('video-card', videoId, card);
}

// Financial snapshot. 24h TTL via date bucket in key.
export function snapshotKey(ticker: string, date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${ticker.toUpperCase()}_${yyyy}-${mm}-${dd}`;
}
export async function getSnapshot<T>(ticker: string): Promise<T | null> {
  const e = await readCache<T>('snapshot', snapshotKey(ticker));
  return e?.payload ?? null;
}
export async function putSnapshot<T>(ticker: string, snapshot: T): Promise<void> {
  await writeCacheEntry('snapshot', snapshotKey(ticker), snapshot);
}

// SEC filing sections. Keyed by accession + section id; invalidation by
// presence of new accession on EDGAR (caller checks before fetching).
// One filing's accession is unique forever — sections under it never change.
export async function getSecSection<T>(accession: string, sectionId: string): Promise<T | null> {
  const e = await readCache<T>('sec', `${accession}_${sectionId}`);
  return e?.payload ?? null;
}
export async function putSecSection<T>(accession: string, sectionId: string, body: T): Promise<void> {
  await writeCacheEntry('sec', `${accession}_${sectionId}`, body);
}

// SEC filing meta — the document-level metadata (parser warnings, all sections list).
// Keyed by accession alone.
export async function getSecFilingMeta<T>(accession: string): Promise<T | null> {
  const e = await readCache<T>('sec-meta', accession);
  return e?.payload ?? null;
}
export async function putSecFilingMeta<T>(accession: string, meta: T): Promise<void> {
  await writeCacheEntry('sec-meta', accession, meta);
}

// LLM-stage outputs. Cache key MUST include a hash of the prompt text so
// editing a prompt invalidates the cache automatically. Otherwise tuning
// prompts silently produces stale results.
export function llmCacheKey(stage: string, inputHash: string, promptText: string): string {
  const promptHash = createHash('sha1').update(promptText).digest('hex').slice(0, 12);
  return `${stage}_${inputHash}_p${promptHash}`;
}
export async function getLlmOutput<T>(stage: string, inputHash: string, promptText: string): Promise<T | null> {
  const e = await readCache<T>('llm', llmCacheKey(stage, inputHash, promptText));
  return e?.payload ?? null;
}
export async function putLlmOutput<T>(
  stage: string,
  inputHash: string,
  promptText: string,
  output: T,
): Promise<void> {
  await writeCacheEntry('llm', llmCacheKey(stage, inputHash, promptText), output);
}

// Generic helper: hash an arbitrary input object for use in cache keys.
export function hashInputs(o: unknown): string {
  return createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 16);
}

// Last-modified time of any cache entry — used by meta-card invalidation
// logic to decide whether to re-run synthesis when an input changed.
export async function cacheEntryMtime(namespace: string, key: string): Promise<Date | null> {
  const p = pathFor(namespace, key);
  try {
    const s = await stat(p);
    return s.mtime;
  } catch {
    return null;
  }
}
