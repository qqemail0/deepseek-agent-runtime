---
name: deepseek-optimizer
description: Optimize DeepSeek prompts for low token use, high context cache hit rate, proper thinking mode, tool calls, and cost reporting.
---

# DeepSeek Optimizer

Use this skill when a task involves DeepSeek model routing, prompt caching, token budgets, JSON Output, thinking mode, or tool-call precision.

## Rules

- Keep system, safety, tool protocol, output contract, project summary, and selected skill text in a stable prefix.
- Put user task, errors, file snippets, command output, and logs in the dynamic tail.
- Disable thinking for simple chat or direct explanations.
- Enable thinking for code analysis, multi-tool tasks, debugging, and refactors.
- Use `deepseek-v4-pro` with max effort only for complex multi-file changes or high-risk reasoning.
- Record `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens` every turn.
- For JSON Output, include the word `json`, provide an example, set `response_format`, and retry once if content is empty.
