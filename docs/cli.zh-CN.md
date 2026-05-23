# CLI 手册

CLI 用于自动化、调试，以及在不打开桌面端的情况下验证 Agent Runtime。

## 构建

```bash
npm install
npm run build
```

设置 API Key：

```powershell
$env:DEEPSEEK_API_KEY="your_key_here"
```

## 命令

### `ds-agent run`

执行一次 Agent 任务。

```bash
node dist/cli/index.js run "读取 README 并总结架构"
```

常用参数：

- `--dry-run`：只构建上下文和模型路由，不调用模型。
- `--json`：输出结构化 JSON。
- `--trace`：输出路由、上下文、工具和缓存诊断。
- `--max-turns <auto|number>`：自动或固定 Agent Loop 轮次。
- `--model <id>`：强制指定模型，跳过自动路由。
- `--thinking <auto|enabled|disabled>`：覆盖 thinking mode。
- `--cwd <path>`：设置工作区。
- `--attach <path>`：附加一个文本文件。
- `--disable-skill <path>`：禁用某个 Skill。
- `--no-network`：禁止 URL 打开和联网工具。
- `--yes`：自动批准非 forbidden 工具。
- `--deny`：拒绝所有非 safe 工具。
- `--full-access`：允许所有非 forbidden 工具。

### `ds-agent chat`

启动交互式 CLI 对话，并保留压缩后的会话记忆。

```bash
node dist/cli/index.js chat --trace
```

输入 `exit` 或 `quit` 退出。

### `ds-agent context`

不调用 DeepSeek，只检查模型路由、工具选择、上下文条目和缓存预算。

```bash
node dist/cli/index.js context "优化 token 缓存命中率" --no-network
```

### `ds-agent models`

从配置的 DeepSeek 兼容 endpoint 拉取模型列表。

```bash
node dist/cli/index.js models
```

### `ds-agent skills`

列出或查看项目级/全局 Skill。

```bash
node dist/cli/index.js skills --search deepseek
node dist/cli/index.js skills --read deepseek-optimizer
```

## 成本和缓存输出

真实 DeepSeek 调用完成后，Runtime 会报告：

- 输入 token
- 输出 token
- 缓存命中 token
- 缓存未命中 token
- 命中率
- 预估成本

如果没有调用模型，例如 `--dry-run` 或直接桌面操作，usage 为 0 或 unavailable 是正常结果。

## 推荐调试流程

1. 用 `context` 检查任务是否被正确分类。
2. 查看 `selectedTools` 是否过多。
3. 查看 `cacheablePrefixTokens` 和 `volatileTailTokens`。
4. 如果波动尾部过大，减少附件、文件片段或命令输出。
5. 再使用 `run --trace` 执行真实任务。
