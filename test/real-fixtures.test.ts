import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getAdapter } from '../src/adapters/index.ts';
import { isRateLimited } from '../src/ratelimit.ts';

// Output captured from the real CLIs on 2026-11-09 (prompt: "Reply with exactly: pong").
// See test/fixtures/real/README.md for how each was recorded.
const fx = (name: string) => readFileSync(new URL(`./fixtures/real/${name}`, import.meta.url), 'utf8');
const PROMPT = 'Reply with exactly: pong';

describe('real CLI fixtures (Req 14)', () => {
  it('codex-cli 0.167.0 --json: answer and reported usage', () => {
    const r = getAdapter('codex').parse(fx('codex-0.167.0.jsonl'), '', PROMPT);
    assert.equal(r.output, 'pong');
    assert.deepEqual(r.usage, { inputTokens: 11611, outputTokens: 87, totalTokens: 11698, estimated: false });
  });

  it('codex-cli 0.167.0 plain text: "tokens used" on its own line', () => {
    const r = getAdapter('codex').parse(fx('codex-0.167.0.plain.stdout.txt'), fx('codex-0.167.0.plain.stderr.txt'), PROMPT);
    assert.equal(r.output, 'pong');
    assert.equal(r.usage.totalTokens, 11661);
    assert.equal(r.usage.estimated, false);
  });

  it('claude 2.1.319 --output-format json: result and usage', () => {
    const r = getAdapter('claude').parse(fx('claude-2.1.319.json'), '', PROMPT);
    assert.equal(r.output, 'pong');
    assert.deepEqual(r.usage, { inputTokens: 10960, outputTokens: 3, totalTokens: 10963, estimated: false });
  });

  it('opencode 1.19.5 --format json: text parts and step tokens', () => {
    const r = getAdapter('opencode').parse(fx('opencode-1.19.5.jsonl'), '', PROMPT);
    assert.equal(r.output, 'pong');
    assert.deepEqual(r.usage, { inputTokens: 7330, outputTokens: 3, totalTokens: 7333, estimated: false });
  });

  it('gemini-cli 0.67.0 error JSON on stderr becomes a readable message, not a rate limit', () => {
    const err = fx('gemini-0.67.0.error.json');
    const r = getAdapter('gemini').parse('', err, PROMPT);
    assert.match(r.output, /^Gemini error 403: .*insufficient authentication scopes/s);
    assert.equal(isRateLimited(r.output, err), false);
  });
});
