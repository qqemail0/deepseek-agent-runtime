# DeepSeek Agent Runtime

[English](README.md) | [简体中文](README.zh-CN.md)

DeepSeek Agent Runtime is an alpha local AI agent harness for coding and
project work. It provides a desktop-first workflow, a CLI, tool calls, skills,
permission checks, context compression, model routing, and DeepSeek cache/cost
diagnostics.

This is not a finished Codex or Claude Code replacement. It is an open-source
base for experimenting with lower-token, cache-aware local agents.

## Goals

- Reduce real prompt tokens instead of padding prompts to fake hit rate.
- Improve DeepSeek context cache reuse by keeping stable prefixes deterministic.
- Load files, tools, and skill bodies only when the task needs them.
- Prefer precise local observations over guessing.
- Keep risky operations behind explicit permissions.
- Make CLI and desktop behavior share the same runtime.

## Current Capabilities

- Desktop app with Chinese UI, streaming output, progress timeline, permission modal, skill toggles, model sync, and per-request cache metrics.
- CLI commands for run, chat, context preview, model listing, and skill inspection.
- DeepSeek-compatible provider through the OpenAI SDK.
- Model routing between flash/pro style models, thinking mode, JSON output, and max-token budgets.
- Tool registry:
  - `list_files`
  - `read_file`
  - `search_text`
  - `desktop_open`
  - `run_shell`
  - `write_file`
  - `apply_patch`
  - `git_status`
  - `git_diff`
  - `mcp_tool` placeholder
- Skill system for `.agent/skills/<name>/SKILL.md` with metadata indexing and lazy body loading.
- Permission modes: ask, allow, deny, and full access, with destructive commands blocked by policy.
- Context budget report with stable, dynamic, cacheable prefix, volatile tail, dropped items, and recommendations.
- Cost report using DeepSeek `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens`.

## First Request Cache Hit Rate

The first request for a new prompt prefix can show 0% cache hit rate. That is
normal for provider-side prompt caching: there is no remote cached prefix to
reuse yet.

The runtime optimizes cold starts by:

- using a minimal prompt for daily chat
- skipping model calls for high-confidence direct desktop opens
- avoiding unneeded tool schemas
- keeping project summaries deterministic
- placing reusable context before the current task
- compressing file snippets, command output, and attachments

After a prefix is warmed, repeated requests with the same model and a small
volatile tail can reach much higher hit rates. A stable 99.1% rate is only
realistic for repeated warm-prefix requests with very little new content.

## Install

```bash
npm install
npm run build
```

Set a DeepSeek API key:

```powershell
$env:DEEPSEEK_API_KEY="your_key_here"
```

Optional custom endpoint:

```powershell
$env:DEEPSEEK_BASE_URL="https://api.deepseek.com"
```

The desktop app can save an API key using Electron `safeStorage`. Saved keys are
stored in Electron user data, not in this repository.

## Desktop Usage

```bash
npm run desktop
```

Desktop features:

- choose workspace per conversation
- sync model list from the configured API
- select auto/manual model
- enable/disable thinking mode
- turn network access on/off
- attach pasted or selected files
- enable/disable and search skills
- approve tool requests in a modal
- inspect reasoning, progress, completed files, tools, and cache metrics

## CLI Usage

Preview routing/context without model usage:

```bash
npm run dev -- context "optimize token cache hit rate" --no-network
```

Run one task:

```bash
npm run dev -- run "read README and summarize the architecture" --trace
```

Start interactive chat:

```bash
npm run dev -- chat --trace
```

List models:

```bash
npm run dev -- models
```

List skills:

```bash
npm run dev -- skills --search deepseek
```

Full CLI reference: [docs/cli.md](docs/cli.md).

## Architecture and Manuals

- [Architecture](docs/architecture.md)
- [Design manual](docs/design-manual.md)
- [Algorithm upgrades](docs/algorithm-upgrades.md)
- [CLI manual](docs/cli.md)
- [Open-source guide](docs/open-source-guide.md)
- [Roadmap](docs/roadmap.md)
- [Open source status](OPEN_SOURCE_STATUS.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Verification

```bash
npm run typecheck
npm test
npm run build
```

## Security Notes

Before publishing or pushing:

- do not commit `.env`
- do not commit `.agent/usage.jsonl`
- do not commit `.agent/run-logs/`
- do not commit desktop user settings
- review `git status --ignored --short`
- run a secret scan

## License

MIT
