import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';
import { LLMValidationError } from './errors.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Per-model pricing (USD per million tokens). Cache-write is 1.25× input;
// cache-read is 0.10× input. Both assume the 5-minute TTL cache.
type Pricing = { input: number; output: number; cacheWrite: number; cacheRead: number };
const PRICING: Record<string, Pricing> = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0, cacheWrite: 1.25, cacheRead: 0.10 },
};

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
  _client = new Anthropic({ apiKey });
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
  cacheWriteTokens = 0,
  cacheReadTokens = 0,
): number {
  const p = pricingFor(model);
  return (
    (inputTokens / 1_000_000) * p.input +
    (outputTokens / 1_000_000) * p.output +
    (cacheWriteTokens / 1_000_000) * p.cacheWrite +
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

// Retry transient API errors (429 rate-limit, 529 overloaded, 5xx). Anthropic
// returns these as `APIError` with `status` set. We back off exponentially
// up to 5 attempts: 4s, 8s, 16s, 32s. Anything past that and the issue is
// likely user-facing (e.g. extended outage); fail loudly.
async function callWithRetry(
  body: MessageCreateParamsNonStreaming,
  stage: string,
): Promise<Message> {
  const maxAttempts = 5;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await client().messages.create(body);
    } catch (e) {
      lastErr = e;
      const err = e as { status?: number; message?: string };
      const status = err.status ?? 0;
      const isRetryable = status === 429 || status === 529 || (status >= 500 && status < 600);
      if (!isRetryable || attempt === maxAttempts - 1) throw e;
      const delayMs = 4000 * Math.pow(2, attempt);
      process.stderr.write(
        `[llm:${stage}] ${status} ${err.message?.slice(0, 80) ?? 'transient error'}; retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/${maxAttempts})\n`,
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
export type CacheableSegment = { text: string; cache?: boolean };

// Build a Sonnet-friendly content array for the system prompt or a user
// message from a string OR an array of segments with optional cache markers.
function buildContentBlocks(
  input: string | CacheableSegment[],
): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
  if (typeof input === 'string') return [{ type: 'text', text: input }];
  return input.map((s) => ({
    type: 'text' as const,
    text: s.text,
    ...(s.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
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
  const model = opts.model ?? DEFAULT_MODEL;
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
  const cacheWriteTokens = (resp.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0;
  const cacheReadTokens = (resp.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0;
  const cost = priceCall(model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens);
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
