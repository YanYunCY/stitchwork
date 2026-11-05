# 🧟 Stitchwork

> One MCP gateway, four coding agents, one shared quota ledger.
> 一个 MCP 网关，缝合四个编码 agent，共用一本配额账。

**Stitchwork** is an open-source control plane that stitches **Codex CLI**, **Claude Code**, **Gemini CLI** and **OpenCode** together behind one MCP-aware gateway. Any MCP client (Kiro, Claude Desktop, Cursor, or another agent) sees a single, uniform set of tools; Stitchwork decides which agent body part does the work, tracks token and request usage across all of them in one ledger, and lets you package prompts as reusable **skills**.

Built spec-first in [Kiro](https://kiro.dev) for **Kiroween 2026 — Frankenstein category**. Everything Kiro produced or used lives in [`/.kiro`](./.kiro): steering docs, the MVP spec, and agent hooks.

[English](#english) · [中文](#中文)

---

## English

### Why

If you pay for more than one coding agent, you juggle four CLIs, four auth flows and four separate quota meters, and you only learn one is exhausted when it fails mid-task. Stitchwork gives them one face:

| Problem | Stitchwork |
| --- | --- |
| Four different CLIs and flags | One MCP tool: `agent_run` |
| Quota exhaustion discovered too late | Shared rolling-window ledger, checked **before** every run |
| "Which agent should do this?" | `agent: "auto"` routes to the healthy agent with the most headroom |
| Copy-pasting the same prompts | Markdown **skills** with front matter, rendered per agent |

### Features (MVP)

- **MCP gateway** (stdio, JSON-RPC 2.0, protocol `2025-06-18`), zero runtime dependencies.
- **Adapters** for `codex exec`, `claude -p`, `gemini -p`, `opencode run`, each with usage parsing and a fallback token estimate.
- **Shared quota ledger**: per-agent token and request limits over a rolling window, persisted as append-only JSONL.
- **Router**: explicit agent, or `auto` (most remaining headroom, skill's preferred agents first).
- **Skills**: `skills/*.md` files with `name`, `description`, `agents`, and a `{{input}}` template.
- **CLI**: `stitchwork serve | agents | quota | skills | run`.

### MCP tools

| Tool | What it does |
| --- | --- |
| `agents_list` | Installed agents, whether their binary is on `PATH`, remaining quota |
| `agent_run` | Run a prompt on `codex`, `claude`, `gemini`, `opencode`, or `auto` |
| `skills_list` | Reusable skills and the agents they prefer |
| `skill_run` | Render a skill with an input and run it through the router |
| `quota_status` | Usage per agent in the current window |

### Quick start

Requires **Node.js 22.18+** (runs TypeScript natively via type stripping, no build step) and at least one of the agent CLIs installed and signed in.

```bash
git clone https://github.com/YanYunCY/stitchwork && cd stitchwork
npm install          # dev tooling only (typescript, fast-check)
npm test             # unit + property tests
node src/cli.ts agents
node src/cli.ts run --agent auto "Explain src/quota/ledger.ts in 3 bullets"
```

Use it from any MCP client, e.g. Kiro's `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "stitchwork": { "command": "node", "args": ["/path/to/stitchwork/src/cli.ts", "serve"] }
  }
}
```

### Configuration

Optional `stitchwork.config.json` in the working directory (see [`stitchwork.config.example.json`](./stitchwork.config.example.json)): per-agent `enabled`, `binary`, `extraArgs`, `limits.tokens`, `limits.requests`, plus `windowMinutes`, `ledgerPath` and `skillsDir`.

Secrets are **never** stored in config. Each CLI keeps its own login; any API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, …) are read only from the environment and passed through to the child process.

### License

[MIT](./LICENSE)

---

## 中文

### 为什么做

同时订阅好几个编码 agent 的人，要在四个 CLI、四套登录、四个配额表之间来回切，而且往往要到任务跑一半失败了才知道某个额度用完了。Stitchwork 把它们缝成一个整体：

| 痛点 | Stitchwork 的做法 |
| --- | --- |
| 四个 CLI，参数各不相同 | 一个 MCP 工具：`agent_run` |
| 额度耗尽发现得太晚 | 共享滚动窗口账本，每次运行**之前**先检查 |
| 不知道该派哪个 agent | `agent: "auto"` 自动路由到剩余额度最多的健康 agent |
| 同样的提示词反复粘贴 | 带 front matter 的 Markdown **skills**，按 agent 渲染 |

### MVP 功能

- **MCP 网关**（stdio，JSON-RPC 2.0，协议版本 `2025-06-18`），运行时零依赖。
- **适配器**：`codex exec`、`claude -p`、`gemini -p`、`opencode run`，各自解析用量，解析不到时按字符数估算 token。
- **共享配额账本**：每个 agent 的 token 和请求数上限，按滚动时间窗口统计，以追加写 JSONL 持久化。
- **路由器**：指定 agent，或 `auto`（优先 skill 推荐的 agent，再按剩余额度排序）。
- **Skills**：`skills/*.md`，含 `name`、`description`、`agents` 和 `{{input}}` 模板。
- **命令行**：`stitchwork serve | agents | quota | skills | run`。

### 快速开始

需要 **Node.js 22.18+**（原生剥离类型运行 TypeScript，无需构建），以及至少一个已安装并登录的 agent CLI。

```bash
git clone https://github.com/YanYunCY/stitchwork && cd stitchwork
npm install          # 仅开发工具（typescript、fast-check）
npm test             # 单元测试 + 属性测试
node src/cli.ts agents
node src/cli.ts run --agent auto "用三点解释 src/quota/ledger.ts"
```

在 Kiro 的 `.kiro/settings/mcp.json` 里接入方式见上方英文部分的 JSON 示例。

### 配置与密钥

可选的 `stitchwork.config.json` 放在工作目录（参考 `stitchwork.config.example.json`）。密钥**从不**写进配置：各 CLI 用自己的登录态，API key 只从环境变量读取并透传给子进程。

### 许可证

[MIT](./LICENSE)
