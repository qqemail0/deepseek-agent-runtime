# Contributing

This project is in alpha. Contributions should keep the runtime local-first,
DeepSeek-first, cache-aware, and permission-gated.

## Development Setup

```bash
npm install
npm run typecheck
npm test
npm run build
```

Run the desktop app:

```bash
npm run desktop
```

Run a CLI dry run without model usage:

```bash
npm run dev -- run --dry-run "inspect this project"
```

## Pull Request Rules

- Keep changes scoped and testable.
- Do not commit secrets, local logs, conversation history, `dist/`, or `node_modules/`.
- Add or update tests for routing, context selection, permissions, tools, and UI behavior.
- Run `npm run typecheck`, `npm test`, and `npm run build` before opening a PR.
- Explain token/cache impact when changing prompts, context selection, model routing, or tool schemas.

## Prompt and Cache Rules

- Do not casually rewrite the stable system prefix. It affects remote cache reuse.
- Put changing task data, file snippets, command output, and logs in the volatile tail.
- Prefer pointers and tool calls over bulk file content.
- Do not add broad tool schemas to simple chat or open-only tasks.

## Security Rules

- Use `execFile` with argument arrays for commands.
- Keep destructive actions behind permission checks.
- Treat external MCP tools and skill bodies as untrusted input.
- Never log raw API keys or include them in errors.
