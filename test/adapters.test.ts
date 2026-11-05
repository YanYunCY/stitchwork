import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ADAPTERS, getAdapter } from '../src/adapters/index.ts';
import { estimateUsage, parseTrailingJson } from '../src/adapters/types.ts';
import { AGENT_IDS } from '../src/types.ts';

describe('adapter registry', () => {
  it('has an adapter for every agent id (Req 1.1)', () => {
    for (const id of AGENT_IDS) assert.equal(getAdapter(id).id, id);
    assert.equal(Object.keys(ADAPTERS).length, 4);
  });

  it('keeps the prompt as a single argv element and appends extraArgs (Req 1.8)', () => {
    const prompt = 'fix "this"; rm -rf / && echo $HOME';
    for (const id of AGENT_IDS) {
      const args = getAdapter(id).buildArgs(prompt, ['--model', 'x']);
      assert.equal(args.filter((a) => a === prompt).length, 1, id);
      assert.ok(args.includes('--model'), id);
    }
  });
});

describe('estimateUsage (Req 1.4)', () => {
  it('uses ceil(chars/4) and flags estimated', () => {
    assert.deepEqual(estimateUsage('12345', 'abcd'), {
      inputTokens: 2, outputTokens: 1, totalTokens: 3, estimated: true,
    });
  });
});

describe('parseTrailingJson', () => {
  it('reads JSON after a banner line', () => {
    assert.deepEqual(parseTrailingJson('Loading...\n{"a":1}'), { a: 1 });
  });
  it('returns undefined for plain text', () => {
    assert.equal(parseTrailingJson('hello'), undefined);
  });
});

describe('claude adapter', () => {
  const a = getAdapter('claude');
  it('builds print-mode JSON args', () => {
    assert.deepEqual(a.buildArgs('hi', []), ['-p', 'hi', '--output-format', 'json']);
  });
  it('parses result and usage including cache tokens', () => {
    const stdout = JSON.stringify({
      type: 'result', result: 'done',
      usage: { input_tokens: 10, cache_read_input_tokens: 5, cache_creation_input_tokens: 1, output_tokens: 7 },
    });
    assert.deepEqual(a.parse(stdout, '', 'hi'), {
      output: 'done', usage: { inputTokens: 16, outputTokens: 7, totalTokens: 23, estimated: false },
    });
  });
  it('falls back to estimate on plain text', () => {
    const r = a.parse('plain answer', '', 'hi');
    assert.equal(r.output, 'plain answer');
    assert.equal(r.usage.estimated, true);
  });
});

describe('gemini adapter', () => {
  const a = getAdapter('gemini');
  it('sums tokens across models', () => {
    const stdout = JSON.stringify({
      response: 'ok',
      stats: { models: {
        'gemini-2.5-pro': { tokens: { prompt: 100, candidates: 20, total: 130 } },
        'gemini-2.5-flash': { tokens: { prompt: 10, candidates: 2, total: 12 } },
      } },
    });
    assert.deepEqual(a.parse(stdout, '', 'p').usage, {
      inputTokens: 110, outputTokens: 22, totalTokens: 142, estimated: false,
    });
  });
  it('estimates when stats are missing', () => {
    assert.equal(a.parse(JSON.stringify({ response: 'ok' }), '', 'p').usage.estimated, true);
  });
});

describe('codex adapter', () => {
  const a = getAdapter('codex');
  it('puts the prompt last after exec flags', () => {
    assert.deepEqual(a.buildArgs('p', ['-m', 'gpt']), ['exec', '--skip-git-repo-check', '-m', 'gpt', 'p']);
  });
  it('parses a "tokens used" line and strips it from output', () => {
    const r = a.parse('Here is the fix.\ntokens used: 1,234\n', '', 'abcdefgh');
    assert.equal(r.output, 'Here is the fix.');
    assert.equal(r.usage.totalTokens, 1234);
    assert.equal(r.usage.inputTokens, 2);
    assert.equal(r.usage.estimated, false);
  });
  it('finds the tokens line on stderr too', () => {
    assert.equal(a.parse('answer', 'tokens used 50', 'p').usage.totalTokens, 50);
  });
  it('estimates otherwise', () => {
    assert.equal(a.parse('answer', '', 'p').usage.estimated, true);
  });
});

describe('opencode adapter', () => {
  it('runs `opencode run` and always estimates', () => {
    const a = getAdapter('opencode');
    assert.deepEqual(a.buildArgs('p', []), ['run', 'p']);
    const r = a.parse('  out \n', '', 'p');
    assert.equal(r.output, 'out');
    assert.equal(r.usage.estimated, true);
  });
});
