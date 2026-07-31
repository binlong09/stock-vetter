// Integration tests against a stand-in Ollama server.
//
// There is no GPU in CI, so the contract with Ollama is pinned here instead:
// the exact request shape we send, and how we behave for each response shape
// the real server produces. If Ollama changes its API, these tests are what
// notices.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { z } from 'zod';
import { OllamaClient, ContextOverflowError, OllamaError, stripFence } from './ollama.js';

type Handler = (body: any) => unknown;

async function withServer(
  handler: Handler,
  fn: (host: string, seen: any[]) => Promise<void>,
  tagsBody: unknown = { models: [{ name: 'qwen3:32b' }] },
): Promise<void> {
  const seen: any[] = [];
  const server: Server = createServer((req, res) => {
    if (req.url === '/api/tags') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(tagsBody));
      return;
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      seen.push(body);
      const out = handler(body);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  try {
    await fn(`http://127.0.0.1:${port}`, seen);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

const ok = (response: string, extra: Record<string, unknown> = {}) => ({
  response,
  done: true,
  done_reason: 'stop',
  prompt_eval_count: 100,
  eval_count: 20,
  ...extra,
});

const Simple = z.object({ label: z.string(), value: z.number() });

test('health reports a missing model with the command to fix it', async () => {
  await withServer(
    () => ok('{}'),
    async (host) => {
      const c = new OllamaClient({ host, model: 'qwen3:32b' });
      const h = await c.health();
      assert.equal(h.ok, false);
      assert.match(h.detail!, /ollama pull qwen3:32b/);
    },
    { models: [{ name: 'llama3:8b' }] },
  );
});

test('health accepts a bare model name against a tagged server entry', async () => {
  await withServer(
    () => ok('{}'),
    async (host) => {
      const c = new OllamaClient({ host, model: 'qwen3' });
      assert.equal((await c.health()).ok, true);
    },
  );
});

test('an oversized prompt is refused before it is sent, not truncated by the server', async () => {
  // The failure this prevents: Ollama silently drops the front of an
  // over-length prompt — the table header and section heading — and returns
  // confident, schema-valid JSON about the remaining fragment.
  await withServer(
    () => ok('{"label":"x","value":1}'),
    async (host, seen) => {
      const c = new OllamaClient({ host, numCtx: 4096 });
      assert.throws(() => c.assertContextFits(3500, 2048), ContextOverflowError);
      await assert.rejects(
        c.generateJson({ prompt: 'x', schema: Simple, estimatedPromptTokens: 3500, maxOutputTokens: 2048 }),
        ContextOverflowError,
      );
      assert.equal(seen.length, 0, 'a doomed request was still sent to the server');
    },
  );
});

test('requests pin num_ctx and keep the model resident', async () => {
  await withServer(
    () => ok('{"label":"x","value":1}'),
    async (host, seen) => {
      const c = new OllamaClient({ host, numCtx: 16384, keepAlive: '30m' });
      await c.generateJson({ prompt: 'p', schema: Simple });
      assert.equal(seen[0].options.num_ctx, 16384);
      assert.equal(seen[0].keep_alive, '30m');
      assert.equal(seen[0].options.temperature, 0);
      assert.equal(seen[0].stream, false);
    },
  );
});

test('the Zod schema is sent as a decoding grammar with no $ref indirection', async () => {
  const Nested = z.object({ items: z.array(z.object({ name: z.string() })) });
  await withServer(
    () => ok('{"items":[]}'),
    async (host, seen) => {
      const c = new OllamaClient({ host });
      await c.generateJson({ prompt: 'p', schema: Nested });
      const format = seen[0].format;
      assert.equal(typeof format, 'object');
      // llama.cpp's JSON-Schema→GBNF converter does not resolve $ref/$defs;
      // a schema containing them under-constrains generation silently.
      assert.doesNotMatch(JSON.stringify(format), /\$ref|\$defs|definitions/);
      assert.ok(format.properties.items, 'schema lost its properties');
    },
  );
});

test('a schema-invalid response triggers a repair retry carrying the error', async () => {
  let call = 0;
  await withServer(
    () => {
      call++;
      return call === 1 ? ok('{"label":"x"}') : ok('{"label":"x","value":42}');
    },
    async (host, seen) => {
      const c = new OllamaClient({ host });
      const r = await c.generateJson({ prompt: 'original', schema: Simple });
      assert.equal(r.value.value, 42);
      assert.equal(seen.length, 2);
      assert.match(seen[1].prompt, /failed validation/);
      assert.match(seen[1].prompt, /value/);
      assert.equal(c.stats.retries, 1);
    },
  );
});

test('persistent schema failure throws with the validation detail', async () => {
  await withServer(
    () => ok('{"label":"x"}'),
    async (host) => {
      const c = new OllamaClient({ host });
      await assert.rejects(c.generateJson({ prompt: 'p', schema: Simple }), (e: Error) => {
        assert.ok(e instanceof OllamaError);
        assert.match(e.message, /value/);
        return true;
      });
      assert.equal(c.stats.schemaFailures, 1);
    },
  );
});

test('hitting the output token cap is reported as such, not as a parse error', async () => {
  await withServer(
    () => ok('{"label":"x","val', { done_reason: 'length' }),
    async (host) => {
      const c = new OllamaClient({ host });
      await assert.rejects(c.generateJson({ prompt: 'p', schema: Simple, attempts: 1 }), (e: Error) => {
        assert.match(e.message, /output token limit/);
        return true;
      });
    },
  );
});

test('reasoning traces and fences are stripped before parsing', () => {
  // Qwen3 emits <think> even under a grammar in some configurations.
  assert.equal(stripFence('<think>weighing options</think>\n{"a":1}'), '{"a":1}');
  assert.equal(stripFence('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripFence('Here is the JSON: {"a":1}'), '{"a":1}');
});

test('a reasoning trace in the response body still parses', async () => {
  await withServer(
    () => ok('<think>The label is x.</think>{"label":"x","value":7}'),
    async (host) => {
      const c = new OllamaClient({ host });
      assert.equal((await c.generateJson({ prompt: 'p', schema: Simple })).value.value, 7);
    },
  );
});

test('throughput stats accumulate across calls', async () => {
  await withServer(
    () => ok('{"label":"x","value":1}', { eval_count: 50, prompt_eval_count: 500 }),
    async (host) => {
      const c = new OllamaClient({ host });
      await c.generateJson({ prompt: 'p', schema: Simple });
      await c.generateJson({ prompt: 'p', schema: Simple });
      assert.equal(c.stats.calls, 2);
      assert.equal(c.stats.outputTokens, 100);
      assert.equal(c.stats.promptTokens, 1000);
    },
  );
});

test('an unreachable server yields a diagnosable error, not a bare fetch failure', async () => {
  const c = new OllamaClient({ host: 'http://127.0.0.1:1', timeoutMs: 2000 });
  const h = await c.health();
  assert.equal(h.ok, false);
  assert.match(h.detail!, /cannot reach Ollama at http:\/\/127\.0\.0\.1:1/);
});

// --- OpenAI-compatible backend (llama.cpp llama-server, vLLM, …) ------------

// A stand-in llama-server: /v1/models for health, /v1/chat/completions for
// generation. Records request bodies so the wire shape stays pinned.
async function withOpenAiServer(
  content: (call: number) => string,
  fn: (host: string, seen: any[]) => Promise<void>,
  modelsBody: unknown = { data: [{ id: 'unsloth/Qwen3.6-27B-MTP-GGUF:UD-Q4_K_XL' }] },
): Promise<void> {
  const seen: any[] = [];
  let call = 0;
  const server: Server = createServer((req, res) => {
    if (req.url === '/v1/models') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(modelsBody));
      return;
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      seen.push(body);
      call++;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: content(call) } }],
          usage: { prompt_tokens: 300, completion_tokens: 40 },
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  try {
    await fn(`http://127.0.0.1:${port}`, seen);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

const MODEL = 'unsloth/Qwen3.6-27B-MTP-GGUF:UD-Q4_K_XL';

test('openai backend: health matches the served model via /v1/models', async () => {
  await withOpenAiServer(
    () => '{}',
    async (host) => {
      const c = new OllamaClient({ host, backend: 'openai', model: MODEL });
      assert.equal((await c.health()).ok, true);
      const miss = new OllamaClient({ host, backend: 'openai', model: 'something-else' });
      const h = await miss.health();
      assert.equal(h.ok, false);
      assert.match(h.detail!, /not served/);
    },
  );
});

test('openai backend: schema goes in response_format and thinking is disabled', async () => {
  await withOpenAiServer(
    () => '{"label":"x","value":9}',
    async (host, seen) => {
      const c = new OllamaClient({ host, backend: 'openai', model: MODEL });
      const r = await c.generateJson({ prompt: 'p', system: 's', schema: Simple });
      assert.equal(r.value.value, 9);
      const body = seen[0];
      assert.equal(body.messages[0].role, 'system');
      assert.equal(body.messages[1].content, 'p');
      assert.equal(body.response_format.type, 'json_schema');
      assert.ok(body.response_format.json_schema.schema.properties.value, 'schema lost its properties');
      assert.doesNotMatch(JSON.stringify(body.response_format), /\$ref|\$defs|definitions/);
      // Extraction is transcription; a reasoning model must not think.
      assert.equal(body.chat_template_kwargs.enable_thinking, false);
      // Ollama-only knobs must not leak onto the OpenAI wire.
      assert.equal(body.options, undefined);
      assert.equal(body.keep_alive, undefined);
    },
  );
});

test('openai backend: a length finish_reason is reported as a budget overflow', async () => {
  // A server that always reports truncation, mirroring the Ollama-path test.
  const srv = createServer((req, res) => {
    if (req.url === '/v1/models') {
      res.end(JSON.stringify({ data: [{ id: MODEL }] }));
      return;
    }
    req.on('data', () => undefined);
    req.on('end', () => {
      res.end(
        JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{"label":"x' } }], usage: {} }),
      );
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as { port: number }).port;
  try {
    const c = new OllamaClient({ host: `http://127.0.0.1:${port}`, backend: 'openai', model: MODEL });
    await assert.rejects(c.generateJson({ prompt: 'p', schema: Simple, attempts: 1 }), /output token limit/);
  } finally {
    await new Promise<void>((r) => srv.close(() => r()));
  }
});

test('a truncated answer is retried with a be-concise instruction, not lost', async () => {
  // A verbose model can hit the output cap mid-JSON. That is recoverable — ask
  // it to be terser and try again — rather than dropping the chunk outright.
  let call = 0;
  const seen: any[] = [];
  const srv = createServer((req, res) => {
    if (req.url === '/v1/models') {
      res.end(JSON.stringify({ data: [{ id: MODEL }] }));
      return;
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      seen.push(JSON.parse(raw));
      call++;
      const truncated = call === 1;
      res.end(
        JSON.stringify({
          choices: [
            {
              finish_reason: truncated ? 'length' : 'stop',
              message: { content: truncated ? '{"label":"x","val' : '{"label":"x","value":3}' },
            },
          ],
          usage: {},
        }),
      );
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as { port: number }).port;
  try {
    const c = new OllamaClient({ host: `http://127.0.0.1:${port}`, backend: 'openai', model: MODEL });
    const r = await c.generateJson({ prompt: 'p', schema: Simple });
    assert.equal(r.value.value, 3, 'recovered on the second attempt');
    assert.equal(seen.length, 2);
    assert.match(seen[1].messages.at(-1).content, /cut off|too long|concise|shorter/i);
    assert.equal(c.stats.retries, 1);
  } finally {
    await new Promise<void>((r) => srv.close(() => r()));
  }
});

test('openai backend: schema-invalid output still triggers a repair retry', async () => {
  await withOpenAiServer(
    (call) => (call === 1 ? '{"label":"x"}' : '{"label":"x","value":5}'),
    async (host, seen) => {
      const c = new OllamaClient({ host, backend: 'openai', model: MODEL });
      const r = await c.generateJson({ prompt: 'original', schema: Simple });
      assert.equal(r.value.value, 5);
      assert.equal(seen.length, 2);
      assert.match(seen[1].messages.at(-1).content, /failed validation/);
      assert.equal(c.stats.retries, 1);
    },
  );
});
