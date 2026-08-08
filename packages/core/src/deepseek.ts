// DeepSeek adapter for the synthesis tool loop.
//
// DeepSeek serves an OpenAI-compatible chat-completions API, and everything
// else in this package speaks Anthropic's Messages shape. Rather than teach
// the tool loop two dialects, this module translates at the boundary: it
// accepts the exact request the loop builds for Anthropic (system blocks,
// MessageParam[], tools) and returns a response shaped like an Anthropic
// message (text + tool_use content blocks, usage with cache fields). The loop
// in `llmCallWithToolsJson` stays provider-blind.
//
// Two provider differences worth knowing:
//
//   SCHEMA ENFORCEMENT IS WEAKER. Anthropic validates tool arguments against
//   the JSON schema server-side; DeepSeek does not, and its documented failure
//   mode is occasionally-malformed argument JSON. A malformed `submit` payload
//   here becomes an empty input, which fails the caller's Zod validation and
//   flows into the existing correct-and-retry path — so the degradation costs
//   an iteration, not the run.
//
//   CACHING IS AUTOMATIC. There are no cache_control breakpoints to place;
//   DeepSeek reports prompt_cache_hit/miss token counts per request and bills
//   hits at ~1/120th of the miss rate. The translator simply drops the
//   cache_control markers the loop adds for Anthropic.

import type { MessageParam, Tool, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';

/** Models routed to this adapter instead of the Anthropic SDK. */
export function isDeepSeekModel(model: string): boolean {
  return model.toLowerCase().startsWith('deepseek');
}

/**
 * Which model the comparison leg should run, given the primary.
 *
 * The default rule is "the other provider": a Claude primary is challenged by
 * DeepSeek and vice versa, because the comparison exists to answer exactly one
 * question — can the cheap model be trusted with the primary seat — and that
 * question is symmetric once the seats swap. An explicit override wins;
 * `undefined` primary means the Anthropic default. Returns null when the
 * comparison would be against itself, which is a config mistake rather than
 * an experiment.
 */
export function resolveCompareModel(
  primary: string | undefined,
  override?: string,
): string | null {
  // The Anthropic default lives in llm.ts, which imports this module — the
  // literal here avoids the cycle and is pinned by a test.
  //
  // 'deepseek-v4-pro', not 'deepseek-chat': DeepSeek retired the -chat and
  // -reasoner aliases on 2026-07-24, so the alias now 404s while the
  // versioned id is the live one.
  const effectivePrimary = primary ?? 'claude-sonnet-4-6';
  const compare = override ?? (isDeepSeekModel(effectivePrimary) ? 'claude-sonnet-4-6' : 'deepseek-v4-pro');
  return compare === effectivePrimary ? null : compare;
}

// --- request translation ----------------------------------------------------

type OpenAIToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
};
export type OpenAITool = {
  type: 'function';
  function: { name: string; description?: string; parameters: unknown };
};

type TextishBlock = { type: 'text'; text: string };

function blockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is TextishBlock => (b as TextishBlock)?.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }
  return '';
}

/**
 * Anthropic-shaped conversation → OpenAI chat messages.
 *
 * Ordering invariants the loop already guarantees map cleanly: an assistant
 * turn carrying tool_use blocks is always followed by a user turn whose
 * tool_result blocks answer them, which is exactly OpenAI's
 * assistant(tool_calls) → role:"tool" sequence. `is_error` has no OpenAI
 * equivalent, so it is folded into the text — the model reads it either way.
 */
export function toOpenAIMessages(
  system: Array<{ type: 'text'; text: string }>,
  messages: MessageParam[],
): OpenAIMessage[] {
  const out: OpenAIMessage[] = [
    { role: 'system', content: system.map((s) => s.text).join('\n\n') },
  ];
  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === 'assistant') {
      const texts: string[] = [];
      const toolCalls: OpenAIToolCall[] = [];
      for (const block of m.content) {
        const b = block as { type: string; text?: string; id?: string; name?: string; input?: unknown };
        if (b.type === 'text' && b.text) texts.push(b.text);
        if (b.type === 'tool_use') {
          toolCalls.push({
            id: b.id ?? '',
            type: 'function',
            function: { name: b.name ?? '', arguments: JSON.stringify(b.input ?? {}) },
          });
        }
      }
      out.push({
        role: 'assistant',
        content: texts.length ? texts.join('\n') : null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }
    // User turn with content blocks: tool results become role:"tool" messages;
    // any interleaved text becomes a plain user message.
    for (const block of m.content) {
      const b = block as {
        type: string;
        text?: string;
        tool_use_id?: string;
        content?: unknown;
        is_error?: boolean;
      };
      if (b.type === 'tool_result') {
        const text = blockText(b.content);
        out.push({
          role: 'tool',
          tool_call_id: b.tool_use_id ?? '',
          content: b.is_error ? `ERROR: ${text}` : text,
        });
      } else if (b.type === 'text' && b.text) {
        out.push({ role: 'user', content: b.text });
      }
    }
  }
  return out;
}

/** Anthropic tool definitions → OpenAI function-tool definitions. */
export function toOpenAITools(tools: Tool[]): OpenAITool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
      parameters: t.input_schema,
    },
  }));
}

// --- response translation ---------------------------------------------------

export type DeepSeekUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
};

type OpenAIChoiceMessage = { content?: string | null; tool_calls?: OpenAIToolCall[] };

/** Anthropic-shaped usage, so the loop's cost accounting reads it unchanged. */
export function toAnthropicUsage(u: DeepSeekUsage | undefined): {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
} {
  const hit = u?.prompt_cache_hit_tokens ?? 0;
  // Prefer the explicit miss figure; fall back to total-minus-hit for
  // providers/gateways that report only prompt_tokens.
  const miss = u?.prompt_cache_miss_tokens ?? Math.max(0, (u?.prompt_tokens ?? 0) - hit);
  return {
    input_tokens: miss,
    output_tokens: u?.completion_tokens ?? 0,
    // DeepSeek has no write premium — a miss is just input — so writes are
    // always reported as zero rather than double-counted.
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: hit,
  };
}

/**
 * OpenAI choice message → Anthropic-shaped content blocks.
 *
 * Malformed tool-argument JSON (DeepSeek's documented weakness) maps to an
 * empty input rather than a throw: for the submit tool that fails Zod
 * validation and triggers the loop's correct-and-retry turn; for verification
 * tools the handler's own error path reports it back. Either way the run
 * survives.
 */
export function toAnthropicContent(msg: OpenAIChoiceMessage): Array<
  { type: 'text'; text: string } | ToolUseBlock
> {
  const blocks: Array<{ type: 'text'; text: string } | ToolUseBlock> = [];
  if (msg.content) blocks.push({ type: 'text', text: msg.content });
  for (const tc of msg.tool_calls ?? []) {
    let input: unknown = {};
    try {
      input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
    } catch {
      input = {};
    }
    if (input === null || typeof input !== 'object' || Array.isArray(input)) input = {};
    blocks.push({
      type: 'tool_use',
      id: tc.id,
      name: tc.function.name,
      input,
    } as ToolUseBlock);
  }
  return blocks;
}

// --- the call ---------------------------------------------------------------

function isRetryable(e: unknown): boolean {
  const err = e as { status?: number; message?: string };
  const status = err.status ?? 0;
  if (status === 429 || (status >= 500 && status < 600)) return true;
  return /econnreset|etimedout|epipe|socket hang up|fetch failed|premature close|network|terminated|other side closed/i.test(
    `${err.message ?? ''}`,
  );
}

export type DeepSeekChatParams = {
  model: string;
  max_tokens: number;
  system: Array<{ type: 'text'; text: string }>;
  messages: MessageParam[];
  tools: Tool[];
};

export type DeepSeekChatResult = {
  content: Array<{ type: 'text'; text: string } | ToolUseBlock>;
  usage: ReturnType<typeof toAnthropicUsage>;
};

/**
 * One chat-completions round trip, returned in Anthropic shape.
 *
 * Config via env — DEEPSEEK_API_KEY (required), DEEPSEEK_BASE_URL (defaults
 * to the official endpoint), DEEPSEEK_REASONING_EFFORT (optional; V4 Pro's
 * reasoning tokens bill as output, so leaving it unset is the cheap default).
 * Retries mirror the Anthropic path: 5 attempts, exponential backoff, only on
 * transient failures.
 */
export async function deepseekChat(
  params: DeepSeekChatParams,
  stage: string,
): Promise<DeepSeekChatResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not set — required when the synthesis model is a deepseek-* model');
  }
  const base = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '');
  const effort = process.env.DEEPSEEK_REASONING_EFFORT;

  const body = {
    model: params.model,
    max_tokens: params.max_tokens,
    messages: toOpenAIMessages(params.system, params.messages),
    tools: toOpenAITools(params.tools),
    ...(effort ? { reasoning_effort: effort } : {}),
  };

  const maxAttempts = 5;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        const err = new Error(`DeepSeek ${res.status}: ${detail}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: OpenAIChoiceMessage }>;
        usage?: DeepSeekUsage;
      };
      const msg = json.choices?.[0]?.message;
      if (!msg) throw new Error('DeepSeek response had no choices[0].message');
      return { content: toAnthropicContent(msg), usage: toAnthropicUsage(json.usage) };
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e) || attempt === maxAttempts - 1) throw e;
      const delayMs = 4000 * Math.pow(2, attempt);
      process.stderr.write(
        `[deepseek:${stage}] retryable error: ${(e as Error).message?.slice(0, 160)}; ` +
          `retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/${maxAttempts})\n`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
