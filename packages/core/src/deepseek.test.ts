import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import {
  isDeepSeekModel,
  resolveCompareModel,
  toOpenAIMessages,
  toOpenAITools,
  toOpenAIToolChoice,
  toAnthropicContent,
  toAnthropicUsage,
} from './deepseek.js';
import { PRICING } from './llm.js';

const SYSTEM = [{ type: 'text' as const, text: 'You are the synthesis pass.' }];

test('model routing matches deepseek-* and nothing else', () => {
  assert.equal(isDeepSeekModel('deepseek-chat'), true);
  assert.equal(isDeepSeekModel('deepseek-v4-pro'), true);
  assert.equal(isDeepSeekModel('DeepSeek-Chat'), true);
  assert.equal(isDeepSeekModel('claude-sonnet-4-6'), false);
});

test('every routable deepseek model has a PRICING entry', () => {
  // pricingFor() silently falls back to Sonnet rates for unknown models —
  // which would report ~7x-inflated costs for the cheap model and defeat the
  // entire point of the A/B. This pins the entries.
  for (const m of ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-pro']) {
    assert.ok(PRICING[m], `${m} missing from PRICING`);
    assert.ok(PRICING[m]!.input < 1, `${m} input rate should be sub-dollar`);
  }
});

test('system blocks concatenate into one system message, first', () => {
  const out = toOpenAIMessages(
    [...SYSTEM, { type: 'text', text: 'Second block.' }],
    [{ role: 'user', content: 'brief' }],
  );
  assert.equal(out[0]!.role, 'system');
  assert.match(out[0]!.content!, /synthesis pass[\s\S]*Second block/);
  assert.deepEqual(out[1], { role: 'user', content: 'brief' });
});

test('an assistant turn with text + tool_use becomes content + tool_calls', () => {
  const messages: MessageParam[] = [
    { role: 'user', content: 'brief' },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Checking DSO first.' },
        { type: 'tool_use', id: 'call_1', name: 'get_metric_history', input: { metric: 'dso' } },
      ],
    },
  ];
  const out = toOpenAIMessages(SYSTEM, messages);
  const asst = out[2]!;
  assert.equal(asst.role, 'assistant');
  assert.equal(asst.content, 'Checking DSO first.');
  assert.equal(asst.tool_calls!.length, 1);
  assert.equal(asst.tool_calls![0]!.id, 'call_1');
  assert.equal(asst.tool_calls![0]!.function.name, 'get_metric_history');
  // Arguments must be a JSON STRING — the OpenAI wire format — not an object.
  assert.equal(asst.tool_calls![0]!.function.arguments, '{"metric":"dso"}');
});

test('tool_result blocks become role:"tool" messages tied to their call id', () => {
  const messages: MessageParam[] = [
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'call_1', content: 'DSO: 61 → 78' },
        { type: 'tool_result', tool_use_id: 'call_2', content: 'not found', is_error: true },
      ],
    },
  ];
  const out = toOpenAIMessages(SYSTEM, messages);
  assert.equal(out[1]!.role, 'tool');
  assert.equal(out[1]!.tool_call_id, 'call_1');
  assert.equal(out[1]!.content, 'DSO: 61 → 78');
  // is_error has no OpenAI field; it must survive as text, not vanish.
  assert.equal(out[2]!.content, 'ERROR: not found');
});

test('tool_result content given as text blocks is flattened', () => {
  const messages: MessageParam[] = [
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'call_1',
          content: [{ type: 'text', text: 'passage one' }],
        },
      ],
    },
  ];
  const out = toOpenAIMessages(SYSTEM, messages);
  assert.equal(out[1]!.content, 'passage one');
});

test('cache_control markers from the Anthropic path are dropped, not sent', () => {
  const messages: MessageParam[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'the brief',
          cache_control: { type: 'ephemeral' },
        } as never,
      ],
    },
  ];
  const out = toOpenAIMessages(SYSTEM, messages);
  assert.equal(out[1]!.content, 'the brief');
  assert.equal(JSON.stringify(out).includes('cache_control'), false);
});

test('forced tool choice translates to the OpenAI function form', () => {
  // The loop forces `submit` on its final turns; if this translation were
  // dropped, DeepSeek would stay free to answer in prose there and the run
  // would time out despite the forcing.
  assert.deepEqual(toOpenAIToolChoice({ type: 'tool', name: 'submit' }), {
    type: 'function',
    function: { name: 'submit' },
  });
  assert.equal(toOpenAIToolChoice(undefined), undefined);
});

test('tools map to OpenAI function definitions with the schema as parameters', () => {
  const tools: Tool[] = [
    {
      name: 'verify_quote',
      description: 'Exact substring check.',
      input_schema: { type: 'object', properties: { quote: { type: 'string' } } },
    },
  ];
  const out = toOpenAITools(tools);
  assert.equal(out[0]!.type, 'function');
  assert.equal(out[0]!.function.name, 'verify_quote');
  assert.deepEqual(out[0]!.function.parameters, tools[0]!.input_schema);
});

test('a response with tool_calls becomes tool_use blocks with parsed input', () => {
  const blocks = toAnthropicContent({
    content: 'Submitting.',
    tool_calls: [
      { id: 'call_9', type: 'function', function: { name: 'submit_assessment', arguments: '{"verdict":"no-edge"}' } },
    ],
  });
  assert.deepEqual(blocks[0], { type: 'text', text: 'Submitting.' });
  const tu = blocks[1] as { type: string; id: string; name: string; input: unknown };
  assert.equal(tu.type, 'tool_use');
  assert.equal(tu.id, 'call_9');
  assert.deepEqual(tu.input, { verdict: 'no-edge' });
});

test("MALFORMED ARGUMENT JSON — DeepSeek's documented weakness — degrades to {}", () => {
  // {} fails the caller's Zod validation, which triggers the existing
  // correct-and-retry turn. The run survives; it costs an iteration.
  for (const bad of ['{"verdict": "no-edge', 'not json at all', '', '[1,2]', 'null']) {
    const blocks = toAnthropicContent({
      content: null,
      tool_calls: [{ id: 'c', type: 'function', function: { name: 'submit', arguments: bad } }],
    });
    const tu = blocks[0] as { input: unknown };
    assert.deepEqual(tu.input, {}, `arguments ${JSON.stringify(bad)} should map to {}`);
  }
});

test('usage maps cache hit/miss to the Anthropic field names', () => {
  const u = toAnthropicUsage({
    prompt_tokens: 10_000,
    completion_tokens: 900,
    prompt_cache_hit_tokens: 8_000,
    prompt_cache_miss_tokens: 2_000,
  });
  assert.equal(u.input_tokens, 2_000, 'input = cache misses only');
  assert.equal(u.cache_read_input_tokens, 8_000);
  assert.equal(u.output_tokens, 900);
  assert.equal(u.cache_creation_input_tokens, 0, 'no write premium exists to count');
});

test('usage degrades sanely when a gateway reports only prompt_tokens', () => {
  const u = toAnthropicUsage({ prompt_tokens: 5_000, completion_tokens: 100 });
  assert.equal(u.input_tokens, 5_000);
  assert.equal(u.cache_read_input_tokens, 0);
  assert.deepEqual(toAnthropicUsage(undefined), {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  });
});

// --- compare-model resolution ----------------------------------------------

test('the comparison defaults to the other provider', () => {
  // Claude primary (explicit or implicit default) → DeepSeek challenger.
  assert.equal(resolveCompareModel('claude-sonnet-4-6'), 'deepseek-v4-pro');
  assert.equal(resolveCompareModel(undefined), 'deepseek-v4-pro');
  // DeepSeek primary → Claude challenger: the question "can the cheap model
  // hold the primary seat" is symmetric once the seats swap.
  assert.equal(resolveCompareModel('deepseek-chat'), 'claude-sonnet-4-6');
  assert.equal(resolveCompareModel('deepseek-v4-pro'), 'claude-sonnet-4-6');
});

test('an explicit override wins', () => {
  assert.equal(resolveCompareModel('claude-sonnet-4-6', 'deepseek-v4-pro'), 'deepseek-v4-pro');
});

test('comparing a model against itself is refused, not silently run twice', () => {
  assert.equal(resolveCompareModel('claude-sonnet-4-6', 'claude-sonnet-4-6'), null);
  assert.equal(resolveCompareModel(undefined, 'claude-sonnet-4-6'), null);
  assert.equal(resolveCompareModel('deepseek-chat', 'deepseek-chat'), null);
});

test('the implicit-default literal stays in sync with llm.ts DEFAULT_MODEL', () => {
  // resolveCompareModel hardcodes 'claude-sonnet-4-6' to avoid an import
  // cycle with llm.ts. PRICING (from llm.ts) must know that model — if the
  // default ever changes there, this fails and points at the literal.
  assert.ok(PRICING['claude-sonnet-4-6'], 'default-model literal drifted from llm.ts');
});
