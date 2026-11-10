# 0008 打开宿主官方 UI primitives 通道（仓库规则例外）

- 状态：已采纳，部分取代 [ADR-0004](0004-memory-detail-in-panel-native-open.md) 第 2 条
- 日期：2026-11-10
- 背景：ADR-0004 撤回侧栏双窗格、正文只在系统应用打开、面板内不自造渲染器，其依据是「purity 门禁禁止 import @deepseek-ai/*」与「客户端拿不到渲染组件」。复查宿主实现后确认：客户端 module seed 的 `require` 能取到 `@deepseek-ai/dsh-client-ui-primitives`（`MarkdownText`/`Toast`/`Modal`/`DetailDocument` 等）与 `@tanstack/react-virtual`，通道存在，只是被本仓库 `tsdown.config.ts` 的 purity 门禁挡住。用户在 2026-11-10 共识中确认打开该通道。

## 决策

1. **允许四个模块**：插件客户端可通过客户端 module seed 的 `require` 使用
   - `@deepseek-ai/dsh-client-ui-primitives` 的 `MarkdownText`（面板内正文只读渲染）、`Toast`、`Modal`；
   - `@tanstack/react-virtual`（长列表虚拟化）。
2. **门禁与规则同步**：`tsdown.config.ts` 的 purity 白名单加入这四个模块；`AGENTS.md` 硬规则 #4 与 [`docs/PLUGIN-DEV.md`](../PLUGIN-DEV.md) 记录「受控例外」的范围与理由，后续 PR 不得借此引入其他 `@deepseek-ai/*` 值导入。
3. **正文仍只读**：面板内新增正文只读预览；「用系统应用打开」保留为辅助入口，不再删除。
4. **降级容错**：客户端对 seed 模块的 `require` 必须容错，取不到时降级为自绘或系统打开，禁止因宿主升级或 seed 变化导致面板崩溃。
5. **升级回归**：宿主升级后回归这四项能力；新增宿主 primitives 使用需逐个评审，不自动扩大白名单。

## 理由

- 记忆以阅读为主，面板内只读预览是阅读主场景；纯 Web 宿主没有系统应用打开能力，正文完全不可见的缺口必须补。
- 复用宿主组件保持视觉与行为一致，避免自维护 Markdown 渲染器与虚拟列表。
- 把耦合面限制在四个组件并带降级分支，风险可控。

## 放弃的方案

- **继续不渲染正文**：阅读体验缺口；纯 Web 宿主无法阅读。
- **全量开放宿主 UI 模块**：耦合面不可控。
- **自写 Markdown 渲染器**：维护成本与渲染安全。

## 后果

- 仓库 purity 门禁放宽为一个受控例外，需要在文档与测试中固定边界。
- 客户端测试需 mock module seed 的 `require` 与降级分支。
- 宿主 primitives 是内部模块，升级可能破坏；每次宿主升级必须回归 B4 批次涉及的四项能力。