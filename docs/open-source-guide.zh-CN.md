# 开源手册

## 仓库应该包含什么

应该提交：

- `src/`
- `tests/`
- `scripts/`
- `docs/`
- `.agent/config.json`
- `.agent/rules.md`
- `.agent/skills/**/SKILL.md`
- package 文件和 TypeScript 配置
- 开源治理文件

不应该提交：

- `node_modules/`
- `dist/`
- `.env` 或真实 API Key
- `.agent/usage.jsonl`
- `.agent/run-logs/`
- Electron 桌面端用户设置
- 临时测试文件

## 推送前检查

```bash
npm run typecheck
npm test
npm run build
git status --ignored --short
```

推送前必须做敏感信息扫描。变量名如 `apiKey` 命中是正常的，真实密钥值命中不是正常的。

## GitHub 创建流程

使用 GitHub CLI：

```bash
gh auth status
git init -b main
git add .
git commit -m "Initial open-source release"
gh repo create deepseek-agent-runtime --public --source . --remote origin --push
```

如果远程仓库已经存在：

```bash
git remote add origin https://github.com/qqemail0/deepseek-agent-runtime.git
git push -u origin main
```

## Release Checklist

1. 更新 `OPEN_SOURCE_STATUS.md` 和 `OPEN_SOURCE_STATUS.zh-CN.md`。
2. 更新 `docs/roadmap.md` 和 `docs/roadmap.zh-CN.md`。
3. 执行完整验证。
4. 执行敏感信息扫描。
5. 打 tag。
6. 写 release notes，说明破坏性变更、缓存行为和已知缺口。

## 开源沟通原则

- 明确标注 alpha 状态。
- 不承诺首次请求命中率。
- 不把 99.1% 描述成通用保证。
- 把“能做什么”和“不能做什么”写清楚。
- 用 issue 跟踪功能缺口，而不是在 README 里隐藏问题。
