import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';
import { LLMValidationError } from './errors.js';

const MODEL = 'claude-sonnet-4-6';
const PRICE_INPUT_PER_MTOK = 3.0;
const PRICE_OUTPUT_PER_MTOK = 15.0;

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
  inputTokens: number;
  outputTokens: number;
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

function priceCall(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * PRICE_INPUT_PER_MTOK +
    (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK
  );
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

export async function llmCall(opts: {
  stage: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  tracker: CostTracker;
}): Promise<LLMCallResult> {
  const resp = await callWithRetry(
    {
      model: MODEL,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.systemPrompt,
      messages: [{ role: 'user', content: opts.userMessage }],
    },
    opts.stage,
  );
  const inputTokens = resp.usage.input_tokens;
  const outputTokens = resp.usage.output_tokens;
  const cost = priceCall(inputTokens, outputTokens);
  opts.tracker.total += cost;
  opts.tracker.byCall.push({ stage: opts.stage, inputTokens, outputTokens, cost });
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
  systemPrompt: string;
  userMessage: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  tracker: CostTracker;
}): Promise<T> {
  let lastError: string | null = null;
  let lastRaw: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const userMessage =
      lastError === null
        ? opts.userMessage
        : `${opts.userMessage}\n\n---\nYour previous response failed validation:\n${lastError}\n\nReturn corrected JSON only. No markdown fences, no commentary.`;
    const result = await llmCall({
      stage: attempt === 0 ? opts.stage : `${opts.stage}-retry`,
      systemPrompt: opts.systemPrompt,
      userMessage,
      maxTokens: opts.maxTokens,
      tracker: opts.tracker,
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
