# dsh-remote-ctrl

> **试验性预览版（`0.0.1-preview.1`）**：仅供内部试验，接口与能力随时可能变化。
> 版本线与仓库一致：npm 只发 `preview` dist-tag，首个正式版定为 `0.0.1`。

DSH 的**远程控制**插件：一个带配对码的**局域网访问网关**。宿主 web UI 只绑
回环且拒绝通配地址，本插件自起一个 `node:http` 网关（默认 `0.0.0.0:31080`）
把**完整、自适应的 DSH Web UI** 反代给局域网内的手机——会话、流式输出、
发送消息、工具审批、智能体提问全部是宿主原生能力，本插件**不做任何业务
UI**（0.0.1-preview.1 起删除了自研手机页，改为纯网关）。

## 组成

- **网关**（`0.0.0.0:31080`，可配）：配对码门 → 反代宿主 webServer（`getOrigin()`）。
  - 上游鉴权照搬宿主 browser-auth：`ctx.connection.authenticatedUrl()` 服务端
    代换 launch token 得到签名 `dsh-auth-*` cookie，缓存后注入上游请求，并把
    cookie 下发给手机（宿主重启后 401 自动重换一次并重放）；
  - `Host`/`Origin`/`Referer` 统一改写为上游 authority，满足宿主 `/api` trust
    fence 的同 authority 检查；
  - SSE/分块响应直通不缓冲，WebSocket upgrade 原样中继；
  - 配对码三通道：`?token=`（扫码链接）/ `Authorization: Bearer` / 首访种下的
    `dsh-remote-ctrl` 配对 cookie（之后 webUI 自己的请求免带 token）。
- **桌面端面板**（slots 侧栏入口 + 主面板，宿主回环 `/remote-ctrl/api` 供数）：
  网关状态、上游就绪状态、各局域网地址链接、二维码（推荐私网地址 + 配对码）、
  配对码展示/复制、活跃连接数。

## 安全模型

- **配对码**：首启生成 24 字节随机码并持久化到 `home/remote-ctrl.json`
  （重启不变，二维码长期有效）；持有配对码 = 获得完整 webUI 访问权。
- **Host 校验**：Host 头必须是本机地址（防 DNS rebinding）。
- **跨站防护**：写请求要求同源 Origin，拒绝浏览器声明的
  `sec-fetch-site: cross-site`（与 dsh-agent-plugin-hub 的 fence 同构）。
- 请只在**可信局域网**使用；桌面面板数据面只挂宿主回环。

## 配置（cordis.patch.yml）

```yaml
- insert:
    - id: remote-ctrl
      name: 'dsh-remote-ctrl'
      config:
        home: ''          # 配对码持久化目录；留空 → DSH_REMOTE_CTRL_HOME → ~/.dsh/remote-ctrl
        host: '0.0.0.0'   # 网关监听地址；0.0.0.0 = 所有网卡（推荐）
        port: 31080       # 网关端口
        token: ''         # 留空 = 首启生成并持久化；填写则用固定配对码
```

## 开发

```powershell
cd packages\dsh-remote-ctrl
npm run check        # tsc --noEmit（node + client 双程序）
npm test             # vitest run（离线；proxy 用例带假上游模拟宿主 browser-auth）
npm run build        # tsdown：lib/index.js（ESM 宿主半）+ lib/client.js（面板）
```

真实宿主调试：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-debug.ps1 packages\dsh-remote-ctrl
```

装进 `zdebug` 后：桌面面板在侧栏「远程控制」；手机打开
`http://<局域网IP>:31080/?token=<配对码>` 即得完整 webUI。

## 许可

MIT。第三方内置：qrcode-generator（MIT © Kazuhiko Arase，见
`src/client/qrcode.ts` 头部说明）。
