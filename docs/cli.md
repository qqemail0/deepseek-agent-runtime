# CLI Manual

The CLI is useful for automation, debugging, and validating the runtime without
opening the desktop app.

## Build

```bash
npm install
npm run build
```

Set an API key:

```bash
# PowerShell
$env:DEEPSEEK_API_KEY="your_key_here"
```

## Commands

### `ds-agent run`

Run one task through the agent loop.

```bash
node dist/cli/index.js run "read README and summarize the architecture"
```

Useful options:

- `--dry-run`: build context and route without calling the model.
- `--json`: return structured JSON.
- `--trace`: print routing, context, tool, and cache diagnostics.
- `--max-turns <auto|number>`: use automatic or fixed loop turns.
- `--model <id>`: force a model instead of auto routing.
- `--thinking <auto|enabled|disabled>`: override thinking mode.
- `--cwd <path>`: set the workspace.
- `--attach <path>`: attach a text file.
- `--disable-skill <path>`: disable one skill.
- `--no-network`: block URL opens and network-capable tools.
- `--yes`: auto-approve non-forbidden tools.
- `--deny`: deny every non-safe tool.
- `--full-access`: allow every non-forbidden tool.

### `ds-agent chat`

Start an interactive CLI session with compressed in-session memory.

```bash
node dist/cli/index.js chat --trace
```

Use `exit` or `quit` to leave.

### `ds-agent context`

Inspect model routing, selected tools, context items, and cache budget without
calling DeepSeek.

```bash
node dist/cli/index.js context "optimize token cache hit rate" --no-network
```

### `ds-agent models`

List models from the configured DeepSeek-compatible endpoint.

```bash
node dist/cli/index.js models
```

### `ds-agent skills`

List or inspect project and global skills.

```bash
node dist/cli/index.js skills --search deepseek
node dist/cli/index.js skills --read deepseek-optimizer
```

## Cost and Cache Output

When real DeepSeek usage is available, the runtime reports:

- input tokens
- output tokens
- cache hit tokens
- cache miss tokens
- hit rate
- estimated cost

When no model is called, usage is reported as unavailable or zero by design.
