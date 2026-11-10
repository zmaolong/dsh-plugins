# 0004 记忆详情撤回侧栏双窗格：面板内弹窗 + 系统应用打开

- 状态：已采纳，取代 [ADR-0003](0003-memory-reading-view.md)；第 2 条「正文不在弹窗内展示」部分被 [ADR-0008](0008-host-ui-primitives-channel.md) 取代（面板内新增正文只读预览，系统应用打开保留）
- 日期：2026-11-10
- 背景：preview.14/15 按 ADR-0003 把记忆阅读面做成宿主右侧栏双窗格（「记忆详情」参数页签 + 宿主原生预览页签）。真机使用后确认交互不可接受：宿主布局中主面板与右侧栏互斥（`RightbarRoot` 仅当 `activePanelId === null` 时可见，主面板激活时 `sidebarRight.mounted === undefined`，侧栏命令直接抛错），因此点开任何一条记忆都必然退出「智能体扩展」主面板；返回还要再切一次面板，且列表的筛选/滚动状态随之重置。一次阅读动作付出一次面板往返，对以阅读为主的记忆不可接受。规格见 [`packages/dsh-agent-extension/docs/memory-reading-view.spec.md`](../../packages/dsh-agent-extension/docs/memory-reading-view.spec.md)。

## 决策

1. **撤回侧栏双窗格**：删除侧栏页签类型/正文槽注册、controller 的 `selectPanel(null)` → `openTab` → `openResource` 时序、参数页签组件与 resource 地址拼装；不再切换主面板。
2. **详情回到面板内宽弹窗**：名称/描述/类型/标签/重要性可编辑，停用/恢复、归档、两步删除保留；**正文不在弹窗内展示**（既不显示 Markdown 源码，也不自造渲染器）。
3. **阅读交给系统应用**：`GET /memory/preview-file` 生成只含正文的临时 `.md`，前端经宿主 Client Remote `session.openWorkspacePath({ path })` 把文件交给本机关联应用（Typora、VS Code、记事本等）打开；`session.canOpenWorkspacePath()` 为 false 的纯 Web 部署给出「当前环境不支持」提示。打开动作仍由宿主完成，插件不 spawn 进程。
4. **预览文件生命周期保留**：`src/memory/preview.ts` 按 id 覆写、7 天清理、删除记忆时清理，用途从「侧栏预览页签」改为「系统应用打开的稳定入口」。

## 理由

- 记忆以阅读为主、人工编辑低频；「留在面板里」比「换到侧栏再回来」更贴近高频查看的路径。
- 不引入、不维护任何 Markdown 渲染器，观感与渲染安全完全交给用户熟悉的编辑器；插件只负责派生正文与调用宿主既有原生打开能力。
- 打开动作经 `session.openWorkspacePath`：路径先过宿主组合文件系统的 Host 路径校验，再交 OS 关联程序执行，安全边界与宿主「在系统中打开」完全一致。
- 宿主侧栏 API 为 pre-stable，撤回后不再依赖 `sidebarRight`/`sidebarRightTabs`/`openResource`，插件对宿主内部布局的耦合面大幅缩小。

## 放弃的方案

- **保留侧栏双窗格（ADR-0003 原方案）**：交互代价经真机确认不可接受，撤回。
- **弹窗内自造/引用 Markdown 渲染**：原 ADR-0003 已论证（第三方无渲染件通道、purity 门禁、长期维护成本），继续放弃。
- **常驻浮层/iframe 预览**：同样需要渲染器或破坏面板上下文，不采用。

## 后果

- 详情弹窗不再内嵌正文预览，正文阅读依赖系统应用；插件无法统计阅读行为、无法在应用内提供搜索定位。
- 纯 Web 宿主（无原生打开能力）只能提示不支持；桌面/本地调试宿主可完整使用。
- 记忆库格式与 `/memory/preview-file` 契约不变，无需数据迁移；仅临时预览文件的消费者换成了系统应用。
