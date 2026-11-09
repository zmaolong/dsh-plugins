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
7. **客户端插件**：`dsh.client` 声明 `platform/inject`，`exports` 暴露 `"./client"` 指向**构建产物** `lib/client.js`（tsdown 产出 CJS 工厂闭包，banner 注入 `window.__ModuleLoader__.load({ id, factory(require){…} })`）；样式一律 CSS Modules（`*.module.css`，构建链编译成 `<style data-plugin-css>` 注入），不得污染全局，主题只消费 `--dsw-alias-*` token。
8. **locale 语言 id 小写**：`en`、`zh`、`zh-cn`（写成 `zh-CN` 会被索引校验拒绝）。
9. **离线测试**：每个改动都要保证 `npm run check`（tsc 双程序）与 `npm test`（vitest）通过；测试不访问网络、不依赖真实宿主。
10. **版本线**：预览 `X.Y.Z-preview.N`（dist-tag `preview`），正式 `X.Y.Z`（dist-tag `latest`）；预览与正式同核心。
11. **禁止整包 `npm unpublish`**：会触发 24 小时冷却且名字裸奔；已发布版本号不可复用。要隐藏版本用 `npm deprecate`。
12. **索引由生成器产出**：不要手改 `index.json` 的版本/来源字段；跑 `node scripts\build-index.mjs`。
13. **展示元数据双写**：官方读取 `locale/*.json` 的 `meta.title/description`（另有 `package.json.icon`）；本仓库生成器读取 `package.json` 的 `dsh.market`。两处必须保持一致，改一处就要同步另一处。
14. **构建产物入库**：git 源安装直接取仓库文件，`lib/` 是 tsdown 构建产物且**必须提交**；源码在 `src/`（服务端 `*.ts` + 客户端 `client/*.tsx`），改完源码必须 `npm run build` 再提交。

## 修改原则（每次改动前先读）

- **简洁与官方风格优先**：每次修改以「代码更简洁、更贴近官方风格」为首要目标；风格基准是 deepseek-harness 官方实现（`packages/client/ui-*` 包、`ui-primitives`、`docs/web-styling.md`、`cordis-plugin-development` skill 模板），拿不准就先对照官方再动手。
- **允许破坏性重构**：预览期不为旧形态保留兼容层、死代码或注释掉的历史实现；重构直接删除，并同步更新测试与文档。
- **数据自动迁移**：凡改动涉及用户磁盘数据（`state.json` / `marketplaces.json` / 安装 cache 等格式），必须随包提供自动迁移（沿用/扩展包内 migrate 机制），用户更新后自动完成；不得要求手工步骤，不得静默丢弃数据。

## 工作流程

1. 读 [`docs/PLUGIN-DEV.md`](docs/PLUGIN-DEV.md) 与 [`README.md`](README.md)；
2. 改代码（TypeScript + JSX + CSS Modules；保持零运行时依赖，工具链全在 devDependencies）；
3. 在包目录跑 `npm run check && npm test && npm run build`（tsc 双程序 + vitest 离线 + tsdown 产物）；
4. **真实宿主自测（必做，见下方「调试交接」）**：离线全绿 ≠ 宿主可用——凡改了客户端 slots、宿主契约或 UI 的改动，先装进 `zdebug` 用浏览器实测通过再继续；
5. 若涉及包版本/展示元数据：`node scripts\build-index.mjs`；
6. `git commit`（**禁止添加 Co-Authored-By 类作者信息**；`lib/` 产物与源码同提交）；
7. `git push origin release-0.0.1`；
8. 涉及 npm 发布时按 §8 执行，并 `npm view <pkg> versions dist-tags` 验证。

## 调试交接（开发完成后、交付验收前，Agent 必做）

插件不能脱离 DSH 宿主单独调试。**离线测试全绿 ≠ 宿主可用**（测试桩可能偏离宿主契约；实测教训：slots 注入 hook 的 selector 必填、inject 面成员逐个到 props，都只在真实宿主才炸）。开发完成后先按下流程**自测通过**，再向用户交付验收：

1. 质量门与构建：`npm run check && npm test && npm run build`（下面的脚本会自动跑）；
2. 装进调试 profile 并启动，默认 `zdebug`：首次按官方 `web` 模板创建（装依赖较慢，可能超 10 分钟），浏览器调试与宿主终端日志都可用：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-debug.ps1 packages\dsh-agent-extension
   ```

   装进桌面真实环境（只安装、不启动，随后刷新页面或关/开插件）：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-debug.ps1 packages\dsh-agent-extension -Profile desktop -NoBoot
   ```

3. **浏览器实测（playwright-cli）**：打开脚本打印的入口 URL 后依次——
   - `console error` 必须为 0；有报错先修再继续；
   - 逐视图驱动：侧栏入口 → 各视图/弹窗/开关，用 `snapshot`/`find` 断言用户可见行为，`screenshot` 核对渲染；
   - 用 curl 打插件 API（如 `/agent-plugin/api/store`）复核数据与版本；
   - **不要被无关 404 迷惑**：如 `/plugins/<pkg>/client.js` 404 只是路径猜错，client bundle 由宿主 manifest 体系下发，页面正常即没问题。
4. 交接信息必须包含：包路径、profile、浏览器入口 URL、宿主日志路径、本次改动点，以及停止调试宿主的 `taskkill /PID …` 命令；调试宿主可留给用户复验，桌面环境由用户自己装；
5. **不要手改 `~/.dsh/profiles/**`**：安装只走脚本、`dsh plugin` 或应用内插件页；
6. 脚本使用桌面安装自带的 CLI（`resources\runtime\cli\bin\dsh.cmd`，允许管理 `desktop` profile；普通 `dsh` 会拒绝）。link 安装要创建 junction，**DSH 沙箱内的 shell 会被拒绝**（EPERM），请在 ZCode 等普通终端里运行。

## 常用命令

```powershell
cd packages\dsh-agent-extension
npm run check        # tsc --noEmit（node + client 双 tsconfig）
npm test             # vitest run（离线）
npm run build        # tsdown：lib/index.js（ESM 宿主半）+ lib/client.js（CJS 浏览器半）

cd F:\workspace\dsh-plugins
node scripts\build-index.mjs            # 生成 index.json
node scripts\serve-index.mjs            # 本地起索引服务（http://127.0.0.1:8231/index.json）
```

## 仓库现状（以文件为准）

- 插件包：`packages/` 下多个组合包，版本以各自 `package.json` 为准：
  - `dsh-agent-extension`（智能体扩展：管理智能体插件、技能、MCP 等扩展，官方化工具链形态：TypeScript + JSX + CSS Modules + tsdown + vitest）；
  - `dsh-remote-ctrl`（局域网访问网关：自起 HTTP 服务反代完整 webUI + 桌面面板，同一工具链双产物）；
- 发布分支：`release-0.0.1`（市场索引从该分支的 `index.json` 读取）；
- 索引源：Git（`DSH_PLUGINS_SOURCE` 可切 npm）；
- 发布线：`0.0.1-preview.N`（`preview`）→ 正式 `0.0.1`（`latest`）。

## 沟通与提交约定

- 提交信息用中文、一句话说清「做了什么」；
- 不覆盖他人未提交改动；不改 `.git` 历史；
- 改动完成即 commit + push（推 `release-0.0.1`）。