# dsh-remote-ctrl

> **试验性预览版（`0.0.1-preview.6`）**：仅供内部试验，接口与能力随时可能变化。
> 版本线与仓库一致：npm 只发 `preview` dist-tag，首个正式版定为 `0.0.1`。

DSH 的**远程控制**插件：一个带配对码的**局域网访问网关**。宿主 web UI 只绑
回环且拒绝通配地址，本插件自起一个 `node:http` 网关（默认 `0.0.0.0:47291`）
把**完整、自适应的 DSH Web UI** 反代给局域网内的手机——会话、流式输出、
发送消息、工具审批、智能体提问全部是宿主原生能力，本插件**不做任何业务
UI**（0.0.1-preview.1 起删除了自研手机页，改为纯网关）。

## 组成

- **网关**（`0.0.0.0:47291`，可配）：配对码门 → 反代宿主 webServer（`getOrigin()`）。
  - 端口默认取高位、非常见端口 **47291**，且低于系统临时端口起点（49152），
    避免与其它服务或系统临时连接撞车；
  - 上游鉴权照搬宿主 browser-auth：`ctx.connection.authenticatedUrl()` 服务端
    代换 launch token 得到签名 `dsh-auth-*` cookie，缓存后注入上游请求，并把
    cookie 下发给手机（宿主重启后 401 自动重换一次并重放）；
  - `Host`/`Origin`/`Referer` 统一改写为上游 authority，满足宿主 `/api` trust
    fence 的同 authority 检查；
  - SSE/分块响应直通不缓冲，WebSocket upgrade 原样中继；
  - 配对码三通道：`?token=`（扫码链接）/ `Authorization: Bearer` / 首访种下的
    `dsh-remote-ctrl` 配对 cookie（之后 webUI 自己的请求免带 token）。
- **侧边栏底部入口 + 全局弹窗**（slots：`sidebar.footer.action`，宿主回环
  `/remote-ctrl/api` 供数）：侧栏脚一个手机图标；侧栏展开时入口 portal 到设置
  触发行、紧挨账号头像右侧（缩短账号入口、不再多占一行），收起轨道或该行不可用
  时回落到自己的脚部动作行；启用时字形保持琥珀橙（ZCode 同款），悬浮底色与账号
  行同款且不跟着变橙；点开是 ZCode
  同构的居中弹窗（遮罩 + 失焦页面 + 焦点锁在弹窗内，Esc / 点遮罩 / 右上角关闭）：
  - **点图标即自动启动**网关（已启动时不会重复操作）；
  - 弹窗默认**固定 900×720** 尺寸；左卡：连接状态、停止/启动、复制链接、
    配对码（展示 + 手动刷新，**不提供复制**）、二维码；右卡：**局域网地址切换**
    （单选，默认推荐私网地址）——切换后二维码与「复制链接」结果随之改变，地址
    过多时**在右卡自己的列表里滚动**；
  - 二维码只在**正方形图块**内白底（虚线框保持弹窗底色），便于扫描；
  - 弹窗打开期间才轮询数据面。

## 安全模型

- **配对码**：首启生成 24 字节随机码并持久化到 `home/remote-ctrl.json`
  （重启不变，默认长期有效，只有手动「刷新配对码」才会更换）；持有配对码 =
  获得完整 webUI 访问权。`config.token` 固定的配对码不能在面板里刷新。
- **可停用**：面板里「停止」会立刻关闭局域网监听并把 `enabled: false` 写入
  `home/remote-ctrl.json`，宿主重启后仍保持停止；「启动」恢复监听（配对码不变）。
- **Host 校验**：Host 头必须是本机地址（防 DNS rebinding）。
- **跨站防护**：写请求要求同源 Origin，拒绝浏览器声明的
  `sec-fetch-site: cross-site`（与 dsh-agent-extension 的 fence 同构）。
- 请只在**可信局域网**使用；桌面面板数据面只挂宿主回环。

## 配置（cordis.patch.yml）

```yaml
- insert:
    - id: remote-ctrl
      name: 'dsh-remote-ctrl'
      config:
        home: ''          # 配对码/启用状态持久化目录；留空 → DSH_REMOTE_CTRL_HOME → ~/.dsh/remote-ctrl
        host: '0.0.0.0'   # 网关监听地址；0.0.0.0 = 所有网卡（推荐）
        port: 47291       # 网关端口（高位非常见端口，可改）
        token: ''         # 留空 = 首启生成并持久化、面板里可刷新；填写则固定配对码
```

## 开发

```powershell
cd packages\dsh-remote-ctrl
npm run check        # tsc --noEmit（node + client 双程序）
npm test             # vitest run（离线；proxy/lifecycle 用例起真回环监听）
npm run build        # tsdown：lib/index.js（ESM 宿主半）+ lib/client.js（弹窗）
```

真实宿主调试：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-debug.ps1 packages\dsh-remote-ctrl
```

装进 `zdebug` 后：点击侧栏底部、账号头像右侧的手机图标弹出「远程控制」弹窗；
手机打开 `http://<局域网IP>:47291/?token=<配对码>` 即得完整 webUI。

## 许可

MIT。第三方内置：qrcode-generator（MIT © Kazuhiko Arase，见
`src/client/qrcode.ts` 头部说明）。