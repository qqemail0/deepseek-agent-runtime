# Design Manual

## Product Direction

DeepSeek Agent Runtime is a local-first agent harness for coding and project
work. It is optimized for low token use, stable prompt prefixes, high cache
reuse after warmup, precise tool calls, and explicit permissions.

The desktop app is the primary surface. The CLI stays as the automation and
debugging surface.

## Runtime Layers

1. CLI/Desktop UI gathers the task, workspace, model preference, attachments,
   permission mode, network mode, and skill toggles.
2. `AlgorithmOptimizer` classifies task kind, domains, complexity, risk, and
   context policy.
3. `ModelRouter` chooses model, thinking mode, response format, and output
   budget.
4. `ToolRegistry` injects only the needed tool schemas.
5. `ContextManager` builds a cache-friendly prompt with reusable context before
   volatile task data.
6. `AgentOrchestrator` runs the think/tool/observe loop.
7. `PermissionManager` checks risky tools before execution.
8. `CostPrecisionEngine` records usage, cache health, and final answer checks.

## Prompt Shape

System message:

- byte-stable runtime rules
- safety rules
- tool protocol
- output contract

User message:

- reusable context: rules and deterministic project summary
- volatile tail: current task, strategy, history, attachments, snippets, git
  state, command output, and diagnostics

Daily chat can use a minimal system prefix. This reduces first-request miss
tokens even though the remote cache hit rate may still be 0%.

## Context Selection

The MVP uses:

- file path scoring
- task keyword matching
- domain boosts for agent/cache/tool/UI/skill work
- focused snippets instead of whole files
- attached file truncation
- automatic compression and budget fitting
- deterministic project summaries for reusable prefix cache

Future versions should add:

- AST symbol graph
- import/dependency tracing
- BM25 search
- embeddings
- test failure to source mapping

## Tool Selection

Tool schemas are part of the prompt budget. The registry should not inject broad
schemas for simple chat or open-only desktop operations.

Default rules:

- simple chat: no tools
- open URL/file/app: `desktop_open` only
- inspect/code tasks: `search_text`, `read_file`
- edit/refactor: `apply_patch`, `git_diff`, plus read/search
- shell/debug: `run_shell` after permission checks
- MCP: placeholder until sandboxed execution exists

## Permissions

Risk levels:

- safe: read-only or no external effect
- low: non-destructive local action
- medium: writes or shell commands
- high: broad modifications or sensitive operations
- forbidden: destructive commands such as recursive delete/reset

The permission manager must stay independent from model output. The model can
request a tool, but policy decides whether it executes.

## Cache Philosophy

The target is real token reduction, not artificial hit-rate padding.

99.1% warm-cache hit rate only becomes realistic when:

- the same model is used
- the stable prefix is already cached remotely
- the reusable prefix is large
- the volatile tail is tiny
- tool schemas and skill bodies are stable or omitted

The first request for a new prefix cannot hit a remote cache. Optimize it by
reducing miss tokens.
