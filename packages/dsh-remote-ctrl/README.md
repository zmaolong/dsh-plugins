# dsh-remote-ctrl

> **试验性预览版（`0.0.1-preview.0`）**：仅供内部试验，接口与能力随时可能变化。
> 版本线与仓库一致：npm 只发 `preview` dist-tag，首个正式版定为 `0.0.1`。

DSH 的**远程控制**插件：在局域网内用手机（或任何浏览器）查看与控制 DSH ——
浏览会话与实时输出、发送消息、批准工具调用、回答智能体提问。功能形态参考
ZCode 移动端远程控制（扫码连接、会话列表、消息与审批），但**局域网直连**，
不依赖云中继；不含 Bot Channel。

## 组成

- **插件自起的 HTTP 服务**（默认 `0.0.0.0:31080`）：手机数据面。宿主 webServer
  拒绝通配绑定，因此本插件自己 `node:http` 监听 —— 绑定 `0.0.0.0` 后每个局域网
  地址都天然可达，无需选 IP；多网卡时面板把所有地址列出来并推荐第一个私网地址。
- **桌面端面板**（slots 侧栏入口 + 主面板）：服务状态、各地址链接、二维码
  （推荐地址 + 配对码）、配对码展示/复制、已连接设备数。数据走宿主 webServer
  的回环前缀 `/remote-ctrl/api`（仅本机回环页面可访问）。
- **手机页**：自包含 HTML + IIFE JS（vanilla，无框架），由插件服务直接下发；
  配对码门 → 会话列表 → 会话视图（SSE 实时流 + 打字机）→ 输入框发送 →
  待审批卡片（允许/拒绝）→ 提问卡片（选项/自由回答）。

## 会话能力的来源（同进程、与官方 Web 前端同权）

| 能力 | 宿主通道 |
|---|---|
| 会话列表 | `ctx.sessionController.list()`（回退 `ctx.sessionQuery.listSessions()`），`api-session/*` 事件增量刷新 |
| 历史基线 | `ctx.sessionQuery.readSession()`（冷读，不激活会话） |
| 发送消息 | `ctx.sessionController.prompt()`（幂等 requestId、queue 模式、冷会话自动 resume） |
| 实时输出 | `ctx.on('session/event')` + `ctx.on('agent/assistant-stream')`（token 级帧） |
| 审批代答 | `ctx.on('approval/request')` waterfall answerer：有手机连接时认领，同时放行桌面 UI（先答者定局），`req.signal` 撤回 → cancelled |
| 回答提问 | `ctx.on('user-questions/request')` 观察 + `ctx.userQuestions.answer()` 代答 |

## 安全模型

- **配对码**：首启生成 24 字节随机码并持久化到 `home/remote-ctrl.json`
  （重启不变，二维码长期有效）；所有 `/api/*` 请求必须携带（Bearer 头或
  `?token=`，EventSource 只能走 query）。
- **Host 校验**：Host 头必须是本机地址（防 DNS rebinding）。
- **同源防护**：写请求要求同源 Origin + JSON content-type，拒绝浏览器声明的
  `sec-fetch-site: cross-site`（与 dsh-agent-plugin-hub 的 fence 同构）。
- 请只在**可信局域网**使用：持有配对码即可查看会话、发送消息并批准工具调用。
- 桌面面板数据面只挂宿主回环（`127.0.0.1`），与手机服务互不相通。

## 配置（cordis.patch.yml）

```yaml
- insert:
    - id: remote-ctrl
      name: 'dsh-remote-ctrl'
      config:
        home: ''          # 配对码持久化目录；留空 → DSH_REMOTE_CTRL_HOME → ~/.dsh/remote-ctrl
        host: '0.0.0.0'   # 监听地址；0.0.0.0 = 所有网卡（推荐），也可收窄到单个 IP 字面量
        port: 31080       # 手机服务端口
        token: ''         # 留空 = 首启生成并持久化；填写则用固定配对码
```

## 开发

```powershell
cd packages\dsh-remote-ctrl
npm run check        # tsc --noEmit（node + client 双程序）
npm test             # vitest run（离线；server 用例走进程内回环监听）
npm run build        # tsdown：lib/index.js（ESM 宿主半）+ lib/client.js（面板）+ lib/mobile.js（手机页 IIFE）
```

真实宿主调试：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev-debug.ps1 packages\dsh-remote-ctrl
```

装进 `zdebug` 后：桌面面板在侧栏「远程控制」；手机页在浏览器打开
`http://127.0.0.1:31080/?token=<配对码>`（同一台机）或 `http://<局域网IP>:31080/`。

## 许可

MIT。第三方内置：qrcode-generator（MIT © Kazuhiko Arase，见
`src/client/qrcode.ts` 头部说明）。
