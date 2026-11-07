import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isRateLimited } from '../src/ratelimit.ts';

describe('isRateLimited (Req 8.1)', () => {
  const hits = [
    'Error: 429 Too Many Requests',
    'rate_limit_error: This request would exceed your rate limit',
    'You have hit your usage limit. Try again at 4:12 PM.',
    'RESOURCE_EXHAUSTED: Quota exceeded for quota metric',
    'API Error: Rate limited, please retry',
    'quota exhausted for model',
  ];
  for (const h of hits) it(`detects: ${h}`, () => assert.equal(isRateLimited('', h), true));

  const misses = ['TypeError: cannot read property', 'exit code 1', 'port 4290 in use', 'generated 1429 lines', ''];
  for (const m of misses) it(`ignores: ${JSON.stringify(m)}`, () => assert.equal(isRateLimited(m), false));

  it('handles undefined inputs', () => assert.equal(isRateLimited(undefined, undefined), false));
});
