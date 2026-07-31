// Ollama client for the local RTX 5090 inference tier.
//
// THE num_ctx FOOTGUN. Ollama does not error when a prompt exceeds the
// context window — it silently truncates from the front and generates anyway.
// Its default `num_ctx` is 4096. Feeding an 8,000-token chunk to a default
// server therefore drops the first half of the chunk (which is where the table
// header and the section heading live), and returns a confident, well-formed,
// schema-valid JSON object describing the wrong thing. Nothing in the output
// indicates this happened.
//
// So every request here sets `num_ctx` explicitly, and `assertContextFits`
// refuses to send a prompt that wouldn't fit rather than letting the server
// quietly truncate it.
//
// Structured output uses Ollama's JSON-schema `format` (llama.cpp compiles it
// to a GBNF grammar and constrains decoding), not the older `format: "json"`.
// The difference matters at this scale: grammar-constrained decoding makes
// schema-invalid output impossible rather than merely unlikely, which removes
// most of the retry traffic across 2,000 companies' worth of chunks.

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Which local server API to speak. `ollama` is the native Ollama API
 * (`/api/generate`, JSON-schema `format`). `openai` is the OpenAI-compatible
 * surface that llama.cpp's llama-server (and vLLM, LM Studio, …) expose
 * (`/v1/chat/completions`, `response_format`). The two constrain decoding to a
 * grammar the same way; only the wire shape differs.
 */
export type LocalBackend = 'ollama' | 'openai';

export type OllamaOptions = {
  host?: string;
  model?: string;
  backend?: LocalBackend;
  /** Context window. Must exceed prompt + expected output. */
  numCtx?: number;
  /** How long the server keeps the model resident between calls. */
  keepAlive?: string;
  temperature?: number;
  /**
   * Suppress a reasoning model's think block. Extraction is transcription, not
   * reasoning: left on, a Qwen3-class model spends the entire output budget
   * thinking and emits no JSON. Defaults on for the `openai` backend (the
   * llama.cpp path this was proven against) and off for `ollama`, where the
   * shipped default model and behaviour are unchanged.
   */
  disableThinking?: boolean;
  /** Per-request timeout. Long chunks on a big model are genuinely slow. */
  timeoutMs?: number;
  /**
   * Concurrent requests. One GPU means one model instance unless the server
   * was started with OLLAMA_NUM_PARALLEL > 1; going wider than the server
   * allows just queues inside Ollama while inflating apparent concurrency.
   */
  concurrency?: number;
};

const DEFAULTS = {
  host: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
  model: process.env.OLLAMA_MODEL ?? 'qwen3:32b',
  backend: (process.env.LOCAL_BACKEND as LocalBackend) ?? 'ollama',
  numCtx: Number(process.env.OLLAMA_NUM_CTX ?? 16384),
  keepAlive: process.env.OLLAMA_KEEP_ALIVE ?? '30m',
  temperature: 0,
  disableThinking: false, // resolved per-backend in the constructor
  timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 300_000),
  concurrency: Number(process.env.OLLAMA_CONCURRENCY ?? 1),
};

export class OllamaError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}

export class ContextOverflowError extends OllamaError {
  constructor(
    readonly promptTokens: number,
    readonly numCtx: number,
  ) {
    super(
      `prompt is ~${promptTokens} tokens but num_ctx is ${numCtx}. Ollama would silently ` +
        `truncate the front of the prompt and answer anyway. Raise OLLAMA_NUM_CTX or lower ` +
        `the chunk size.`,
    );
    this.name = 'ContextOverflowError';
  }
}

/**
 * Generation hit the output token cap mid-object. Unlike a context overflow this
 * is recoverable: a verbose model asked to be terser often fits on a second try,
 * so `generateJson` retries it with a be-concise instruction rather than losing
 * the whole chunk.
 */
export class OutputTruncatedError extends OllamaError {
  constructor() {
    super('generation stopped at the output token limit — raise maxOutputTokens or ask for less');
    this.name = 'OutputTruncatedError';
  }
}

export type LocalUsage = {
  promptTokens: number;
  outputTokens: number;
  /** Wall-clock for the request, ms. */
  durationMs: number;
  /** Output tokens/sec — the number that tells you if the GPU is being used well. */
  tokensPerSecond: number;
};

export type LocalStats = {
  calls: number;
  promptTokens: number;
  outputTokens: number;
  totalMs: number;
  retries: number;
  schemaFailures: number;
};

export function newLocalStats(): LocalStats {
  return { calls: 0, promptTokens: 0, outputTokens: 0, totalMs: 0, retries: 0, schemaFailures: 0 };
}

type GenerateResponse = {
  response?: string;
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
};

type OpenAiChatResponse = {
  choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** A backend-agnostic completion request; each backend renders its own wire shape. */
type CompleteRequest = {
  prompt: string;
  system?: string;
  /** JSON Schema to constrain decoding, already inlined ($refStrategy: 'none'). */
  schema?: object;
  maxOutputTokens: number;
};

function usageOf(promptTokens: number | undefined, outputTokens: number | undefined, durationMs: number): LocalUsage {
  const out = outputTokens ?? 0;
  return {
    promptTokens: promptTokens ?? 0,
    outputTokens: out,
    durationMs,
    tokensPerSecond: durationMs > 0 ? (out / durationMs) * 1000 : 0,
  };
}

export class OllamaClient {
  private readonly opts: Required<OllamaOptions>;
  private queue: Promise<unknown> = Promise.resolve();
  private active = 0;
  readonly stats: LocalStats = newLocalStats();

  constructor(opts: OllamaOptions = {}) {
    const backend = opts.backend ?? DEFAULTS.backend;
    // Env override wins; otherwise thinking is off only on the openai path.
    const envThinking = process.env.LOCAL_DISABLE_THINKING;
    const disableThinking =
      opts.disableThinking ?? (envThinking != null ? envThinking !== 'false' : backend === 'openai');
    this.opts = { ...DEFAULTS, ...opts, backend, disableThinking } as Required<OllamaOptions>;
  }

  get model(): string {
    return this.opts.model;
  }
  get numCtx(): number {
    return this.opts.numCtx;
  }

  /** Is the server up, and is the configured model available? */
  async health(): Promise<{ ok: boolean; models: string[]; detail?: string }> {
    const matches = (id: string): boolean =>
      id === this.opts.model || id.split(':')[0] === this.opts.model;

    if (this.opts.backend === 'openai') {
      try {
        const res = await fetch(`${this.opts.host}/v1/models`, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return { ok: false, models: [], detail: `GET /v1/models → ${res.status}` };
        const body = (await res.json()) as { data?: Array<{ id?: string }>; models?: Array<{ name?: string }> };
        const models = [...(body.data ?? []), ...(body.models ?? [])]
          .map((m) => (m as { id?: string; name?: string }).id ?? (m as { name?: string }).name)
          .filter((x): x is string => Boolean(x));
        return models.some(matches)
          ? { ok: true, models }
          : { ok: false, models, detail: `model "${this.opts.model}" not served. /v1/models lists: ${models.join(', ') || '(none)'}` };
      } catch (e) {
        return { ok: false, models: [], detail: `cannot reach server at ${this.opts.host}: ${(e as Error).message}` };
      }
    }

    try {
      const res = await fetch(`${this.opts.host}/api/tags`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return { ok: false, models: [], detail: `GET /api/tags → ${res.status}` };
      const body = (await res.json()) as { models?: Array<{ name: string }> };
      const models = (body.models ?? []).map((m) => m.name);
      // Ollama reports "qwen3:32b"; a bare "qwen3" in config should still match.
      const found = models.some(matches);
      return found
        ? { ok: true, models }
        : { ok: false, models, detail: `model "${this.opts.model}" not pulled. Run: ollama pull ${this.opts.model}` };
    } catch (e) {
      return { ok: false, models: [], detail: `cannot reach Ollama at ${this.opts.host}: ${(e as Error).message}` };
    }
  }

  /**
   * Refuse a prompt that wouldn't fit, instead of letting the server truncate
   * it. `reserveOutput` is the space the response needs.
   */
  assertContextFits(estimatedPromptTokens: number, reserveOutput = 2048): void {
    if (estimatedPromptTokens + reserveOutput > this.opts.numCtx) {
      throw new ContextOverflowError(estimatedPromptTokens, this.opts.numCtx);
    }
  }

  private async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    // Simple depth-limited gate. At concurrency 1 (the default, and correct
    // for a single GPU without OLLAMA_NUM_PARALLEL) this is a plain queue.
    while (this.active >= this.opts.concurrency) {
      await this.queue.catch(() => undefined);
    }
    this.active++;
    const p = fn().finally(() => {
      this.active--;
    });
    this.queue = p.catch(() => undefined);
    return p;
  }

  private async postJson(path: string, body: Record<string, unknown>): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.opts.host}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
    } catch (e) {
      throw new OllamaError(`request to ${this.opts.host} failed: ${(e as Error).message}`, e);
    }
    if (!res.ok) {
      throw new OllamaError(`server returned ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    return res.json();
  }

  private async ollamaComplete(req: CompleteRequest): Promise<{ text: string; usage: LocalUsage }> {
    const started = Date.now();
    const json = (await this.postJson('/api/generate', {
      model: this.opts.model,
      prompt: req.prompt,
      system: req.system,
      stream: false,
      ...(req.schema ? { format: req.schema } : {}),
      ...(this.opts.disableThinking ? { think: false } : {}),
      keep_alive: this.opts.keepAlive,
      options: {
        temperature: this.opts.temperature,
        num_ctx: this.opts.numCtx,
        num_predict: req.maxOutputTokens,
      },
    })) as GenerateResponse;
    const durationMs = Date.now() - started;
    // `done_reason: "length"` means generation hit the token cap mid-object.
    // With a grammar in force the JSON is truncated and unparseable; saying so
    // explicitly beats a confusing parse error.
    if (json.done_reason === 'length') {
      throw new OutputTruncatedError();
    }
    return { text: json.response ?? '', usage: usageOf(json.prompt_eval_count, json.eval_count, durationMs) };
  }

  private async openaiComplete(req: CompleteRequest): Promise<{ text: string; usage: LocalUsage }> {
    const started = Date.now();
    const messages: Array<{ role: string; content: string }> = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    messages.push({ role: 'user', content: req.prompt });
    const json = (await this.postJson('/v1/chat/completions', {
      model: this.opts.model,
      messages,
      temperature: this.opts.temperature,
      max_tokens: req.maxOutputTokens,
      // A reasoning model burns the whole budget thinking and returns empty
      // content; extraction is transcription, so thinking is turned off.
      ...(this.opts.disableThinking ? { chat_template_kwargs: { enable_thinking: false } } : {}),
      ...(req.schema
        ? { response_format: { type: 'json_schema', json_schema: { name: 'schema', schema: req.schema, strict: true } } }
        : {}),
    })) as OpenAiChatResponse;
    const durationMs = Date.now() - started;
    const choice = json.choices?.[0];
    if (choice?.finish_reason === 'length') {
      throw new OutputTruncatedError();
    }
    return {
      text: choice?.message?.content ?? '',
      usage: usageOf(json.usage?.prompt_tokens, json.usage?.completion_tokens, durationMs),
    };
  }

  /** One completion against the configured backend, gated by the slot limit. */
  private async complete(req: CompleteRequest): Promise<{ text: string; usage: LocalUsage }> {
    return this.withSlot(async () => {
      const r =
        this.opts.backend === 'openai' ? await this.openaiComplete(req) : await this.ollamaComplete(req);
      this.stats.calls++;
      this.stats.promptTokens += r.usage.promptTokens;
      this.stats.outputTokens += r.usage.outputTokens;
      this.stats.totalMs += r.usage.durationMs;
      return r;
    });
  }

  /** Raw text completion. */
  async generate(opts: {
    prompt: string;
    system?: string;
    maxOutputTokens?: number;
    estimatedPromptTokens?: number;
  }): Promise<{ text: string; usage: LocalUsage }> {
    if (opts.estimatedPromptTokens != null) {
      this.assertContextFits(opts.estimatedPromptTokens, opts.maxOutputTokens ?? 2048);
    }
    return this.complete({ prompt: opts.prompt, system: opts.system, maxOutputTokens: opts.maxOutputTokens ?? 2048 });
  }

  /**
   * Structured completion. The Zod schema is compiled to JSON Schema and
   * handed to Ollama as a decoding grammar, then the result is validated
   * against the same Zod schema — grammar conformance is not type conformance
   * (a grammar can't express "this string must be a verbatim quote"), so both
   * steps are needed.
   *
   * On validation failure the error text is fed back to the model, the same
   * repair loop `llmCallJson` uses for the cloud tier.
   */
  async generateJson<T>(opts: {
    prompt: string;
    system?: string;
    schema: z.ZodType<T>;
    maxOutputTokens?: number;
    estimatedPromptTokens?: number;
    attempts?: number;
  }): Promise<{ value: T; usage: LocalUsage }> {
    if (opts.estimatedPromptTokens != null) {
      this.assertContextFits(opts.estimatedPromptTokens, opts.maxOutputTokens ?? 2048);
    }
    // `$refStrategy: 'none'` inlines everything. llama.cpp's JSON-Schema →
    // GBNF converter does not resolve $ref/$defs, and a schema containing them
    // is either rejected or silently under-constrains generation.
    const jsonSchema = zodToJsonSchema(opts.schema, { $refStrategy: 'none', target: 'jsonSchema7' });

    let lastError: string | null = null;
    const attempts = opts.attempts ?? 2;
    for (let i = 0; i < attempts; i++) {
      if (i > 0) this.stats.retries++;
      const prompt =
        lastError === null
          ? opts.prompt
          : `${opts.prompt}\n\n---\n${lastError}\nReturn corrected, complete JSON only.`;

      let r: { text: string; usage: LocalUsage };
      try {
        r = await this.complete({
          prompt,
          system: opts.system,
          schema: jsonSchema,
          maxOutputTokens: opts.maxOutputTokens ?? 2048,
        });
      } catch (e) {
        // A truncation is recoverable: the model ran long, so on a remaining
        // attempt ask it to be terser rather than losing the chunk. Any other
        // error (network, context overflow) is not something a retry fixes.
        if (e instanceof OutputTruncatedError && i < attempts - 1) {
          lastError =
            'Your previous answer was cut off at the output limit because it was too long. ' +
            'Return only the most material findings, with shorter quotes and fewer summary bullets, ' +
            'so the JSON is complete.';
          continue;
        }
        throw e;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(stripFence(r.text));
      } catch (e) {
        lastError = `Your previous answer was not valid JSON: ${(e as Error).message}. Output began: ${r.text.slice(0, 200)}`;
        continue;
      }
      const check = opts.schema.safeParse(parsed);
      if (check.success) return { value: check.data, usage: r.usage };
      lastError = `Your previous answer failed validation:\n${check.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('\n')}`;
    }
    this.stats.schemaFailures++;
    throw new OllamaError(`local model failed after ${attempts} attempts:\n${lastError}`);
  }
}

// Reasoning-tuned models (Qwen3 among them) prepend a <think> block and
// sometimes a markdown fence even under a grammar. Strip both before parsing.
export function stripFence(s: string): string {
  let t = s.trim();
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  const first = t.search(/[{[]/);
  if (first > 0) t = t.slice(first);
  return t.trim();
}

export function summarizeLocalStats(s: LocalStats): string {
  const secs = s.totalMs / 1000;
  const tps = secs > 0 ? s.outputTokens / secs : 0;
  return (
    `${s.calls} local calls · ${s.promptTokens.toLocaleString()} prompt tok · ` +
    `${s.outputTokens.toLocaleString()} output tok · ${secs.toFixed(1)}s · ` +
    `${tps.toFixed(1)} tok/s · ${s.retries} retries · ${s.schemaFailures} schema failures`
  );
}
