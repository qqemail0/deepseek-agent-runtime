# Algorithm Upgrades

## Context Selection v2

The runtime builds context in three layers:

1. Stable system prefix: system rules, safety rules, tool protocol, and output contract.
2. Reusable user prefix: project rules and deterministic project summary.
3. Volatile tail: current task, execution strategy, history, git status/diff, and task-relevant file snippets.
4. Tool schemas: only selected tools for the current task profile.

The file snippet selector scores paths with direct keyword matches plus domain boosts for desktop UI, cache/token code, tools, skills, config, and providers.

## Cache Metrics

Each built context includes:

- `stablePrefixHash`
- `cacheablePrefixHash`
- `dynamicTailHash`
- stable token count
- dynamic token count
- cacheable prefix token count
- volatile tail token count
- dropped context item count
- cache strategy: `excellent`, `good`, or `needs_work`

After real DeepSeek calls, the cost engine reads:

- `prompt_cache_hit_tokens`
- `prompt_cache_miss_tokens`
- input/output tokens
- estimated cost

It returns a cache health grade and concrete optimization recommendations.

## Tool Expansion

New MVP tool:

- `write_file`: creates or overwrites UTF-8 files with permission checks.

Existing edit path still prefers `apply_patch` for small scoped changes.

## Desktop Upgrade

The desktop shell is now a Chinese engineering console with:

- live DeepSeek model sync through `GET /models`
- manual model selection
- thinking mode override
- run progress timeline
- DeepSeek `reasoning_content` display when available
- completed file list from tool metadata
- route decision panel
- context budget panel
- automatic context compression level
- current request cache hit rate
- current desktop conversation cache hit rate
- inline permission approval block for operational requests
- cache recommendations
- selected context item list
- tool result list
- capability matrix

Renderer remains unprivileged and uses preload IPC only.

## Cache Target

The desktop UI displays a 99.1% cache-hit target. This is an optimization target, not a guaranteed value. The real hit rate is returned by DeepSeek through `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens`.

The runtime improves hit rate by:

- keeping the stable prefix ordered and deterministic
- placing deterministic project summaries before the current task
- moving volatile task data into the dynamic tail
- automatically compressing dynamic context
- limiting eager file snippets
- using tools to fetch details only when needed
- omitting read/search tool schemas for open-only desktop operations
- using a minimal system prefix for simple daily chat

## First Request Behavior

The first request for a new exact prefix can have a real server-side cache hit
rate of 0%. The runtime cannot change provider cache state before the provider
has seen the prefix. The correct optimization is to reduce first-request miss
tokens, then preserve the exact reusable prefix for later turns.

Cold-start optimizations:

- direct desktop actions skip model tokens
- simple chat uses a compact system prefix
- project summaries are deterministic
- volatile tail is explicitly measured and trimmed
- tool schemas are selected narrowly
