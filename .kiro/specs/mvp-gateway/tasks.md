# Implementation plan: MVP gateway

- [x] 1. Project scaffold
  - `package.json` (ESM, Node ≥22.18, scripts `test`, `typecheck`), `tsconfig.json` (strict, noEmit, erasable syntax only), `src/types.ts`.
  - _Requirements: 1.3_

- [x] 2. Agent adapters
  - [x] 2.1 Shared `estimateUsage` helper and `AgentAdapter` interface. _Req 1.4_
  - [x] 2.2 Claude adapter: args + JSON usage parsing. _Req 1.1, 1.2_
  - [x] 2.3 Gemini adapter: args + JSON stats parsing. _Req 1.1, 1.2_
  - [x] 2.4 Codex adapter: args + `tokens used` parsing. _Req 1.1, 1.2_
  - [x] 2.5 OpenCode adapter: args + estimate. _Req 1.1, 1.2_
  - [x] 2.6 Registry and `extraArgs` support; tests for each adapter. _Req 1.8_

- [x] 3. Process runner
  - Spawn with injectable `spawn`, timeout kill, ENOENT detection, output caps; tests with a fake child process. _Req 1.5, 1.6, 1.7_

- [x] 4. Quota ledger
  - [x] 4.1 Rolling-window snapshot math with injectable `now` and store. _Req 3.4, 3.6, 3.7_
  - [x] 4.2 JSONL file store; malformed-line tolerance. _Req 3.1, 3.2, 3.3, 3.8_
  - [x] 4.3 Property tests P1–P3 with fast-check. _Req 3.4, 3.5_

- [x] 5. Router
  - Explicit and auto selection, skip reasons, property P4. _Req 4.1–4.5, 3.5_

- [x] 6. Skills
  - Front matter parser, registry with warnings, `{{input}}` rendering, two built-in skills. _Req 5.1–5.6_

- [x] 7. Config
  - Defaults, merge, typed validation with field paths. _Req 6.1, 6.2_

- [ ] 8. Gateway
  - Wire config, adapters, runner, ledger, router, skills; record usage after each run. _Req 1.2, 3.1, 6.3, 6.4_

- [ ] 9. MCP server
  - [ ] 9.1 JSON-RPC line framing and error helpers. _Req 2.6, 2.8_
  - [ ] 9.2 `initialize`, `ping`, `tools/list`, `tools/call` with argument validation. _Req 2.1–2.5, 2.7_
  - [ ] 9.3 End-to-end test over in-memory streams with a fake agent. _Req 2.x, 3.1_

- [ ] 10. CLI
  - `serve`, `agents`, `quota`, `skills`, `run`, usage/exit code 2. _Req 7.1–7.4_

- [ ] 11. Milestone 2 (next spec): streaming progress notifications, web dashboard, live quota import from vendor usage endpoints.
