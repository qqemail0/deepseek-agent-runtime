# Roadmap and Improvement Plan

## Priority 0: Correctness and Safety

- Harden shell risk detection across Windows, macOS, and Linux.
- Add more tests for permission prompts and denied tool paths.
- Add path traversal tests for file tools and desktop open.
- Add screenshot-based desktop UI regression checks.
- Add dependency vulnerability scanning in CI.

## Priority 1: Token and Cache Optimization

- Add prefix warmup mode that sends a tiny no-op request only when the user
  explicitly accepts the extra initial cost.
- Add per-model prefix history so the UI can distinguish local warm prefixes
  from unknown remote cache state.
- Make tool schemas progressively loadable inside the agent loop.
- Add AST/import graph context selection.
- Add BM25 plus optional embedding retrieval.
- Add cache-aware conversation summarization with stable facts and volatile
  unresolved tasks separated.

## Priority 2: Desktop Agent Capability

- Add explicit computer-control tools beyond open URL/file/app.
- Add a safe action planner that asks for target confirmation when intent is
  ambiguous.
- Add completed-file quick preview and diff viewer.
- Add a task objective tracker that can mark done/partial/failed with evidence.
- Add workspace profiles and per-conversation runtime settings.

## Priority 3: Extensibility

- Implement real MCP server registration, schema loading, and sandbox policy.
- Add subagents with isolated context budgets and compressed result handoff.
- Add hooks for pre-tool validation, post-tool formatting, tests, and security
  checks.
- Add provider plugins for OpenAI, Anthropic, Gemini, and local models.

## Priority 4: Distribution

- Package signed installers.
- Add auto-update.
- Add crash reporting that redacts secrets and private paths.
- Publish architecture diagrams and example workflows.
