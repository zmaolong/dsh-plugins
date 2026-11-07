/**
 * 智能体插件（Agent Plugins）面板的浏览器端：ZCode「插件市场」同构的商店 UI。
 *
 * 纯 JS、无构建步骤：由 `dsh.client` 清单加载，向 `window.__ModuleLoader__` 注册模块；
 * 通过宿主 `ctx.slots` 注册到 `sidebar.panellist`（侧栏入口）、`main`（商店主面板）与
 * `shell.overlay`（弹窗 / Toast 框架级浮层）。数据来自 Host 的 `/agent-plugin/api/*`。
 *
 * 首版范围：只有「个人插件」分段（按市场源分组），不做公开 / 社区 / 应用插件专区。
 * 市场源由输入路径自动识别（本地目录 / Git 仓库 / marketplace.json 直链）。
 *
 * @module dsh-agent-plugin-hub/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-agent-plugin-hub',
  factory(require) {
    const React = require('react')
    const { useCallback, useEffect, useRef, useState } = React
    const h = React.createElement

    const NS = 'agentPluginHub'
    const API_BASE = '/agent-plugin/api'

    /* ---------------------------------------------------------------------- *
     * 文案（中英文；由 locale 服务的 active 语言前缀选择）
     * ---------------------------------------------------------------------- */
    const EN = {
      tab: 'Agent Plugins',
      title: 'Agent Plugins',
      segmentPersonal: 'Personal',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      sources: 'Marketplace sources',
      add: 'Add',
      addMarketplace: 'Add plugin marketplace',
      manage: 'Manage plugins',
      browseMarketplace: 'Browse plugin marketplace',
      searchPlaceholder: 'Search plugins',
      searchResults: 'Search results ({count})',
      searchEmpty: 'No plugins match your search',
      personalEmpty: 'No plugins from personal sources yet. Use “Add” in the top right to add a marketplace source.',
      catalogLoading: 'Loading plugins…',
      catalogEmpty: 'No marketplace plugins found',
      marketEmpty: 'This marketplace lists no plugins.',
      viewMore: 'See {names}, and {count} more',
      viewMoreFew: 'See {names}',
      showLess: 'Show less',
      install: 'Install',
      installing: 'Installing…',
      installedToast: 'Installed {name}',
      update: 'Update',
      updating: 'Updating…',
      updatedToast: 'Updated {name}',
      upToDate: '{name} is already up to date',
      updateAvailable: 'Update',
      updateAll: 'Update all ({count})',
      updateAllDone: 'Updated {count} plugin(s)',
      updateAllPartial: 'Updated {succeeded}, failed {failed}: {plugins}',
      updateAllAborted: 'Update all stopped; updated {count} plugin(s)',
      checkFound: 'Found {count} plugin update(s) available',
      checkNone: 'All installed plugins are up to date',
      refreshPartial: 'Refresh finished with {count} failure(s); see marketplace sources',
      enable: 'Enable',
      disable: 'Disable',
      enabled: 'Enabled',
      disabled: 'Disabled',
      enabledToast: 'Enabled {name}',
      disabledToast: 'Disabled {name}',
      toggleFailed: 'Couldn’t update {name}. Try again.',
      uninstall: 'Uninstall',
      uninstallTitle: 'Uninstall {name}?',
      uninstallDescription: 'This removes the plugin’s cached files, its data directory, and any saved configuration. This cannot be undone.',
      uninstalledToast: 'Uninstalled {name}',
      rollback: 'Roll back',
      rollbackTitle: 'Roll back {name}?',
      rollbackDescription: 'Switch the installed copy back to version {version}. The current version is kept for another rollback.',
      rollbackToast: 'Rolled back {name} to {version}',
      back: 'Back',
      detail: 'Details',
      moreActions: 'More actions',
      sectionMcp: 'MCP servers',
      sectionSkills: 'Skills',
      sectionCommands: 'Commands',
      sectionHooks: 'Hooks',
      infoTitle: 'Information',
      infoDeveloper: 'Developer',
      infoCategory: 'Category',
      infoVersion: 'Version',
      infoMarket: 'Source',
      infoWebsite: 'Website',
      infoRepository: 'Repository',
      infoLicense: 'License',
      infoInstalledAt: 'Installed at',
      moreDetails: 'Advanced details',
      rootPath: 'Root path',
      format: 'Format',
      hooksSource: 'Hooks source',
      mcpSource: 'MCP source',
      warnings: 'Warnings',
      rollbackVersions: 'Rollback versions',
      runtimeStatus: 'Runtime',
      componentsLoading: 'Loading components…',
      componentsError: 'Couldn’t load the component list. Showing available info only.',
      componentsRetry: 'Retry',
      componentsEmpty: 'This plugin doesn’t declare components, or they couldn’t be read.',
      componentsNotEffective: 'Not effective',
      componentsEffective: 'Effective',
      hostEvent: 'Host event',
      canBlock: 'can block',
      sourceMissing: 'Marketplace source is missing. This plugin remains usable, but updates are unavailable.',
      sourceMissingShort: 'Source missing',
      noDescription: 'No description',
      close: 'Close',
      cancel: 'Cancel',
      confirm: 'Confirm',
      addMarketTitle: 'Add marketplace',
      addMarketSourceLabel: 'GitHub repo, git URL, file, or directory',
      addMarketHint: 'Local directories, Git repositories, and marketplace.json links are recognized automatically.',
      addMarketRisk: 'Unofficial plugin marketplaces may contain malicious plugins that can harm your device. Verify the source and take precautions before adding.',
      addMarketRiskAck: 'I understand the risks, have verified the source, and have taken precautions.',
      marketName: 'Name (optional)',
      adding: 'Adding…',
      addedToast: 'Added marketplace: {name} ({type}, {count} plugins)',
      detectedLocal: 'local directory',
      detectedGit: 'Git repository',
      detectedUrl: 'marketplace.json URL',
      sourcesEmpty: 'No marketplace sources registered yet',
      sourcePluginCount: '{count} plugins',
      sourceUpdated: 'Updated {time}',
      sourceRefreshFailed: 'Refresh failed at {time}: {message}',
      sourceRefresh: 'Refresh this marketplace',
      sourceRemove: 'Remove this marketplace',
      refreshDone: 'Refreshed {name}',
      remove: 'Remove',
      removeMarketTitle: 'Remove marketplace?',
      removeMarketDescription: 'Installed plugins are kept and remain usable, but they will lose their source and update ability. Add the same source again to restore.',
      removedMarketToast: 'Removed marketplace: {name}',
      orphanedToast: 'Removed {name}; {count} installed plugin(s) became orphaned',
      installedGroup: 'Installed',
      noInstalled: 'No plugins are installed in this scope.',
      noInstalledTitle: 'No plugins installed',
      noInstalledDescription: 'Browse the store and install plugins to add MCP, skills, commands and hooks.',
      filterLabel: 'Status filter',
      filterAll: 'All',
      filterEnabled: 'Enabled',
      filterDisabled: 'Disabled',
      version: 'Version',
      statusFilter: 'Status filter',
      updatesAvailable: '{count} updates available',
      operationBusy: 'Another operation is in progress. Try again shortly.',
      apiUnavailable: 'Agent Plugins API unavailable',
      apiHint: 'This page is not served over the loopback origin, or the host has not loaded the current plugin code. Refresh the page and retry.',
      migrationError: 'Data migration failed: {message}. Your original data is preserved under the hub logs directory.',
      retry: 'Retry',
      unknownError: 'Unknown error',
      loading: 'Loading…',
      runtimeSkills: 'Skills',
      runtimeCommands: 'Commands',
      runtimeHooks: 'Hooks',
      runtimeMcp: 'MCP',
      runtimeNotEffective: 'not effective',
      runtimeEffective: 'ready',
      enabledCount: '{total} plugins · {enabled} enabled',
      pluginCount: '{count} plugins',
      installedBadge: 'Installed',
      updateBadge: 'Update',
      notInstallable: 'Not installable',
      menuEnable: 'Enable',
      menuDisable: 'Disable',
      menuUninstall: 'Uninstall',
      hooksInactive: 'Not effective: {reason}',
      clearSearch: 'Clear search',
      allSources: 'All sources',
    }
    const ZH = {
      tab: '智能体插件',
      title: '智能体插件',
      segmentPersonal: '个人',
      refresh: '刷新',
      refreshing: '刷新中…',
      sources: '市场源',
      add: '添加',
      addMarketplace: '添加插件市场',
      manage: '插件管理',
      browseMarketplace: '浏览插件市场',
      searchPlaceholder: '搜索插件',
      searchResults: '搜索结果（{count}）',
      searchEmpty: '没有匹配的插件',
      personalEmpty: '个人来源还没有插件。用右上角的「添加」添加市场源。',
      catalogLoading: '正在加载插件…',
      catalogEmpty: '暂无市场插件',
      marketEmpty: '该市场里没有插件条目。',
      viewMore: '查看 {names}，以及另外 {count} 个',
      viewMoreFew: '查看 {names}',
      showLess: '收起',
      install: '安装',
      installing: '安装中…',
      installedToast: '已安装 {name}',
      update: '更新',
      updating: '更新中…',
      updatedToast: '已更新 {name}',
      upToDate: '{name} 已是最新版本',
      updateAvailable: '可更新',
      updateAll: '全部更新（{count}）',
      updateAllDone: '已更新 {count} 个插件',
      updateAllPartial: '已更新 {succeeded} 个，{failed} 个失败：{plugins}',
      updateAllAborted: '全部更新已中止；已更新 {count} 个插件',
      checkFound: '发现 {count} 个插件可更新',
      checkNone: '所有已安装插件已更新',
      refreshPartial: '刷新完成，{count} 个市场失败；可在市场源中查看',
      enable: '启用',
      disable: '停用',
      enabled: '已启用',
      disabled: '已停用',
      enabledToast: '已启用 {name}',
      disabledToast: '已停用 {name}',
      toggleFailed: '无法更新 {name}，请重试。',
      uninstall: '卸载',
      uninstallTitle: '卸载 {name}？',
      uninstallDescription: '将删除该插件的缓存文件、数据目录以及已保存的配置。此操作无法撤销。',
      uninstalledToast: '已卸载 {name}',
      rollback: '回滚',
      rollbackTitle: '回滚 {name}？',
      rollbackDescription: '将已安装副本切回版本 {version}。当前版本会保留，可再次回滚。',
      rollbackToast: '已将 {name} 回滚到 {version}',
      back: '返回',
      detail: '详情',
      moreActions: '更多操作',
      sectionMcp: 'MCP 服务器',
      sectionSkills: '技能',
      sectionCommands: '命令',
      sectionHooks: 'Hooks',
      infoTitle: '信息',
      infoDeveloper: '开发者',
      infoCategory: '类别',
      infoVersion: '版本',
      infoMarket: '来源',
      infoWebsite: '网站',
      infoRepository: '仓库',
      infoLicense: '许可',
      infoInstalledAt: '安装时间',
      moreDetails: '高级信息',
      rootPath: '安装路径',
      format: '格式',
      hooksSource: 'Hooks 来源',
      mcpSource: 'MCP 来源',
      warnings: '警告',
      rollbackVersions: '可回滚版本',
      runtimeStatus: '运行状态',
      componentsLoading: '正在加载组件…',
      componentsError: '组件清单加载失败，仅展示可得信息。',
      componentsRetry: '重试',
      componentsEmpty: '该插件未声明组件，或组件无法读取。',
      componentsNotEffective: '未生效',
      componentsEffective: '已生效',
      hostEvent: '宿主事件',
      canBlock: '可阻断',
      sourceMissing: '市场来源已移除。插件仍可使用，但暂时无法更新。',
      sourceMissingShort: '来源已移除',
      noDescription: '暂无描述',
      close: '关闭',
      cancel: '取消',
      confirm: '确定',
      addMarketTitle: '添加插件市场',
      addMarketSourceLabel: 'GitHub 仓库、Git URL、文件或目录',
      addMarketHint: '支持本地目录、Git 仓库地址与 marketplace.json 直链，自动识别来源类型与插件格式。',
      addMarketRisk: '非官方插件市场可能包含恶意插件，损害设备。请先核实来源并做好风险防范，再添加。',
      addMarketRiskAck: '我已了解风险，并已核实来源、做好风险防范。',
      marketName: '名称（可选）',
      adding: '添加中…',
      addedToast: '已添加市场：{name}（{type}，{count} 个插件）',
      detectedLocal: '本地目录',
      detectedGit: 'Git 仓库',
      detectedUrl: 'marketplace.json 直链',
      sourcesEmpty: '还没有登记任何市场源',
      sourcePluginCount: '{count} 个插件',
      sourceUpdated: '更新于 {time}',
      sourceRefreshFailed: '刷新失败于 {time}：{message}',
      sourceRefresh: '刷新该市场',
      sourceRemove: '移除该市场',
      refreshDone: '已刷新 {name}',
      remove: '移除',
      removeMarketTitle: '移除市场源？',
      removeMarketDescription: '已安装插件会保留并可继续使用，但会失去来源与更新能力。重新添加同一来源后恢复。',
      removedMarketToast: '已移除市场：{name}',
      orphanedToast: '已移除 {name}；{count} 个已安装插件失去来源',
      installedGroup: '已安装',
      noInstalled: '当前范围尚未安装插件。',
      noInstalledTitle: '尚未安装插件',
      noInstalledDescription: '浏览市场并安装插件，以添加 MCP、技能、命令与 hooks 能力。',
      filterLabel: '启用状态',
      filterAll: '全部',
      filterEnabled: '已启用',
      filterDisabled: '未启用',
      version: '版本',
      statusFilter: '启用状态',
      updatesAvailable: '{count} 个可更新',
      operationBusy: '另一个操作正在进行，请稍后重试。',
      apiUnavailable: '智能体插件 API 不可用',
      apiHint: '当前页面不是通过本机回环访问，或宿主尚未加载新版插件代码。刷新页面后重试。',
      migrationError: '数据迁移失败：{message}。原始数据仍保留在 hub 日志目录中。',
      retry: '重试',
      unknownError: '未知错误',
      loading: '加载中…',
      runtimeSkills: '技能',
      runtimeCommands: '命令',
      runtimeHooks: 'hooks',
      runtimeMcp: 'MCP',
      runtimeNotEffective: '未生效',
      runtimeEffective: '就绪',
      enabledCount: '共 {total} 个插件 · {enabled} 个已启用',
      pluginCount: '{count} 个插件',
      installedBadge: '已安装',
      updateBadge: '可更新',
      notInstallable: '不可安装',
      menuEnable: '启用',
      menuDisable: '停用',
      menuUninstall: '卸载',
      hooksInactive: '未生效：{reason}',
      clearSearch: '清空搜索',
      allSources: '全部来源',
    }

    /* ---------------------------------------------------------------------- *
     * 样式（静态客户端半身没有 styles.insert，在 apply 里插入一个带标记的 <style>）
     * 颜色全部走宿主主题 token；hover / 选中 / success 底用 color-mix 派生。
     * ---------------------------------------------------------------------- */
    const CSS = `
.aph-root{position:relative;height:100%;min-height:0;overflow-y:auto;overflow-x:hidden;container-type:inline-size;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5}
.aph-root *{box-sizing:border-box}
/* 主题派生变量：亮色下品牌色近黑、暗色下近白，因此按钮文字必须用 label-primary-foreground；
   hover/选中用宿主 interactive token，避免自造明暗两套色值。 */
.aph-root,.aph-overlay-root{--aph-on-brand:var(--dsw-alias-label-primary-foreground,#fff);--aph-hover:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));--aph-active:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.2))}
.aph-page{display:flex;flex-direction:column;gap:20px;min-height:100%;padding:20px 24px 32px}
.aph-topbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}
.aph-title{margin:0;font-size:18px;font-weight:600;letter-spacing:-0.01em}
.aph-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.aph-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .12s ease,color .12s ease,border-color .12s ease,opacity .12s ease}
.aph-btn:hover:not(:disabled){background:var(--aph-hover)}
.aph-btn:active:not(:disabled){background:var(--aph-active)}
.aph-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.aph-btn:disabled{opacity:.5;cursor:not-allowed}
.aph-btn.icon{width:32px;padding:0;border-color:transparent;background:transparent}
.aph-btn.icon:hover:not(:disabled){background:var(--aph-hover)}
.aph-btn.primary{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));border-color:transparent;color:var(--aph-on-brand)}
.aph-btn.primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary));color:var(--aph-on-brand)}
.aph-btn.pill{border-radius:999px}
.aph-btn.danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent)}
.aph-btn.danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.aph-btn.secondary-icon{width:32px;padding:0;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.aph-btn.secondary-icon:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--aph-hover)}
.aph-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px}
.aph-seg{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px}
.aph-seg-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:14px;font-weight:500;cursor:pointer;transition:background .12s ease,color .12s ease}
.aph-seg-pill:hover{background:var(--aph-hover);color:var(--dsw-alias-label-primary)}
.aph-seg-pill[aria-pressed="true"]{background:var(--aph-active);color:var(--dsw-alias-label-primary)}
.aph-seg-pill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.aph-search{position:relative;display:flex;align-items:center;flex:1 1 14rem;min-width:0;margin-left:auto;max-width:320px}
.aph-search>svg{position:absolute;left:12px;color:var(--dsw-alias-label-secondary);pointer-events:none}
.aph-search input{width:100%;height:36px;padding:0 12px 0 36px;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px}
.aph-search input::placeholder{color:var(--dsw-alias-label-secondary)}
.aph-search input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.aph-search.clear input{padding-right:36px}
.aph-search-clear{position:absolute;right:4px;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.aph-search-clear:hover{background:var(--aph-hover)}
.aph-section{display:flex;flex-direction:column}
.aph-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:0 8px 8px}
.aph-section-title{margin:0;font-size:16px;font-weight:500}
.aph-section-count{font-size:12px;color:var(--dsw-alias-label-secondary)}
.aph-divider{height:1px;background:var(--dsw-alias-bg-layer-2)}
.aph-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:24px;row-gap:4px;margin-top:8px}
.aph-grid.single{grid-template-columns:minmax(0,1fr)}
@container (max-width:640px){.aph-grid{grid-template-columns:minmax(0,1fr)}}
@container (max-width:640px){.aph-grid.single{grid-template-columns:minmax(0,1fr)}}
@media (max-width:720px){.aph-grid{grid-template-columns:minmax(0,1fr)}}
.aph-card{display:flex;align-items:center;gap:12px;min-width:0;padding:12px 8px;border-radius:12px;cursor:pointer;transition:background .12s ease;text-align:left;background:transparent;border:0;font:inherit;color:inherit;width:100%}
.aph-card:hover{background:var(--aph-hover)}
.aph-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.aph-avatar{display:flex;align-items:center;justify-content:center;flex:none;width:40px;height:40px;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 70%,var(--dsw-alias-label-primary) 5%);color:var(--dsw-alias-label-secondary);overflow:hidden}
.aph-avatar.large{width:64px;height:64px;border-radius:16px}
.aph-avatar img{width:100%;height:100%;object-fit:contain}
.aph-card-body{display:flex;flex-direction:column;min-width:0;flex:1}
.aph-card-title-line{display:flex;align-items:center;gap:6px;min-width:0}
.aph-card-title{font-size:14px;font-weight:500;line-height:20px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aph-card-desc{font-size:13px;line-height:20px;min-height:20px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}
.aph-card-sub{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
.aph-card-warning{display:flex;align-items:center;gap:4px;margin-top:2px;font-size:12px;color:var(--dsw-alias-state-warn-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aph-card-actions{display:flex;flex:none;align-items:center;gap:6px;position:relative}
.aph-card .aph-menu-wrap{opacity:0;transition:opacity .12s ease}
.aph-card:hover .aph-menu-wrap,.aph-card:focus-within .aph-menu-wrap,.aph-card .aph-menu[data-open="true"]{opacity:1}
@media (hover:none){.aph-card .aph-menu-wrap{opacity:1}}
.aph-badge{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:999px;font-size:11px;line-height:1;white-space:nowrap;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1)}
.aph-badge.success{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent)}
.aph-badge.warn{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent)}
.aph-badge.error{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.aph-badge.plain{border-color:transparent;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 60%,var(--dsw-alias-label-primary) 8%)}
.aph-update-badge{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:999px;font-size:11px;line-height:1;white-space:nowrap;color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent)}
.aph-menu-wrap{position:relative;display:inline-flex}
.aph-menu-backdrop{position:fixed;inset:0;z-index:40;background:transparent}
.aph-menu{position:absolute;top:calc(100% + 4px);right:0;z-index:41;min-width:168px;padding:4px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);box-shadow:0 10px 30px rgba(0,0,0,.28)}
.aph-menu-item{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;text-align:left;cursor:pointer}
.aph-menu-item:hover{background:var(--aph-hover)}
.aph-menu-item.danger{color:var(--dsw-alias-state-error-primary)}
.aph-menu-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l1)}
.aph-switch{position:relative;display:inline-flex;flex:none;width:32px;height:18px;border-radius:999px;border:0;background:var(--dsw-alias-border-l3);padding:0;cursor:pointer;transition:background .15s ease}
.aph-switch::after{content:"";position:absolute;top:1px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-switch-thumb);transition:left .15s ease,background .15s ease}
.aph-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}
.aph-switch[aria-checked="true"]::after{left:16px;background:var(--dsw-alias-label-primary-foreground)}
.aph-switch:disabled{opacity:.5;cursor:not-allowed}
.aph-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.aph-collapse-row{display:flex;align-items:center;gap:8px;width:100%;margin-top:8px;padding:8px 8px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:14px;text-align:left;cursor:pointer}
.aph-collapse-row:hover{background:var(--aph-hover);color:var(--dsw-alias-label-primary)}
.aph-collapse-avatars{display:flex;flex:none;align-items:center;gap:6px}
.aph-collapse-avatars .aph-avatar{width:20px;height:20px;border-radius:6px}
.aph-collapse-avatars .aph-avatar svg{width:10px;height:10px}
.aph-placeholder{display:flex;align-items:center;justify-content:center;gap:8px;min-height:96px;padding:24px 16px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;color:var(--dsw-alias-label-secondary);font-size:14px;text-align:center}
.aph-placeholder.column{flex-direction:column;gap:12px}
.aph-placeholder-title{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary)}
.aph-placeholder-desc{font-size:12px;max-width:420px}
.aph-error{border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary);padding:10px 12px;border-radius:10px;font-size:13px;white-space:pre-wrap;word-break:break-word}
.aph-warning{border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent);color:var(--dsw-alias-state-warn-primary);padding:10px 12px;border-radius:10px;font-size:13px;display:flex;align-items:flex-start;gap:8px}
.aph-warning .aph-inline-btn{margin-left:auto}
.aph-spinner{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid color-mix(in srgb,currentColor 30%,transparent);border-top-color:currentColor;animation:aph-spin .8s linear infinite;flex:none}
.aph-spinner.large{width:20px;height:20px;border-width:2.5px}
@keyframes aph-spin{to{transform:rotate(360deg)}}
.aph-back{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px;margin-left:-8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:14px;cursor:pointer;width:fit-content}
.aph-back:hover{background:var(--aph-hover);color:var(--dsw-alias-label-primary)}
.aph-detail{gap:32px}
.aph-detail-head{display:flex;align-items:flex-start;gap:16px;min-width:0}
.aph-detail-headmain{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.aph-detail-titleline{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
.aph-detail-title{margin:0;font-size:18px;font-weight:500;min-width:0;word-break:break-word}
.aph-detail-desc{margin:0;font-size:14px;color:var(--dsw-alias-label-secondary)}
.aph-detail-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;flex:none}
.aph-detail-warning{display:flex;align-items:center;gap:6px;font-size:14px;color:var(--dsw-alias-state-warn-primary)}
.aph-comp-head{display:flex;align-items:baseline;gap:8px;padding-bottom:8px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.aph-comp-title{margin:0;font-size:16px;font-weight:600}
.aph-comp-count{font-size:14px;color:var(--dsw-alias-label-secondary)}
.aph-comp-list{display:flex;flex-direction:column;margin-top:4px}
.aph-comp-row{display:flex;align-items:center;gap:12px;min-width:0;padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l1) 55%,transparent)}
.aph-comp-row:last-child{border-bottom:0}
.aph-comp-icon{display:flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 60%,var(--dsw-alias-label-primary) 8%);color:var(--dsw-alias-label-secondary)}
.aph-comp-body{display:flex;flex-direction:column;min-width:0;flex:1}
.aph-comp-name{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aph-comp-desc{margin-top:2px;font-size:14px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aph-comp-side{display:flex;align-items:center;gap:8px;flex:none}
.aph-info{display:flex;flex-direction:column;gap:10px}
.aph-info-row{display:grid;grid-template-columns:128px minmax(0,1fr);gap:12px;align-items:baseline}
.aph-info-label{font-size:14px;color:var(--dsw-alias-label-secondary)}
.aph-info-value{font-size:14px;color:var(--dsw-alias-label-primary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aph-info-value a{color:var(--dsw-alias-label-primary);text-decoration:none;display:inline-flex;align-items:center;gap:4px}
.aph-info-value a:hover{color:var(--dsw-alias-brand-primary)}
.aph-advanced{border-top:1px solid var(--dsw-alias-border-l1);padding-top:16px}
.aph-advanced summary{display:flex;align-items:center;gap:8px;list-style:none;cursor:pointer;font-size:14px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.aph-advanced summary::-webkit-details-marker{display:none}
.aph-advanced summary:hover{color:var(--dsw-alias-label-primary)}
.aph-advanced summary .aph-chev{transition:transform .15s ease}
.aph-advanced[open] summary .aph-chev{transform:rotate(90deg)}
.aph-advanced-body{display:flex;flex-direction:column;gap:12px;margin-top:12px}
.aph-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:var(--dsw-alias-label-secondary);word-break:break-all}
.aph-list-block{display:flex;flex-direction:column;gap:6px}
.aph-list-title{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.aph-list-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);font-size:13px}
.aph-runtime{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);padding-top:8px}
.aph-overlay-root{position:absolute;inset:0;z-index:30;pointer-events:none;font-size:14px;color:var(--dsw-alias-label-primary)}
.aph-overlay-mask{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.6);backdrop-filter:blur(2px);pointer-events:auto}
.aph-dialog{width:min(480px,calc(100vw - 32px));max-height:calc(100vh - 80px);display:flex;flex-direction:column;gap:16px;padding:16px;border-radius:16px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);box-shadow:0 24px 64px rgba(0,0,0,.35);pointer-events:auto}
.aph-dialog.narrow{width:min(420px,calc(100vw - 32px))}
.aph-dialog-head{display:flex;align-items:center;gap:8px}
.aph-dialog-title{margin:0;font-size:16px;font-weight:500;flex:1;min-width:0}
.aph-dialog-body{display:flex;flex-direction:column;gap:12px;min-height:0;overflow-y:auto}
.aph-dialog-foot{display:flex;justify-content:flex-end;gap:8px}
.aph-field{display:flex;flex-direction:column;gap:6px}
.aph-field-label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.aph-input{width:100%;height:36px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px}
.aph-input::placeholder{color:var(--dsw-alias-label-secondary)}
.aph-input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.aph-risk{display:flex;gap:8px;align-items:flex-start;padding:12px;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent);color:var(--dsw-alias-state-warn-primary);font-size:13px}
.aph-check{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.aph-check input{margin:3px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary)}
.aph-source-row{display:flex;align-items:center;gap:12px;padding:8px;border-radius:8px}
.aph-source-row:hover{background:var(--aph-hover)}
.aph-source-main{display:flex;flex-direction:column;min-width:0;flex:1}
.aph-source-name{font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aph-source-sub{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aph-source-error{display:flex;align-items:flex-start;gap:4px;margin-top:4px;font-size:12px;color:var(--dsw-alias-state-error-primary);word-break:break-word}
.aph-toasts{position:absolute;right:20px;bottom:20px;display:flex;flex-direction:column;gap:8px;max-width:min(400px,calc(100vw - 40px));pointer-events:none}
.aph-toast{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-toast-bg,var(--dsw-alias-bg-overlay));color:var(--dsw-alias-toast-label,var(--dsw-alias-label-primary));box-shadow:0 12px 32px rgba(0,0,0,.28);font-size:13px;pointer-events:auto;animation:aph-toast-in .18s ease}
.aph-toast.success{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 40%,transparent)}
.aph-toast.warn{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 40%,transparent)}
.aph-toast.error{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent)}
.aph-toast-body{flex:1;min-width:0;white-space:pre-wrap;word-break:break-word}
.aph-toast-close{flex:none;border:0;background:transparent;color:color-mix(in srgb,currentColor 65%,transparent);cursor:pointer;padding:2px;border-radius:4px;display:flex}
.aph-toast-close:hover{color:currentColor}
@keyframes aph-toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.aph-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.aph-icon-btn:hover{background:var(--aph-hover);color:var(--dsw-alias-label-primary)}
.aph-icon-btn:disabled{opacity:.45;cursor:not-allowed}
.aph-inline-btn{display:inline-flex;align-items:center;gap:4px;border:0;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer;padding:0}
.aph-inline-btn:hover{text-decoration:underline}
.aph-footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);padding-top:8px}
.aph-hidden{display:none!important}
`

    /* ---------------------------------------------------------------------- *
     * 图标（lucide 路径，内联 SVG，不依赖图标库）
     * ---------------------------------------------------------------------- */
    const ICONS = {
      refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
      store: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
      plus: ['M12 5v14', 'M5 12h14'],
      chevronDown: ['m6 9 6 6 6-6'],
      chevronRight: ['m9 18 6-6-6-6'],
      arrowLeft: ['M19 12H5', 'm12 19-7-7 7-7'],
      arrowRight: ['M5 12h14', 'm12 5 7 7-7 7'],
      more: [[5, 12, 1.4], [12, 12, 1.4], [19, 12, 1.4]],
      download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
      search: [[11, 11, 8], 'm21 21-4.3-4.3'],
      x: ['M18 6 6 18', 'm6 6 12 12'],
      external: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14 21 3'],
      power: ['M12 2v10', 'M18.4 6.6a9 9 0 1 1-12.77.04'],
      trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6'],
      alert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
      blocks: ['M10 3H3v7h7V3z', 'M14 3h7v7h-7V3z', 'M10 14H3v7h7v-7z', 'M14 14h7v7h-7v-7z'],
      server: ['M4 4h16v6H4z', 'M4 14h16v6H4z', 'M7 7h.01', 'M7 17h.01'],
      wand: ['m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72', 'm14 7 3 3', 'M5 6v4', 'M19 14v4', 'M10 2v2', 'M7 8H3', 'M21 16h-3', 'M14 22v-2'],
      terminal: ['m4 17 6-6-6-6', 'M12 19h8'],
      anchor: [[12, 5, 3], 'M12 8v14', 'M5 12H2a10 10 0 0 0 20 0h-3'],
      check: ['M20 6 9 17l-5-5'],
      info: [[12, 12, 10], 'M12 16v-4', 'M12 8h.01'],
      folder: ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'],
    }

    function Icon({ name, size = 16, strokeWidth = 1.8 }) {
      const shape = ICONS[name] || []
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        style: { display: 'block', flex: 'none' },
      }, shape.map((part, index) => (typeof part === 'string'
        ? h('path', { key: index, d: part })
        : h('circle', { key: index, cx: part[0], cy: part[1], r: part[2], fill: 'currentColor', stroke: 'none' }))))
    }

    function Spinner({ large }) {
      return h('span', { className: `aph-spinner${large ? ' large' : ''}`, 'aria-hidden': true })
    }

    /* ---------------------------------------------------------------------- *
     * 工具函数
     * ---------------------------------------------------------------------- */
    function errorMessage(error) {
      if (error && typeof error.message === 'string' && error.message !== '') return error.message
      return String(error)
    }

    function pad2(value) {
      return String(value).padStart(2, '0')
    }

    function formatTime(value) {
      if (typeof value !== 'string' || value.trim() === '') return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
    }

    function canonicalTitle(name) {
      const text = String(name ?? '')
      const words = text.split(/[-_\s]+/u).filter(Boolean)
      if (words.length === 0) return text
      return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    }

    /** 多语言取值：精确 locale → 语言前缀 → base。 */
    function pickI18n(base, map, localeId) {
      const id = String(localeId ?? '').toLowerCase()
      if (map && typeof map === 'object' && !Array.isArray(map) && id !== '') {
        if (typeof map[id] === 'string' && map[id].trim() !== '') return map[id]
        const prefix = id.split('-')[0]
        for (const key of Object.keys(map)) {
          const keyId = String(key).toLowerCase()
          if (keyId === id || keyId.split('-')[0] === prefix) {
            if (typeof map[key] === 'string' && map[key].trim() !== '') return map[key]
          }
        }
      }
      return typeof base === 'string' && base.trim() !== '' ? base : ''
    }

    /** 条目/已安装项的展示字段。 */
    function displayOf(entity, localeId) {
      const display = (entity && entity.display) || {}
      const title = pickI18n(display.title, display.titleI18n, localeId) || canonicalTitle(entity && entity.name)
      const description = pickI18n(display.description, display.descriptionI18n, localeId)
      const author = display.author && typeof display.author === 'object'
        ? display.author
        : (typeof display.author === 'string' && display.author ? { name: display.author } : null)
      return {
        title,
        description,
        category: typeof display.category === 'string' ? display.category : '',
        author,
        homepage: typeof display.homepage === 'string' ? display.homepage : '',
        repository: typeof display.repository === 'string' ? display.repository : '',
        license: typeof display.license === 'string' ? display.license : '',
        keywords: Array.isArray(display.keywords) ? display.keywords : [],
        icon: display.icon && typeof display.icon === 'object' ? display.icon : { kind: 'none', url: null, mime: null },
        titleI18n: display.titleI18n,
        descriptionI18n: display.descriptionI18n,
      }
    }

    /** 只接受 https 外链。 */
    function httpsUrl(value) {
      return typeof value === 'string' && /^https:\/\//iu.test(value) ? value : ''
    }

    /** 图标 src：仅 https、受限 data raster、同源 /icon 路由。 */
    function iconSrc(icon) {
      if (!icon || typeof icon !== 'object') return ''
      if (icon.kind === 'route' && typeof icon.url === 'string' && icon.url.startsWith('/agent-plugin/api/icon')) return icon.url
      if (icon.kind === 'http' && httpsUrl(icon.url)) return icon.url
      if (icon.kind === 'data' && typeof icon.url === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/iu.test(icon.url)) return icon.url
      return ''
    }

    /** 搜索匹配：名称/显示名/描述/分类/作者/关键词/市场名，不区分大小写子串。 */
    function matchQuery(item, query, localeId) {
      const keyword = String(query ?? '').trim().toLowerCase()
      if (keyword === '') return true
      const display = displayOf(item, localeId)
      const market = item.market || {}
      const fields = [
        item.name,
        display.title,
        display.description,
        display.category,
        display.author && display.author.name,
        ...(display.keywords || []),
        market.name,
        market.title,
      ]
      return fields.some((value) => typeof value === 'string' && value.toLowerCase().includes(keyword))
    }

    /** 市场排序：lastRefreshed 倒序，缺失沉底，同刻按名称。 */
    function orderMarkets(markets) {
      return [...(markets || [])].sort((left, right) => {
        const leftTime = left && left.lastRefreshed ? Date.parse(left.lastRefreshed) : 0
        const rightTime = right && right.lastRefreshed ? Date.parse(right.lastRefreshed) : 0
        const leftValid = Number.isFinite(leftTime) && leftTime > 0
        const rightValid = Number.isFinite(rightTime) && rightTime > 0
        if (leftValid !== rightValid) return leftValid ? -1 : 1
        if (leftValid && rightValid && leftTime !== rightTime) return rightTime - leftTime
        const leftName = String((left && (left.title || left.name)) || '')
        const rightName = String((right && (right.title || right.name)) || '')
        return leftName.localeCompare(rightName)
      })
    }

    /** 个人分段：按市场源分组。 */
    function groupItemsByMarket(items, markets) {
      const sortedMarkets = orderMarkets(markets)
      const buckets = new Map()
      for (const item of items || []) {
        const marketId = item && item.market ? item.market.id : ''
        if (!buckets.has(marketId)) buckets.set(marketId, [])
        buckets.get(marketId).push(item)
      }
      const groups = []
      for (const market of sortedMarkets) {
        const list = buckets.get(market.id) || []
        if (list.length === 0) continue
        groups.push({ market, items: [...list] })
        buckets.delete(market.id)
      }
      for (const [marketId, list] of buckets) {
        if (list.length === 0) continue
        const market = (list[0] && list[0].market) || { id: marketId, name: marketId, title: marketId }
        groups.push({ market, items: [...list] })
      }
      for (const group of groups) {
        group.items.sort((left, right) => displayOf(left, '').title.localeCompare(displayOf(right, '').title))
      }
      return groups
    }

    /** 可更新判定（只认 available，unknown 不误报）。 */
    function updateAvailable(entity) {
      return Boolean(entity && entity.update && entity.update.state === 'available')
    }

    /** 需要考虑的显示名（用于折叠行文案）。 */
    function displayNames(items, localeId, limit) {
      return items.slice(0, limit).map((item) => displayOf(item, localeId).title)
    }

    function joinNames(names) {
      return names.join('、')
    }

    /* ---------------------------------------------------------------------- *
     * HTTP 数据通道（同源 fetch；Host 只认当前版本）
     * ---------------------------------------------------------------------- */
    async function api(path, options = {}) {
      const method = options.method || 'GET'
      const timeoutMs = options.timeoutMs || 120000
      const init = { method, cache: 'no-store', headers: { 'content-type': 'application/json' } }
      if (options.body !== undefined) init.body = JSON.stringify(options.body)
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        init.signal = AbortSignal.timeout(timeoutMs)
      }
      const response = await fetch(`${API_BASE}${path}`, init)
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok || payload === null || payload.ok !== true) {
        const message = payload && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`
        const error = new Error(message)
        error.code = payload && typeof payload.code === 'string' ? payload.code : ''
        throw error
      }
      return payload.data
    }

    /* ---------------------------------------------------------------------- *
     * 模块级 UI store（面板与 shell.overlay 共用）
     * ---------------------------------------------------------------------- */
    function createStore(t, getLocaleId) {
      const listeners = new Set()
      const store = {
        state: {
          status: 'loading',
          error: '',
          snapshot: null,
          view: 'store',
          detailKey: null,
          detail: null,
          detailStatus: 'idle',
          detailError: '',
          query: '',
          manageQuery: '',
          manageFilter: 'all',
          collapsed: {},
          busy: {},
          capBusy: {},
          marketBusy: {},
          refreshing: false,
          updatingAll: false,
          dialogs: [],
          toasts: [],
        },
        started: false,
        queue: Promise.resolve(),
        listScroll: 0,
        toastSeq: 0,
        dialogSeq: 0,
        disposed: false,
        getState() {
          return store.state
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        set(patch) {
          if (store.disposed) return
          const next = typeof patch === 'function' ? patch(store.state) : patch
          store.state = Object.assign({}, store.state, next)
          for (const listener of listeners) {
            try {
              listener()
            } catch {
              /* 单个订阅者失败不影响其他 */
            }
          }
        },
        localeId() {
          return getLocaleId()
        },
        toast(kind, message, duration = 4500) {
          if (store.disposed || typeof message !== 'string' || message === '') return
          store.toastSeq += 1
          const id = store.toastSeq
          store.set((state) => ({ toasts: [...state.toasts, { id, kind, message }].slice(-5) }))
          if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
            window.setTimeout(() => store.dismissToast(id), duration)
          }
        },
        dismissToast(id) {
          store.set((state) => ({ toasts: state.toasts.filter((toastItem) => toastItem.id !== id) }))
        },
        pushDialog(dialog) {
          store.dialogSeq += 1
          const id = `dialog-${store.dialogSeq}`
          store.set((state) => ({ dialogs: [...state.dialogs, Object.assign({ id }, dialog)] }))
          return id
        },
        closeDialog(id) {
          store.set((state) => ({ dialogs: id === undefined ? [] : state.dialogs.filter((dialog) => dialog.id !== id) }))
        },
        openSources() {
          store.pushDialog({ kind: 'sources' })
        },
        openAddSource() {
          store.pushDialog({ kind: 'add-source' })
        },
        openConfirm(options) {
          return store.pushDialog(Object.assign({ kind: 'confirm' }, options))
        },
        setBusy(key, label) {
          store.set((state) => {
            const busy = Object.assign({}, state.busy)
            if (label) busy[key] = label
            else delete busy[key]
            return { busy }
          })
        },
        setCapBusy(pluginKey, kind, capability, busy) {
          const id = `${pluginKey}#${kind}:${capability}`
          store.set((state) => {
            const next = Object.assign({}, state.capBusy)
            if (busy) next[id] = true
            else delete next[id]
            return { capBusy: next }
          })
        },
        isCapBusy(pluginKey, kind, capability) {
          return Boolean(store.state.capBusy[`${pluginKey}#${kind}:${capability}`])
        },
        setMarketBusy(id, label) {
          store.set((state) => {
            const next = Object.assign({}, state.marketBusy)
            if (label) next[id] = label
            else delete next[id]
            return { marketBusy: next }
          })
        },
        enqueue(task) {
          store.queue = store.queue.then(async () => {
            try {
              await task()
            } catch (error) {
              store.toast('error', errorMessage(error))
            }
          })
          return store.queue
        },
        async load() {
          if (!store.state.snapshot) store.set({ status: 'loading' })
          try {
            const snapshot = await api('/store')
            store.set({ snapshot, status: 'ready', error: '' })
          } catch (error) {
            store.set({ status: store.state.snapshot ? 'ready' : 'error', error: errorMessage(error) })
          }
        },
        init() {
          if (store.started) return
          store.started = true
          store.load()
        },
        openStore() {
          store.set({ view: 'store', detailKey: null, detail: null, detailStatus: 'idle', detailError: '' })
        },
        openManage() {
          store.set({ view: 'manage', detailKey: null, detail: null, detailStatus: 'idle', detailError: '' })
        },
        openDetail(key) {
          store.set({ view: 'detail', detailKey: key, detail: null, detailStatus: 'loading', detailError: '' })
          store.loadDetail(false)
        },
        async loadDetail(force) {
          const key = store.state.detailKey
          if (!key) return
          const snapshot = store.state.snapshot
          if (!snapshot) return
          const installed = (snapshot.installed || []).find((item) => item.key === key) || null
          const item = (snapshot.items || []).find((entry) => entry.key === key) || null
          store.set({ detailStatus: 'loading', detailError: '' })
          try {
            let data
            if (installed) {
              data = await api(`/describe?key=${encodeURIComponent(key)}`, { timeoutMs: 60000 })
            } else if (item) {
              const market = item.market ? item.market.id : ''
              data = await api(`/describe?market=${encodeURIComponent(market)}&name=${encodeURIComponent(item.name)}`, { timeoutMs: 60000 })
            } else {
              throw new Error(t('unknownError'))
            }
            if (store.state.detailKey === key) store.set({ detail: data, detailStatus: 'ready' })
            if (force === true) store.set({ detailStatus: 'ready' })
          } catch (error) {
            if (store.state.detailKey === key) store.set({ detailStatus: 'error', detailError: errorMessage(error) })
          }
        },
        setQuery(query) {
          store.set({ query })
        },
        setManageQuery(manageQuery) {
          store.set({ manageQuery })
        },
        setManageFilter(manageFilter) {
          store.set({ manageFilter })
        },
        toggleCollapse(groupKey) {
          store.set((state) => {
            const collapsed = Object.assign({}, state.collapsed)
            if (collapsed[groupKey]) delete collapsed[groupKey]
            else collapsed[groupKey] = true
            return { collapsed }
          })
        },
        async refreshAll() {
          if (store.state.refreshing) return
          store.set({ refreshing: true })
          try {
            const result = await api('/market/refresh', { method: 'POST', body: {}, timeoutMs: 180000 })
            await store.load()
            const installed = (store.state.snapshot && store.state.snapshot.installed) || []
            const updates = installed.filter((item) => updateAvailable(item)).length
            store.toast('success', updates > 0 ? t('checkFound', { count: updates }) : t('checkNone'))
            const failures = (result && result.failures) || []
            if (failures.length > 0) {
              store.toast('warn', t('refreshPartial', { count: failures.length }))
            }
          } catch (error) {
            store.toast('error', errorMessage(error))
          } finally {
            store.set({ refreshing: false })
          }
        },
        install(item) {
          if (store.state.busy[item.key]) return
          store.setBusy(item.key, 'install')
          store.enqueue(async () => {
            try {
              await api('/install', {
                method: 'POST',
                body: { name: item.name, market: item.market ? item.market.id : undefined },
                timeoutMs: 180000,
              })
              await store.load()
              if (store.state.view === 'detail' && store.state.detailKey === item.key) await store.loadDetail(false)
              store.toast('success', t('installedToast', { name: displayOf(item, store.localeId()).title }))
            } finally {
              store.setBusy(item.key, '')
            }
          })
        },
        update(item) {
          if (store.state.busy[item.key]) return
          store.setBusy(item.key, 'update')
          store.enqueue(async () => {
            try {
              const result = await api('/update', { method: 'POST', body: { name: item.key }, timeoutMs: 180000 })
              await store.load()
              if (store.state.view === 'detail' && store.state.detailKey === item.key) await store.loadDetail(false)
              const name = displayOf(item, store.localeId()).title
              store.toast('success', result && result.changed === false ? t('upToDate', { name }) : t('updatedToast', { name }))
            } finally {
              store.setBusy(item.key, '')
            }
          })
        },
        updateAll() {
          if (store.state.updatingAll) return
          store.set({ updatingAll: true })
          store.enqueue(async () => {
            try {
              const result = await api('/update-all', { method: 'POST', body: {}, timeoutMs: 300000 })
              await store.load()
              const succeeded = (result && result.succeeded) || []
              const failed = (result && result.failed) || []
              if (result && result.aborted === true) {
                store.toast('warn', t('updateAllAborted', { count: succeeded.length }))
              } else if (failed.length > 0) {
                store.toast('warn', t('updateAllPartial', {
                  succeeded: succeeded.length,
                  failed: failed.length,
                  plugins: failed.map((entry) => entry.key).join('、'),
                }))
              } else {
                store.toast('success', t('updateAllDone', { count: succeeded.length }))
              }
            } finally {
              store.set({ updatingAll: false })
            }
          })
        },
        toggleEnabled(entity, enabled) {
          const key = entity.key
          if (store.state.busy[key]) return
          store.setBusy(key, 'toggle')
          store.enqueue(async () => {
            try {
              await api('/enable', { method: 'POST', body: { name: key, enabled } })
              await store.load()
              if (store.state.view === 'detail' && store.state.detailKey === key) await store.loadDetail(false)
              const name = displayOf(entity, store.localeId()).title
              store.toast('success', enabled ? t('enabledToast', { name }) : t('disabledToast', { name }))
            } finally {
              store.setBusy(key, '')
            }
          })
        },
        askUninstall(entity) {
          const name = displayOf(entity, store.localeId()).title
          store.openConfirm({
            title: t('uninstallTitle', { name }),
            message: t('uninstallDescription'),
            confirmLabel: t('uninstall'),
            danger: true,
            onConfirm: async () => {
              await api('/uninstall', { method: 'POST', body: { name: entity.key } })
              await store.load()
              if (store.state.view === 'detail' && store.state.detailKey === entity.key) store.openStore()
              store.toast('success', t('uninstalledToast', { name }))
            },
          })
        },
        askRollback(record) {
          const versions = (record && record.previousVersions) || []
          const target = versions.filter((item) => item.available).slice(-1)[0]
          if (!target) return
          const name = displayOf(record, store.localeId()).title
          store.openConfirm({
            title: t('rollbackTitle', { name }),
            message: t('rollbackDescription', { version: target.version }),
            confirmLabel: t('rollback'),
            danger: false,
            onConfirm: async () => {
              await api('/rollback', { method: 'POST', body: { name: record.key } })
              await store.load()
              await store.loadDetail(false)
              store.toast('success', t('rollbackToast', { name, version: target.version }))
            },
          })
        },
        toggleCapability(pluginKey, kind, capability, enabled) {
          if (store.isCapBusy(pluginKey, kind, capability)) return
          store.setCapBusy(pluginKey, kind, capability, true)
          store.enqueue(async () => {
            try {
              await api('/capability', {
                method: 'POST',
                body: { name: pluginKey, kind, capability, enabled },
              })
              await store.load()
              await store.loadDetail(false)
            } finally {
              store.setCapBusy(pluginKey, kind, capability, false)
            }
          })
        },
        async addMarketSource(location, name) {
          const data = await api('/market/add', {
            method: 'POST',
            body: { location, name: name ? name : undefined },
            timeoutMs: 180000,
          })
          await store.load()
          return data
        },
        async refreshMarket(id) {
          if (store.state.marketBusy[id]) return
          store.setMarketBusy(id, 'refresh')
          try {
            const result = await api('/market/refresh', { method: 'POST', body: { id }, timeoutMs: 180000 })
            await store.load()
            const market = (store.state.snapshot && store.state.snapshot.markets || []).find((entry) => entry.id === id) || {}
            const failures = (result && result.failures) || []
            if (failures.length > 0) store.toast('warn', failures[0].error || t('unknownError'))
            else store.toast('success', t('refreshDone', { name: market.title || market.name || id }))
          } finally {
            store.setMarketBusy(id, '')
          }
        },
        async removeMarket(market) {
          const name = market.title || market.name || market.id
          store.openConfirm({
            title: t('removeMarketTitle'),
            message: t('removeMarketDescription'),
            confirmLabel: t('remove'),
            danger: true,
            onConfirm: async () => {
              store.setMarketBusy(market.id, 'remove')
              try {
                const result = await api('/market/remove', { method: 'POST', body: { id: market.id }, timeoutMs: 60000 })
                await store.load()
                const orphaned = (result && result.orphaned) || []
                if (orphaned.length > 0) store.toast('warn', t('orphanedToast', { name, count: orphaned.length }))
                else store.toast('success', t('removedMarketToast', { name }))
              } finally {
                store.setMarketBusy(market.id, '')
              }
            },
          })
        },
        destroy() {
          store.disposed = true
          listeners.clear()
        },
      }
      return store
    }

    function useStoreState(store) {
      const [snapshot, setSnapshot] = useState(store.getState())
      useEffect(() => {
        setSnapshot(store.getState())
        return store.subscribe(() => setSnapshot(store.getState()))
      }, [store])
      return snapshot
    }

    /** 订阅 locale 变化以触发重渲染。 */
    function useLocaleVersion(locale) {
      const [, setVersion] = useState(0)
      useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => setVersion((value) => value + 1))
      }, [locale])
    }

    /* ---------------------------------------------------------------------- *
     * 基础组件
     * ---------------------------------------------------------------------- */
    function Button({ variant, pill, icon, disabled, title, onClick, children, type }) {
      const className = [
        'aph-btn',
        variant === 'primary' ? 'primary' : '',
        variant === 'ghost' ? 'icon' : '',
        variant === 'danger' ? 'danger' : '',
        pill ? 'pill' : '',
      ].filter(Boolean).join(' ')
      return h('button', {
        type: type || 'button',
        className,
        disabled: disabled === true,
        title,
        'aria-label': title,
        onClick,
      }, icon ? h(Icon, { name: icon, size: 14 }) : null, children)
    }

    function IconButton({ icon, title, disabled, onClick, busy, danger, outline }) {
      return h('button', {
        type: 'button',
        className: outline ? 'aph-btn secondary-icon' : `aph-icon-btn${danger ? ' danger' : ''}`,
        title,
        'aria-label': title,
        disabled: disabled === true,
        onClick,
        style: danger && !outline ? { color: 'var(--dsw-alias-state-error-primary)' } : undefined,
      }, busy ? h(Spinner, null) : h(Icon, { name: icon, size: outline ? 14 : 15 }))
    }

    function Badge({ tone, children }) {
      return h('span', { className: `aph-badge${tone ? ` ${tone}` : ''}` }, children)
    }

    function Switch({ checked, disabled, label, onChange }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked === true,
        'aria-label': label,
        title: label,
        disabled: disabled === true,
        className: 'aph-switch',
        onClick: (event) => {
          event.stopPropagation()
          if (!disabled) onChange(!(checked === true))
        },
      })
    }

    function SearchBox({ value, onChange, placeholder, clearable, clearLabel }) {
      return h('div', { className: `aph-search${clearable && value !== '' ? ' clear' : ''}` },
        h(Icon, { name: 'search', size: 16 }),
        h('input', {
          type: 'search',
          value,
          placeholder,
          'aria-label': placeholder,
          onChange: (event) => onChange(event.target.value),
        }),
        clearable && value !== ''
          ? h('button', {
            type: 'button',
            className: 'aph-search-clear',
            title: clearLabel,
            'aria-label': clearLabel,
            onClick: () => onChange(''),
          }, h(Icon, { name: 'x', size: 14 }))
          : null)
    }

    function Avatar({ display, item, large }) {
      const src = iconSrc(display.icon)
      const [failed, setFailed] = useState(false)
      const fallback = display.title ? display.title.slice(0, 1).toUpperCase() : ''
      useEffect(() => {
        setFailed(false)
      }, [src])
      return h('div', { className: `aph-avatar${large ? ' large' : ''}` },
        src !== '' && !failed
          ? h('img', {
            src,
            alt: '',
            loading: 'lazy',
            onError: () => setFailed(true),
          })
          : fallback !== ''
            ? h('span', { style: { fontSize: large ? 22 : 15, fontWeight: 600 } }, fallback)
            : h(Icon, { name: 'blocks', size: large ? 24 : 16 }))
    }

    function EmptyBlock({ title, description, action }) {
      return h('div', { className: 'aph-placeholder column' },
        title ? h('div', { className: 'aph-placeholder-title' }, title) : null,
        description ? h('div', { className: 'aph-placeholder-desc' }, description) : null,
        action || null)
    }

    function LoadingBlock({ text }) {
      return h('div', { className: 'aph-placeholder' }, h(Spinner, null), h('span', {}, text))
    }

    /* ---------------------------------------------------------------------- *
     * 菜单
     * ---------------------------------------------------------------------- */
    function Menu({ t, items, busy, triggerVariant }) {
      const [open, setOpen] = useState(false)
      return h('div', { className: 'aph-menu-wrap' },
        h('button', {
          type: 'button',
          className: 'aph-icon-btn',
          title: t('moreActions'),
          'aria-label': t('moreActions'),
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          disabled: busy === true,
          onClick: (event) => {
            event.stopPropagation()
            setOpen((value) => !value)
          },
        }, busy ? h(Spinner, null) : h(Icon, { name: 'more', size: 16 })),
        open
          ? h('div', null,
            h('div', { className: 'aph-menu-backdrop', onClick: () => setOpen(false) }),
            h('div', { className: 'aph-menu', role: 'menu' },
              items.filter(Boolean).map((entry, index) => (entry.sep
                ? h('div', { key: `sep-${index}`, className: 'aph-menu-sep' })
                : h('button', {
                  key: entry.key || index,
                  type: 'button',
                  role: 'menuitem',
                  className: `aph-menu-item${entry.danger ? ' danger' : ''}`,
                  disabled: entry.disabled === true,
                  onClick: (event) => {
                    event.stopPropagation()
                    setOpen(false)
                    entry.onSelect()
                  },
                }, entry.icon ? h(Icon, { name: entry.icon, size: 15 }) : null, entry.label)))))
          : null)
    }

    /* ---------------------------------------------------------------------- *
     * 折叠行
     * ---------------------------------------------------------------------- */
    function CollapseRow({ t, hidden, localeId, onExpand }) {
      const names = displayNames(hidden, localeId, 2)
      const label = hidden.length > 2
        ? t('viewMore', { names: joinNames(names), count: hidden.length - names.length })
        : t('viewMoreFew', { names: joinNames(names) })
      return h('button', { type: 'button', className: 'aph-collapse-row', onClick: onExpand },
        h('span', { className: 'aph-collapse-avatars', 'aria-hidden': true },
          hidden.slice(0, 3).map((item, index) => h(Avatar, {
            key: `${item.key || index}`,
            display: displayOf(item, localeId),
          }))),
        h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, label))
    }

    /* ---------------------------------------------------------------------- *
     * 卡片
     * ---------------------------------------------------------------------- */
    function StoreCard({ item, ctx, management }) {
      const { store, t, localeId, openDetail } = ctx
      const display = displayOf(item, localeId)
      const installed = item.installed === true
      const orphan = item.orphan === true
      const busyLabel = store.state.busy[item.key] || ''
      const busy = busyLabel !== ''
      const canInstall = item.installable !== false && !item.blockedReason
      const updatable = !orphan && updateAvailable(item)
      const enabled = item.installedEnabled !== undefined && item.installedEnabled !== null
        ? item.installedEnabled === true
        : item.enabled === true
      const menuItems = installed
        ? [
          { key: 'toggle', icon: 'power', label: enabled ? t('menuDisable') : t('menuEnable'), disabled: busy, onSelect: () => store.toggleEnabled(item, !enabled) },
          { sep: true },
          { key: 'uninstall', icon: 'trash', label: t('menuUninstall'), danger: true, disabled: busy, onSelect: () => store.askUninstall(item) },
        ]
        : []
      const activate = () => {
        if (installed || item.name) openDetail(item.key, item)
      }
      return h('div', {
        className: 'aph-card',
        role: 'button',
        tabIndex: 0,
        'aria-label': display.title,
        onClick: activate,
        onKeyDown: (event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            activate()
          }
        },
      },
      h(Avatar, { display, item }),
      h('div', { className: 'aph-card-body' },
        h('div', { className: 'aph-card-title-line' },
          h('span', { className: 'aph-card-title', title: display.title }, display.title),
          updatable ? h('span', { className: 'aph-update-badge' }, h(Icon, { name: 'download', size: 12 }), t('updateBadge')) : null,
          orphan ? h(Badge, { tone: 'warn' }, t('sourceMissingShort')) : null),
        orphan
          ? h('div', { className: 'aph-card-warning' }, h(Icon, { name: 'alert', size: 12 }), t('sourceMissing'))
          : h('div', { className: 'aph-card-desc' }, display.description || t('noDescription')),
        management || installed
          ? h('div', { className: 'aph-card-sub' },
            `${t('version')} ${item.installedVersion || item.version || '—'}`,
            item.market ? ` · ${item.market.title || item.market.name || ''}` : '',
            orphan ? ` · ${t('sourceMissingShort')}` : '')
          : null),
      h('div', { className: 'aph-card-actions' },
        !installed && canInstall
          ? h(Button, {
            variant: 'secondary',
            pill: true,
            disabled: busy || store.state.busy[item.key] === 'install',
            onClick: (event) => {
              event.stopPropagation()
              store.install(item)
            },
          }, busy ? h(Spinner, null) : h(Icon, { name: 'download', size: 14 }), busy ? t('installing') : t('install'))
          : null,
        !installed && !canInstall
          ? h(Button, { variant: 'secondary', pill: true, disabled: true, title: item.blockedReason || t('notInstallable') }, t('notInstallable'))
          : null,
        installed && updatable
          ? h(Button, {
            variant: 'secondary',
            pill: true,
            disabled: busy || store.state.busy[item.key] === 'update',
            onClick: (event) => {
              event.stopPropagation()
              store.update(item)
            },
          }, busy ? h(Spinner, null) : h(Icon, { name: 'download', size: 14 }), busy ? t('updating') : t('update'))
          : null,
        installed ? h(Menu, { t, items: menuItems, busy }) : null,
        installed
          ? h(Switch, {
            checked: enabled,
            disabled: busy,
            label: `${enabled ? t('disable') : t('enable')} ${display.title}`,
            onChange: (next) => store.toggleEnabled(item, next),
          })
          : null))
    }

    /* ---------------------------------------------------------------------- *
     * 商店列表页
     * ---------------------------------------------------------------------- */
    function AddMenu({ t, onAdd }) {
      const [open, setOpen] = useState(false)
      return h('div', { className: 'aph-menu-wrap' },
        h(Button, {
          variant: 'secondary',
          onClick: (event) => {
            event.stopPropagation()
            setOpen((value) => !value)
          },
        }, h(Icon, { name: 'plus', size: 14 }), t('add'), h(Icon, { name: 'chevronDown', size: 14 })),
        open
          ? h('div', null,
            h('div', { className: 'aph-menu-backdrop', onClick: () => setOpen(false) }),
            h('div', { className: 'aph-menu', role: 'menu', style: { minWidth: 200 } },
              h('button', {
                type: 'button',
                role: 'menuitem',
                className: 'aph-menu-item',
                onClick: () => {
                  setOpen(false)
                  onAdd()
                },
              }, h(Icon, { name: 'plus', size: 15 }), t('addMarketplace'))))
          : null)
    }

    function StoreView({ store, t, localeId }) {
      const state = store.state
      const snapshot = state.snapshot
      const markets = (snapshot && snapshot.markets) || []
      const items = (snapshot && snapshot.items) || []
      const query = state.query
      const searching = query.trim() !== ''
      const groups = searching ? [] : groupItemsByMarket(items, markets)
      const searchResults = searching ? items.filter((item) => matchQuery(item, query, localeId)) : []
      const ctx = { store, t, localeId, openDetail: (key) => store.openDetail(key) }

      let content
      if (searching) {
        content = h('section', { className: 'aph-section' },
          h('div', { className: 'aph-section-head' },
            h('h2', { className: 'aph-section-title' }, t('searchResults', { count: searchResults.length }))),
          h('div', { className: 'aph-divider' }),
          searchResults.length === 0
            ? h('div', { style: { marginTop: 8 } }, h(EmptyBlock, { description: t('searchEmpty') }))
            : h('div', { className: 'aph-grid' }, searchResults.map((item) => h(StoreCard, { key: item.key, item, ctx }))))
      } else if (markets.length === 0) {
        content = h(EmptyBlock, {
          description: t('personalEmpty'),
          action: h(Button, { variant: 'primary', onClick: () => store.openAddSource() }, h(Icon, { name: 'plus', size: 14 }), t('addMarketplace')),
        })
      } else if (items.length === 0) {
        content = h(EmptyBlock, { description: t('catalogEmpty') })
      } else {
        content = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 32 } },
          groups.map((group) => {
            const groupKey = `market:${group.market.id}`
            const collapsed = state.collapsed[groupKey] === true
            const hidden = collapsed ? group.items.slice(6) : []
            const visible = collapsed ? group.items.slice(0, 6) : group.items
            return h('section', { key: groupKey, className: 'aph-section' },
              h('div', { className: 'aph-section-head' },
                h('h2', { className: 'aph-section-title' }, group.market.title || group.market.name || group.market.id)),
              h('div', { className: 'aph-divider' }),
              h('div', { className: 'aph-grid' }, visible.map((item) => h(StoreCard, { key: item.key, item, ctx }))),
              hidden.length > 0
                ? h(CollapseRow, { t, hidden, localeId, onExpand: () => store.toggleCollapse(groupKey) })
                : null,
              !collapsed && group.items.length > 6
                ? h('button', { type: 'button', className: 'aph-collapse-row', onClick: () => store.toggleCollapse(groupKey) },
                  h('span', { style: { minWidth: 0 } }, t('showLess')))
                : null)
          }))
      }

      return h('div', { className: 'aph-page' },
        h('header', { className: 'aph-topbar' },
          h('h1', { className: 'aph-title' }, t('title')),
          h('div', { className: 'aph-actions' },
            h(IconButton, {
              icon: 'refresh',
              title: state.refreshing ? t('refreshing') : t('refresh'),
              busy: state.refreshing,
              disabled: state.refreshing,
              outline: true,
              onClick: () => store.refreshAll(),
            }),
            h(IconButton, { icon: 'store', title: t('sources'), outline: true, onClick: () => store.openSources() }),
            h(AddMenu, { t, onAdd: () => store.openAddSource() }),
            h(Button, { variant: 'primary', onClick: () => store.openManage() }, t('manage')))),
        h('div', { className: 'aph-toolbar' },
          h('div', { className: 'aph-seg' },
            h('button', { type: 'button', className: 'aph-seg-pill', 'aria-pressed': true }, t('segmentPersonal'))),
          h(SearchBox, {
            value: query,
            onChange: (value) => store.setQuery(value),
            placeholder: t('searchPlaceholder'),
            clearable: false,
          })),
        state.error ? h('div', { className: 'aph-error' }, state.error) : null,
        content)
    }

    /* ---------------------------------------------------------------------- *
     * 详情页
     * ---------------------------------------------------------------------- */
    function ExternalValue({ t, url, label }) {
      if (!url) return null
      return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', title: url, 'aria-label': `${label}: ${url}` },
        h('span', {}, url), h(Icon, { name: 'external', size: 13 }))
    }

    function ComponentSection({ t, title, icon, items, renderRow }) {
      if (!items || items.length === 0) return null
      return h('section', { className: 'aph-section', style: { gap: 0 } },
        h('div', { className: 'aph-comp-head' },
          h('h2', { className: 'aph-comp-title' }, title),
          h('span', { className: 'aph-comp-count' }, String(items.length))),
        h('div', { className: 'aph-comp-list' }, items.map((item, index) => renderRow(item, index))))
    }

    function DetailView({ store, t, localeId }) {
      const state = store.state
      const snapshot = state.snapshot || {}
      const key = state.detailKey
      const installed = (snapshot.installed || []).find((item) => item.key === key) || null
      const catalogItem = (snapshot.items || []).find((item) => item.key === key) || null
      const detail = state.detail
      const display = detail ? detail.display || {} : {}
      const installedFlag = detail ? Boolean(detail.installed && detail.installed.installed) : Boolean(installed)
      const currentVersion = detail && detail.version ? detail.version : (installed ? installed.version : (catalogItem ? catalogItem.version : ''))
      const market = detail ? detail.market : (installed ? installed.market : (catalogItem ? catalogItem.market : null))
      const title = pickI18n(display.title, display.titleI18n, localeId) || canonicalTitle(detail ? detail.name : (installed ? installed.name : (catalogItem ? catalogItem.name : '')))
      const description = pickI18n(display.description, display.descriptionI18n, localeId)
        || (catalogItem ? displayOf(catalogItem, localeId).description : '')
      const orphan = detail ? detail.orphan === true || (installed && installed.orphan === true) : Boolean(installed && installed.orphan)
      const updatable = !orphan && detail ? updateAvailable(detail) : Boolean(installed && updateAvailable(installed))
      const busy = key ? Boolean(state.busy[key]) : false
      const enabled = detail && detail.installed && detail.installed.enabled !== undefined
        ? detail.installed.enabled === true
        : Boolean(installed && installed.enabled)
      const capabilities = detail ? detail.capabilities : null

      const back = () => store.openStore()
      const actionMenu = installedFlag
        ? h(Menu, {
          t,
          busy,
          items: [
            { key: 'toggle', icon: 'power', label: enabled ? t('menuDisable') : t('menuEnable'), disabled: busy, onSelect: () => store.toggleEnabled(installed || catalogItem, !enabled) },
            { sep: true },
            { key: 'uninstall', icon: 'trash', label: t('menuUninstall'), danger: true, disabled: busy, onSelect: () => store.askUninstall(installed || catalogItem) },
          ],
        })
        : null

      const header = h('header', { className: 'aph-detail-head' },
        h(Avatar, { display: displayOf({ display, name: title }, localeId), large: true }),
        h('div', { className: 'aph-detail-headmain' },
          h('div', { className: 'aph-detail-titleline' },
            h('h1', { className: 'aph-detail-title' }, title),
            market ? h(Badge, { tone: 'plain' }, market.title || market.name || market.id) : null),
          description ? h('p', { className: 'aph-detail-desc' }, description) : null,
          orphan ? h('div', { className: 'aph-detail-warning' }, h(Icon, { name: 'alert', size: 14 }), t('sourceMissing')) : null),
        h('div', { className: 'aph-detail-actions' },
          updatable
            ? h(Button, {
              variant: 'secondary',
              pill: true,
              disabled: busy,
              onClick: () => store.update(installed || catalogItem),
            }, h(Icon, { name: 'download', size: 14 }), t('update'))
            : null,
          actionMenu,
          !installedFlag
            ? h(Button, {
              variant: 'primary',
              pill: true,
              disabled: busy || (catalogItem && (catalogItem.installable === false || catalogItem.blockedReason)),
              title: catalogItem && catalogItem.blockedReason ? catalogItem.blockedReason : undefined,
              onClick: () => store.install(catalogItem || { key, name: title, market }),
            }, h(Icon, { name: 'download', size: 14 }), t('install'))
            : null))

      let components
      if (!detail || state.detailStatus === 'loading') {
        components = h(LoadingBlock, { text: t('componentsLoading') })
      } else if (state.detailStatus === 'error') {
        components = h('div', { className: 'aph-warning' },
          h(Icon, { name: 'alert', size: 14 }),
          h('span', { style: { flex: 1 } }, t('componentsError')),
          h('button', { type: 'button', className: 'aph-btn', onClick: () => store.loadDetail(true) }, h(Icon, { name: 'refresh', size: 13 }), t('componentsRetry')))
      } else if (!capabilities) {
        components = h(EmptyBlock, { description: (detail && detail.blockedReason) || t('componentsEmpty') })
      } else {
        const sections = []
        const capBusyFor = (kind, name) => store.isCapBusy(key, kind, name)
        const rowOf = (kind, name, body, side) => h('div', { key: `${kind}:${name}`, className: 'aph-comp-row' },
          h('div', { className: 'aph-comp-icon' }, h(Icon, { name: kind === 'mcpServers' ? 'server' : kind === 'skills' ? 'wand' : kind === 'commands' ? 'terminal' : 'anchor', size: 16 })),
          h('div', { className: 'aph-comp-body' }, body),
          h('div', { className: 'aph-comp-side' }, side))
        const switchOf = (kind, name, item) => (installedFlag && item.enabled !== undefined
          ? h(Switch, {
            checked: item.enabled === true,
            disabled: capBusyFor(kind, name),
            label: `${item.enabled ? t('disable') : t('enable')} ${name}`,
            onChange: (next) => store.toggleCapability(key, kind, name, next),
          })
          : null)
        const skillRows = (capabilities.skills || []).map((item) => rowOf('skills', item.name,
          h('span', { className: 'aph-comp-name' }, item.name),
          [h('span', { className: 'aph-comp-desc', style: { flex: 1 } }, item.description || ''),
            switchOf('skills', item.name, item)]))
        const commandRows = (capabilities.commands || []).map((item) => rowOf('commands', item.name,
          h('span', { className: 'aph-comp-name' }, `/${item.hostName || item.name}`),
          [h('span', { className: 'aph-comp-desc', style: { flex: 1 } }, item.description || ''),
            switchOf('commands', item.name, item)]))
        const hookRows = (capabilities.hooks || []).map((item) => rowOf('hooks', item.event,
          h('div', { className: 'aph-comp-body' },
            h('span', { className: 'aph-comp-name' }, item.event),
            h('span', { className: 'aph-comp-desc' },
              item.host ? `${t('hostEvent')}: ${item.host}${item.canBlock ? `（${t('canBlock')}）` : ''}` : t('hooksInactive', { reason: item.reason || t('componentsNotEffective') }))),
          [item.effective
            ? h(Badge, { tone: 'success' }, t('componentsEffective'))
            : h(Badge, { tone: 'warn' }, t('componentsNotEffective')),
            switchOf('hooks', item.event, item)]))
        const mcpRows = (capabilities.mcpServers || []).map((item) => rowOf('mcpServers', item.name,
          h('div', { className: 'aph-comp-body' },
            h('span', { className: 'aph-comp-name' }, item.name),
            h('span', { className: 'aph-comp-desc' },
              [item.transport, item.command, ...(item.args || [])].filter(Boolean).join(' ') || item.url || t('componentsNotEffective'))),
          [h(Badge, { tone: 'warn' }, t('componentsNotEffective')),
            switchOf('mcpServers', item.name, item)]))
        sections.push(h(ComponentSection, { key: 'mcp', t, title: t('sectionMcp'), icon: 'server', items: capabilities.mcpServers || [], renderRow: (item, index) => mcpRows[index] }))
        sections.push(h(ComponentSection, { key: 'skills', t, title: t('sectionSkills'), icon: 'wand', items: capabilities.skills || [], renderRow: (item, index) => skillRows[index] }))
        sections.push(h(ComponentSection, { key: 'commands', t, title: t('sectionCommands'), icon: 'terminal', items: capabilities.commands || [], renderRow: (item, index) => commandRows[index] }))
        sections.push(h(ComponentSection, { key: 'hooks', t, title: t('sectionHooks'), icon: 'anchor', items: capabilities.hooks || [], renderRow: (item, index) => hookRows[index] }))
        components = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 32 } }, sections)
      }

      const author = display.author && display.author.name ? display.author.name : ''
      const homepage = httpsUrl(display.homepage)
      const repository = httpsUrl(display.repository)
      const infoRows = [
        { key: 'developer', label: t('infoDeveloper'), value: author },
        { key: 'category', label: t('infoCategory'), value: display.category || '' },
        { key: 'version', label: t('infoVersion'), value: currentVersion },
        { key: 'market', label: t('infoMarket'), value: market ? (market.title || market.name) : '' },
        { key: 'website', label: t('infoWebsite'), url: homepage },
        { key: 'repository', label: t('infoRepository'), url: repository },
        { key: 'license', label: t('infoLicense'), value: display.license || '' },
        { key: 'installedAt', label: t('infoInstalledAt'), value: installedFlag && installed ? formatTime(installed.installedAt) : '' },
      ].filter((row) => row.url || row.value)

      const advanced = []
      const format = detail && detail.format
        ? detail.format
        : (installed ? installed.format : (catalogItem ? (catalogItem.format || (catalogItem.market && catalogItem.market.format)) : ''))
      if (format) advanced.push(h('div', { key: 'format', className: 'aph-info-row' }, h('span', { className: 'aph-info-label' }, t('format')), h('span', { className: 'aph-info-value' }, format)))
      if (installedFlag && installed && installed.installedPath) {
        advanced.push(h('div', { key: 'path', className: 'aph-list-block' },
          h('div', { className: 'aph-list-title' }, t('rootPath')),
          h('div', { className: 'aph-mono' }, installed.installedPath)))
      }
      const rollbackRows = installedFlag && installed && (installed.previousVersions || []).length > 0
        ? h('div', { key: 'rollback', className: 'aph-list-block' },
          h('div', { className: 'aph-list-title' }, t('rollbackVersions')),
          (installed.previousVersions || []).map((version) => h('div', { key: version.version, className: 'aph-list-row' },
            h('span', { style: { flex: 1 } }, `v${version.version}`, version.available ? '' : ` · ${t('sourceMissingShort')}`),
            h(Button, {
              variant: 'secondary',
              disabled: busy || version.available === false,
              onClick: () => store.askRollback(installed),
            }, h(Icon, { name: 'refresh', size: 13 }), t('rollback')))))
        : null
      if (rollbackRows) advanced.push(rollbackRows)
      if (detail && detail.hooksSource) advanced.push(h('div', { key: 'hooks-source', className: 'aph-info-row' }, h('span', { className: 'aph-info-label' }, t('hooksSource')), h('span', { className: 'aph-info-value' }, detail.hooksSource)))
      if (detail && detail.mcpSource) advanced.push(h('div', { key: 'mcp-source', className: 'aph-info-row' }, h('span', { className: 'aph-info-label' }, t('mcpSource')), h('span', { className: 'aph-info-value' }, detail.mcpSource)))
      const warnings = (detail && detail.warnings) || []
      if (warnings.length > 0) {
        advanced.push(h('div', { key: 'warnings', className: 'aph-list-block' },
          h('div', { className: 'aph-list-title' }, t('warnings')),
          warnings.map((warning, index) => h('div', { key: index, className: 'aph-warning' }, h(Icon, { name: 'alert', size: 13 }), h('span', {}, warning)))))
      }
      if (installedFlag && installed) {
        advanced.push(h('div', { key: 'runtime', className: 'aph-list-block' },
          h('div', { className: 'aph-list-title' }, t('runtimeStatus')),
          h('div', { className: 'aph-runtime' },
            h(Badge, { tone: installed.enabled ? 'success' : 'warn' }, installed.enabled ? t('enabled') : t('disabled')),
            h(Badge, null, `${t('runtimeSkills')} ${(installed.capabilities && installed.capabilities.skills ? installed.capabilities.skills.length : 0)}`),
            h(Badge, null, `${t('runtimeCommands')} ${(installed.capabilities && installed.capabilities.commands ? installed.capabilities.commands.length : 0)}`),
            h(Badge, null, `${t('runtimeHooks')} ${(installed.capabilities && installed.capabilities.hooks ? installed.capabilities.hooks.length : 0)}`),
            h(Badge, null, `${t('runtimeMcp')} ${t('runtimeNotEffective')}`))))
      }

      return h('div', { className: 'aph-page aph-detail' },
        h('button', { type: 'button', className: 'aph-back', onClick: back }, h(Icon, { name: 'arrowLeft', size: 16 }), t('back')),
        header,
        state.error ? h('div', { className: 'aph-error' }, state.error) : null,
        components,
        infoRows.length > 0
          ? h('section', { className: 'aph-section', style: { gap: 0 } },
            h('div', { className: 'aph-comp-head' }, h('h2', { className: 'aph-comp-title' }, t('infoTitle'))),
            h('div', { className: 'aph-info', style: { marginTop: 12 } },
              infoRows.map((row) => h('div', { key: row.key, className: 'aph-info-row' },
                h('span', { className: 'aph-info-label' }, row.label),
                h('span', { className: 'aph-info-value' }, row.url ? h(ExternalValue, { t, url: row.url, label: row.label }) : row.value)))))
          : null,
        advanced.length > 0
          ? h('details', { className: 'aph-advanced' },
            h('summary', null, h(Icon, { name: 'chevronRight', size: 14 }), t('moreDetails')),
            h('div', { className: 'aph-advanced-body' }, advanced))
          : null)
    }

    /* ---------------------------------------------------------------------- *
     * 管理已安装视图
     * ---------------------------------------------------------------------- */
    function ManageView({ store, t, localeId }) {
      const state = store.state
      const snapshot = state.snapshot || {}
      const installed = snapshot.installed || []
      const query = state.manageQuery
      const filter = state.manageFilter
      const filtered = installed.filter((item) => {
        if (filter === 'enabled' && item.enabled !== true) return false
        if (filter === 'disabled' && item.enabled === true) return false
        const display = displayOf(item, localeId)
        if (query.trim() === '') return true
        return `${display.title} ${display.description} ${item.name}`.toLowerCase().includes(query.trim().toLowerCase())
      })
      const updates = installed.filter((item) => !item.orphan && updateAvailable(item)).length
      const runtime = snapshot.runtime || {}
      const groups = []
      groups.push({ key: 'installed', title: t('installedGroup'), items: filtered })
      const ctx = { store, t, localeId, openDetail: (key) => store.openDetail(key) }

      return h('div', { className: 'aph-page' },
        h('header', { className: 'aph-topbar' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 } },
            h('button', { type: 'button', className: 'aph-back', onClick: () => store.openStore() }, h(Icon, { name: 'arrowLeft', size: 16 })),
            h('h1', { className: 'aph-title' }, t('manage'))),
          h('div', { className: 'aph-actions' },
            updates > 0
              ? h(Button, {
                variant: 'secondary',
                disabled: state.updatingAll,
                onClick: () => store.updateAll(),
              }, state.updatingAll ? h(Spinner, null) : h(Icon, { name: 'download', size: 14 }), t('updateAll', { count: updates }))
              : null,
            h(IconButton, { icon: 'refresh', title: t('refresh'), onClick: () => store.load() }),
            h(Button, { variant: 'secondary', onClick: () => store.openStore() }, t('browseMarketplace')),
            h(AddMenu, { t, onAdd: () => store.openAddSource() }))),
        h('div', { className: 'aph-toolbar' },
          h('div', { className: 'aph-seg' },
            [['all', t('filterAll')], ['enabled', t('filterEnabled')], ['disabled', t('filterDisabled')]].map(([value, label]) =>
              h('button', {
                key: value,
                type: 'button',
                className: 'aph-seg-pill',
                'aria-pressed': filter === value,
                onClick: () => store.setManageFilter(value),
              }, label))),
          h(SearchBox, {
            value: query,
            onChange: (value) => store.setManageQuery(value),
            placeholder: t('searchPlaceholder'),
            clearable: true,
            clearLabel: t('clearSearch'),
          })),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 32 } },
          groups.map((group) => h('section', { key: group.key, className: 'aph-section' },
            h('div', { className: 'aph-section-head' },
              h('h2', { className: 'aph-section-title' }, group.title, ' ', h('span', { className: 'aph-section-count' }, String(group.items.length)))),
            h('div', { className: 'aph-divider' }),
            group.items.length === 0
              ? h('div', { style: { marginTop: 8 } }, h(EmptyBlock, {
                title: installed.length === 0 ? t('noInstalledTitle') : t('noInstalled'),
                description: installed.length === 0 ? t('noInstalledDescription') : '',
                action: installed.length === 0
                  ? h(Button, { variant: 'primary', onClick: () => store.openStore() }, t('browseMarketplace'))
                  : null,
              }))
              : h('div', { className: 'aph-grid single' }, group.items.map((item) => h(StoreCard, { key: item.key, item: Object.assign({}, item, { installed: true, installable: true }), ctx, management: true })))))),
        h('div', { className: 'aph-footer' },
          h('span', {}, t('enabledCount', {
            total: installed.length,
            enabled: installed.filter((item) => item.enabled === true).length,
          })),
          h('span', { className: 'aph-runtime' },
            h(Badge, { tone: runtime.skills && runtime.skills.registered ? 'success' : 'warn' }, `${t('runtimeSkills')} ${runtime.skills && typeof runtime.skills.skills === 'number' ? runtime.skills.skills : 0}`),
            h(Badge, { tone: runtime.commands && runtime.commands.available ? 'success' : 'warn' }, `${t('runtimeCommands')} ${runtime.commands && Array.isArray(runtime.commands.registered) ? runtime.commands.registered.length : 0}`),
            h(Badge, { tone: runtime.hooks && runtime.hooks.attached ? 'success' : 'warn' }, t('runtimeHooks')),
            h(Badge, { tone: runtime.mcp && runtime.mcp.available ? 'success' : 'warn' }, `${t('runtimeMcp')} ${runtime.mcp && runtime.mcp.available ? t('runtimeEffective') : t('runtimeNotEffective')}`))))
    }

    /* ---------------------------------------------------------------------- *
     * 弹窗（挂到 shell.overlay）
     * ---------------------------------------------------------------------- */
    function DialogShell({ t, title, children, footer, narrow, onClose }) {
      return h('div', { className: 'aph-overlay-mask', onMouseDown: (event) => {
        if (event.target === event.currentTarget && onClose) onClose()
      } },
      h('div', { className: `aph-dialog${narrow ? ' narrow' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { className: 'aph-dialog-head' },
          h('h2', { className: 'aph-dialog-title' }, title),
          onClose ? h('button', { type: 'button', className: 'aph-icon-btn', title: t('close'), 'aria-label': t('close'), onClick: onClose }, h(Icon, { name: 'x', size: 16 })) : null),
        h('div', { className: 'aph-dialog-body' }, children),
        footer ? h('div', { className: 'aph-dialog-foot' }, footer) : null))
    }

    function AddSourceDialog({ store, t, dialog }) {
      const [location, setLocation] = useState('')
      const [name, setName] = useState('')
      const [risk, setRisk] = useState(false)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const inputRef = useRef(null)
      const close = () => store.closeDialog(dialog.id)
      useEffect(() => {
        if (inputRef.current && typeof inputRef.current.focus === 'function') inputRef.current.focus()
      }, [])
      const submit = async () => {
        if (busy || location.trim() === '' || !risk) return
        setBusy(true)
        setError('')
        try {
          const data = await store.addMarketSource(location.trim(), name.trim())
          const detected = data && data.detectedType === 'git'
            ? t('detectedGit')
            : data && data.detectedType === 'url' ? t('detectedUrl') : t('detectedLocal')
          const market = data && data.market ? data.market : {}
          store.toast('success', t('addedToast', {
            name: market.title || market.name || location.trim(),
            type: detected,
            count: data && typeof data.pluginCount === 'number' ? data.pluginCount : 0,
          }))
          close()
        } catch (submitError) {
          setError(errorMessage(submitError))
        } finally {
          setBusy(false)
        }
      }
      return h(DialogShell, {
        t,
        title: t('addMarketTitle'),
        narrow: true,
        onClose: () => { if (!busy) close() },
        footer: [
          h(Button, { key: 'cancel', variant: 'secondary', disabled: busy, onClick: close }, t('cancel')),
          h(Button, { key: 'add', variant: 'primary', disabled: busy || location.trim() === '' || !risk, onClick: submit },
            busy ? h(Spinner, null) : h(Icon, { name: 'plus', size: 14 }), busy ? t('adding') : t('add')),
        ],
      },
      h('div', { className: 'aph-risk' }, h(Icon, { name: 'alert', size: 14 }), h('span', {}, t('addMarketRisk'))),
      h('div', { className: 'aph-field' },
        h('label', { className: 'aph-field-label', htmlFor: 'aph-add-source-input' }, t('addMarketSourceLabel')),
        h('input', {
          id: 'aph-add-source-input',
          ref: inputRef,
          className: 'aph-input',
          value: location,
          placeholder: t('addMarketSourceLabel'),
          'aria-label': t('addMarketSourceLabel'),
          onChange: (event) => setLocation(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) submit()
          },
        }),
        h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, t('addMarketHint'))),
      h('div', { className: 'aph-field' },
        h('label', { className: 'aph-field-label', htmlFor: 'aph-add-source-name' }, t('marketName')),
        h('input', {
          id: 'aph-add-source-name',
          className: 'aph-input',
          value: name,
          placeholder: t('marketName'),
          onChange: (event) => setName(event.target.value),
        })),
      h('label', { className: 'aph-check' },
        h('input', { type: 'checkbox', checked: risk, onChange: (event) => setRisk(event.target.checked) }),
        h('span', {}, t('addMarketRiskAck'))),
      error ? h('div', { className: 'aph-error', role: 'alert' }, error) : null)
    }

    function SourcesDialog({ store, t }) {
      const state = store.state
      const snapshot = state.snapshot || {}
      const markets = orderMarkets(snapshot.markets || [])
      const dialog = state.dialogs.find((entry) => entry.kind === 'sources') || { id: '' }
      const list = markets.length === 0
        ? h('div', { className: 'aph-placeholder' }, t('sourcesEmpty'))
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 'min(420px, 60vh)', overflowY: 'auto' } },
          markets.map((market) => {
            const busyLabel = state.marketBusy[market.id] || ''
            return h('div', { key: market.id, className: 'aph-source-row' },
              h('div', { className: 'aph-source-main' },
                h('div', { className: 'aph-source-name' }, market.title || market.name || market.id),
                h('div', { className: 'aph-source-sub' },
                  t('sourcePluginCount', { count: market.pluginCount || 0 }),
                  market.lastRefreshed ? ` · ${t('sourceUpdated', { time: formatTime(market.lastRefreshed) })}` : ''),
                market.refreshError
                  ? h('div', { className: 'aph-source-error' },
                    h(Icon, { name: 'alert', size: 12 }),
                    h('span', {}, t('sourceRefreshFailed', { time: formatTime(market.lastRefreshed), message: market.refreshError })))
                  : null),
              h(IconButton, {
                icon: 'refresh',
                title: t('sourceRefresh'),
                busy: busyLabel === 'refresh',
                disabled: busyLabel !== '',
                onClick: () => store.refreshMarket(market.id),
              }),
              h(IconButton, {
                icon: 'trash',
                title: t('sourceRemove'),
                danger: true,
                busy: busyLabel === 'remove',
                disabled: busyLabel !== '',
                onClick: () => store.removeMarket(market),
              }))
          }))
      return h(DialogShell, {
        t,
        title: t('sources'),
        onClose: () => store.closeDialog(dialog.id),
        footer: h('div', { className: 'aph-dialog-foot' },
          h(Button, { variant: 'secondary', onClick: () => store.closeDialog(dialog.id) }, t('close'))),
      }, list)
    }

    function ConfirmDialog({ store, t, dialog }) {
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const close = () => { if (!busy) store.closeDialog(dialog.id) }
      const confirm = async () => {
        if (busy) return
        setBusy(true)
        setError('')
        try {
          await dialog.onConfirm()
          store.closeDialog(dialog.id)
        } catch (confirmError) {
          setError(errorMessage(confirmError))
        } finally {
          setBusy(false)
        }
      }
      return h(DialogShell, {
        t,
        title: dialog.title,
        narrow: true,
        onClose: close,
        footer: [
          h(Button, { key: 'cancel', variant: 'secondary', disabled: busy, onClick: close }, t('cancel')),
          h(Button, {
            key: 'confirm',
            variant: dialog.danger ? 'danger' : 'primary',
            disabled: busy,
            onClick: confirm,
          }, busy ? h(Spinner, null) : null, dialog.confirmLabel || t('confirm')),
        ],
      },
      h('div', { style: { fontSize: 14, color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'pre-wrap' } }, dialog.message || ''),
      error ? h('div', { className: 'aph-error', role: 'alert' }, error) : null)
    }

    function Toasts({ store, t }) {
      const state = store.state
      if (state.toasts.length === 0) return null
      return h('div', { className: 'aph-toasts', role: 'status', 'aria-live': 'polite' },
        state.toasts.map((toastItem) => h('div', { key: toastItem.id, className: `aph-toast ${toastItem.kind}` },
          h(Icon, { name: toastItem.kind === 'success' ? 'check' : toastItem.kind === 'error' || toastItem.kind === 'warn' ? 'alert' : 'info', size: 15 }),
          h('div', { className: 'aph-toast-body' }, toastItem.message),
          h('button', { type: 'button', className: 'aph-toast-close', title: t('close'), 'aria-label': t('close'), onClick: () => store.dismissToast(toastItem.id) }, h(Icon, { name: 'x', size: 14 })))))
    }

    function OverlayHost({ store, t, locale }) {
      useLocaleVersion(locale)
      const state = useStoreState(store)
      if (state.dialogs.length === 0 && state.toasts.length === 0) return null
      const toasts = h(Toasts, { store, t })
      const dialogs = state.dialogs.map((dialog) => {
        if (dialog.kind === 'add-source') return h(AddSourceDialog, { key: dialog.id, store, t, dialog })
        if (dialog.kind === 'sources') return h(SourcesDialog, { key: dialog.id, store, t, dialog })
        if (dialog.kind === 'confirm') return h(ConfirmDialog, { key: dialog.id, store, t, dialog })
        return null
      })
      return h('div', { className: 'aph-overlay-root' }, dialogs, toasts)
    }

    /* ---------------------------------------------------------------------- *
     * 主面板
     * ---------------------------------------------------------------------- */
    function Panel({ store, t, locale, getLocaleId }) {
      useLocaleVersion(locale)
      const state = useStoreState(store)
      const scrollRef = useRef(null)
      const lastView = useRef(state.view)
      useEffect(() => {
        store.init()
      }, [store])
      useEffect(() => {
        const previous = lastView.current
        if (previous === state.view) return
        if (previous === 'store' && scrollRef.current) store.listScroll = scrollRef.current.scrollTop
        if (state.view === 'store' && scrollRef.current) scrollRef.current.scrollTop = store.listScroll || 0
        lastView.current = state.view
      }, [state.view])
      useEffect(() => () => {
        store.set({ dialogs: [] })
      }, [store])
      const localeId = getLocaleId()

      let body
      if (state.status === 'loading' && !state.snapshot) {
        body = h('div', { className: 'aph-page' }, h(LoadingBlock, { text: t('loading') }))
      } else if (!state.snapshot) {
        body = h('div', { className: 'aph-page' },
          h('div', { className: 'aph-placeholder column' },
            h('div', { className: 'aph-placeholder-title' }, t('apiUnavailable')),
            h('div', { className: 'aph-placeholder-desc' }, `${state.error || t('unknownError')}\n${t('apiHint')}`),
            h(Button, { variant: 'primary', onClick: () => store.load() }, h(Icon, { name: 'refresh', size: 14 }), t('retry'))))
      } else {
        const banner = []
        if (state.snapshot.migrationError) {
          banner.push(h('div', { key: 'migration', className: 'aph-warning' },
            h(Icon, { name: 'alert', size: 14 }),
            h('span', {}, t('migrationError', { message: state.snapshot.migrationError }))))
        }
        if (state.snapshot.ui && state.snapshot.ui.active === false) {
          banner.push(h('div', { key: 'ui', className: 'aph-error' },
            `${t('apiUnavailable')}：${state.snapshot.ui.reason || ''}\n${t('apiHint')}`))
        }
        const view = state.view === 'detail'
          ? h(DetailView, { key: 'detail', store, t, localeId })
          : state.view === 'manage'
            ? h(ManageView, { key: 'manage', store, t, localeId })
            : h(StoreView, { key: 'store', store, t, localeId })
        body = h('div', { style: { display: 'flex', flexDirection: 'column' } }, banner, view)
      }

      return h('div', { className: 'aph-root', ref: scrollRef }, body)
    }

    /** 左侧栏全局面板图标（ownerProps：size / active）。拼图块 = 插件/扩展的通用符号。 */
    function PanelIcon({ size, active }) {
      const edge = typeof size === 'number' ? size : 20
      const scale = 1.3
      return h('svg', {
        viewBox: '0 0 24 24',
        width: edge,
        height: edge,
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block' },
      },
      h('g', { transform: `translate(12 12) scale(${scale}) translate(-12 -12)` },
        h('path', {
          d: 'M6 6h4V4.6Q10 3 12 3t2 1.6V6h4v3q-1.6 0-1.6 2t1.6 2v5H6Z',
          stroke: 'currentColor',
          strokeWidth: (active === true ? 2 : 1.7) / scale,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          fill: 'none',
        })))
    }

    /* ---------------------------------------------------------------------- *
     * apply
     * ---------------------------------------------------------------------- */
    function injectCss(ctx) {
      try {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') return
        const cssId = 'dsh-agent-plugin-hub/aph.css'
        let tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(cssId)}]`)
        if (!tag) {
          tag = document.createElement('style')
          tag.setAttribute('data-plugin', 'dsh-agent-plugin-hub')
          tag.setAttribute('data-plugin-css', cssId)
          tag.textContent = CSS
          document.head.appendChild(tag)
        }
        ctx.effect?.(() => () => {
          try {
            tag.remove()
          } catch {
            /* 已被移除 */
          }
        })
      } catch {
        /* 样式注入失败不阻塞功能 */
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.locale
        for (const [id, dict] of Object.entries({ en: EN, zh: ZH, 'zh-cn': ZH })) {
          try {
            locale?.register?.(NS, id, dict)
          } catch {
            /* 未知 locale id 忽略；页面仍可用显式字典渲染 */
          }
        }
        let bound = null
        try {
          bound = typeof locale?.bind === 'function' ? locale.bind(NS) : null
        } catch {
          bound = null
        }
        const activeId = () => {
          try {
            return String(locale?.getLocale?.()?.active ?? '').toLowerCase()
          } catch {
            return ''
          }
        }
        const dictFor = () => {
          const active = activeId()
          if (active.startsWith('zh')) return ZH
          if (active === '') return ZH
          return EN
        }
        const t = (key, vars) => {
          const dict = dictFor()
          let text = typeof dict[key] === 'string' && dict[key] !== ''
            ? dict[key]
            : (typeof EN[key] === 'string' ? EN[key] : key)
          if (typeof bound === 'function' && text === key) {
            try {
              const value = bound(key)
              if (typeof value === 'string' && value !== '') text = value
            } catch {
              /* 回退到静态字典 */
            }
          }
          if (vars && typeof vars === 'object') {
            for (const name of Object.keys(vars)) {
              text = text.split(`{${name}}`).join(String(vars[name]))
            }
          }
          return text
        }
        const getLocaleId = () => activeId() || 'zh'

        injectCss(ctx)
        const store = createStore(t, getLocaleId)
        ctx.effect?.(() => () => store.destroy())

        // 左侧栏：面板顺序 插件0 → 智能体插件5 → 自动化任务10 → 上下文洞察20
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'agent-plugin',
          order: 5,
          label: () => t('tab'),
          locale: NS,
        }, (props) => h(PanelIcon, { size: props?.size, active: props?.active })))

        // 中央主面板：key 与左侧栏入口 id 相同，由主面板按 id 分发。
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'agent-plugin',
          locale: NS,
        }, () => h(Panel, { store, t, locale, getLocaleId })))

        // 框架级浮层：弹窗与 Toast（避免面板内 fixed 被裁剪 / 切面板消失）。
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'agent-plugin-overlay',
          order: 60,
          label: () => t('tab'),
          locale: NS,
        }, () => h(OverlayHost, { store, t, locale })))
      },
      __test: {
        canonicalTitle,
        formatTime,
        pickI18n,
        matchQuery,
        orderMarkets,
        groupItemsByMarket,
        updateAvailable,
        displayOf,
        iconSrc,
        httpsUrl,
        createStore,
        components: {
          Panel,
          StoreView,
          ManageView,
          DetailView,
          OverlayHost,
          StoreCard,
        },
      },
    }
  },
})