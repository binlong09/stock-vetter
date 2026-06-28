import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';
import { LLMValidationError } from './errors.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Per-model pricing (USD per million tokens). Cache-write is 1.25× input;
// cache-read is 0.10× input. Both assume the 5-minute TTL cache.
type Pricing = { input: number; output: number; cacheWrite: number; cacheRead: number };
const PRICING: Record<string, Pricing> = {
  'claude-opus-4-8': { input: 5.0, output: 25.0, cacheWrite: 6.25, cacheRead: 0.50 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0, cacheWrite: 1.25, cacheRead: 0.10 },
};
// 1-hour cache writes are billed at 2x base input (vs 1.25x for the 5-minute
// `cacheWrite` rate above), so they're priced separately from the breakdown.

function pricingFor(model: string): Pricing {
  // Fall back to Sonnet pricing for unknown models (defensive — prevents
  // throwing on a model we haven't priced yet, at the cost of a possibly
  // wrong cost number on screen).
  return PRICING[model] ?? PRICING[DEFAULT_MODEL]!;
}

let _client: Anthropic | null = null;

function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env or your environment.');
  }
  // Force the SDK onto Node's native fetch (undici) instead of the bundled
  // node-fetch@2. node-fetch v2 throws `ERR_STREAM_PREMATURE_CLOSE` from its
  // Gunzip handler on gzipped responses under newer Node (seen failing EVERY
  // call in CI on Node 22.x, regardless of request size). Native fetch
  // decompresses gzip correctly. Guard for older runtimes without global fetch.
  const nativeFetch = (globalThis as { fetch?: unknown }).fetch;
  const opts: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
  if (typeof nativeFetch === 'function') {
    (opts as { fetch?: unknown }).fetch = nativeFetch;
  }
  _client = new Anthropic(opts);
  return _client;
}

export type CostEntry = {
  stage: string;
  inputTokens: number;        // uncached input
  outputTokens: number;
  cacheWriteTokens: number;   // tokens billed at 1.25× input (writing into the cache)
  cacheReadTokens: number;    // tokens billed at 0.10× input (cache hit)
  cost: number;
};

export type CostTracker = {
  total: number;
  byCall: CostEntry[];
  onAfterCall?: (total: number) => void;
};

export function newCostTracker(onAfterCall?: (total: number) => void): CostTracker {
  return { total: 0, byCall: [], onAfterCall };
}

function priceCall(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens = 0,   // 5-minute cache writes (1.25x input)
  cacheReadTokens = 0,
  cacheWrite1hTokens = 0, // 1-hour cache writes (2x input)
): number {
  const p = pricingFor(model);
  return (
    (inputTokens / 1_000_000) * p.input +
    (outputTokens / 1_000_000) * p.output +
    (cacheWriteTokens / 1_000_000) * p.cacheWrite +
    (cacheWrite1hTokens / 1_000_000) * (p.input * 2) +
    (cacheReadTokens / 1_000_000) * p.cacheRead
  );
}

// Aggregate per-stage cost breakdown for end-of-run reporting. Groups byCall
// entries by stage prefix (e.g., "primary-source-moatDurability-s0" →
// "primary-source").
export function summarizeCost(tracker: CostTracker): {
  byStage: Record<string, { calls: number; inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number; cost: number }>;
  total: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
} {
  const byStage: Record<string, { calls: number; inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number; cost: number }> = {};
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  for (const c of tracker.byCall) {
    // Bucket by the high-level prefix so we get clean stage groupings.
    const prefix = c.stage.startsWith('primary-source-skeptic')
      ? 'primary-source-skeptic'
      : c.stage.startsWith('primary-source-judge')
        ? 'primary-source-judge'
        : c.stage.startsWith('primary-source-')
          ? 'primary-source-pass1'
          : c.stage.startsWith('meta-card')
            ? 'meta-card'
            : c.stage;
    const cur = byStage[prefix] ?? { calls: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, cost: 0 };
    cur.calls += 1;
    cur.inputTokens += c.inputTokens;
    cur.outputTokens += c.outputTokens;
    cur.cacheWriteTokens += c.cacheWriteTokens;
    cur.cacheReadTokens += c.cacheReadTokens;
    cur.cost += c.cost;
    byStage[prefix] = cur;
    totalCacheReadTokens += c.cacheReadTokens;
    totalCacheWriteTokens += c.cacheWriteTokens;
  }
  return { byStage, total: tracker.total, totalCacheReadTokens, totalCacheWriteTokens };
}

export type LLMCallResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
};

// Is this a transient error worth retrying?
//   - HTTP 429 (rate limit), 529 (overloaded), 5xx (server) — carry a status.
//   - Connection/transport errors carry NO status: a dropped socket, a TLS
//     reset, or a body stream cut off mid-read ("Premature close"). These are
//     the failures that most deserve a retry, and the ones that silently killed
//     the cron before this. The Anthropic SDK wraps them as APIConnectionError;
//     we also match raw undici/node messages in case the error isn't wrapped.
function isRetryableLlmError(e: unknown): boolean {
  const err = e as { status?: number; message?: string; name?: string };
  const status = err.status ?? 0;
  if (status === 429 || status === 529 || (status >= 500 && status < 600)) return true;
  if (e instanceof Anthropic.APIConnectionError || e instanceof Anthropic.APIConnectionTimeoutError) return true;
  const text = `${err.name ?? ''} ${err.message ?? ''}`;
  return /premature close|econnreset|etimedout|epipe|socket hang up|fetch failed|terminated|network|connection error|other side closed/i.test(
    text,
  );
}

// Retry transient API errors. Status-carrying ones (429/529/5xx) AND statusless
// connection/transport errors (dropped sockets, "Premature close"). Back off
// exponentially up to 5 attempts: 4s, 8s, 16s, 32s. Anything past that is
// likely a sustained outage; fail loudly.
// Compact one-line error description including the `cause` chain — undici hides
// the real transport failure there ("Premature close" is the wrapper; the cause
// is the actual ECONNRESET / UND_ERR_* / timeout).
function shortErrorDetail(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  let depth = 0;
  while (cur && depth < 4) {
    const x = cur as { name?: string; code?: string; status?: number; message?: string; cause?: unknown };
    const seg = [x.name, x.code, x.status != null ? `status=${x.status}` : '', x.message?.slice(0, 120)]
      .filter(Boolean)
      .join(' ');
    parts.push(depth === 0 ? seg : `cause→ ${seg}`);
    cur = x.cause;
    depth++;
  }
  return parts.join(' | ');
}

async function callWithRetry(
  body: MessageCreateParamsNonStreaming,
  stage: string,
): Promise<Message> {
  const maxAttempts = 5;
  let lastErr: unknown;
  // Rough request size for diagnosing oversized-request failures.
  const reqChars = JSON.stringify(body).length;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await client().messages.create(body);
    } catch (e) {
      lastErr = e;
      if (!isRetryableLlmError(e) || attempt === maxAttempts - 1) throw e;
      const delayMs = 4000 * Math.pow(2, attempt);
      process.stderr.write(
        `[llm:${stage}] retryable error (req ~${reqChars} chars): ${shortErrorDetail(e)}; ` +
          `retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/${maxAttempts})\n`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// A text segment optionally marked for prompt caching. When `cache` is true,
// a `cache_control: { type: "ephemeral" }` breakpoint is added on that block.
// Anthropic supports up to 4 cache breakpoints per request; the prefix up to
// each breakpoint is cached separately. Order matters — caches build
// incrementally from the start.
//
// `ttl` selects the cache lifetime: '5m' (default) or '1h'. The 1-hour TTL
// costs 2x base input to *write* (vs 1.25x for 5m) but survives long enough
// for a later pass to read it. We use it on the shared dimension-context block
// so Pass 2/3 (which run minutes after Pass 1 wrote it) still hit the cache.
export type CacheableSegment = { text: string; cache?: boolean; ttl?: '5m' | '1h' };

type CacheControl = { type: 'ephemeral'; ttl?: '5m' | '1h' };

// Build a Sonnet-friendly content array for the system prompt or a user
// message from a string OR an array of segments with optional cache markers.
function buildContentBlocks(
  input: string | CacheableSegment[],
): Array<{ type: 'text'; text: string; cache_control?: CacheControl }> {
  if (typeof input === 'string') return [{ type: 'text', text: input }];
  return input.map((s) => ({
    type: 'text' as const,
    text: s.text,
    ...(s.cache
      ? { cache_control: { type: 'ephemeral' as const, ...(s.ttl ? { ttl: s.ttl } : {}) } }
      : {}),
  }));
}

export async function llmCall(opts: {
  stage: string;
  systemPrompt: string | CacheableSegment[];
  userMessage: string | CacheableSegment[];
  maxTokens?: number;
  tracker: CostTracker;
  // Per-call model override. Defaults to Sonnet 4.6.
  model?: string;
}): Promise<LLMCallResult> {
  // Model precedence: explicit per-call opts.model wins; otherwise ANTHROPIC_MODEL
  // lets a run pick the model (e.g. Sonnet vs Opus for the prompt-cache A/B)
  // without code changes. Falls back to DEFAULT_MODEL (Sonnet).
  const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const systemBlocks = buildContentBlocks(opts.systemPrompt);
  const userBlocks = buildContentBlocks(opts.userMessage);
  const resp = await callWithRetry(
    {
      model,
      max_tokens: opts.maxTokens ?? 4096,
      system: systemBlocks,
      messages: [{ role: 'user', content: userBlocks }],
    },
    opts.stage,
  );
  const inputTokens = resp.usage.input_tokens;
  const outputTokens = resp.usage.output_tokens;
  // The Anthropic SDK exposes cache fields when prompt caching is in use.
  // They're absent on calls without cache_control blocks, so default to 0.
  // The `cache_creation` breakdown splits writes by TTL (5m billed at 1.25x,
  // 1h at 2x). Older responses only carry the aggregate, so fall back to
  // treating the whole aggregate as 5m.
  const u = resp.usage as {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
  };
  const aggregateWrite = u.cache_creation_input_tokens ?? 0;
  const cacheWrite1hTokens = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const cacheWrite5mTokens = u.cache_creation
    ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0)
    : aggregateWrite;
  const cacheWriteTokens = cacheWrite5mTokens + cacheWrite1hTokens; // for display
  const cacheReadTokens = u.cache_read_input_tokens ?? 0;
  const cost = priceCall(model, inputTokens, outputTokens, cacheWrite5mTokens, cacheReadTokens, cacheWrite1hTokens);
  opts.tracker.total += cost;
  opts.tracker.byCall.push({ stage: opts.stage, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, cost });
  opts.tracker.onAfterCall?.(opts.tracker.total);

  let text = '';
  for (const block of resp.content) {
    if (block.type === 'text') text += block.text;
  }
  return { text, inputTokens, outputTokens, cost };
}

export function stripJsonFence(s: string): string {
  let t = s.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*\n?/, '');
    t = t.replace(/\n?```\s*$/, '');
  }
  // Some models prepend explanatory text before the JSON despite instructions.
  // Trim to the first { or [ if present.
  const firstBrace = t.search(/[{\[]/);
  if (firstBrace > 0) t = t.slice(firstBrace);
  return t.trim();
}

export async function llmCallJson<T>(opts: {
  stage: string;
  systemPrompt: string | CacheableSegment[];
  userMessage: string | CacheableSegment[];
  schema: z.ZodType<T>;
  maxTokens?: number;
  tracker: CostTracker;
  model?: string;
}): Promise<T> {
  let lastError: string | null = null;
  let lastRaw: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    let userMessage: string | CacheableSegment[];
    if (lastError === null) {
      userMessage = opts.userMessage;
    } else {
      // On retry, append a correction directive. Preserve cache markers from
      // the original by appending a new uncached segment, so the cached
      // prefix still hits.
      const retrySuffix = `\n\n---\nYour previous response failed validation:\n${lastError}\n\nReturn corrected JSON only. No markdown fences, no commentary.`;
      if (typeof opts.userMessage === 'string') {
        userMessage = opts.userMessage + retrySuffix;
      } else {
        userMessage = [...opts.userMessage, { text: retrySuffix }];
      }
    }
    const result = await llmCall({
      stage: attempt === 0 ? opts.stage : `${opts.stage}-retry`,
      systemPrompt: opts.systemPrompt,
      userMessage,
      maxTokens: opts.maxTokens,
      tracker: opts.tracker,
      model: opts.model,
    });
    const cleaned = stripJsonFence(result.text);
    lastRaw = cleaned;
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      lastError = `JSON parse error: ${(e as Error).message}\nFirst 500 chars of output:\n${cleaned.slice(0, 500)}`;
      continue;
    }
    const validation = opts.schema.safeParse(parsed);
    if (validation.success) return validation.data;
    lastError = validation.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n');
  }
  throw new LLMValidationError(opts.stage, lastError ?? 'unknown', lastRaw);
}
