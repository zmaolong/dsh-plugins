# DSH 插件开发规范

> **读者**：本仓库的开发者，以及任何在本仓库工作的 AI Agent / Harness（Claude Code、CodeBuddy、ZCode、Cursor、Codex 等）。
> **目标**：读完本文即可写出「能安装、能运行、能发布、能进市场索引」的 DSH 插件。
> **参考实现**：[`packages/dsh-agent-plugin-hub`](../packages/dsh-agent-plugin-hub)（真实可用、147 个离线测试）。

---

## 1. 术语

| 术语 | 含义 |
|---|---|
| DSH | DeepSeek Harness，宿主程序（桌面端 Electron / CLI 两种形态） |
| DSH 插件 | 基于 cordis 的组合包（bundle），装进 DSH 插件树，入口是 `apply(ctx, config)`；**本仓库发布的就是它** |
| Agent 插件 / 智能体插件 | Claude Code / CodeBuddy / ZCode 的资产包（`plugin.json` + `skills/` + `commands/` + `hooks/` + `mcpServers`），**不是** DSH 插件 |
| 组合包 bundle | `package.json` 里声明 `dsh.bundle.patch` 的 npm 包 |
| profile | DSH 的插件组合层（`web` / `desktop`），`desktop` 由 Electron 应用独占 |

---

## 2. 最小可安装骨架

### 2.1 文件树

```text
packages/my-dsh-plugin/
├── package.json          # 声明 bundle、exports、files、dsh 字段
├── cordis.patch.yml      # 向 profile 组合层 insert 本插件的行
├── README.md
├── icon.svg              # 可选，市场图标
├── locale/en.json        # 可选，客户端展示元数据
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
      "inject": [
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-settings",
        "@deepseek-ai/dsh-client-ui-theme"
      ]
    },
    "market": {
      "title": { "en": "My Plugin", "zh-cn": "我的插件" },
      "description": { "en": "What it does.", "zh-cn": "它做什么。" },
      "category": "tool",
      "keywords": ["dsh-plugin"]
    }
  }
}
```

- **没有客户端 UI** 时：删掉 `dsh.client`、`client.js`、`exports["./client"]` 与 `files` 里的 `client.js`。
- `dsh.market` 是市场/商店展示信息，字段见 §9。
- `engines.dsh` **不要随便写**：写了就会被严格校验，写错直接拒装；不确定就省略。

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

### 2.5 装不上的三个硬条件

1. **必须是组合包**：`package.json` 有 `dsh.bundle.patch` 指向本包的 `cordis.patch.yml`，否则报 `not-a-bundle`；
2. **patch 行的 `name` 必须能解析**（通常就是包名），否则启动时报 `Cannot find module`；
3. **索引条目 `name` 必须等于该包 `package.json` 的 `name`**（Git 源时是子目录里那个 `package.json`），否则安装状态对不上。

---

## 3. 宿主端契约

### 3.1 入口导出

- `export const name`：cordis 行名，建议用短横线包名；
- `export const inject`：硬依赖服务名数组（如 `['commands']`）；
- `export function apply(ctx, config)`：**同步**注册，不要阻塞；返回导出对象可能被宿主忽略；
- 启动异常要自己 try/catch 并写日志，**不要抛到宿主**导致整机加载失败。

### 3.2 服务就绪与延迟注册

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

### 3.3 清理与生命周期

- 用 `ctx.effect(() => () => dispose())` 注册清理；
- 文件/进程/定时器/HTTP 路由都要能被清理；
- 宿主重启后插件状态应能从磁盘恢复（不要把唯一状态放内存）。

### 3.4 配置

`cordis.patch.yml` 的 `insert[].config` 会作为 `apply` 的第二个参数传入。配置要有默认值，缺字段不崩。

### 3.5 禁止事项

- **禁止 `import` 任何 `@deepseek-ai/*`**：profile 的 `pnpm-workspace.yaml` 是 `autoInstallPeers: false`，peer 依赖不会安装，import 会在宿主里解析失败。需要 `defineTool` 之类助手时，把它写进 `dependencies` 并和宿主版本对齐；能通过 `ctx` 拿到的能力优先用 `ctx`；
- 不要在模块顶层做耗时/带副作用的初始化；
- 不要写死宿主内部路径，用 `ctx` 提供的接口或环境变量。

---

## 4. 客户端插件（Web UI）

### 4.1 声明

`dsh.client` 声明浏览器端入口与需要注入的宿主模块：

```json
"dsh": {
  "client": {
    "platform": "web",
    "immediately": true,
    "inject": ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-settings"]
  }
}
```

`inject` 里列的是宿主提供的客户端模块名（`require` 时可用）；不使用的不要列。

### 4.2 入口与模块加载

`client.js` 是**纯 ESM、无构建步骤**，通过全局模块加载器注册：

```js
window.__ModuleLoader__.load({
  id: 'my-dsh-plugin',            // 建议 = 包名
  factory(require) {
    const React = require('react') // 宿主提供
    const h = React.createElement

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // 注册 UI、locale、清理逻辑
      },
    }
  },
})
```

### 4.3 槽位注册（真实示例）

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

常用槽位：`sidebar.panellist`、`main`、`shell.overlay`。`order` 用于排序（插件页约定 插件 0 / 智能体插件 5 / 自动化任务 10 / 上下文洞察 20）。

### 4.4 数据面与安全

- 客户端不直连外部服务；数据由**宿主端 HTTP 路由**提供，浏览器 `fetch` 前缀地址；
- 路由挂载用 `ctx.webServer`（可能晚到，用 `ctx.inject(['webServer'], …)`）；
- 默认只允许本机回环访问；写操作要校验同源 `Origin` 与 JSON body，防止跨站触发；
- 路由前缀自定义（如 `/my-plugin/api`），不要占用别人的前缀。

### 4.5 主题与样式

- 优先用宿主 CSS 变量 / 主题 token（如 `--dsw-alias-*`），暗色用 `body[data-ds-dark-theme]` 区分；
- 样式注入用 `<style data-plugin="…">` 并注册清理；**避免全局选择器**污染宿主 UI；
- 图标、颜色等展示元数据放 `locale/` 与 `dsh.market`，不要写死在中英文文案里。

### 4.6 locale

```js
const locale = ctx.locale
locale?.register?.('myPlugin', 'en', EN_DICT)
locale?.register?.('myPlugin', 'zh', ZH_DICT)
locale?.register?.('myPlugin', 'zh-cn', ZH_DICT)
```

语言 id 必须**小写**：`en`、`zh`、`zh-cn`。

### 4.7 热更新

- `cordis.patch.yml` 改动约 1 秒热重载；
- 宿主端 `lib/*` 改动一般需重启宿主（桌面端重启应用，CLI 重启 `dsh`）；
- 客户端 `client.js` 改动刷新页面即可（开发时可用 HMR）。

---

## 5. 宿主能力清单（通过 ctx 获取）

| 能力 | 典型用法 | 说明 |
|---|---|---|
| commands | `ctx.commands.register(...)` | 注册 `/命令`；命令处理器只能返回文本 |
| skills | `ctx.skills.registerProvider(...)` | 注册技能目录（SKILL.md 扫描） |
| webServer | `ctx.webServer` | 注册本机 HTTP 路由，做 UI 数据面 |
| subprocess | `ctx.subprocess` | 执行外部命令（hooks 等），超时/中止受宿主管理 |
| 事件 | `ctx.on('tools/pre-execute', …)` 等 | PreToolUse / PostToolUse / Stop / SessionStart / SessionEnd 等，见 `docs/HOST-API.md` |
| effect | `ctx.effect(() => () => cleanup)` | 生命周期清理 |
| inject | `ctx.inject(deps, cb)` | 等待服务就绪 |

更细的接口形状、路由约定与降级矩阵见参考实现内的 [`docs/HOST-API.md`](../packages/dsh-agent-plugin-hub/docs/HOST-API.md)。

---

## 6. 安装与调试

**开发期安装（web profile）**：

```powershell
dsh plugin --profile web add E:\path\to\packages\my-dsh-plugin
dsh --profile web
```

**桌面端**：设置 → 插件 → 安装，填包名或安装 spec；本地目录用绝对路径。
注意：`desktop` profile 由 Electron 应用独占管理，CLI 会拒绝（`profile "desktop" is managed exclusively by the Electron application`）。

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

- 运行时零依赖最佳（本仓库参考实现零运行时依赖、零构建链）。

---

## 8. 版本与发布

| 阶段 | 版本形态 | dist-tag |
|---|---|---|
| 预览 | `0.0.1-preview.0`、`-preview.1`… | `preview` |
| 正式 | `0.0.1`、`0.0.2`… | `latest` |

约定：

- **预览与正式同核心**（`0.0.1-preview.N` → `0.0.1`），SemVer 排序天然正确；
- `package.json` 里固定 `publishConfig: { "access": "public", "tag": "preview" }`，正式发布时用 `--tag latest` 覆盖；
- 发布前必跑：`npm run check`、`npm test`、`npm pack --dry-run`；
- npm 发布要求 2FA（或 CI trusted publishing）；长期建议 GitHub Actions + OIDC；
- **禁止整包 `npm unpublish`**：会触发 24 小时不可重发冷却，期间名字不可用；单版本 unpublish 仅限发布后 72 小时内；
- 已发布的版本号**不可复用**；
- npmmirror 会自动同步公开包（不影响所有权，仅影响国内安装新鲜度）。

---

## 9. 市场索引（format 1）

索引是 DSH「发现」页的数据源：一份可匿名访问的 `index.json`，条目声明「有哪些插件、从哪个 npm 包 / Git 提交的哪个子目录装、怎么展示」。

### 9.1 字段（速查）

```json
{
  "format": 1,
  "title": { "en": "Registry", "zh-cn": "插件源" },
  "description": { "en": "…", "zh-cn": "…" },
  "metadata": { "categories": { "tool": { "title": { "en": "Tools", "zh-cn": "工具" } } } },
  "plugins": [
    {
      "name": "my-dsh-plugin",
      "title": { "en": "My Plugin", "zh-cn": "我的插件" },
      "description": { "en": "…", "zh-cn": "…" },
      "metadata": { "category": "tool", "keywords": ["dsh-plugin"] },
      "versions": [
        {
          "version": "0.0.1",
          "publishTimestamp": 1794097867,
          "source": {
            "type": "git",
            "url": "https://github.com/<owner>/<repo>",
            "commit": "<40 位小写 hex>",
            "path": "packages/my-dsh-plugin"
          }
        }
      ]
    }
  ]
}
```

- `source` 两种：`{"type":"npm","registry"?}` 或 `{"type":"git","url":"https://…","commit":"<40 hex>","path"?}`；
- 安装参数由宿主现算：npm → `包名@版本`；Git → `git+https://…#commit` + `&path:/packages/xxx`；
- 图标必须 https 或与索引同源（或 `data:` 内联 ≤ 32 KiB）。

### 9.2 硬约束（不满足就加不进源）

- 单次读取 **15 秒超时**；
- **不跟随重定向**，必须填最终地址；
- URL 不得带凭据、查询串或片段；
- 索引必须**匿名可读**；
- 索引有 **10 分钟缓存**。

### 9.3 本仓库的生成流程

```powershell
node scripts\build-index.mjs
```

- 扫 `packages/*` 的 `package.json`，跳过没有 `dsh.bundle` 的目录；
- 展示字段取 `dsh.market`；市场级标题/描述/分类取 `market.config.json`；
- 默认 Git 源，取当前 HEAD commit；`DSH_PLUGINS_SOURCE=npm` 可切 npm 源；
- 版本历史会从旧 `index.json` 合并保留（除非主动清空）。

改完插件后：**提交代码 → 重新生成索引 → 提交 `index.json` → 推送发布分支**。

---

## 10. 测试与质量门

```powershell
cd packages/my-dsh-plugin
npm run check   # node --check 全部源文件
npm test        # node --test，零网络、零依赖
```

规则：

- 测试**必须离线可跑**（不访问网络、不依赖真实宿主），fixture 放 `test/fixtures/`；
- 每个功能点补测试；改动不应降低用例数；
- 受限沙箱里 Node 子进程 / Git spawn 可能被拒（`EPERM`），涉及 git 的用例要在本机完整权限下跑；
- 质量门通过后再提交。

---

## 11. 常见错误对照表

| 现象 | 原因 | 修复 |
|---|---|---|
| `not-a-bundle` | 缺 `dsh.bundle.patch` | 补上并指向 `cordis.patch.yml` |
| `Cannot find module '<pkg>'` | patch 行 `name` 与包名不一致 | 改成包名 |
| 安装后无效果 | `lib/*` 改动未重启宿主 | 重启宿主（client 只刷页面） |
| 插件页/侧栏不出现入口 | `dsh.client` 缺失或 `exports["./client"]` 未暴露 | 补声明与 exports |
| 403 `Two-factor authentication … required` | 账号未开 2FA / token 无 bypass | 开 2FA 或用 publish token |
| 403 `cannot be republished until 24 hours` | 整包 unpublish 冷却中 | 等 24 小时，用**新版本号**发布 |
| 索引加不进去 | 语言 id 写成 `zh-CN`、URL 有重定向或查询串、非匿名可读 | 按 §9.2 修正 |
| 索引看起来是旧的 | 10 分钟缓存 | 刷新发现页或重新添加源 |
| 图标不显示 | http 图床 / 非同源 | 改 https 或与索引同源 |
| 市场条目与实际包对不上 | 索引 `name` 与 `package.json.name` 不一致 | 对齐 |

---

## 12. Agent / Harness 执行清单

每次改动前后逐项确认：

- [ ] `package.json` 有 `dsh.bundle.patch`；`cordis.patch.yml` 行 `name` = 包名
- [ ] `files` 覆盖全部运行时文件；`npm pack --dry-run` 内容正确
- [ ] 没有 `import '@deepseek-ai/*'`；没有多余的 `engines.dsh`
- [ ] 宿主端服务用 `ctx.inject` 延迟获取；清理用 `ctx.effect`
- [ ] 客户端样式不污染全局；locale id 小写
- [ ] `npm run check` 与 `npm test` 通过（离线）
- [ ] 版本号符合发布线（`-preview.N` / 正式）
- [ ] 涉及包版本或展示元数据时，已重跑 `node scripts\build-index.mjs`
- [ ] commit 信息清晰（**不要加 Co-Authored-By**）；完成后 push 到发布分支
- [ ] 发布后 `npm view <pkg> dist-tags versions` 验证

---

## 13. 延伸阅读

- 仓库结构、市场索引字段详解：[`README.md`](../README.md)
- 宿主 API 侦察结论与接口：[`packages/dsh-agent-plugin-hub/docs/HOST-API.md`](../packages/dsh-agent-plugin-hub/docs/HOST-API.md)
- 参考实现：[`packages/dsh-agent-plugin-hub`](../packages/dsh-agent-plugin-hub)
- Agent 硬规则速查：[`AGENTS.md`](../AGENTS.md)