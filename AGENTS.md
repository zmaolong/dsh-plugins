# AGENTS.md

> 本文件面向所有在本仓库工作的 AI Agent / Harness（Claude Code、CodeBuddy、ZCode、Cursor、Codex 等），是**唯一入口**：不再维护 `CLAUDE.md` 等副本，各 Harness 直接读本文件。
> **开工前必读**：DSH 插件开发规范 [`docs/PLUGIN-DEV.md`](docs/PLUGIN-DEV.md)（权威）；仓库结构与市场索引格式见 [`README.md`](README.md)。

## 权威资料与知识来源

- **官方（冲突时以官方为准）**：
  - 仓库 https://github.com/deepseek-ai/deepseek-harness
  - 文档站 https://deepseek-harness.github.io/deepseek-harness/
  - 关键文档：`docs/architecture.md`、`docs/development.md`、`docs/cordis-primer.md`、`docs/cookbook/adding-a-package.md`（插件展示元数据）、`docs/user/guide/plugin-market.zh.md`（**索引 format 1 权威规范**）、`docs/testing.md`、`docs/web-styling.md`
- **来源分级**：`docs/PLUGIN-DEV.md` 中每条规则标注了 🟢 官方 / 🟡 本机实测 / 🟠 经验推断。改代码前先看该条目的等级与 §0 时效声明。
- **提示词与文档的关系**：规则来自官方文档 + 本机实测（安装/发布/报错/profile 结构），**不是**来自某个提示词；提示词只给需求与约束。`docs/PLUGIN-DEV.md` §0.2 记录了完整证据链。
- **版本时效**：DSH 是 developer preview，官方明确会有兼容性破坏性变更；🟡/🟠 条目在宿主升级后必须复核（复核方法见 `docs/PLUGIN-DEV.md` §10）。
- **官方仓库 `AGENTS.md` 的约束只适用于给官方仓库贡献包**，不适用于本仓库的第三方插件包（包名、tsconfig、pnpm 门禁等）。

## 硬性规则（违反会导致插件装不上、跑不起来或发不出去）

1. **组合包**：插件的 `package.json` 必须有 `dsh.bundle.patch` 指向本包 `cordis.patch.yml`，否则安装报 `not-a-bundle`。
2. **行名对齐**：`cordis.patch.yml` 里 `insert[].name` 必须是能被解析的模块名，通常等于 `package.json` 的 `name`。
3. **索引名对齐**：`index.json` 条目的 `name` 必须等于对应 `package.json` 的 `name`。
4. **禁止 `import '@deepseek-ai/*'`**：profile 的 `autoInstallPeers: false`，peer 不会安装；宿主能力一律走 `ctx.*`，确需助手函数就写进 `dependencies` 并与宿主版本对齐。
5. **不写多余的 `engines.dsh`**：写了会严格校验，版本不匹配直接拒装。
6. **服务就绪**：`skills` / `webServer` / `subprocess` 可能晚到，用 `ctx.inject([...], cb)` 延迟注册；清理用 `ctx.effect(() => () => …)`。
7. **客户端插件**：`dsh.client` 声明 `platform/inject`，`exports` 暴露 `"./client"`，入口用 `window.__ModuleLoader__.load({ id, factory(require) { … } })`；样式不得污染全局，主题走宿主 CSS 变量。
8. **locale 语言 id 小写**：`en`、`zh`、`zh-cn`（写成 `zh-CN` 会被索引校验拒绝）。
9. **离线测试**：每个改动都要保证 `npm run check` 与 `npm test` 通过；测试不访问网络、不依赖真实宿主。
10. **版本线**：预览 `X.Y.Z-preview.N`（dist-tag `preview`），正式 `X.Y.Z`（dist-tag `latest`）；预览与正式同核心。
11. **禁止整包 `npm unpublish`**：会触发 24 小时冷却且名字裸奔；已发布版本号不可复用。要隐藏版本用 `npm deprecate`。
12. **索引由生成器产出**：不要手改 `index.json` 的版本/来源字段；跑 `node scripts\build-index.mjs`。
13. **展示元数据双写**：官方读取 `locale/*.json` 的 `meta.title/description`（另有 `package.json.icon`）；本仓库生成器读取 `package.json` 的 `dsh.market`。两处必须保持一致，改一处就要同步另一处。

## 工作流程

1. 读 [`docs/PLUGIN-DEV.md`](docs/PLUGIN-DEV.md) 与 [`README.md`](README.md)；
2. 改代码（保持零运行时依赖、无构建链优先）；
3. 在包目录跑 `npm run check && npm test`；
4. 若涉及包版本/展示元数据：`node scripts\build-index.mjs`；
5. `git commit`（**禁止添加 Co-Authored-By 类作者信息**）；
6. `git push origin release-0.0.1`；
7. 涉及 npm 发布时按 §8 执行，并 `npm view <pkg> versions dist-tags` 验证。

## 常用命令

```powershell
cd packages\dsh-agent-plugin-hub
npm run check        # node --check 全部源文件
npm test             # node --test（离线）

cd E:\workspace\dsh-plugins
node scripts\build-index.mjs            # 生成 index.json
node scripts\serve-index.mjs            # 本地起索引服务（http://127.0.0.1:8231/index.json）
```

## 仓库现状（以文件为准）

- 插件包：`packages/dsh-agent-plugin-hub`，版本见其 `package.json`；
- 发布分支：`release-0.0.1`（市场索引从该分支的 `index.json` 读取）；
- 索引源：Git（`DSH_PLUGINS_SOURCE` 可切 npm）；
- 发布线：`0.0.1-preview.N`（`preview`）→ 正式 `0.0.1`（`latest`）。

## 沟通与提交约定

- 提交信息用中文、一句话说清「做了什么」；
- 不覆盖他人未提交改动；不改 `.git` 历史；
- 改动完成即 commit + push（推 `release-0.0.1`）。