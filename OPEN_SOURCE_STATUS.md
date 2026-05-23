# Open Source Status

DeepSeek Agent Runtime is an alpha local AI agent harness. It is useful for
experimentation with DeepSeek-oriented prompt caching, tool calls, skills, and
desktop workflows, but it is not yet a mature replacement for Codex, Claude
Code, or OpenCode.

## What Works

- DeepSeek-compatible provider through the OpenAI SDK.
- CLI and Electron desktop surfaces.
- Agent loop with model calls, tool calls, observations, and final synthesis.
- Tool registry for file reads, search, shell, patching, git status/diff, and desktop open.
- Permission manager with ask/allow/deny/full-access modes.
- Skill discovery, search, enable/disable, and lazy skill-body loading.
- Context compression and budget diagnostics.
- DeepSeek cache metrics from `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens`.
- Per-request and per-conversation token/cache summaries.

## Important Limitation: First Request Cache Hit Rate

The first request for a new stable prefix usually has a real cache hit rate of
0%. This is expected: the remote provider has not seen that exact prefix yet.
The runtime can reduce first-request cost by keeping prompts short, avoiding
unneeded tool schemas, using direct local operations when possible, and using a
minimal chat prefix for daily conversation. It cannot make server-side cache
tokens appear before the provider has cached the prefix.

## Needs Improvement

- Stronger computer-control primitives beyond open URL/file/app.
- Sandboxed MCP execution and trust policy.
- True subagent manager with isolated budgets and result compression.
- Better long-horizon conversation memory and summarization quality.
- AST/import graph retrieval and BM25 plus embedding hybrid search.
- More precise DeepSeek model capability discovery and pricing updates.
- Desktop packaging, auto-update, signed installers, and crash reporting.
- More robust Windows path handling and cross-platform shell policies.
- Better UI testing with screenshots and regression checks.
- Public documentation examples using real but non-sensitive demo repositories.

## Release Readiness

This repo is safe to open-source after the following checks:

- `npm run typecheck`
- `npm test`
- `npm run build`
- secret scan for real API keys and private host paths
- `git status --ignored --short` review before push
