# Open Source Guide

## Repository Contents

Commit:

- `src/`
- `tests/`
- `scripts/`
- `docs/`
- `.agent/config.json`
- `.agent/rules.md`
- `.agent/skills/**/SKILL.md`
- package manifests and TypeScript config
- open-source governance files

Do not commit:

- `node_modules/`
- `dist/`
- `.env` or real API keys
- `.agent/usage.jsonl`
- `.agent/run-logs/`
- desktop user settings
- temporary test files

## Pre-Push Checklist

```bash
npm run typecheck
npm test
npm run build
git status --ignored --short
```

Run a secret scan before pushing. A finding for variable names such as `apiKey`
is expected; a real key value is not.

## GitHub Setup

With GitHub CLI:

```bash
gh auth status
git init -b main
git add .
git commit -m "Initial open-source release"
gh repo create deepseek-agent-runtime --public --source . --remote origin --push
```

If the repo already exists:

```bash
git remote add origin https://github.com/qqemail0/deepseek-agent-runtime.git
git push -u origin main
```

## Release Checklist

1. Update `OPEN_SOURCE_STATUS.md`.
2. Update `docs/roadmap.md`.
3. Run verification.
4. Run secret scan.
5. Tag the release.
6. Draft release notes with breaking changes, cache behavior, and known gaps.
