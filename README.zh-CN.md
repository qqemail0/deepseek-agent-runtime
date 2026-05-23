# DeepSeek Agent Runtime

[English](README.md) | [简体中文](README.zh-CN.md)

DeepSeek Agent Runtime 是一个本地优先、DeepSeek 优先的 AI Agent Runtime。它面向代码开发和项目操作，提供桌面端主界面、CLI、工具调用、Skills、权限控制、上下文压缩、模型路由，以及 DeepSeek 缓存与成本诊断。

这个项目目前是 alpha 版本。它不是成熟的 Codex、Claude Code 或 OpenCode 替代品，而是一个用于实验“低 token、高缓存复用、本地执行、可扩展 Agent Harness”的开源基础。

## 核心目标

- 减少真实 prompt token，而不是靠填充无意义前缀刷命中率。
- 通过稳定、确定性的 prompt 前缀提升 DeepSeek 上下文缓存复用。
- 文件、工具 schema、Skill 正文都按需加载。
- 优先基于真实文件、命令输出和工具结果回答，减少猜测。
- 高风险操作必须经过权限策略。
- CLI 和桌面端共享同一套 Agent Runtime。

## 当前能力

- 中文桌面端：流式输出、任务进度、权限弹窗、Skill 开关、模型同步、缓存指标、完成文件列表。
- CLI：支持 `run`、`chat`、`context`、`models`、`skills`。
- DeepSeek 兼容 Provider：基于 OpenAI SDK 的兼容接口。
- 模型路由：根据任务复杂度选择 flash/pro、thinking mode、JSON 输出和输出预算。
- 工具注册中心：
  - `list_files`
  - `read_file`
  - `search_text`
  - `desktop_open`
  - `run_shell`
  - `write_file`
  - `apply_patch`
  - `git_status`
  - `git_diff`
  - `mcp_tool` 占位
- Skill 系统：读取 `.agent/skills/<name>/SKILL.md`，先索引元数据，再按需加载正文。
- 权限模式：ask、allow、deny、full access；破坏性命令仍由策略禁止。
- 上下文预算报告：稳定前缀、动态内容、可缓存前缀、波动尾部、丢弃条目和优化建议。
- 成本报告：读取 DeepSeek 返回的 `prompt_cache_hit_tokens` 与 `prompt_cache_miss_tokens`。

## 为什么首次请求命中率可能是 0

首次请求某个全新的 prompt 前缀时，DeepSeek 服务端还没有可复用缓存，所以真实命中率可能是 0%。这是 provider-side prompt caching 的正常现象。

Runtime 能优化的是冷启动成本：

- 日常聊天使用极简 prompt。
- 高置信度桌面打开操作跳过模型调用。
- 不给简单任务注入无关工具 schema。
- 项目摘要保持确定性。
- 可复用上下文放在当前任务前面。
- 文件片段、命令输出、附件进入波动尾部并自动压缩。

当同一模型、同一稳定前缀被预热后，后续请求如果波动尾部足够小，命中率才会显著提升。稳定达到 99.1% 只适合“已预热前缀 + 极小动态尾部”的重复请求场景。

## 安装

```bash
npm install
npm run build
```

设置 DeepSeek API Key：

```powershell
$env:DEEPSEEK_API_KEY="your_key_here"
```

可选：自定义兼容接口地址。

```powershell
$env:DEEPSEEK_BASE_URL="https://api.deepseek.com"
```

桌面端可以使用 Electron `safeStorage` 保存 API Key。保存位置在 Electron 用户数据目录，不在项目仓库内。

## 桌面端使用

```bash
npm run desktop
```

桌面端能力：

- 每个对话选择工作区。
- 从配置的 API 同步模型列表。
- 支持自动模型和手动模型选择。
- 支持 thinking mode 开关。
- 支持联网开关。
- 支持粘贴或选择附件。
- 支持 Skill 搜索、启用、关闭。
- 工具权限请求以弹窗确认。
- 查看思考、进度、完成文件、工具结果和缓存指标。

## CLI 使用

不调用模型，只预览路由和上下文：

```bash
npm run dev -- context "优化 token 缓存命中率" --no-network
```

运行单次任务：

```bash
npm run dev -- run "读取 README 并总结架构" --trace
```

启动交互式 CLI 对话：

```bash
npm run dev -- chat --trace
```

列出模型：

```bash
npm run dev -- models
```

列出 Skill：

```bash
npm run dev -- skills --search deepseek
```

完整 CLI 文档：[docs/cli.zh-CN.md](docs/cli.zh-CN.md)。

## 中文文档

- [架构说明](docs/architecture.md)
- [设计手册](docs/design-manual.zh-CN.md)
- [算法优化说明](docs/algorithm-upgrades.md)
- [CLI 手册](docs/cli.zh-CN.md)
- [开源手册](docs/open-source-guide.zh-CN.md)
- [路线图和待优化项](docs/roadmap.zh-CN.md)
- [开源状态说明](OPEN_SOURCE_STATUS.zh-CN.md)
- [安全策略](SECURITY.zh-CN.md)
- [贡献指南](CONTRIBUTING.md)

## 验证

```bash
npm run typecheck
npm test
npm run build
```

## 发布前安全检查

开源或推送前不要提交：

- `.env`
- `.agent/usage.jsonl`
- `.agent/run-logs/`
- Electron 桌面端用户设置
- 任何包含 API Key、私有路径、私有代码的截图或日志

建议执行：

```bash
git status --ignored --short
npm audit --omit=dev
```

## 许可证

MIT
