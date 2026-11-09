import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { hostAllowed, originAllowed, postAllowed } from '../src/lab/guard.ts';

const port = fc.integer({ min: 0, max: 65535 });

describe('request guard (Req 15.5, 19.4)', () => {
  it('accepts loopback names only', () => {
    assert.equal(hostAllowed('127.0.0.1:7777', 7777), true);
    assert.equal(hostAllowed('localhost:7777', 7777), true);
    assert.equal(hostAllowed('evil.example:7777', 7777), false);
    assert.equal(hostAllowed('127.0.0.1', 7777), false);
    assert.equal(hostAllowed(undefined, 7777), false);
    assert.equal(originAllowed('http://localhost:7777', 7777), true);
    assert.equal(originAllowed('https://localhost:7777', 7777), false);
    assert.equal(originAllowed('null', 7777), false);
  });

  it('lets header-less POSTs through unless the browser says cross-site', () => {
    assert.equal(postAllowed({}, 1), true);
    assert.equal(postAllowed({ 'sec-fetch-site': 'cross-site' }, 1), false);
    assert.equal(postAllowed({ origin: 'http://evil.example' }, 1), false);
    assert.equal(postAllowed({ origin: 'http://127.0.0.1:1' }, 1), true);
  });

  // Feature: m3-lab, Property 9: host and origin guard
  it('P9: allowed iff exactly the loopback forms for that port', () => {
    fc.assert(fc.property(fc.string(), fc.string(), port, (s, t, p) => {
      assert.equal(hostAllowed(s, p), s === `127.0.0.1:${p}` || s === `localhost:${p}`);
      assert.equal(originAllowed(t, p), t === `http://127.0.0.1:${p}` || t === `http://localhost:${p}`);
    }), { numRuns: 300 });
    fc.assert(fc.property(port, port, (p, q) => {
      assert.equal(hostAllowed(`127.0.0.1:${q}`, p), p === q);
      assert.equal(originAllowed(`http://localhost:${q}`, p), p === q);
    }), { numRuns: 300 });
  });
});
