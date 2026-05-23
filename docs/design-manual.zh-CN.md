# 设计手册

## 产品方向

DeepSeek Agent Runtime 是一个本地优先的 Agent Harness，面向代码开发、项目分析和本地操作。它的设计重点不是做普通聊天机器人，而是做一个可以长期扩展的 Agent Runtime：低 token、稳定前缀、高缓存复用、精准工具调用、明确权限边界。

桌面端是主入口，CLI 是自动化、调试和集成入口。两者共享同一套核心运行时。

## 运行时分层

1. CLI 或桌面 UI 收集任务、工作区、模型偏好、附件、权限模式、联网模式和 Skill 开关。
2. `AlgorithmOptimizer` 判断任务类型、领域、复杂度、风险和上下文策略。
3. `ModelRouter` 选择模型、thinking mode、输出格式和输出 token 预算。
4. `ToolRegistry` 只注入当前任务需要的工具 schema。
5. `ContextManager` 构建缓存友好的 prompt，把可复用上下文放在波动任务数据之前。
6. `AgentOrchestrator` 执行模型、工具、观察、继续推理、最终回答的 Agent Loop。
7. `PermissionManager` 在工具执行前做风险分级和权限确认。
8. `CostPrecisionEngine` 记录 token、缓存命中、成本和最终回答自检。

## Prompt 结构

系统消息放稳定规则：

- 运行时规则
- 安全规则
- 工具协议
- 输出规范

用户消息分两段：

- 可复用前缀：项目规则、确定性项目摘要。
- 波动尾部：当前任务、执行策略、历史摘要、附件、文件片段、git 状态、命令输出和诊断信息。

日常聊天可以走极简系统前缀。这样即使首次请求真实命中率为 0，也能减少冷启动 miss tokens。

## 上下文选择

当前 MVP 使用：

- 文件路径打分
- 任务关键词匹配
- agent/cache/tool/UI/skill 等领域加权
- 聚焦片段，而不是整文件塞入上下文
- 附件截断
- 自动压缩和预算裁剪
- 确定性项目摘要，用于可复用前缀

后续应该补：

- AST 符号图
- import/dependency 追踪
- BM25 检索
- embedding 检索
- 测试失败到源码位置映射

## 工具选择

工具 schema 本身也是 prompt token。简单聊天和只打开文件/网页的任务不应该注入读文件、搜索、shell 等无关 schema。

默认策略：

- 简单聊天：不注入工具。
- 打开 URL、文件、应用：只注入 `desktop_open`。
- 检查和代码分析：注入 `search_text`、`read_file`。
- 修改和重构：注入 `apply_patch`、`git_diff`，并带上读/搜工具。
- shell 和 debug：在权限检查后使用 `run_shell`。
- MCP：当前是占位，后续需要沙箱和信任策略。

## 权限模型

风险等级：

- safe：只读或无外部副作用。
- low：非破坏性本地操作。
- medium：写文件或执行命令。
- high：大范围修改或敏感操作。
- forbidden：递归删除、reset 等破坏性命令。

权限管理必须独立于模型输出。模型可以请求工具，但是否执行由策略决定。

## 缓存设计哲学

目标是真实降低 token 成本，不是靠无意义 padding 刷命中率。

99.1% warm-cache 命中率只在以下条件同时满足时才现实：

- 使用同一个模型。
- 稳定前缀已经在远端预热。
- 可复用前缀足够大。
- 波动尾部极小。
- 工具 schema 和 Skill 正文稳定或被省略。

新前缀的首次请求无法命中远端缓存。正确做法是减少首轮 miss tokens，并保持后续前缀稳定。
