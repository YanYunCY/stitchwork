# Implementation plan: M3 — adapters verified against real CLIs

- [x] 1. Record real output from each CLI into `test/fixtures/real/` (ids and paths redacted). _Req 14.6_
- [x] 2. Codex: `--json` events, two-layout plain fallback. _Req 14.1, 14.2_
- [x] 3. OpenCode: `--format json` events. _Req 14.3_
- [x] 4. Gemini: `--skip-trust`, error object. _Req 14.4, 14.5_
- [x] 5. `test/real-fixtures.test.ts` parses every fixture. _Req 14.6_
- [x] 6. README compatibility table. _Req 14.7_
- [ ] 7. Record a successful Gemini response and one real rate-limit response from any vendor.
