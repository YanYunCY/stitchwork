# 🧟 Stitchwork

> One MCP gateway, four coding agents, one shared quota ledger.
> 一个 MCP 网关，缝合四个编码 agent，共用一本配额账。

**Stitchwork** is an open-source control plane that stitches **Codex CLI**, **Claude Code**, **Gemini CLI** and **OpenCode** together behind one MCP-aware gateway. Any MCP client (Kiro, Claude Desktop, Cursor, or another agent) sees one uniform set of tools. Stitchwork decides which limb does the work, checks a shared quota ledger **before** every run, fails over when a vendor rate-limits you, and lets you package prompts as reusable **skills**.

Built spec-first in [Kiro](https://kiro.dev) for **Kiroween 2026, Frankenstein category**. Everything Kiro uses lives in [`/.kiro`](./.kiro): steering docs, two specs, agent hooks and the MCP config.

[English](#english) · [中文](#中文)

---

## English

### See it in 30 seconds (no subscriptions, no tokens)

```bash
git clone https://github.com/YanYunCY/stitchwork && cd stitchwork
node bin/stitchwork.js demo        # Node 22.18+, nothing to install
```

The demo runs bundled stand-in CLIs against a throwaway ledger and shows the whole story: Claude runs twice, the ledger refuses a third call before it is wasted, `auto` hands the job to Codex, Gemini answers `429` and the request fails over to OpenCode, and Gemini is skipped while it cools down. Add `--pace 900` to slow it down for screen recording.

### Why

If you pay for more than one coding agent, you juggle four CLIs, four logins and four quota meters, and you only learn one is empty when it dies mid-task.

| Problem | Stitchwork |
| --- | --- |
| Four different CLIs and flags | One MCP tool: `agent_run` |
| Quota exhaustion discovered too late | Shared rolling-window ledger, checked **before** every run |
| A vendor rate-limits you mid-task | Automatic failover to the next eligible agent, plus a cooldown |
| "Which agent should do this?" | `agent: "auto"` routes to the healthy agent with the most headroom |
| A long run looks hung | MCP progress notifications; cancel kills the agent process |
| Copy-pasting the same prompts | Markdown **skills** with front matter and preferred agents |

### Features

- **MCP gateway** over stdio (JSON-RPC 2.0, protocol `2025-06-18`), zero runtime dependencies.
- **Adapters** for `codex exec`, `claude -p`, `gemini -p`, `opencode run`, each parsing reported usage, with a character-based estimate when a CLI reports none.
- **Shared quota ledger**: per-agent token and request limits over a rolling window, append-only JSONL, counts only.
- **Router**: explicit agent, or `auto` (skill's preferred agents first, then most headroom).
- **Rate-limit failover**: a `429` / "usage limit" / `RESOURCE_EXHAUSTED` failure on an auto run is retried on the next agent (up to `maxFallbacks`, default 2); the limited agent cools down for `cooldownMinutes` (default 15), persisted in the ledger. Explicit runs never fail over.
- **Progress and cancellation**: `notifications/progress` when the client sends a `progressToken`; `notifications/cancelled` kills the child process.
- **Skills**: `skills/*.md` with `name`, `description`, `agents`, `timeoutSeconds` and an `{{input}}` template.
- **CLI**: `stitchwork serve | agents | quota | skills | run | doctor | demo`.

### MCP tools

| Tool | What it does |
| --- | --- |
| `agents_list` | Agents, whether each binary is on `PATH`, remaining headroom, cooldown |
| `agent_run` | Run a prompt on `codex`, `claude`, `gemini`, `opencode`, or `auto` |
| `skills_list` | Reusable skills and the agents they prefer |
| `skill_run` | Render a skill with an input and run it through the router |
| `quota_status` | Tokens and requests per agent in the current window |

Every run returns `agent`, `ok`, `output`, `usage { inputTokens, outputTokens, totalTokens, estimated }`, `durationMs`, `exitCode`, `routedBy` and `fallbacks` as structured content.

### Install and connect

Requires **Node.js 22.18+** and at least one agent CLI installed and signed in.

```bash
git clone https://github.com/YanYunCY/stitchwork && cd stitchwork
npm install && npm run build && npm install -g .
stitchwork doctor            # which CLIs are on PATH, their versions, your limits
stitchwork run --agent auto "Explain src/quota/ledger.ts in 3 bullets"
```

Add it to any MCP client. In Kiro, `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "stitchwork": { "command": "stitchwork", "args": ["serve"] }
  }
}
```

### Configuration

Optional `stitchwork.config.json` in the working directory (see [`stitchwork.config.example.json`](./stitchwork.config.example.json)):

| Key | Default | Meaning |
| --- | --- | --- |
| `windowMinutes` | 300 | Rolling window for limits |
| `timeoutSeconds` | 600 | Per-run timeout (a skill can override) |
| `cooldownMinutes` | 15 | How long a rate-limited agent is skipped |
| `maxFallbacks` | 2 | How many other agents an auto run may try (0–3) |
| `ledgerPath` | `.stitchwork/ledger.jsonl` | Where usage counts are appended |
| `skillsDir` | `skills` | Where skills are read from |
| `agents.<id>` | enabled | `enabled`, `binary`, `extraArgs`, `limits.tokens`, `limits.requests` |

Secrets are **never** stored in config or the ledger. Each CLI keeps its own login; API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, …) are read only from the environment and passed through to the child process.

### Develop

```bash
npm install
npm run typecheck
npm test                  # unit, property-based (fast-check), end-to-end MCP, real child processes
```

### Built with Kiro

How the specs, steering, hooks, MCP and property tests were used: [`docs/KIRO_USAGE.md`](./docs/KIRO_USAGE.md). Specs: [`mvp-gateway`](./.kiro/specs/mvp-gateway), [`m2-demo-ready`](./.kiro/specs/m2-demo-ready). Roadmap: [`docs/MILESTONES.md`](./docs/MILESTONES.md).

### Status and limits

- Adapter flags and output parsing follow each CLI's documented non-interactive mode; they have not yet been checked against every current CLI release (tracked in the milestones).
- Quota is what Stitchwork has seen. Usage you make outside the gateway is not counted yet.

### License

[MIT](./LICENSE)

---

## 中文

### 30 秒看效果（不需要任何订阅、不花 token）

```bash
git clone https://github.com/YanYunCY/stitchwork && cd stitchwork
node bin/stitchwork.js demo        # Node 22.18+，无需安装依赖
```

演示用仓库自带的模拟 CLI 和一次性账本跑完整流程：Claude 跑两次，第三次在浪费调用之前被账本拒绝；`auto` 把任务交给 Codex；Gemini 返回 `429`，请求自动转给 OpenCode；之后 Gemini 在冷却期内被跳过。录屏时加 `--pace 900` 放慢节奏。

### 为什么做

同时订阅好几个编码 agent，就要在四个 CLI、四套登录、四个配额表之间切换，往往任务跑一半失败了才知道额度用完。

| 痛点 | Stitchwork 的做法 |
| --- | --- |
| 四个 CLI，参数各不相同 | 一个 MCP 工具：`agent_run` |
| 额度耗尽发现得太晚 | 共享滚动窗口账本，每次运行**之前**先检查 |
| 跑到一半被厂商限流 | 自动转给下一个可用 agent，并让被限流的 agent 冷却 |
| 不知道该派哪个 agent | `agent: "auto"` 路由到剩余额度最多的健康 agent |
| 长任务看起来像卡住 | MCP 进度通知；取消会结束 agent 进程 |
| 同样的提示词反复粘贴 | 带 front matter 和首选 agent 的 Markdown **skills** |

### 功能

- **MCP 网关**：stdio，JSON-RPC 2.0，协议 `2025-06-18`，运行时零依赖。
- **适配器**：`codex exec`、`claude -p`、`gemini -p`、`opencode run`，各自解析用量，解析不到时按字符数估算。
- **共享配额账本**：每个 agent 的 token 与请求数上限，滚动窗口统计，追加写 JSONL，只记计数。
- **路由**：指定 agent，或 `auto`（先按 skill 首选，再按剩余额度）。
- **限流自动转派**：`auto` 运行遇到 `429`、"usage limit"、`RESOURCE_EXHAUSTED` 等失败时，换下一个 agent 重试（最多 `maxFallbacks` 次，默认 2）；被限流的 agent 冷却 `cooldownMinutes`（默认 15 分钟），冷却状态写在账本里，跨进程有效。指定 agent 的运行不会转派。
- **进度与取消**：客户端带 `progressToken` 时发送 `notifications/progress`；收到 `notifications/cancelled` 时结束子进程。
- **Skills**：`skills/*.md`，含 `name`、`description`、`agents`、`timeoutSeconds` 与 `{{input}}` 模板。
- **命令行**：`stitchwork serve | agents | quota | skills | run | doctor | demo`。

### 安装与接入

需要 **Node.js 22.18+**，以及至少一个已安装并登录的 agent CLI。

```bash
npm install && npm run build && npm install -g .
stitchwork doctor            # 检查哪些 CLI 在 PATH 上、版本和额度设置
```

在 Kiro 的 `.kiro/settings/mcp.json` 中加入：`{"mcpServers": {"stitchwork": {"command": "stitchwork", "args": ["serve"]}}}`。

### 配置与密钥

可选的 `stitchwork.config.json` 放在工作目录，字段见上方英文表格。密钥**从不**写进配置或账本：各 CLI 用自己的登录态，API key 只从环境变量读取并透传给子进程。

### 现状与限制

- 适配器的参数和输出解析按各 CLI 文档中的非交互模式实现，尚未逐一对照所有最新版本验证。
- 配额只统计经过 Stitchwork 的用量，网关之外的用量暂不计入。

### 许可证

[MIT](./LICENSE)
