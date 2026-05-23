# 安全策略

## 支持状态

本项目目前是 alpha 软件。在权限控制、沙箱和安装包加固完成前，建议只在可恢复、已备份或实验性工作区中使用。

## 漏洞报告

请使用 GitHub Security Advisories，或提交不包含利用细节的最小 issue。不要在 issue 中包含 API Key、私有路径、私有仓库内容或敏感日志。

## 本地安全模型

- 读取默认允许。
- 写文件和 shell 命令由权限策略控制。
- 破坏性 shell 命令由策略禁止。
- 通过桌面端联网设置可以关闭 URL 打开和联网工具。
- 桌面端保存的 API Key 使用 Electron `safeStorage`，并存放在仓库外部。

## 已知安全缺口

- MCP 目前是占位实现，真实执行前需要沙箱和信任模型。
- 子智能体尚未做隔离。
- shell allow/deny 规则需要覆盖更多 Windows、macOS、Linux 场景。
- 桌面安装包尚未签名。
- 尚未进行外部安全审计。

## 密钥卫生

永远不要提交：

- `.env` 或 `.env.*`，`.env.example` 除外。
- `.agent/usage.jsonl`
- `.agent/run-logs/`
- Electron 用户数据目录中的桌面端设置
- 包含 API Key、私有路径、私有代码的截图或日志

## 依赖安全

建议定期执行：

```bash
npm audit --omit=dev
npm audit
```

## 贡献者安全要求

- 不要把模型输出当作权限决策依据。
- shell 命令应使用参数数组，避免字符串拼接执行。
- 外部 Skill 和 MCP 结果都按不可信输入处理。
- 错误信息和日志不得包含原始 API Key。
