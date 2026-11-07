# dsh-plugins

一个仓库放**多个 DSH 插件**，并把它们聚合成一�?*自己的插件市场索�?*（DSH「发现」页的索引源）�?

这份索引就是市场源：DSH 读到它，就能像逛官方市场一样浏览、搜索、一键安装仓库里的每个插件。它�?Claude Code �?`marketplace.json` 是同一个思路——一个仓库列多个插件；区别是 DSH 的条目来源只�?**npm** �?**Git（可带子目录 path�?* 两种，没�?相对目录"来源�?

---

## 这个仓库是什�?

| 东西 | 作用 |
|---|---|
| `packages/*` | 每个目录是一个独立的 DSH 插件（组合包 bundle），可单独安装、单独开关、单独升�?|
| `index.json` | 聚合索引（格�?`format: 1`），�?`packages/*` 全部列成一份目�?|
| `scripts/build-index.mjs` | 扫包、生�?合并索引；改完插件跑一次就�?|
| `scripts/serve-index.mjs` | 本机起一个静态服务，方便�?DSH 里先试这个索引源 |
| `market.config.json` | 索引的标题、分类、标签等展示元数�?|

索引本身不存代码，只�?有哪些插件、从哪个 npm �?/ Git 提交的哪个子目录装、怎么展示"。插件代码永远在各自的包里�?

```
dsh-plugins/
├── index.json                  # 生成物，需要提�?
├── market.config.json
├── package.json
├── README.md
├── scripts/
�?  ├── build-index.mjs
�?  └── serve-index.mjs
└── packages/
    └── dsh-agent-plugin-hub/   # 智能体插件运行时与市场（0.0.1-preview.1，ZCode 风格商店面板�?
        ├── package.json
        ├── cordis.patch.yml
        ├── README.md
        ├── client.js           # 商店面板：sidebar.panellist / main / shell.overlay
        ├── locale/             # en / zh 展示元数�?
        ├── docs/HOST-API.md    # 宿主 API 侦察结论与当前接�?
        ├── lib/                # 19 �?ES 模块，零运行时依赖（�?migrate/version�?
        └── test/               # node --test：fixtures + 147 个用�?
```

### 分支与发�?

| 分支 | 内容 |
|---|---|
| `main` | 文档与仓库说明（�?README�?|
| `release-0.0.1` | 当前全部插件代码、脚本、`HANDOFF.md` 与生成的 `index.json`；市场索引从该分支读取（分支名沿用首个发布版本，包版本为 `0.0.1-preview.1`�?|

当前发布分支�?`release-0.0.1`。在 DSH 插件�?�?**发现** �?**添加索引�?* 时填�?

```text
https://raw.githubusercontent.com/zmaolong/dsh-plugins/release-0.0.1/index.json
```

---

## 快速开�?

### 1. 生成索引

```powershell
cd E:\workspace\dsh-plugins
node scripts\build-index.mjs
```

### 2. 本地起索引服�?

```powershell
node scripts\serve-index.mjs
# http://127.0.0.1:8231/index.json
```

> 索引里的安装地址取自 `git remote origin`（本仓库：`https://github.com/zmaolong/dsh-plugins`）。发布时在对应的 `release-x.y.z` 分支提交后重新生成索引，安装才能命中真实 Git 提交�?

### 3. 先把插件装上跑起来（绕过索引，开发期用）

```powershell
dsh plugin --profile web add E:\workspace\dsh-plugins\packages\dsh-agent-plugin-hub
dsh --profile web
```

桌面端注意：`desktop` profile �?Electron 应用独占管理，CLI 会直接拒绝（`profile "desktop" is managed exclusively by the Electron application`）。桌面端请用**设置 �?插件 / 插件�?*的安装入口（填包名或安装 spec，本地目录用绝对路径），或者让 Agent �?`plugin_manager` 帮你装�?

### 4. �?DSH 里添加自己的索引�?

插件�?�?**发现** �?**添加索引�?* �?�?`http://127.0.0.1:8231/index.json`（或线上地址）�?

索引�?10 分钟缓存；改完索引点一下刷新，或重新添加一次�?

---

## 仓库里的插件

| �?| 作用 | 代码要点 |
|---|---|---|
| `dsh-agent-plugin-hub` | �?DSH 里托�?Claude Code、CodeBuddy、ZCode �?*智能体插�?*（Agent Plugins）：个人市场、安�?更新/回滚、能力注入与逐项启停，以�?ZCode 风格商店面板 | 组合�?+ `/agent-plugin` 命令 + 首页左侧栏商店面板（个人分段 / 按市场分�?/ 详情 / 管理 / 市场�?/ 自动识别来源）；schema v2 自动迁移；skills/commands/hooks 注入，MCP 清单标注�?47 �?`node --test` 用例 |

> 命名说明：Agent 直译“代理”不准确、“助手”易混淆；单叫“插件”会�?DSH 自身插件混淆�?
> �?*智能体插�?*（英�?Agent Plugins）加限定词区分；代码里的包名�?`/agent-plugin` 命令不变�?

包内细节�?[`packages/dsh-agent-plugin-hub/README.md`](packages/dsh-agent-plugin-hub/README.md)�?

本包**刻意�?import 任何 `@deepseek-ai/*` �?*。原因：profile �?`pnpm-workspace.yaml` 里是 `autoInstallPeers: false`，peer 依赖不会被安装，第三方插�?`import '@deepseek-ai/...'` 会在宿主里解析失败。需�?`defineTool` 这类助手时，把它写进 `dependencies` 并和宿主版本对齐；能�?`ctx` 提供的接口就优先�?`ctx`�?

---

## 新建一个插�?

1. 参�?`packages/dsh-agent-plugin-hub` 的骨架，复制成你的包名目录�?
2. �?`package.json`：`name`、`version`、`description`、`dsh.market` 展示信息�?
3. �?`cordis.patch.yml`：`id` 换成本插件独有的�?id，`name` 换成**自己的包�?*�?
4. �?`lib/index.js`：`export const name` �?`apply` 里的逻辑�?
5. �?`node scripts\build-index.mjs` 重新生成索引�?

骨架要求（缺一个都装不上）�?

- 包必须是**组合�?*：`package.json` 里有 `dsh.bundle.patch` 指向本包�?`cordis.patch.yml`，否则安装时�?`not-a-bundle`�?

  ```json
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
  ```

- `cordis.patch.yml` �?insert 的行，`name` 必须是能解析到的模块名（通常就是自己的包名）�?

  ```yaml
  - insert:
      - id: my-plugin
        name: 'my-plugin'
  ```

- 索引条目�?`name` 必须等于该包 `package.json` �?`name`（Git + `path` 安装时，就是子目录里那个 `package.json` �?`name`），否则安装状态对不上�?

---

## 索引（市场源）说�?

### 格式 1

```json
{
  "format": 1,
  "title": { "en": "My DSH plugins", "zh-cn": "我的 DSH 插件�? },
  "metadata": {
    "categories": { "tool": { "title": { "en": "Tools", "zh-cn": "工具" } } }
  },
  "plugins": [
    {
      "name": "my-plugin",
      "title": { "en": "My Plugin", "zh-cn": "我的插件" },
      "description": { "en": "Sample plugin.", "zh-cn": "示例插件�? },
      "metadata": { "category": "tool", "keywords": ["example"] },
      "versions": [
        {
          "version": "0.1.0",
          "publishTimestamp": 1767225600,
          "source": {
            "type": "git",
            "url": "https://github.com/zmaolong/dsh-plugins",
            "commit": "0123456789abcdef0123456789abcdef01234567",
            "path": "packages/my-plugin"
          }
        }
      ]
    }
  ]
}
```

安装参数�?Host 现算�?

- npm �?`包名@版本`（可�?`registry`�?
- Git �?`git+https://�?<40 �?commit>`，子目录再加 `&path:/packages/xxx`

### 本仓库怎么生成

```powershell
node scripts\build-index.mjs
```

做的事：

1. �?`packages/*/package.json`，跳过没�?`dsh.bundle` 的目录；
2. �?`dsh.market` 里的标题/描述/分类/关键词生成展示字段，缺省用包名和 `description`�?
3. 默认�?**Git �?*取当�?`HEAD` 和提交时间；同名同版本的历史条目会从�?`index.json` 合并保留（旧提交仍然有效）；
4. 校验包名、版本号、来源，有问题直接报错而不是写出坏索引�?

可用环境变量�?

| 变量 | 默认 | 含义 |
|---|---|---|
| `DSH_PLUGINS_SOURCE` | `git` | 设成 `npm` 则每个条目按 npm 源生�?|
| `DSH_PLUGINS_REPO` | 自动�?`git remote origin` | 索引里写入的仓库 HTTPS 地址 |
| `DSH_PLUGINS_NPM_REGISTRY` | 空（公共 npm�?| npm 源的私有 registry 地址 |

### 托管到哪�?

| 方式 | 索引 URL | 说明 |
|---|---|---|
| 仓库 raw | `https://raw.githubusercontent.com/<org>/<repo>/HEAD/index.json` | 最省事，无需开 Pages；索引在发布分支时把 `HEAD` 换成分支�?|
| GitHub Pages | `https://<org>.github.io/<repo>/index.json` | 需要仓库开 Pages |
| npm �?+ jsDelivr | `https://cdn.jsdelivr.net/npm/<index-pkg>/index.json` | 最快、有版本号可回滚 |
| 内网静态服务器 | `https://intranet.example/index.json` | 团队私有最直接，`http:` 也接�?|

硬约束（不满足就加不进源）：

- 单次读取 **15 秒超�?*�?
- **不跟随重定向**，必须填最终地址�?
- URL 不得带凭据、查询串或片段；
- 索引文档必须**匿名可读**：私有仓库的 raw 地址用不了，得放到内网或公开位置�?

### 发布路径

| 方式 | 适合 | 做法 |
|---|---|---|
| Git（同仓库多子包） | 一组插件一起维�?| 直接�?GitHub，`git+commit&path` 安装；每次发版重�?`build-index` 并把 `index.json` 一起提�?|
| 公共 npm | 想给别人稳定安装 | 每个包单�?`npm publish`，`DSH_PLUGINS_SOURCE=npm` 生成索引（jsDelivr 托管索引最快） |
| 私有 npm registry | 公司内网 | npm �?+ 条目�?`"registry": "http://npm.internal:4873"` |
| 私有 Git | 代码不公开 | 安装走本�?git 凭据；但索引本身仍要匿名可读 |

> 索引**没有签名**：条目里的包名、版本只是索引的声明，最终装的是什么由被装包的 manifest 决定。所以自建源只放自己的插件，别把它当审核机制�?

> **npm 首发策略（试验期�?*：先�?`0.0.1-preview.1` 试验版发布（`0.0.1-preview.N` 为试验线），
> `publishConfig.tag` 固定�?`preview`，`latest` 暂不指向任何版本；此阶段不推广、不进索引�?
> 首个正式版定�?`1.0.0`，届�?`npm publish --tag latest`，然�?`DSH_PLUGINS_SOURCE=npm` 重新生成索引�?

---

## 字段速查

顶层：`format`（必填，只能�?`1`）、`title`（必填，字符串或�?`en` 的多语言对象）、`description`（可选）、`metadata`（可选，声明分类/标签/排序键）�?

> 多语言对象的语言 id 必须**小写**：`zh-cn`、`en`。写�?`zh-CN` 会被校验器拒绝（这是最容易踩的一条，本仓库的 `build-index.mjs` 会自动把 key 转小写）�?

`plugins[]`：`name`（必填，合法 npm 包名，全局唯一）、`title`、`description`、`icon`、`author`、`homepage`、`repository`、`metadata`（`category` / `labels` / `sortKeys` / `keywords`）、`versions`（必填，非空）�?

`versions[]`：`version`（必填，精确 SemVer）、`publishTimestamp`（必填，Unix 秒整数）、`engines`（可选，`{ dsh: "<SemVer range>" }`）、`source`（必填）�?

`source`：`{"type":"npm","registry"?}` �?`{"type":"git","url":"https://�?,"commit":"<40 位小�?hex>","path"?: "相对目录"}`�?

`icon` 相对于索�?URL 解析，必须落�?https 或与索引同源；也可以�?`data:` 内联图片（解码后 �?32 KiB）�?

---

## 常见�?

- **`not-a-bundle`**：包没声�?`dsh.bundle.patch`�?
- **`engines.dsh` / DSH peer 不匹�?*：会�?pnpm 之前就被拒（当前宿主 `0.2.7-rc.1`）；不声明就不检查，别乱写范围�?
- **改了代码不生�?*：`cordis.patch.yml` 的改动约 1 秒热重载；`lib/index.js` 的改动一般要重启宿主（桌面端重启应用，CLI 重启 `dsh`）�?
- **索引看起来是旧的**：索引缓�?10 分钟，刷新发现页或重新添加源�?
- **想一次装完所有插�?*：索引是逐个装的；真�?一装全�?，就做一个打�?bundle，在它的 `cordis.patch.yml` �?insert 多行——但那样版本会绑在一起，不适合独立迭代�?
- **图标不显�?*：图标必�?https 或与索引同源，别�?http 图床�?
- **同一个包名重�?*：索引内不允许重复，改包名前先看看索引生成有没有报错�?
- **索引加不进去**：先看发现页「索引源」里对应源下方的错误；最常见的是语言 id 写成 `zh-CN`、URL 有重定向或带查询串�?

---

## 验证清单

- [ ] `node scripts\build-index.mjs` 无报错，`index.json` 里能看到所有插�?
- [ ] 索引 URL 浏览器能直接打开（无重定向）
- [ ] 插件�?�?发现 �?索引源能看到条目和描�?
- [ ] 安装后出现在"已安�?，插件页可对这个包的各个行单独开�?
- [ ] �?`cordis.patch.yml` �?1 秒后生效

---

## 许可

MIT