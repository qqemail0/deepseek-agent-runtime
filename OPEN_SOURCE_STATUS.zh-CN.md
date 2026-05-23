# 开源状态说明

DeepSeek Agent Runtime 是 alpha 阶段的本地 AI Agent Harness。它适合用于实验 DeepSeek prompt caching、工具调用、Skills、权限控制和桌面端工作流，但还不是成熟的 Codex、Claude Code 或 OpenCode 替代品。

## 已经可用

- 基于 OpenAI SDK 的 DeepSeek 兼容 Provider。
- CLI 和 Electron 桌面端。
- Agent Loop：模型调用、工具调用、观察结果和最终综合。
- 工具注册中心：文件读取、搜索、shell、patch、git status/diff、desktop open。
- 权限管理：ask、allow、deny、full access。
- Skill 发现、搜索、启用/关闭和按需加载正文。
- 上下文压缩和预算诊断。
- DeepSeek 缓存指标：`prompt_cache_hit_tokens` 和 `prompt_cache_miss_tokens`。
- 单次请求和当前对话的 token/cache 汇总。

## 重要限制：首次请求命中率

新稳定前缀的首次请求通常真实命中率为 0%。这是正常现象，因为远端 provider 还没有见过这个精确前缀。

Runtime 能做的是减少首次请求成本：

- 保持 prompt 短。
- 避免不必要的工具 schema。
- 高置信度直接操作跳过模型。
- 日常聊天使用极简前缀。

它不能在 provider 还没缓存某个前缀之前凭空制造命中 token。

## 需要改进

- 增强电脑控制能力，不只打开 URL、文件和应用。
- MCP 执行需要沙箱和信任策略。
- 子智能体需要隔离上下文预算。
- 长对话记忆和摘要质量还需要提升。
- 上下文选择需要 AST/import graph 和 BM25 + embedding。
- DeepSeek 模型能力和价格需要自动更新。
- 桌面端需要签名安装包、自动更新和崩溃报告。
- Windows 路径处理和跨平台 shell 策略需要继续强化。
- UI 需要截图回归测试。
- 需要公开 demo 仓库和非敏感示例工作流。

## 发布准备状态

开源前应完成：

- `npm run typecheck`
- `npm test`
- `npm run build`
- 真实密钥和宿主机路径扫描
- `git status --ignored --short` 人工复核
