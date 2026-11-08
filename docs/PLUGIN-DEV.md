# DSH 插件开发规范

> **读者**：本仓库的开发者，以及任何在本仓库工作的 AI Agent / Harness（Claude Code、CodeBuddy、ZCode、Cursor、Codex 等）。
> **目标**：读完本文即可写出「能安装、能运行、能发布、能进市场索引」的 DSH 插件。
> **参考实现**：[`packages/dsh-agent-plugin-hub`](../packages/dsh-agent-plugin-hub)（真实可用、离线测试）。

---

## 0. 知识来源、权威性与时效

### 0.1 官方资料（权威）

DSH 是开源项目，官方资料优先级最高：

| 资料 | 链接 | 内容 |
|---|---|---|
| 官方仓库 | https://github.com/deepseek-ai/deepseek-harness | 源码、文档、示例（MIT） |
| 官方文档站 | https://deepseek-harness.github.io/deepseek-harness/ | 文档站（由仓库 `docs/` 投影生成） |
| 架构与插件模型 | https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md | 「一切皆插件」、cordis 上下文、capability seam |
| cordis 入门/教程 | https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md<br>https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/cordis-tutorial | 插件 `name/inject/apply`、waterfall、loader 配置 |
| 开发指南 | https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md | 构建、类型检查、校验命令 |
| 新增包 / 插件展示元数据 | https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-package.md | 包结构、`locale/*.json` 的 `meta.title/description/detail`、`icon`、`exports`、`files` |
| 扩展点 cookbook | https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md | 如何落到官方扩展点而不是改主循环 |
| 官方 bundle 详情预览图 | https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-plugin-preview.md | `docs/preview*.svg` 规范（第三方可选） |
| **插件索引（format 1）权威规范** | https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/plugin-market.zh.md | 「发现」页、索引字段、图标规则、推荐版本选择、生成器 |
| 官方仓库 Agent 约定 | https://github.com/deepseek-ai/deepseek-harness/blob/master/AGENTS.md | 官方仓库贡献规则（**不是**第三方插件的运行时要求，见 §0.4） |

> 官方 README 明确声明：DSH 处于 **developer preview**，会有兼容性破坏性变更（`THERE WILL BE COMPATIBILITY-BREAKING CHANGES`）。官方 `AGENTS.md` 也写明公共 API 是 pre-stable。因此本文档中的「实测」「推断」条目需要随宿主版本复核。

### 0.2 本文档怎么来的（哪些提示词、哪些证据）

**提示词只给了目标和约束，不提供技术规则。** 具体规则来自下列证据，按可靠性排序：

| 等级 | 来源 | 说明 |
|---|---|---|
| 🟢 官方 | 官方仓库文档、`@deepseek-ai/dsh*` 包元数据、DSH 运行时行为 | 可直接引用；链接见 §0.1 |
| 🟡 实测 | 本机真实安装/发布/报错、profile 文件、宿主日志 | 已验证，但随版本可能变化 |
| 🟠 推断 | 社区插件实践、经验外推、本仓库约定 | 换宿主版本前必须复核 |

具体证据清单：

1. **用户提示词**（需求方约束，非技术规则）：多插件聚合仓库、自建索引、npm 占名与 `0.0.1-preview.N` 预览线、首个正式版 `0.0.1`、中性文案、要求把规范文档化。
2. **本仓库既有资料**：`README.md`、`HANDOFF.md`、`packages/dsh-agent-plugin-hub/README.md`、`packages/dsh-agent-plugin-hub/docs/HOST-API.md`。
3. **DSH 运行时上下文（系统注入）**：实现 checkout 路径、GUI URL、workspace 路径、文件沙箱策略；`plugin_manager` 工具描述（安装/卸载/开关能力）。
4. **本机 DSH 安装**：`D:\Program Files\dsh`（`app.asar`、`app.asar.unpacked`、`resources/runtime`）、`~/.dsh/profiles/<profile>/`（`package.json` 的 `dsh.profile.bundles`、`cordis.patch.yml`、`.plugin-manager` 日志、pnpm 日志）。
5. **官方仓库与文档站**（§0.1 全部链接）。
6. **npm registry 元数据**：`@deepseek-ai/dsh` 的 `dist-tags`（写作时 `latest: 0.2.2-rc.1`）、官方包 `peerDependencies` 形态、社区插件（如 `dsh-better-sidebar`）的 `dsh` 字段与 peer 依赖。
7. **实测记录**：本地安装（`dsh plugin --profile web add <路径>`）、npm 发布（`0.0.1-preview.0` 真实发布与安装验证）、索引生成与校验报错、`not-a-bundle` / `Cannot find module` / npm 403 等真实错误信息。

> 结论：本文档中**标 🟢 的条目有官方出处**；标 🟡 的条目是本机验证过的事实；标 🟠 的条目是经验约定。**没有任何一条规则来自某个"隐藏提示词"**——提示词只规定了要做什么，怎么做来自上述证据。

### 0.3 冲突处理顺序

1. 官方 docs / 官方源码（🟢）说了算；
2. 官方未写、但本机实测（🟡）能复现的，按实测；
3. 两者都没有时，按本文档的 🟠 约定，并在改动前用 §10 的方法验证。

### 0.4 官方仓库约定 ≠ 第三方插件要求

官方 `AGENTS.md` 里的若干硬约束只适用于**给官方仓库贡献包**（包名 `@deepseek-ai/dsh-<name>`、`private: true`、tsconfig 聚合、pnpm 门禁、`src/*.ts`、TypeScript 全量类型等）。
**第三方 npm 插件（本仓库的产物）不必满足这些**，只需满足本文档 §2–§5 的运行时契约与 §9 的索引契约。

---

## 1. 术语

| 术语 | 含义 |
|---|---|
| DSH | DeepSeek Harness，宿主程序（桌面端 Electron / CLI 两种形态） |
| DSH 插件 | 基于 cordis 的组合包（bundle），装进 DSH 插件树，入口是 `apply(ctx, config)`；**本仓库发布的就是它** |
| Agent 插件 / 智能体插件 | Claude Code / CodeBuddy / ZCode 的资产包（`plugin.json` + `skills/` + `commands/` + `hooks/` + `mcpServers`），**不是** DSH 插件 |
| 组合包 bundle | `package.json` 里声明 `dsh.bundle.patch` 的 npm 包 🟡 |
| profile | DSH 的插件组合层（`web` / `desktop`），`desktop` 由 Electron 应用独占 🟡 |
| 插件索引 | 「发现」页的数据源 JSON（format 1）🟢 见 §9 |

---

## 2. 最小可安装骨架

### 2.1 文件树

```text
packages/my-dsh-plugin/
├── package.json          # 声明 bundle、exports、files、dsh 字段
├── cordis.patch.yml      # 向 profile 组合层 insert 本插件的行
├── README.md
├── icon.svg              # 可选：卡片/详情图标（top-level "icon" 或 exports "./icon"）🟢
├── locale/en.json        # 插件展示元数据：meta.title / meta.description（可选 meta.detail）🟢
├── locale/zh.json
├── lib/index.js          # 宿主端入口（apply）
└── client.js             # 可选，Web 客户端入口
```

### 2.2 package.json 模板

```json
{
  "name": "my-dsh-plugin",
  "version": "0.0.1-preview.0",
  "description": "一句话说明插件做什么",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./client.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg",
    "./package.json": "./package.json"
  },
  "icon": "./icon.svg",
  "files": [
    "lib",
    "client.js",
    "cordis.patch.yml",
    "locale/*.json",
    "icon.svg",
    "README.md",
    "package.json"
  ],
  "engines": { "node": ">=20" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": ["@deepseek-ai/dsh-client-locale"]
    }
  }
}
```

- **没有客户端 UI** 时：删掉 `dsh.client`、`client.js`、`exports["./client"]` 与 `files` 里的 `client.js`；
- `icon` 与 `locale/*.json` 的 `meta.title/description` 是**官方**展示元数据来源（🟢，见 §0.1 `adding-a-package.md`）；
- `engines.dsh` 官方支持但**不要随便写**：写了会被严格校验（🟡），不确定就省略；
- 本仓库另用 `package.json` 里的 `dsh.market` 作为 **`scripts/build-index.mjs` 的输入约定**（🟠 本仓库自定义，DSH 运行时不读它）。

### 2.3 cordis.patch.yml 模板

```yaml
# 向 profile 组合层 insert 本插件的行
- insert:
    - id: my-dsh-plugin        # 行 id：全局唯一且稳定，用于配置覆盖/禁用
      name: 'my-dsh-plugin'    # 必须是能被解析的模块名，通常 = package.json 的 name
      config:
        home: ''
```

### 2.4 lib/index.js 模板（宿主端）

```js
/** Cordis 插件名：日志与加载器识别用。 */
export const name = 'my-dsh-plugin'

/** 硬依赖：这些服务就绪后才 apply；可选服务用 ctx.inject 延迟。 */
export const inject = ['commands']

/**
 * 插件入口。
 * @param {object} ctx - 宿主上下文
 * @param {object} config - cordis.patch.yml 里 insert[].config
 */
export function apply(ctx, config = {}) {
  // 注册命令、路由、技能 provider…
  ctx.commands?.register?.(/* ... */)

  // 清理钩子：宿主卸载/重载时回收资源
  ctx.effect?.(() => () => {
    /* dispose */
  })
}
```

### 2.5 装不上的三个硬条件 🟡（均为实测复现）

1. **必须是组合包**：`package.json` 有 `dsh.bundle.patch` 指向本包的 `cordis.patch.yml`，否则报 `not-a-bundle`；
2. **patch 行的 `name` 必须能解析**（通常就是包名），否则启动时报 `Cannot find module`；
3. **索引条目 `name` 必须等于该包 `package.json` 的 `name`**（Git 源时是子目录里那个 `package.json`），否则安装状态对不上。

---

## 3. 宿主端契约

### 3.1 入口导出 🟢（cordis 模型，见 §0.1 cordis-primer/tutorial）

- `export const name`：cordis 行名，建议用短横线包名；
- `export const inject`：硬依赖服务名数组（如 `['commands']`）；
- `export function apply(ctx, config)`：**同步**注册，不要阻塞；返回导出对象可能被宿主忽略；
- 启动异常要自己 try/catch 并写日志，**不要抛到宿主**导致整机加载失败。

### 3.2 服务就绪与延迟注册 🟡

DSH 按「服务可用性」驱动插件激活：`commands` 通常最先就绪，`skills` / `webServer` / `subprocess` 可能晚到。
`ctx.get()` 在服务未就绪时拿不到值，正确做法：

```js
function defer(ctx, deps, callback) {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(deps, (scope) => {
    try { callback(scope) } catch { /* 记录日志 */ }
  })
}

defer(ctx, ['skills'], (scope) => {
  scope.skills.registerProvider(/* ... */)
})
```

### 3.3 清理与生命周期 🟢/🟡

- 用 `ctx.effect(() => () => dispose())` 注册清理（官方规则：注册即 effect）；
- 文件/进程/定时器/HTTP 路由都要能被清理；
- 宿主重启后插件状态应能从磁盘恢复（不要把唯一状态放内存）。

### 3.4 配置

`cordis.patch.yml` 的 `insert[].config` 会作为 `apply` 的第二个参数传入。配置要有默认值，缺字段不崩。

### 3.5 禁止事项

- **不要 `import` 任何 `@deepseek-ai/*`**（🟡 本机验证：profile 的 `pnpm-workspace.yaml` 是 `autoInstallPeers: false`，peer 依赖不会安装，import 会在宿主里解析失败）。需要 `defineTool` 之类助手时，把它写进 `dependencies` 并和宿主版本对齐；能通过 `ctx` 拿到的能力优先用 `ctx`；
- 不要在模块顶层做耗时/带副作用的初始化；
- 不要写死宿主内部路径，用 `ctx` 提供的接口或环境变量。

---

## 4. 客户端插件（Web UI）

### 4.1 声明 🟢/🟡

`dsh.client` 声明浏览器端入口与需要注入的宿主模块：

```json
"dsh": {
  "client": {
    "platform": "web",
    "immediately": true,
    "inject": ["@deepseek-ai/dsh-client-locale"]
  }
}
```

- `inject` 里列的是宿主提供的客户端模块名（`require` 时可用）；不使用的不要列；
- 官方仓库的 client 包用 tsdown 共享 preset 构建（🟢 官方约定）；**本仓库同样采用 TypeScript + tsdown 构建链**（🟡 本仓库 0.1.0 起的形态，见 §4.2）：源码写在 `src/client/`（TSX + CSS Modules），`npm run build` 产出 `lib/client.js`。纯 ESM 手写单文件仍是官方允许的替代路径，但不再被本仓库采用。

### 4.2 入口与模块加载 🟡

源码入口 `src/client/index.ts` 导出 `apply(ctx)`；**浏览器产物 `lib/client.js` 由 tsdown 生成**：CJS 工厂闭包，banner/footer 注入 `window.__ModuleLoader__.load({ id, factory(require){…} })`，`react` 等基线模块走 loader 的 `require`（external），CSS Modules 编译为 `<style data-plugin-css>` 注入并导出哈希类名表。构建行为对齐官方 `packages/client/tsdown.client.ts` 预设（本仓库自研配置 `tsdown.config.ts`，不 import 官方内部包）。

等价的手写形态（理解产物用，本仓库不再手写）：

```js
window.__ModuleLoader__.load({
  id: 'my-dsh-plugin',            // 建议 = 包名
  factory(require) {
    const React = require('react') // 宿主提供

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // 注册 UI、locale、清理逻辑
      },
    }
  },
})
```

### 4.3 槽位注册（真实示例）🟡

```js
// 左侧栏入口
ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
  name: 'sidebar.panellist',
  id: 'my-plugin',
  order: 5,
  label: () => '我的插件',
  locale: 'myPlugin',
}, (props) => h(Icon, { size: props?.size, active: props?.active })))

// 中央主面板：key 与左侧栏入口 id 相同
ctx.slots.inject('main', () => ctx.slots.register({
  name: 'main',
  key: 'my-plugin',
  locale: 'myPlugin',
}, () => h(Panel, { /* ... */ })))

// 框架级浮层（弹窗/Toast，可避免被面板裁剪）
ctx.slots.inject('shell.overlay', () => ctx.slots.register({
  name: 'shell.overlay',
  id: 'my-plugin-overlay',
  order: 60,
  label: () => '我的插件',
  locale: 'myPlugin',
}, () => h(OverlayHost, { /* ... */ })))
```

常用槽位：`sidebar.panellist`、`main`、`shell.overlay`。`order` 用于排序（本仓库约定：插件 0 / 智能体插件 5 / 自动化任务 10 / 上下文洞察 20，🟡 实机顺序）。

### 4.4 数据面与安全

- 客户端不直连外部服务；数据由**宿主端 HTTP 路由**提供，浏览器 `fetch` 前缀地址；
- 路由挂载用 `ctx.webServer`（可能晚到，用 `ctx.inject(['webServer'], …)`）；
- 默认只允许本机回环访问；写操作要校验同源 `Origin` 与 JSON body，并拒绝浏览器声明的 `sec-fetch-site: cross-site`，防止跨站触发（🟡 本仓库实现验证）；
- 路由前缀自定义（如 `/my-plugin/api`），不要占用别人的前缀。

### 4.5 主题与样式 🟢/🟡

- 组件样式一律 **CSS Modules**（`*.module.css` 与组件同目录），构建链编译并注入 `<style data-plugin-css>`；**避免全局选择器**污染宿主 UI；
- 只消费宿主 `--dsw-alias-*` 语义 token，不自带调色板、不写主题选择器（暗色由 token 自动切换）；
- 官方样式规范见 `docs/web-styling.md`（§0.1），本仓库实测要点：`:hover` 包 `@media (hover: hover)`；弹窗遮罩不加 blur；elevated 面 `border:0` + `--dsw-elevation-*` 阴影；中性边框 0.5px hairline；**全圆形状（999px/50%）必须配 `corner-shape: round`** 退出宿主全局 superellipse；
- 图标、颜色等展示元数据放 `locale/`，不要写死在中英文文案里。

### 4.6 locale 🟢

```ts
// src/client/index.ts — 一次注册全语言（键集一致），由 ctx.effect 管生命周期
ctx.effect(() => ctx.locale.register('myPlugin', { zh, en, ja, es, fr, de, ru, pt }), 'my-plugin: dictionaries')
```

语言 id 必须**小写**：`en`、`zh`、`zh-cn`（官方索引规范同此要求）；词典补齐官方 8 语言（zh/en/ja/es/fr/de/ru/pt）。

### 4.7 热更新 🟡

- `cordis.patch.yml` 改动约 1 秒热重载；
- 宿主端 `lib/*` 改动一般需重启宿主（桌面端重启应用，CLI 重启 `dsh`）；改源码后先 `npm run build`；
- 客户端 `lib/client.js` 重新构建后刷新页面即可（开发时可用 HMR）。

---

## 5. 宿主能力清单（通过 ctx 获取）🟡

| 能力 | 典型用法 | 说明 |
|---|---|---|
| commands | `ctx.commands.register(...)` | 注册 `/命令`；命令处理器只能返回文本 |
| skills | `ctx.skills.registerProvider(...)` | 注册技能目录（SKILL.md 扫描） |
| webServer | `ctx.webServer` | 注册本机 HTTP 路由，做 UI 数据面 |
| subprocess | `ctx.subprocess` | 执行外部命令（hooks 等），超时/中止受宿主管理 |
| 事件 | `ctx.on('tools/pre-execute', …)` 等 | PreToolUse / PostToolUse / Stop / SessionStart / SessionEnd 等，见 `docs/HOST-API.md` |
| effect | `ctx.effect(() => () => cleanup)` | 生命周期清理 |
| inject | `ctx.inject(deps, cb)` | 等待服务就绪 |

更细的接口形状、路由约定与降级矩阵见参考实现内的 [`docs/HOST-API.md`](../packages/dsh-agent-plugin-hub/docs/HOST-API.md)（🟡 本机侦察结论）。

---

## 6. 安装与调试 🟡

**开发期安装（web profile）**：

```powershell
dsh plugin --profile web add E:\path\to\packages\my-dsh-plugin
dsh --profile web
```

**桌面端**：设置 → 插件 → 安装，填包名或安装 spec；本地目录用绝对路径。
注意：普通 `dsh` CLI 会拒绝 `desktop` profile（`profile "desktop" is managed exclusively by the Electron application`）；桌面安装自带的 `resources\runtime\cli\bin\dsh.cmd` 例外，它允许管理该 profile（🟡 读 `dsh-desktop-host/lib/cli.js` 的 `manageDesktopProfile: true` 实测）。

**本仓库一键调试（推荐）**：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-debug.ps1 packages\dsh-agent-plugin-hub
```

默认跑 `check`/`test`/`build`，装进 `zdebug` 调试 profile（首次按 `web` 模板创建）并启动浏览器实例，打印入口 URL 与宿主日志路径；`-Profile desktop -NoBoot` 只装进桌面真实环境。link 安装要创建 junction，需在 ZCode 等普通终端运行（DSH 沙箱内的 shell 会拒绝）。

**验证**：

- 插件页/侧栏能看到入口；
- 插件自身命令（如 `/my-plugin status`）可执行；
- 宿主日志无 `Cannot find module` / `not-a-bundle` 错误。

---

## 7. 打包

- `files` 是白名单：**只发布运行时必需文件**（lib、client.js、cordis.patch.yml、locale、icon、README、package.json）；测试与 fixture 不要进包；
- 自检：

```powershell
cd packages/my-dsh-plugin
npm pack --dry-run
```

- 运行时零依赖最佳（`dependencies` 保持为空；react 与宿主服务由宿主注入，工具链全在 `devDependencies`）。

---

## 8. 版本与发布

| 阶段 | 版本形态 | dist-tag |
|---|---|---|
| 预览 | `0.0.1-preview.0`、`-preview.1`… | `preview` |
| 正式 | `0.0.1`、`0.0.2`… | `latest` |

约定（🟡 本项目实践 + npm 平台规则）：

- **预览与正式同核心**（`0.0.1-preview.N` → `0.0.1`），SemVer 排序天然正确；
- `package.json` 里固定 `publishConfig: { "access": "public", "tag": "preview" }`，正式发布时用 `--tag latest` 覆盖；
- 发布前必跑：`npm run check`、`npm test`、`npm pack --dry-run`；
- npm 发布要求 2FA 或 CI trusted publishing（🟢 npm 平台规则）；长期建议 GitHub Actions + OIDC；
- **禁止整包 `npm unpublish`**：会有 24 小时不可重发冷却、期间名字不可用（🟢 npm 平台规则，本项目实测触发）；单版本 unpublish 仅限发布后 72 小时内；
- 已发布的版本号**不可复用**；
- npmmirror 会自动同步公开包（不影响所有权，仅影响国内安装新鲜度）。

> 官方索引对「推荐版本」的选择规则（🟢）：与当前 DSH 兼容、**非预发布**的最高版本；若没有非预发布版本，则取兼容的最高预发布版本。因此只发预览版的插件仍可被安装与展示。

---

## 9. 市场索引（format 1）🟢

**权威规范**：官方 [`docs/user/guide/plugin-market.zh.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/plugin-market.zh.md)（英文版 `.md`）。本节是摘要，冲突时以官方为准。

### 9.1 基本模型

- 索引是一份 **UTF-8 JSON**，默认 **≤ 128 MiB**，以 2xx 返回且**不重定向**，放在任意静态主机即可；
- DSH **不内置索引源**；需要在 插件 → 实验性插件 → **自定义插件索引** 打开开关，「发现」标签页才会出现；
- 网络路径上的 `http:` 索引可被中间人篡改（含安装 spec），不可信网络请用 `https:`；
- 索引是第三方内容：DSH 只校验格式，不验证声明真实性。

### 9.2 字段（速查）

```json
{
  "format": 1,
  "title": { "en": "Registry", "zh": "插件源" },
  "description": { "en": "…", "zh": "…" },
  "metadata": {
    "categories": { "tool": { "title": { "en": "Tools", "zh": "工具" } } },
    "labels": {},
    "sortKeys": { "downloads": { "title": { "en": "Downloads", "zh": "下载量" }, "order": "desc" } }
  },
  "plugins": [
    {
      "name": "my-dsh-plugin",
      "title": { "en": "My Plugin", "zh": "我的插件" },
      "description": { "en": "…", "zh": "…" },
      "icon": "icons/my-plugin.svg",
      "author": "Jane Doe",
      "homepage": "https://github.com/jane/my-dsh-plugin#readme",
      "repository": { "url": "https://github.com/jane/my-dsh-plugin", "directory": "packages/my-plugin" },
      "metadata": { "category": "tool", "labels": ["..."], "sortKeys": { "downloads": 42 } },
      "versions": [
        {
          "version": "0.0.1",
          "publishTimestamp": 1794097867,
          "source": {
            "type": "git",
            "url": "https://github.com/<owner>/<repo>",
            "commit": "<40 位小写 hex>",
            "path": "packages/my-dsh-plugin"
          },
          "engines": { "dsh": ">=0.2.0-rc.2" }
        }
      ]
    }
  ]
}
```

关键规则（🟢）：

- `LocalizedText`：字符串，或以**小写语言 id** 为键的对象（对象必须含 `en`）；
- `source` 两种：`{"type":"npm","registry"?}` 或 `{"type":"git","url":"https://…","commit":"<40 hex>","path"?}`；
- 安装参数由宿主现算：npm → `name@version`；Git → `git+<url>.git#<commit>`，子目录追加 `&path:/<path>`；
- `icon`：内联 `data:` URL（SVG/PNG/JPEG/WebP ≤ 32 KiB）或 URL；**相对 icon 相对索引 URL 解析**；跨源绝对 URL 必须 `https:`；
- `engines.dsh` 可选；应与包自身 `engines.dsh` 一致，否则按包的 `@deepseek-ai/dsh*` peer 依赖检查兼容性；
- 违反任何规则会**拒绝整个索引**，并在「管理索引源…」显示原因与违规值的 JSON 路径。

### 9.3 本仓库的生成与托管

```powershell
node scripts\build-index.mjs
```

- 扫 `packages/*` 的 `package.json`，跳过没有 `dsh.bundle` 的目录（🟠 本仓库生成器约定）；
- 展示字段取本仓库自定义的 `dsh.market`（🟠）；DSH 运行时读取的是包的 `locale/*.json` `meta.*` 与 `package.json` 的 `icon`（🟢），两者不要混淆；
- 默认 Git 源，取当前 HEAD commit；`DSH_PLUGINS_SOURCE=npm` 可切 npm 源；
- 版本历史会从旧 `index.json` 合并保留（除非主动清空；清空前注意 SemVer 排序陷阱：历史高版本会被当"推荐版本"）。

改完插件后：**提交代码 → 重新生成索引 → 提交 `index.json` → 推送发布分支**。

> 官方还提供参考生成器（`apps/plugin-market-generator`）与索引校验库，可用来交叉校验本仓库生成的索引（🟢 见官方 plugin-market 文档「用参考生成器生成索引」）。

---

## 10. 测试与质量门 🟡

```powershell
cd packages/my-dsh-plugin
npm run check   # tsc --noEmit（node + client 双 tsconfig）
npm test        # vitest run，零网络、零真实宿主
npm run build   # tsdown 产物（lib/ 入库）
```

规则：

- 测试**必须离线可跑**（不访问网络、不依赖真实宿主），fixture 放 `tests/fixtures/`；服务端用例 `*.spec.ts`（node 环境），客户端组件用例 `*.client.spec.tsx`（首行 `// @vitest-environment jsdom` + @testing-library/react，断言用户可见行为而非类名）；
- 每个功能点补测试；改动不应降低用例数；每个 registry/resource 补 dispose（HMR-safety）用例；
- 受限沙箱里 Node 子进程 / Git spawn 可能被拒（`EPERM`），涉及 git 的用例要在本机完整权限下跑；
- 仓库 `core.autocrlf=true`：对源码做字符串探针的测试先归一化 `\r\n`（优先用行为断言）；
- 质量门通过后再提交。

**如何复核本文档的 🟡/🟠 条目**（给下一个 Agent）：

1. 在 web profile 真实安装一次插件，记录报错文本；
2. `npm view <pkg> dist-tags versions` 核对发布结果；
3. 打开官方对应文档（§0.1）比对字段与规则；
4. 若本机 DSH 版本已升级（看 `~/.dsh/profiles/*/package.json` 的依赖版本），重点复核 §3.2、§4.2–4.3、§5、§9。

---

## 11. 常见错误对照表

| 现象 | 原因 | 修复 | 来源 |
|---|---|---|---|
| `not-a-bundle` | 缺 `dsh.bundle.patch` | 补上并指向 `cordis.patch.yml` | 🟡 实测 |
| `Cannot find module '<pkg>'` | patch 行 `name` 与包名不一致 | 改成包名 | 🟡 实测 |
| 安装后无效果 | `lib/*` 改动未重启宿主 | 重启宿主（client 只刷页面） | 🟡 实测 |
| 插件页/侧栏不出现入口 | `dsh.client` 缺失或 `exports["./client"]` 未暴露 | 补声明与 exports | 🟡 实测 |
| `import '@deepseek-ai/...'` 解析失败 | `autoInstallPeers: false`，peer 未安装 | 不 import，改走 `ctx` | 🟡 实测 |
| 403 `Two-factor authentication … required` | 账号未开 2FA / token 无 bypass | 开 2FA 或用 publish token | 🟢 npm 平台 |
| 403 `cannot be republished until 24 hours` | 整包 unpublish 冷却中 | 等 24 小时，用**新版本号**发布 | 🟢 npm 平台 + 🟡 实测 |
| 索引加不进去 | 语言 id 写成 `zh-CN`、URL 有重定向/凭据/片段、非匿名可读、超过大小限制 | 按 §9 修正 | 🟢 官方索引规范 |
| 索引看起来是旧的 | 索引缓存（约 10 分钟，🟠 观察值） | 刷新「发现」页或重新添加源 | 🟠 |
| 图标不显示 | http 图床 / 跨源非 https / 超过 256 KiB（bundle 图标）或 32 KiB（内联索引图标） | 按官方规则修正 | 🟢 官方 |
| 市场条目与实际包对不上 | 索引 `name` 与 `package.json.name` 不一致 | 对齐 | 🟡 实测 |

---

## 12. Agent / Harness 执行清单

每次改动前后逐项确认：

- [ ] `package.json` 有 `dsh.bundle.patch`；`cordis.patch.yml` 行 `name` = 包名
- [ ] `files` 覆盖全部运行时文件（含 `lib/` 产物）；`npm pack --dry-run` 内容正确
- [ ] 没有 `import '@deepseek-ai/*'`；没有多余的 `engines.dsh`；`dependencies` 为空
- [ ] 宿主端服务用 `ctx.inject` 延迟获取；清理用 `ctx.effect`
- [ ] 客户端样式不污染全局（CSS Modules）；locale id 小写；`npm run build` 已跑且 `lib/` 与源码同提交
- [ ] 展示元数据在 `locale/*.json` 的 `meta.title/description`（官方）与本仓库 `dsh.market`（生成器）之间保持一致
- [ ] `npm run check` 与 `npm test` 通过（离线）
- [ ] 版本号符合发布线（`-preview.N` / 正式）
- [ ] 涉及包版本或展示元数据时，已重跑 `node scripts\build-index.mjs`
- [ ] commit 信息清晰（**不要加 Co-Authored-By**）；完成后 push 到发布分支
- [ ] 发布后 `npm view <pkg> dist-tags versions` 验证

---

## 13. 延伸阅读

- 官方文档站：https://deepseek-harness.github.io/deepseek-harness/
- 官方仓库：https://github.com/deepseek-ai/deepseek-harness
- 官方索引规范：[`docs/user/guide/plugin-market.zh.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/plugin-market.zh.md)
- 官方插件展示元数据：[`docs/cookbook/adding-a-package.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-package.md)（§ Add optional plugin display metadata）
- 官方架构：[`docs/architecture.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- 本仓库：[`README.md`](../README.md)、[`AGENTS.md`](../AGENTS.md)
- 宿主 API 侦察结论：[`packages/dsh-agent-plugin-hub/docs/HOST-API.md`](../packages/dsh-agent-plugin-hub/docs/HOST-API.md)
- 参考实现：[`packages/dsh-agent-plugin-hub`](../packages/dsh-agent-plugin-hub)