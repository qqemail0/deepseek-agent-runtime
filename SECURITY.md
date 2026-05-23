# Security Policy

## Supported Status

This project is alpha software. Use it on disposable or well-backed-up
workspaces until permission controls, sandboxing, and packaging are hardened.

## Reporting Vulnerabilities

Please use GitHub Security Advisories or open a minimal issue that does not
include exploit payloads, API keys, private paths, or private repository data.

## Local Security Model

- Reads are allowed by default.
- Writes and shell commands are permission-gated.
- Destructive shell commands are blocked by policy.
- Desktop URL opens can be disabled through the network setting.
- Saved desktop API keys use Electron `safeStorage` and stay outside the repo.

## Known Security Gaps

- MCP execution is currently a placeholder and needs a sandboxed trust model.
- Subagents are not isolated yet.
- Shell allow/deny rules need broader Windows, macOS, and Linux coverage.
- Desktop packaging is not signed.
- There is no external audit yet.

## Secret Hygiene

Never commit:

- `.env` or `.env.*` files except `.env.example`
- `.agent/usage.jsonl`
- `.agent/run-logs/`
- desktop settings from Electron user data
- screenshots or logs containing API keys, private paths, or private code
