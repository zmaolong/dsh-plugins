window.__ModuleLoader__.load({
	id: "dsh-agent-extension",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		// src/client/locales.ts
		/**
		* Dictionary namespace of the Agent Extension panel and its 8-language
		* dictionaries (language ids lowercase). `zh` is the key-set authority; every
		* other language carries the same keys. Placeholders use `{name}` templates.
		*
		* @module dsh-agent-extension/client/locales
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "agentExtension";
		/** Chinese dictionary (key-set authority). */
		const zh = {
			tab: "智能体扩展",
			title: "智能体扩展",
			refresh: "刷新",
			refreshing: "刷新中…",
			sources: "市场源",
			add: "添加",
			addMarketplace: "添加插件市场",
			manage: "插件管理",
			browseMarketplace: "浏览插件市场",
			searchPlaceholder: "搜索插件",
			searchResults: "搜索结果（{count}）",
			searchEmpty: "没有匹配的插件",
			personalEmpty: "个人来源还没有插件。用右上角的「添加」添加市场源。",
			catalogLoading: "正在加载插件…",
			catalogEmpty: "暂无市场插件",
			marketEmpty: "该市场里没有插件条目。",
			viewMore: "查看 {names}，以及另外 {count} 个",
			viewMoreFew: "查看 {names}",
			andMore: "等 {count} 个",
			showLess: "收起",
			install: "安装",
			installing: "安装中…",
			installedToast: "已安装 {name}",
			update: "更新",
			updating: "更新中…",
			updatedToast: "已更新 {name}",
			upToDate: "{name} 已是最新版本",
			updateAvailable: "可更新",
			updateAll: "全部更新（{count}）",
			updateAllDone: "已更新 {count} 个插件",
			updateAllPartial: "已更新 {succeeded} 个，{failed} 个失败：{plugins}",
			updateAllAborted: "全部更新已中止；已更新 {count} 个插件",
			checkFound: "发现 {count} 个插件可更新",
			checkNone: "所有已安装插件已更新",
			refreshPartial: "刷新完成，{count} 个市场失败；可在市场源中查看",
			enable: "启用",
			disable: "停用",
			enabled: "已启用",
			disabled: "已停用",
			enabledToast: "已启用 {name}",
			disabledToast: "已停用 {name}",
			toggleFailed: "无法更新 {name}，请重试。",
			uninstall: "卸载",
			uninstallTitle: "卸载 {name}？",
			uninstallDescription: "将删除该插件的缓存文件、数据目录以及已保存的配置。此操作无法撤销。",
			uninstalledToast: "已卸载 {name}",
			rollback: "回滚",
			rollbackTitle: "回滚 {name}？",
			rollbackDescription: "将已安装副本切回版本 {version}。当前版本会保留，可再次回滚。",
			rollbackToast: "已将 {name} 回滚到 {version}",
			back: "返回",
			detail: "详情",
			moreActions: "更多操作",
			sectionMcp: "MCP 服务器",
			sectionSkills: "技能",
			sectionCommands: "命令",
			sectionHooks: "Hooks",
			infoTitle: "信息",
			infoDeveloper: "开发者",
			infoCategory: "类别",
			infoVersion: "版本",
			infoMarket: "来源",
			infoWebsite: "网站",
			infoRepository: "仓库",
			infoLicense: "许可",
			infoInstalledAt: "安装时间",
			moreDetails: "高级信息",
			rootPath: "安装路径",
			format: "格式",
			hooksSource: "Hooks 来源",
			mcpSource: "MCP 来源",
			warnings: "警告",
			rollbackVersions: "可回滚版本",
			runtimeStatus: "运行状态",
			componentsLoading: "正在加载组件…",
			componentsError: "组件清单加载失败，仅展示可得信息。",
			componentsRetry: "重试",
			fetchDetail: "联网获取详情",
			fetchDetailHint: "详情尚未缓存到本地，可联网从市场源获取。",
			componentsEmpty: "该插件未声明组件，或组件无法读取。",
			componentsNotEffective: "未生效",
			componentsEffective: "已生效",
			hostEvent: "宿主事件",
			canBlock: "可阻断",
			sourceMissing: "市场来源已移除。插件仍可使用，但暂时无法更新。",
			sourceMissingShort: "来源已移除",
			noDescription: "暂无描述",
			close: "关闭",
			cancel: "取消",
			confirm: "确定",
			addMarketTitle: "添加插件市场",
			addMarketSourceLabel: "GitHub 仓库、Git URL、文件或目录",
			addMarketHint: "支持本地目录、Git 仓库地址与 marketplace.json 直链，自动识别来源类型与插件格式。",
			addMarketRisk: "非官方插件市场可能包含恶意插件，损害设备。请先核实来源并做好风险防范，再添加。",
			addMarketRiskAck: "我已了解风险，并已核实来源、做好风险防范。",
			marketName: "名称（可选）",
			adding: "添加中…",
			addedToast: "已添加市场：{name}（{type}，{count} 个插件）",
			detectedLocal: "本地目录",
			detectedGit: "Git 仓库",
			detectedUrl: "marketplace.json 直链",
			sourcesEmpty: "还没有登记任何市场源",
			sourcePluginCount: "{count} 个插件",
			sourceUpdated: "更新于 {time}",
			sourceRefreshFailed: "刷新失败于 {time}：{message}",
			sourceRefresh: "刷新该市场",
			sourceRemove: "移除该市场",
			refreshDone: "已刷新 {name}",
			remove: "移除",
			removeMarketTitle: "移除市场源？",
			removeMarketDescription: "已安装插件会保留并可继续使用，但会失去来源与更新能力。重新添加同一来源后恢复。",
			removedMarketToast: "已移除市场：{name}",
			orphanedToast: "已移除 {name}；{count} 个已安装插件失去来源",
			installedGroup: "已安装",
			noInstalled: "当前范围尚未安装插件。",
			noInstalledTitle: "尚未安装插件",
			noInstalledDescription: "浏览市场并安装插件，以添加 MCP、技能、命令与 hooks 能力。",
			filterAll: "全部",
			filterEnabled: "已启用",
			filterDisabled: "未启用",
			version: "版本",
			updatesAvailable: "{count} 个可更新",
			operationBusy: "另一个操作正在进行，请稍后重试。",
			errorForbidden: "请求被拒绝：插件 API 只允许本机回环页面访问。",
			errorNotFound: "目标不存在，插件或市场可能已被移除；请刷新后重试。",
			errorConflict: "状态冲突：目标已存在或已被变更；请刷新后重试。",
			errorSourceUnavailable: "市场源当前不可用，请刷新该市场后重试。",
			errorVersionInvalid: "版本号不合法。",
			errorNetwork: "网络请求失败，请检查网络后重试。",
			errorGit: "Git 操作失败，请检查仓库地址与网络。",
			errorInternal: "内部错误，请查看 hub 日志。",
			apiUnavailable: "智能体扩展 API 不可用",
			apiHint: "当前页面不是通过本机回环访问，或宿主尚未加载新版插件代码。刷新页面后重试。",
			migrationError: "数据迁移失败：{message}。原始数据仍保留在 hub 日志目录中。",
			retry: "重试",
			unknownError: "未知错误",
			runtimeSkills: "技能",
			runtimeCommands: "命令",
			runtimeHooks: "hooks",
			runtimeMcp: "MCP",
			runtimeNotEffective: "未生效",
			runtimeEffective: "就绪",
			enabledCount: "共 {total} 个插件 · {enabled} 个已启用",
			pluginCount: "{count} 个插件",
			installedBadge: "已安装",
			updateBadge: "可更新",
			notInstallable: "不可安装",
			menuEnable: "启用",
			menuDisable: "停用",
			menuUninstall: "卸载",
			hooksInactive: "未生效：{reason}",
			clearSearch: "清空搜索",
			allSources: "全部来源",
			tabSources: "我的市场",
			tabRecommended: "推荐",
			storeTabsLabel: "视图",
			tabPlugins: "插件",
			tabMemory: "记忆",
			tabSkills: "技能",
			sectionTabsLabel: "功能分区",
			comingSoon: "功能即将上线",
			memoryPlaceholder: "记忆管理功能还在规划中，敬请期待。",
			skillsPlaceholder: "技能管理功能还在规划中，敬请期待。",
			recommendedHint: "精选的插件市场源，点击添加后即可浏览安装。",
			addedBadge: "已添加",
			previewAddHint: "添加后即可浏览并安装其中的全部插件。",
			previewInstallBlocked: "添加市场源后可安装",
			memoryTitle: "记忆",
			memoryScopeLabel: "记忆作用域",
			memoryScopeGlobal: "全局",
			memoryScopeProject: "项目",
			memoryProjectLabel: "项目",
			memoryProjectEmpty: "尚未识别到任何项目。在项目目录中打开一次会话后即可使用项目记忆；全局记忆始终可用。",
			memorySearchPlaceholder: "搜索记忆",
			memoryTypeLabel: "记忆类型",
			memoryTypeAll: "全部",
			memoryTypePreference: "偏好/约定",
			memoryTypeDecision: "决策",
			memoryTypeGotcha: "坑/经验",
			memoryTypeProject: "项目事实",
			memoryTypeReference: "参考资料",
			memoryStatusActive: "生效中",
			memoryStatusStale: "已停用",
			memoryStatusArchived: "已归档",
			memoryNew: "新建记忆",
			memoryRetry: "重试",
			memoryListTitle: "记忆条目",
			memoryLoading: "正在加载记忆…",
			memoryListEmpty: "还没有记忆条目。点击「新建记忆」创建第一条。",
			memoryListEmptyFiltered: "没有匹配的记忆条目。",
			memoryCreateTitle: "新建记忆",
			memoryEditTitle: "编辑记忆",
			memoryFieldName: "名称",
			memoryFieldDescription: "描述",
			memoryFieldType: "类型",
			memoryFieldTags: "标签",
			memoryFieldImportance: "重要性",
			memoryFieldContent: "内容",
			memoryTagsHint: "回车或逗号添加标签",
			memoryImportanceHint: "0–100，越大越优先注入",
			memorySave: "保存",
			memorySaving: "保存中…",
			memorySaved: "记忆已保存",
			memoryNameRequired: "请填写名称和内容。",
			memoryStatusDone: "记忆状态已更新",
			memoryDeactivate: "停用",
			memoryArchive: "归档",
			memoryRestore: "恢复",
			memoryDelete: "删除",
			memoryDeleteConfirm: "确认删除",
			memoryDeleteDescription: "删除「{name}」后无法恢复。",
			memoryDeleting: "删除中…",
			memoryDeleted: "已删除记忆「{name}」",
			memoryExportMarkdown: "导出 Markdown",
			memoryExporting: "导出中…",
			memoryExportDone: "已导出 {filename}",
			memoryExportFailed: "导出失败：{message}",
			memoryRefreshIndex: "刷新索引",
			memoryRefreshIndexDone: "记忆索引已刷新",
			memoryRefreshIndexFailed: "刷新记忆索引失败：{message}",
			memorySettingsTitle: "捕获与注入设置",
			memorySettingsButton: "记忆设置与统计",
			memorySettingsCapture: "自动捕获",
			memorySettingsCaptureSessionEnd: "会话结束补漏",
			memorySettingsInject: "索引注入",
			memorySettingsIndexGlobal: "全局索引条数",
			memorySettingsIndexProject: "项目索引条数",
			memorySettingsMaxChars: "总字符预算",
			memoryTypeFilterLabel: "按类型筛选",
			memoryStatsTitle: "统计",
			memoryStatCaptureRuns: "累计捕获次数",
			memoryStatCapturedEntries: "已捕获条目",
			memoryInjectionRate: "注入利用率",
			memoryRetrievalRate: "检索命中率",
			memoryRecentCaptures: "最近捕获",
			memoryCaptureWritten: "写入 {count} 条",
			memoryCaptureSkipped: "跳过：{reason}",
			memoryUndoCapture: "撤销",
			memoryUndoCaptureDone: "已撤销该次捕获",
			memoryUndoCaptureFailed: "撤销失败：{message}",
			memoryCaptureUndone: "已撤销",
			memoryRecentCapturesEmpty: "暂无最近捕获",
			memorySortLabel: "排序",
			memorySortDefault: "重要度优先",
			memorySortRecent: "最近更新",
			memoryClearTypeFilter: "清除类型筛选",
			memoryClearTagFilter: "清除标签筛选",
			memoryTagRemove: "移除标签 {tag}",
			memoryTagFilterHint: "点击按此标签筛选",
			memoryAuditButton: "记忆体检",
			memoryAuditRunning: "体检中…",
			memoryAuditTitle: "记忆体检",
			memoryAuditStaleTitle: "过时候选",
			memoryAuditStaleHint: "有失效投票或已停用，建议归档",
			memoryAuditDuplicateTitle: "疑似重复",
			memoryAuditDuplicateHint: "内容与另一条高度相似",
			memoryAuditLowValueTitle: "低价值条目",
			memoryAuditLowValueHint: "超过 30 天未更新且从未被强化",
			memoryAuditKeep: "建议保留「{name}」",
			memoryAuditEmpty: "未发现问题，记忆库状态良好。",
			memoryAuditSelected: "已选 {count} 条",
			memoryAuditDeleteConfirm: "将删除所选 {count} 条记忆，且无法恢复。",
			memoryAuditDone: "已处理 {count} 条记忆",
			memoryAuditPartial: "{count} 条处理失败，可重新体检后重试",
			memoryOpenNative: "用系统应用打开",
			memoryBodyReadOnlyHint: "正文只读；用系统应用打开阅读。",
			memoryOpenNativeFailed: "无法用系统应用打开：{message}",
			memoryOpenNativeUnavailable: "当前环境不支持用系统应用打开文件",
			memoryMaintenanceButton: "优化记忆",
			memoryMaintenanceDueTitle: "该优化记忆了",
			memoryMaintenanceDueHint: "距上次维护 {days} 天，新增/强化 {writes} 条",
			memoryMaintenanceDueNeverHint: "尚未维护过；新增/强化 {writes} 条",
			memoryMaintenanceNotDueHint: "距上次维护不足阈值，仍要立即优化？",
			memoryMaintenanceConfirmTitle: "优化记忆",
			memoryMaintenanceConfirmHint: "将合并重复、停用过时条目并删除低价值条目；删除有备份，可整次撤销。",
			memoryMaintenanceRun: "立即优化",
			memoryMaintenanceRunning: "正在优化…",
			memoryMaintenanceResultTitle: "优化完成",
			memoryMaintenanceResult: "合并 {merges} 条，停用 {staled} 条，恢复 {restored} 条，删除 {deleted} 条",
			memoryMaintenanceFailed: "优化失败：{message}",
			memoryMaintenanceUndo: "撤销本次维护",
			memoryMaintenanceUndone: "已撤销本次维护",
			memoryMaintenanceUndoFailed: "撤销失败：{message}",
			memoryMaintenanceRecent: "最近维护",
			memoryMaintenanceEmpty: "暂无维护记录",
			memoryMaintenanceStatusCompleted: "已完成",
			memoryMaintenanceStatusFailed: "失败",
			memoryMaintenanceStatusEmpty: "无变更",
			memoryMaintenanceStatusUndone: "已撤销",
			memoryMaintenanceModelInherit: "留空继承宿主默认模型",
			memoryMaintenanceProvider: "维护模型提供方",
			memoryMaintenanceModel: "维护模型",
			memoryMaintenanceLater: "暂不",
			memoryDiagnosisButton: "诊断",
			memoryDiagnosisTitle: "记忆诊断",
			memoryDiagnosisEmpty: "暂无记录",
			memoryDiagnosisInjections: "最近注入",
			memoryDiagnosisCaptures: "最近捕获",
			memoryDiagnosisRetrievals: "最近检索",
			memoryDiagnosisMaintenance: "维护流水",
			memoryDiagnosisEntries: "{count} 条",
			memoryDiagnosisChars: "{count} 字符",
			memoryDiagnosisTruncated: "已截断",
			memoryDiagnosisQuery: "查询：{query}",
			memoryDiagnosisResults: "结果 {count} 条",
			memoryDiagnosisMore: "还有 {count} 条",
			memoryDiagnosisUndo: "撤销",
			memoryDiagnosisUndoDone: "已撤销该次维护",
			memoryDiagnosisUndoFailed: "撤销失败：{message}",
			memoryShowArchived: "显示已归档",
			memoryCopyId: "复制 ID",
			memoryIdCopied: "已复制 ID"
		};
		/** English dictionary (sentence case; same key set as `zh`). */
		const en = {
			tab: "Agent Extension",
			title: "Agent Extension",
			refresh: "Refresh",
			refreshing: "Refreshing…",
			sources: "Marketplace sources",
			add: "Add",
			addMarketplace: "Add plugin marketplace",
			manage: "Manage plugins",
			browseMarketplace: "Browse plugin marketplace",
			searchPlaceholder: "Search plugins",
			searchResults: "Search results ({count})",
			searchEmpty: "No plugins match your search",
			personalEmpty: "No plugins from personal sources yet. Use “Add” in the top right to add a marketplace source.",
			catalogLoading: "Loading plugins…",
			catalogEmpty: "No marketplace plugins found",
			marketEmpty: "This marketplace lists no plugins.",
			viewMore: "See {names}, and {count} more",
			viewMoreFew: "See {names}",
			andMore: "and {count} more",
			showLess: "Show less",
			install: "Install",
			installing: "Installing…",
			installedToast: "Installed {name}",
			update: "Update",
			updating: "Updating…",
			updatedToast: "Updated {name}",
			upToDate: "{name} is already up to date",
			updateAvailable: "Update",
			updateAll: "Update all ({count})",
			updateAllDone: "Updated {count} plugin(s)",
			updateAllPartial: "Updated {succeeded}, failed {failed}: {plugins}",
			updateAllAborted: "Update all stopped; updated {count} plugin(s)",
			checkFound: "Found {count} plugin update(s) available",
			checkNone: "All installed plugins are up to date",
			refreshPartial: "Refresh finished with {count} failure(s); see marketplace sources",
			enable: "Enable",
			disable: "Disable",
			enabled: "Enabled",
			disabled: "Disabled",
			enabledToast: "Enabled {name}",
			disabledToast: "Disabled {name}",
			toggleFailed: "Couldn’t update {name}. Try again.",
			uninstall: "Uninstall",
			uninstallTitle: "Uninstall {name}?",
			uninstallDescription: "This removes the plugin’s cached files, its data directory, and any saved configuration. This cannot be undone.",
			uninstalledToast: "Uninstalled {name}",
			rollback: "Roll back",
			rollbackTitle: "Roll back {name}?",
			rollbackDescription: "Switch the installed copy back to version {version}. The current version is kept for another rollback.",
			rollbackToast: "Rolled back {name} to {version}",
			back: "Back",
			detail: "Details",
			moreActions: "More actions",
			sectionMcp: "MCP servers",
			sectionSkills: "Skills",
			sectionCommands: "Commands",
			sectionHooks: "Hooks",
			infoTitle: "Information",
			infoDeveloper: "Developer",
			infoCategory: "Category",
			infoVersion: "Version",
			infoMarket: "Source",
			infoWebsite: "Website",
			infoRepository: "Repository",
			infoLicense: "License",
			infoInstalledAt: "Installed at",
			moreDetails: "Advanced details",
			rootPath: "Root path",
			format: "Format",
			hooksSource: "Hooks source",
			mcpSource: "MCP source",
			warnings: "Warnings",
			rollbackVersions: "Rollback versions",
			runtimeStatus: "Runtime",
			componentsLoading: "Loading components…",
			componentsError: "Couldn’t load the component list. Showing available info only.",
			componentsRetry: "Retry",
			fetchDetail: "Fetch details online",
			fetchDetailHint: "Details aren’t cached locally yet. Fetch them online from the marketplace source.",
			componentsEmpty: "This plugin doesn’t declare components, or they couldn’t be read.",
			componentsNotEffective: "Not effective",
			componentsEffective: "Effective",
			hostEvent: "Host event",
			canBlock: "can block",
			sourceMissing: "Marketplace source is missing. This plugin remains usable, but updates are unavailable.",
			sourceMissingShort: "Source missing",
			noDescription: "No description",
			close: "Close",
			cancel: "Cancel",
			confirm: "Confirm",
			addMarketTitle: "Add marketplace",
			addMarketSourceLabel: "GitHub repo, git URL, file, or directory",
			addMarketHint: "Local directories, Git repositories, and marketplace.json links are recognized automatically.",
			addMarketRisk: "Unofficial plugin marketplaces may contain malicious plugins that can harm your device. Verify the source and take precautions before adding.",
			addMarketRiskAck: "I understand the risks, have verified the source, and have taken precautions.",
			marketName: "Name (optional)",
			adding: "Adding…",
			addedToast: "Added marketplace: {name} ({type}, {count} plugins)",
			detectedLocal: "local directory",
			detectedGit: "Git repository",
			detectedUrl: "marketplace.json URL",
			sourcesEmpty: "No marketplace sources registered yet",
			sourcePluginCount: "{count} plugins",
			sourceUpdated: "Updated {time}",
			sourceRefreshFailed: "Refresh failed at {time}: {message}",
			sourceRefresh: "Refresh this marketplace",
			sourceRemove: "Remove this marketplace",
			refreshDone: "Refreshed {name}",
			remove: "Remove",
			removeMarketTitle: "Remove marketplace?",
			removeMarketDescription: "Installed plugins are kept and remain usable, but they will lose their source and update ability. Add the same source again to restore.",
			removedMarketToast: "Removed marketplace: {name}",
			orphanedToast: "Removed {name}; {count} installed plugin(s) became orphaned",
			installedGroup: "Installed",
			noInstalled: "No plugins are installed in this scope.",
			noInstalledTitle: "No plugins installed",
			noInstalledDescription: "Browse the store and install plugins to add MCP, skills, commands and hooks.",
			filterAll: "All",
			filterEnabled: "Enabled",
			filterDisabled: "Disabled",
			version: "Version",
			updatesAvailable: "{count} updates available",
			operationBusy: "Another operation is in progress. Try again shortly.",
			errorForbidden: "Request rejected: only local loopback pages may call this API.",
			errorNotFound: "Not found. The plugin or marketplace may have been removed; refresh and retry.",
			errorConflict: "State conflict: the target already exists or has changed. Refresh and retry.",
			errorSourceUnavailable: "The marketplace source is unavailable right now; refresh it and retry.",
			errorVersionInvalid: "The version number is not valid.",
			errorNetwork: "Network request failed. Check the connection and retry.",
			errorGit: "Git operation failed. Check the repository URL and your network.",
			errorInternal: "Internal error. See the hub logs for details.",
			apiUnavailable: "Agent Extension API unavailable",
			apiHint: "This page is not served over the loopback origin, or the host has not loaded the current plugin code. Refresh the page and retry.",
			migrationError: "Data migration failed: {message}. Your original data is preserved under the hub logs directory.",
			retry: "Retry",
			unknownError: "Unknown error",
			runtimeSkills: "Skills",
			runtimeCommands: "Commands",
			runtimeHooks: "Hooks",
			runtimeMcp: "MCP",
			runtimeNotEffective: "not effective",
			runtimeEffective: "ready",
			enabledCount: "{total} plugins · {enabled} enabled",
			pluginCount: "{count} plugins",
			installedBadge: "Installed",
			updateBadge: "Update",
			notInstallable: "Not installable",
			menuEnable: "Enable",
			menuDisable: "Disable",
			menuUninstall: "Uninstall",
			hooksInactive: "Not effective: {reason}",
			clearSearch: "Clear search",
			allSources: "All sources",
			tabSources: "My marketplaces",
			tabRecommended: "Recommended",
			storeTabsLabel: "Views",
			tabPlugins: "Plugins",
			tabMemory: "Memory",
			tabSkills: "Skills",
			sectionTabsLabel: "Sections",
			comingSoon: "Coming soon",
			memoryPlaceholder: "Memory management is on the roadmap. Stay tuned.",
			skillsPlaceholder: "Skill management is on the roadmap. Stay tuned.",
			recommendedHint: "Curated marketplace sources — add one to browse and install its plugins.",
			addedBadge: "Added",
			previewAddHint: "Add the source to browse and install all of its plugins.",
			previewInstallBlocked: "Installable after adding the source",
			memoryTitle: "Memory",
			memoryScopeLabel: "Memory scope",
			memoryScopeGlobal: "Global",
			memoryScopeProject: "Project",
			memoryProjectLabel: "Project",
			memoryProjectEmpty: "No projects detected yet. Open a session inside a project directory to use project memory; global memory is always available.",
			memorySearchPlaceholder: "Search memory",
			memoryTypeLabel: "Memory types",
			memoryTypeAll: "All",
			memoryTypePreference: "Preference",
			memoryTypeDecision: "Decision",
			memoryTypeGotcha: "Gotcha",
			memoryTypeProject: "Project fact",
			memoryTypeReference: "Reference",
			memoryStatusActive: "Active",
			memoryStatusStale: "Deactivated",
			memoryStatusArchived: "Archived",
			memoryNew: "New memory",
			memoryRetry: "Retry",
			memoryListTitle: "Memories",
			memoryLoading: "Loading memory…",
			memoryListEmpty: "No memories yet. Choose “New memory” to create the first one.",
			memoryListEmptyFiltered: "No memories match this filter.",
			memoryCreateTitle: "New memory",
			memoryEditTitle: "Edit memory",
			memoryFieldName: "Name",
			memoryFieldDescription: "Description",
			memoryFieldType: "Type",
			memoryFieldTags: "Tags",
			memoryFieldImportance: "Importance",
			memoryFieldContent: "Content",
			memoryTagsHint: "Press Enter or comma to add a tag",
			memoryImportanceHint: "0–100; higher values are injected first",
			memorySave: "Save",
			memorySaving: "Saving…",
			memorySaved: "Memory saved",
			memoryNameRequired: "Enter a name and content.",
			memoryStatusDone: "Memory status updated",
			memoryDeactivate: "Deactivate",
			memoryArchive: "Archive",
			memoryRestore: "Restore",
			memoryDelete: "Delete",
			memoryDeleteConfirm: "Confirm delete",
			memoryDeleteDescription: "Deleting “{name}” cannot be undone.",
			memoryDeleting: "Deleting…",
			memoryDeleted: "Deleted memory “{name}”",
			memoryExportMarkdown: "Export Markdown",
			memoryExporting: "Exporting…",
			memoryExportDone: "Exported {filename}",
			memoryExportFailed: "Export failed: {message}",
			memoryRefreshIndex: "Refresh index",
			memoryRefreshIndexDone: "Memory index refreshed",
			memoryRefreshIndexFailed: "Failed to refresh the memory index: {message}",
			memorySettingsTitle: "Capture and injection",
			memorySettingsButton: "Memory settings and stats",
			memorySettingsCapture: "Automatic capture",
			memorySettingsCaptureSessionEnd: "Session-end sweep",
			memorySettingsInject: "Index injection",
			memorySettingsIndexGlobal: "Global index size",
			memorySettingsIndexProject: "Project index size",
			memorySettingsMaxChars: "Total character budget",
			memoryTypeFilterLabel: "Filter by type",
			memoryStatsTitle: "Statistics",
			memoryStatCaptureRuns: "Capture runs",
			memoryStatCapturedEntries: "Entries captured",
			memoryInjectionRate: "Injection utilization",
			memoryRetrievalRate: "Retrieval hit rate",
			memoryRecentCaptures: "Recent captures",
			memoryCaptureWritten: "Wrote {count}",
			memoryCaptureSkipped: "Skipped: {reason}",
			memoryUndoCapture: "Undo",
			memoryUndoCaptureDone: "Capture undone",
			memoryUndoCaptureFailed: "Undo failed: {message}",
			memoryCaptureUndone: "Undone",
			memoryRecentCapturesEmpty: "No recent captures",
			memorySortLabel: "Sort",
			memorySortDefault: "By importance",
			memorySortRecent: "Recently updated",
			memoryClearTypeFilter: "Clear type filter",
			memoryClearTagFilter: "Clear tag filter",
			memoryTagRemove: "Remove tag {tag}",
			memoryTagFilterHint: "Click to filter by this tag",
			memoryAuditButton: "Memory audit",
			memoryAuditRunning: "Auditing…",
			memoryAuditTitle: "Memory audit",
			memoryAuditStaleTitle: "Stale candidates",
			memoryAuditStaleHint: "Carries an obsolete vote or is deactivated — consider archiving",
			memoryAuditDuplicateTitle: "Suspected duplicates",
			memoryAuditDuplicateHint: "Closely similar to another entry",
			memoryAuditLowValueTitle: "Low-value entries",
			memoryAuditLowValueHint: "Untouched for over 30 days and never reinforced",
			memoryAuditKeep: "Suggested to keep: {name}",
			memoryAuditEmpty: "No issues found — the memory store looks healthy.",
			memoryAuditSelected: "{count} selected",
			memoryAuditDeleteConfirm: "This deletes the {count} selected memories and cannot be undone.",
			memoryAuditDone: "Processed {count} memories",
			memoryAuditPartial: "{count} failed — rerun the audit and retry",
			memoryOpenNative: "Open in system app",
			memoryBodyReadOnlyHint: "The content is read-only; open it in a system app to read.",
			memoryOpenNativeFailed: "Could not open in a system app: {message}",
			memoryOpenNativeUnavailable: "This environment cannot open files in a system app",
			memoryMaintenanceButton: "Optimize memory",
			memoryMaintenanceDueTitle: "Memory upkeep is due",
			memoryMaintenanceDueHint: "{days} day(s) since the last upkeep; {writes} new or reinforced entries",
			memoryMaintenanceDueNeverHint: "Never optimized before; {writes} new or reinforced entries",
			memoryMaintenanceNotDueHint: "Below the upkeep threshold — optimize now anyway?",
			memoryMaintenanceConfirmTitle: "Optimize memory",
			memoryMaintenanceConfirmHint: "Merges duplicates, deactivates stale entries, and deletes low-value ones. Deletions are backed up, and the whole run can be undone.",
			memoryMaintenanceRun: "Optimize now",
			memoryMaintenanceRunning: "Optimizing…",
			memoryMaintenanceResultTitle: "Optimization complete",
			memoryMaintenanceResult: "Merged {merges}, deactivated {staled}, restored {restored}, deleted {deleted}",
			memoryMaintenanceFailed: "Optimization failed: {message}",
			memoryMaintenanceUndo: "Undo this run",
			memoryMaintenanceUndone: "Run undone",
			memoryMaintenanceUndoFailed: "Undo failed: {message}",
			memoryMaintenanceRecent: "Recent runs",
			memoryMaintenanceEmpty: "No maintenance runs yet",
			memoryMaintenanceStatusCompleted: "Completed",
			memoryMaintenanceStatusFailed: "Failed",
			memoryMaintenanceStatusEmpty: "No changes",
			memoryMaintenanceStatusUndone: "Undone",
			memoryMaintenanceModelInherit: "Leave empty to inherit the host default model",
			memoryMaintenanceProvider: "Maintenance model provider",
			memoryMaintenanceModel: "Maintenance model",
			memoryMaintenanceLater: "Not now",
			memoryDiagnosisButton: "Diagnostics",
			memoryDiagnosisTitle: "Memory diagnostics",
			memoryDiagnosisEmpty: "No records yet",
			memoryDiagnosisInjections: "Recent injections",
			memoryDiagnosisCaptures: "Recent captures",
			memoryDiagnosisRetrievals: "Recent retrievals",
			memoryDiagnosisMaintenance: "Maintenance runs",
			memoryDiagnosisEntries: "{count} entries",
			memoryDiagnosisChars: "{count} chars",
			memoryDiagnosisTruncated: "Truncated",
			memoryDiagnosisQuery: "Query: {query}",
			memoryDiagnosisResults: "{count} results",
			memoryDiagnosisMore: "and {count} more",
			memoryDiagnosisUndo: "Undo",
			memoryDiagnosisUndoDone: "Maintenance run undone",
			memoryDiagnosisUndoFailed: "Undo failed: {message}",
			memoryShowArchived: "Show archived",
			memoryCopyId: "Copy ID",
			memoryIdCopied: "ID copied"
		};
		/** Japanese dictionary (same key set as `zh`). */
		const ja = {
			tab: "エージェント拡張",
			title: "エージェント拡張",
			refresh: "再読み込み",
			refreshing: "再読み込み中…",
			sources: "マーケットソース",
			add: "追加",
			addMarketplace: "プラグインマーケットを追加",
			manage: "プラグイン管理",
			browseMarketplace: "プラグインマーケットを見る",
			searchPlaceholder: "プラグインを検索",
			searchResults: "検索結果（{count}）",
			searchEmpty: "一致するプラグインがありません",
			personalEmpty: "個人ソースにはまだプラグインがありません。右上の「追加」からマーケットソースを追加してください。",
			catalogLoading: "プラグインを読み込み中…",
			catalogEmpty: "マーケットのプラグインはまだありません",
			marketEmpty: "このマーケットにはプラグインが登録されていません。",
			viewMore: "{names}、ほか {count} 件を表示",
			viewMoreFew: "{names} を表示",
			andMore: "ほか {count} 件",
			showLess: "折りたたむ",
			install: "インストール",
			installing: "インストール中…",
			installedToast: "{name} をインストールしました",
			update: "更新",
			updating: "更新中…",
			updatedToast: "{name} を更新しました",
			upToDate: "{name} は最新です",
			updateAvailable: "更新あり",
			updateAll: "すべて更新（{count}）",
			updateAllDone: "{count} 件のプラグインを更新しました",
			updateAllPartial: "{succeeded} 件更新、{failed} 件失敗：{plugins}",
			updateAllAborted: "すべて更新を中止しました。{count} 件のプラグインを更新済みです。",
			checkFound: "{count} 件のプラグインに更新があります",
			checkNone: "インストール済みのプラグインはすべて最新です",
			refreshPartial: "再読み込みが完了しましたが、{count} 件のマーケットが失敗しました。マーケットソースで確認してください。",
			enable: "有効化",
			disable: "無効化",
			enabled: "有効",
			disabled: "無効",
			enabledToast: "{name} を有効化しました",
			disabledToast: "{name} を無効化しました",
			toggleFailed: "{name} を更新できませんでした。再試行してください。",
			uninstall: "アンインストール",
			uninstallTitle: "{name} をアンインストールしますか？",
			uninstallDescription: "このプラグインのキャッシュファイル、データディレクトリ、保存済みの設定を削除します。この操作は元に戻せません。",
			uninstalledToast: "{name} をアンインストールしました",
			rollback: "ロールバック",
			rollbackTitle: "{name} をロールバックしますか？",
			rollbackDescription: "インストール済みのコピーをバージョン {version} に戻します。現在のバージョンは保持され、再度ロールバックできます。",
			rollbackToast: "{name} をバージョン {version} にロールバックしました",
			back: "戻る",
			detail: "詳細",
			moreActions: "その他の操作",
			sectionMcp: "MCP サーバー",
			sectionSkills: "スキル",
			sectionCommands: "コマンド",
			sectionHooks: "Hooks",
			infoTitle: "情報",
			infoDeveloper: "開発者",
			infoCategory: "カテゴリ",
			infoVersion: "バージョン",
			infoMarket: "提供元",
			infoWebsite: "ウェブサイト",
			infoRepository: "リポジトリ",
			infoLicense: "ライセンス",
			infoInstalledAt: "インストール日時",
			moreDetails: "詳細情報",
			rootPath: "インストール先",
			format: "形式",
			hooksSource: "Hooks の提供元",
			mcpSource: "MCP の提供元",
			warnings: "警告",
			rollbackVersions: "ロールバック可能なバージョン",
			runtimeStatus: "実行状態",
			componentsLoading: "コンポーネントを読み込み中…",
			componentsError: "コンポーネント一覧を読み込めませんでした。取得できた情報のみを表示します。",
			componentsRetry: "再試行",
			fetchDetail: "オンラインで詳細を取得",
			fetchDetailHint: "詳細はまだローカルにキャッシュされていません。マーケットソースからオンラインで取得できます。",
			componentsEmpty: "このプラグインはコンポーネントを宣言していないか、読み取れませんでした。",
			componentsNotEffective: "未反映",
			componentsEffective: "反映済み",
			hostEvent: "ホストイベント",
			canBlock: "ブロック可能",
			sourceMissing: "マーケットソースが見つかりません。このプラグインは引き続き使用できますが、更新はできません。",
			sourceMissingShort: "提供元なし",
			noDescription: "説明なし",
			close: "閉じる",
			cancel: "キャンセル",
			confirm: "OK",
			addMarketTitle: "マーケットを追加",
			addMarketSourceLabel: "GitHub リポジトリ、Git URL、ファイル、またはディレクトリ",
			addMarketHint: "ローカルディレクトリ、Git リポジトリ、marketplace.json へのリンクを自動認識します。",
			addMarketRisk: "非公式のプラグインマーケットには、デバイスに害を与える悪意のあるプラグインが含まれている可能性があります。追加する前に、提供元を確認し、リスク対策を行ってください。",
			addMarketRiskAck: "リスクを理解したうえで、提供元を確認し、リスク対策を行いました。",
			marketName: "名前（任意）",
			adding: "追加中…",
			addedToast: "マーケットを追加しました：{name}（{type}、プラグイン {count} 件）",
			detectedLocal: "ローカルディレクトリ",
			detectedGit: "Git リポジトリ",
			detectedUrl: "marketplace.json の URL",
			sourcesEmpty: "マーケットソースがまだ登録されていません",
			sourcePluginCount: "プラグイン {count} 件",
			sourceUpdated: "最終更新：{time}",
			sourceRefreshFailed: "再読み込み失敗（{time}）：{message}",
			sourceRefresh: "このマーケットを再読み込み",
			sourceRemove: "このマーケットを削除",
			refreshDone: "{name} を再読み込みしました",
			remove: "削除",
			removeMarketTitle: "マーケットソースを削除しますか？",
			removeMarketDescription: "インストール済みのプラグインは残り、引き続き使用できますが、提供元と更新機能は失われます。同じソースを再度追加すると復元できます。",
			removedMarketToast: "マーケットを削除しました：{name}",
			orphanedToast: "{name} を削除しました。インストール済みの {count} 件のプラグインが提供元を失いました。",
			installedGroup: "インストール済み",
			noInstalled: "この範囲にはインストール済みのプラグインがありません。",
			noInstalledTitle: "プラグインがインストールされていません",
			noInstalledDescription: "マーケットを見てプラグインをインストールすると、MCP、スキル、コマンド、Hooks を追加できます。",
			filterAll: "すべて",
			filterEnabled: "有効",
			filterDisabled: "無効",
			version: "バージョン",
			updatesAvailable: "{count} 件の更新あり",
			operationBusy: "別の操作が進行中です。しばらくしてから再試行してください。",
			errorForbidden: "リクエストが拒否されました：この API を呼び出せるのはローカルループバックのページのみです。",
			errorNotFound: "見つかりません。プラグインまたはマーケットが削除された可能性があります。再読み込みして再試行してください。",
			errorConflict: "状態が競合しています：対象は既に存在するか、変更されています。再読み込みして再試行してください。",
			errorSourceUnavailable: "マーケットソースは現在利用できません。再読み込みしてから再試行してください。",
			errorVersionInvalid: "バージョン番号が不正です。",
			errorNetwork: "ネットワークリクエストに失敗しました。接続を確認して再試行してください。",
			errorGit: "Git 操作に失敗しました。リポジトリの URL とネットワークを確認してください。",
			errorInternal: "内部エラーが発生しました。詳細は hub のログを確認してください。",
			apiUnavailable: "エージェント拡張 API を利用できません",
			apiHint: "このページがローカルループバック経由で配信されていないか、ホストが新しいプラグインコードを読み込んでいません。ページを再読み込みして再試行してください。",
			migrationError: "データ移行に失敗しました：{message}。元のデータは hub のログディレクトリに残っています。",
			retry: "再試行",
			unknownError: "不明なエラー",
			runtimeSkills: "スキル",
			runtimeCommands: "コマンド",
			runtimeHooks: "Hooks",
			runtimeMcp: "MCP",
			runtimeNotEffective: "未反映",
			runtimeEffective: "準備完了",
			enabledCount: "プラグイン {total} 件 · 有効 {enabled} 件",
			pluginCount: "プラグイン {count} 件",
			installedBadge: "インストール済み",
			updateBadge: "更新あり",
			notInstallable: "インストール不可",
			menuEnable: "有効化",
			menuDisable: "無効化",
			menuUninstall: "アンインストール",
			hooksInactive: "未反映：{reason}",
			clearSearch: "検索をクリア",
			allSources: "すべてのソース",
			tabSources: "マーケット",
			tabRecommended: "おすすめ",
			storeTabsLabel: "ビュー",
			tabPlugins: "プラグイン",
			tabMemory: "メモリ",
			tabSkills: "スキル",
			sectionTabsLabel: "セクション",
			comingSoon: "近日公開",
			memoryPlaceholder: "メモリ管理機能は準備中です。お待ちください。",
			skillsPlaceholder: "スキル管理機能は準備中です。お待ちください。",
			recommendedHint: "厳選されたマーケットソースです。追加するとプラグインを閲覧・インストールできます。",
			addedBadge: "追加済み",
			previewAddHint: "追加すると、すべてのプラグインを閲覧・インストールできます。",
			previewInstallBlocked: "マーケットソースの追加後にインストールできます",
			memoryTitle: "メモリ",
			memoryScopeLabel: "メモリのスコープ",
			memoryScopeGlobal: "グローバル",
			memoryScopeProject: "プロジェクト",
			memoryProjectLabel: "プロジェクト",
			memoryProjectEmpty: "プロジェクトがまだ検出されていません。プロジェクトのディレクトリでセッションを開くとプロジェクトメモリを利用できます。グローバルメモリは常に利用できます。",
			memorySearchPlaceholder: "メモリを検索",
			memoryTypeLabel: "メモリの種類",
			memoryTypeAll: "すべて",
			memoryTypePreference: "好み・取り決め",
			memoryTypeDecision: "決定",
			memoryTypeGotcha: "落とし穴・経験",
			memoryTypeProject: "プロジェクトの事実",
			memoryTypeReference: "参考資料",
			memoryStatusActive: "有効",
			memoryStatusStale: "停止中",
			memoryStatusArchived: "アーカイブ済み",
			memoryNew: "メモリを作成",
			memoryRetry: "再試行",
			memoryListTitle: "メモリ一覧",
			memoryLoading: "メモリを読み込み中…",
			memoryListEmpty: "メモリはまだありません。「メモリを作成」から最初の1件を作成してください。",
			memoryListEmptyFiltered: "条件に一致するメモリがありません。",
			memoryCreateTitle: "メモリを作成",
			memoryEditTitle: "メモリを編集",
			memoryFieldName: "名前",
			memoryFieldDescription: "説明",
			memoryFieldType: "種類",
			memoryFieldTags: "タグ",
			memoryFieldImportance: "重要度",
			memoryFieldContent: "内容",
			memoryTagsHint: "Enter またはカンマでタグを追加",
			memoryImportanceHint: "0〜100。大きいほど優先して注入されます",
			memorySave: "保存",
			memorySaving: "保存中…",
			memorySaved: "メモリを保存しました",
			memoryNameRequired: "名前と内容を入力してください。",
			memoryStatusDone: "メモリの状態を更新しました",
			memoryDeactivate: "停止",
			memoryArchive: "アーカイブ",
			memoryRestore: "復元",
			memoryDelete: "削除",
			memoryDeleteConfirm: "削除を確定",
			memoryDeleteDescription: "「{name}」を削除すると元に戻せません。",
			memoryDeleting: "削除中…",
			memoryDeleted: "メモリ「{name}」を削除しました",
			memoryExportMarkdown: "Markdown を書き出す",
			memoryExporting: "書き出し中…",
			memoryExportDone: "{filename} を書き出しました",
			memoryExportFailed: "書き出しに失敗しました：{message}",
			memoryRefreshIndex: "索引を再構築",
			memoryRefreshIndexDone: "メモリ索引を再構築しました",
			memoryRefreshIndexFailed: "メモリ索引の再構築に失敗しました：{message}",
			memorySettingsTitle: "キャプチャと注入の設定",
			memorySettingsCapture: "自動キャプチャ",
			memorySettingsCaptureSessionEnd: "セッション終了時の補完",
			memorySettingsInject: "インデックス注入",
			memorySettingsIndexGlobal: "グローバル索引件数",
			memorySettingsIndexProject: "プロジェクト索引件数",
			memorySettingsMaxChars: "合計文字数予算",
			memorySettingsButton: "メモリ設定と統計",
			memoryTypeFilterLabel: "タイプで絞り込み",
			memoryStatsTitle: "統計",
			memoryStatCaptureRuns: "キャプチャ回数",
			memoryStatCapturedEntries: "キャプチャ済み件数",
			memoryInjectionRate: "注入利用率",
			memoryRetrievalRate: "検索ヒット率",
			memoryRecentCaptures: "最近のキャプチャ",
			memoryCaptureWritten: "{count} 件書き込み",
			memoryCaptureSkipped: "スキップ：{reason}",
			memoryUndoCapture: "取り消す",
			memoryUndoCaptureDone: "キャプチャを取り消しました",
			memoryUndoCaptureFailed: "取り消しに失敗しました：{message}",
			memoryCaptureUndone: "取り消し済み",
			memoryRecentCapturesEmpty: "最近のキャプチャはありません",
			memorySortLabel: "並び替え",
			memorySortDefault: "重要度順",
			memorySortRecent: "更新が新しい順",
			memoryClearTypeFilter: "タイプ絞り込みを解除",
			memoryClearTagFilter: "タグ絞り込みを解除",
			memoryTagRemove: "タグ {tag} を削除",
			memoryTagFilterHint: "クリックでこのタグで絞り込み",
			memoryAuditButton: "メモリ診断",
			memoryAuditRunning: "診断中…",
			memoryAuditTitle: "メモリ診断",
			memoryAuditStaleTitle: "陳腐化の候補",
			memoryAuditStaleHint: "無効投票ありまたは停止中。アーカイブを推奨",
			memoryAuditDuplicateTitle: "重複の疑い",
			memoryAuditDuplicateHint: "別のエントリと内容が類似",
			memoryAuditLowValueTitle: "低価値エントリ",
			memoryAuditLowValueHint: "30 日以上未更新かつ強化なし",
			memoryAuditKeep: "保持候補：{name}",
			memoryAuditEmpty: "問題は見つかりませんでした。メモリは良好です。",
			memoryAuditSelected: "{count} 件選択中",
			memoryAuditDeleteConfirm: "選択した {count} 件のメモリを削除します。元に戻せません。",
			memoryAuditDone: "{count} 件のメモリを処理しました",
			memoryAuditPartial: "{count} 件が失敗しました。再診断して再試行してください",
			memoryOpenNative: "システムアプリで開く",
			memoryBodyReadOnlyHint: "本文は読み取り専用です。システムアプリで開いて読んでください。",
			memoryOpenNativeFailed: "システムアプリで開けませんでした：{message}",
			memoryOpenNativeUnavailable: "この環境ではシステムアプリでファイルを開けません",
			memoryMaintenanceButton: "記憶を最適化",
			memoryMaintenanceDueTitle: "記憶の最適化が必要です",
			memoryMaintenanceDueHint: "前回のメンテナンスから {days} 日、新規/強化 {writes} 件",
			memoryMaintenanceDueNeverHint: "まだメンテナンス未実施；新規/強化 {writes} 件",
			memoryMaintenanceNotDueHint: "前回のメンテナンスから間もなく閾値未満です。今すぐ最適化しますか？",
			memoryMaintenanceConfirmTitle: "記憶を最適化",
			memoryMaintenanceConfirmHint: "重複の統合、古い項目の無効化、低価値項目の削除を行います。削除はバックアップされ、実行全体を取り消せます。",
			memoryMaintenanceRun: "今すぐ最適化",
			memoryMaintenanceRunning: "最適化中…",
			memoryMaintenanceResultTitle: "最適化が完了しました",
			memoryMaintenanceResult: "統合 {merges} 件、無効化 {staled} 件、復元 {restored} 件、削除 {deleted} 件",
			memoryMaintenanceFailed: "最適化に失敗しました：{message}",
			memoryMaintenanceUndo: "この実行を取り消す",
			memoryMaintenanceUndone: "実行を取り消しました",
			memoryMaintenanceUndoFailed: "取り消しに失敗しました：{message}",
			memoryMaintenanceRecent: "最近の実行",
			memoryMaintenanceEmpty: "実行履歴はありません",
			memoryMaintenanceStatusCompleted: "完了",
			memoryMaintenanceStatusFailed: "失敗",
			memoryMaintenanceStatusEmpty: "変更なし",
			memoryMaintenanceStatusUndone: "取り消し済み",
			memoryMaintenanceModelInherit: "空欄でホスト既定モデルを継承",
			memoryMaintenanceProvider: "メンテナンスモデルの提供元",
			memoryMaintenanceModel: "メンテナンスモデル",
			memoryMaintenanceLater: "今はしない",
			memoryDiagnosisButton: "診断",
			memoryDiagnosisTitle: "メモリ診断",
			memoryDiagnosisEmpty: "記録はありません",
			memoryDiagnosisInjections: "最近の注入",
			memoryDiagnosisCaptures: "最近のキャプチャ",
			memoryDiagnosisRetrievals: "最近の検索",
			memoryDiagnosisMaintenance: "メンテナンス履歴",
			memoryDiagnosisEntries: "{count} 件",
			memoryDiagnosisChars: "{count} 文字",
			memoryDiagnosisTruncated: "切り詰め済み",
			memoryDiagnosisQuery: "クエリ：{query}",
			memoryDiagnosisResults: "結果 {count} 件",
			memoryDiagnosisMore: "ほか {count} 件",
			memoryDiagnosisUndo: "取り消す",
			memoryDiagnosisUndoDone: "このメンテナンスを取り消しました",
			memoryDiagnosisUndoFailed: "取り消しに失敗しました：{message}",
			memoryShowArchived: "アーカイブを表示",
			memoryCopyId: "ID をコピー",
			memoryIdCopied: "ID をコピーしました"
		};
		/** Spanish dictionary (same key set as `zh`). */
		const es = {
			tab: "Extensión de agente",
			title: "Extensión de agente",
			refresh: "Recargar",
			refreshing: "Recargando…",
			sources: "Fuentes de marketplace",
			add: "Agregar",
			addMarketplace: "Agregar marketplace de plugins",
			manage: "Administrar plugins",
			browseMarketplace: "Explorar marketplace de plugins",
			searchPlaceholder: "Buscar plugins",
			searchResults: "Resultados de búsqueda ({count})",
			searchEmpty: "Ningún plugin coincide con la búsqueda",
			personalEmpty: "Aún no hay plugins de fuentes personales. Use “Agregar” en la esquina superior derecha para agregar una fuente de marketplace.",
			catalogLoading: "Cargando plugins…",
			catalogEmpty: "Aún no hay plugins en el marketplace",
			marketEmpty: "Este marketplace no tiene plugins.",
			viewMore: "Ver {names} y {count} más",
			viewMoreFew: "Ver {names}",
			andMore: "y {count} más",
			showLess: "Mostrar menos",
			install: "Instalar",
			installing: "Instalando…",
			installedToast: "{name} instalado",
			update: "Actualizar",
			updating: "Actualizando…",
			updatedToast: "{name} actualizado",
			upToDate: "{name} ya está actualizado",
			updateAvailable: "Actualización disponible",
			updateAll: "Actualizar todo ({count})",
			updateAllDone: "Plugins actualizados: {count}",
			updateAllPartial: "Se actualizaron {succeeded}, fallaron {failed}: {plugins}",
			updateAllAborted: "La actualización total se detuvo; plugins actualizados: {count}",
			checkFound: "Actualizaciones disponibles: {count}",
			checkNone: "Todos los plugins instalados están actualizados",
			refreshPartial: "La recarga finalizó con {count} error(es); consulte las fuentes de marketplace",
			enable: "Activar",
			disable: "Desactivar",
			enabled: "Activado",
			disabled: "Desactivado",
			enabledToast: "{name} activado",
			disabledToast: "{name} desactivado",
			toggleFailed: "No se pudo actualizar {name}. Vuelva a intentarlo.",
			uninstall: "Desinstalar",
			uninstallTitle: "¿Desinstalar {name}?",
			uninstallDescription: "Se eliminarán los archivos de caché del plugin, su directorio de datos y la configuración guardada. Esta acción no se puede deshacer.",
			uninstalledToast: "{name} desinstalado",
			rollback: "Revertir",
			rollbackTitle: "¿Revertir {name}?",
			rollbackDescription: "La copia instalada volverá a la versión {version}. La versión actual se conserva para poder revertir de nuevo.",
			rollbackToast: "Se revirtió {name} a la versión {version}",
			back: "Volver",
			detail: "Detalles",
			moreActions: "Más acciones",
			sectionMcp: "Servidores MCP",
			sectionSkills: "Habilidades",
			sectionCommands: "Comandos",
			sectionHooks: "Hooks",
			infoTitle: "Información",
			infoDeveloper: "Desarrollador",
			infoCategory: "Categoría",
			infoVersion: "Versión",
			infoMarket: "Fuente",
			infoWebsite: "Sitio web",
			infoRepository: "Repositorio",
			infoLicense: "Licencia",
			infoInstalledAt: "Fecha de instalación",
			moreDetails: "Detalles avanzados",
			rootPath: "Ruta de instalación",
			format: "Formato",
			hooksSource: "Fuente de Hooks",
			mcpSource: "Fuente de MCP",
			warnings: "Advertencias",
			rollbackVersions: "Versiones para revertir",
			runtimeStatus: "Estado de ejecución",
			componentsLoading: "Cargando componentes…",
			componentsError: "No se pudo cargar la lista de componentes. Se muestra solo la información disponible.",
			componentsRetry: "Reintentar",
			fetchDetail: "Obtener detalles en línea",
			fetchDetailHint: "Los detalles aún no están en la caché local. Puede obtenerlos en línea desde la fuente de marketplace.",
			componentsEmpty: "Este plugin no declara componentes o no se pudieron leer.",
			componentsNotEffective: "Sin efecto",
			componentsEffective: "Efectivo",
			hostEvent: "Evento del host",
			canBlock: "puede bloquear",
			sourceMissing: "Falta la fuente de marketplace. El plugin sigue siendo utilizable, pero no hay actualizaciones disponibles.",
			sourceMissingShort: "Fuente ausente",
			noDescription: "Sin descripción",
			close: "Cerrar",
			cancel: "Cancelar",
			confirm: "Confirmar",
			addMarketTitle: "Agregar marketplace",
			addMarketSourceLabel: "Repositorio de GitHub, URL de git, archivo o directorio",
			addMarketHint: "Se reconocen automáticamente directorios locales, repositorios de Git y enlaces a marketplace.json.",
			addMarketRisk: "Los marketplaces de plugins no oficiales pueden contener plugins maliciosos que podrían dañar su dispositivo. Verifique la fuente y tome precauciones antes de agregar.",
			addMarketRiskAck: "Entiendo los riesgos, he verificado la fuente y he tomado precauciones.",
			marketName: "Nombre (opcional)",
			adding: "Agregando…",
			addedToast: "Marketplace agregado: {name} ({type}, {count} plugins)",
			detectedLocal: "directorio local",
			detectedGit: "repositorio de Git",
			detectedUrl: "URL de marketplace.json",
			sourcesEmpty: "Aún no hay fuentes de marketplace registradas",
			sourcePluginCount: "{count} plugins",
			sourceUpdated: "Actualizado: {time}",
			sourceRefreshFailed: "La recarga falló a las {time}: {message}",
			sourceRefresh: "Recargar este marketplace",
			sourceRemove: "Quitar este marketplace",
			refreshDone: "{name} recargado",
			remove: "Quitar",
			removeMarketTitle: "¿Quitar el marketplace?",
			removeMarketDescription: "Los plugins instalados se conservan y siguen siendo utilizables, pero perderán su fuente y la posibilidad de actualizarse. Agregue la misma fuente de nuevo para restaurarla.",
			removedMarketToast: "Marketplace quitado: {name}",
			orphanedToast: "Se quitó {name}; {count} plugin(s) instalado(s) quedaron huérfanos",
			installedGroup: "Instalados",
			noInstalled: "No hay plugins instalados en este ámbito.",
			noInstalledTitle: "No hay plugins instalados",
			noInstalledDescription: "Explore el marketplace e instale plugins para agregar MCP, habilidades, comandos y Hooks.",
			filterAll: "Todos",
			filterEnabled: "Activados",
			filterDisabled: "Desactivados",
			version: "Versión",
			updatesAvailable: "{count} actualizaciones disponibles",
			operationBusy: "Hay otra operación en curso. Vuelva a intentarlo en un momento.",
			errorForbidden: "Solicitud rechazada: solo las páginas locales de loopback pueden llamar a esta API.",
			errorNotFound: "No encontrado. Es posible que el plugin o el marketplace se hayan quitado; recargue e inténtelo de nuevo.",
			errorConflict: "Conflicto de estado: el destino ya existe o ha cambiado. Recargue e inténtelo de nuevo.",
			errorSourceUnavailable: "La fuente de marketplace no está disponible en este momento; recárguela e inténtelo de nuevo.",
			errorVersionInvalid: "El número de versión no es válido.",
			errorNetwork: "Error en la solicitud de red. Compruebe la conexión e inténtelo de nuevo.",
			errorGit: "Error en la operación de Git. Compruebe la URL del repositorio y su red.",
			errorInternal: "Error interno. Consulte los registros del hub para más detalles.",
			apiUnavailable: "API de la extensión de agente no disponible",
			apiHint: "Esta página no se sirve por el origen de loopback local, o el host no ha cargado el código actual del plugin. Recargue la página e inténtelo de nuevo.",
			migrationError: "Error en la migración de datos: {message}. Sus datos originales se conservan en el directorio de registros del hub.",
			retry: "Reintentar",
			unknownError: "Error desconocido",
			runtimeSkills: "Habilidades",
			runtimeCommands: "Comandos",
			runtimeHooks: "Hooks",
			runtimeMcp: "MCP",
			runtimeNotEffective: "sin efecto",
			runtimeEffective: "listo",
			enabledCount: "{total} plugins · {enabled} activados",
			pluginCount: "{count} plugins",
			installedBadge: "Instalado",
			updateBadge: "Actualización",
			notInstallable: "No instalable",
			menuEnable: "Activar",
			menuDisable: "Desactivar",
			menuUninstall: "Desinstalar",
			hooksInactive: "Sin efecto: {reason}",
			clearSearch: "Borrar búsqueda",
			allSources: "Todas las fuentes",
			tabSources: "Mis mercados",
			tabRecommended: "Recomendados",
			storeTabsLabel: "Vistas",
			tabPlugins: "Complementos",
			tabMemory: "Memoria",
			tabSkills: "Habilidades",
			sectionTabsLabel: "Secciones",
			comingSoon: "Próximamente",
			memoryPlaceholder: "La gestión de la memoria estará disponible próximamente.",
			skillsPlaceholder: "La gestión de las habilidades estará disponible próximamente.",
			recommendedHint: "Fuentes de marketplace seleccionadas: agregue una para explorar e instalar sus plugins.",
			addedBadge: "Agregado",
			previewAddHint: "Agregue la fuente para explorar e instalar todos sus plugins.",
			previewInstallBlocked: "Se puede instalar tras agregar la fuente",
			memoryTitle: "Memoria",
			memoryScopeLabel: "Ámbito de memoria",
			memoryScopeGlobal: "Global",
			memoryScopeProject: "Proyecto",
			memoryProjectLabel: "Proyecto",
			memoryProjectEmpty: "Aún no se detectan proyectos. Abra una sesión dentro del directorio de un proyecto para usar la memoria de proyecto; la memoria global siempre está disponible.",
			memorySearchPlaceholder: "Buscar en la memoria",
			memoryTypeLabel: "Tipos de memoria",
			memoryTypeAll: "Todos",
			memoryTypePreference: "Preferencia",
			memoryTypeDecision: "Decisión",
			memoryTypeGotcha: "Advertencia",
			memoryTypeProject: "Hecho del proyecto",
			memoryTypeReference: "Referencia",
			memoryStatusActive: "Activa",
			memoryStatusStale: "Desactivada",
			memoryStatusArchived: "Archivada",
			memoryNew: "Nueva memoria",
			memoryRetry: "Reintentar",
			memoryListTitle: "Memorias",
			memoryLoading: "Cargando memoria…",
			memoryListEmpty: "Aún no hay memorias. Elija «Nueva memoria» para crear la primera.",
			memoryListEmptyFiltered: "Ninguna memoria coincide con este filtro.",
			memoryCreateTitle: "Nueva memoria",
			memoryEditTitle: "Editar memoria",
			memoryFieldName: "Nombre",
			memoryFieldDescription: "Descripción",
			memoryFieldType: "Tipo",
			memoryFieldTags: "Etiquetas",
			memoryFieldImportance: "Importancia",
			memoryFieldContent: "Contenido",
			memoryTagsHint: "Pulse Intro o una coma para añadir la etiqueta",
			memoryImportanceHint: "0–100; los valores altos se inyectan primero",
			memorySave: "Guardar",
			memorySaving: "Guardando…",
			memorySaved: "Memoria guardada",
			memoryNameRequired: "Escriba un nombre y un contenido.",
			memoryStatusDone: "Estado de la memoria actualizado",
			memoryDeactivate: "Desactivar",
			memoryArchive: "Archivar",
			memoryRestore: "Restaurar",
			memoryDelete: "Eliminar",
			memoryDeleteConfirm: "Confirmar eliminación",
			memoryDeleteDescription: "Eliminar «{name}» no se puede deshacer.",
			memoryDeleting: "Eliminando…",
			memoryDeleted: "Memoria «{name}» eliminada",
			memoryExportMarkdown: "Exportar Markdown",
			memoryExporting: "Exportando…",
			memoryExportDone: "Se exportó {filename}",
			memoryExportFailed: "Error al exportar: {message}",
			memoryRefreshIndex: "Reconstruir índice",
			memoryRefreshIndexDone: "Índice de memoria reconstruido",
			memoryRefreshIndexFailed: "No se pudo reconstruir el índice de memoria: {message}",
			memorySettingsTitle: "Captura e inyección",
			memorySettingsCapture: "Captura automática",
			memorySettingsCaptureSessionEnd: "Cierre de sesión",
			memorySettingsInject: "Inyección del índice",
			memorySettingsIndexGlobal: "Tamaño del índice global",
			memorySettingsIndexProject: "Tamaño del índice del proyecto",
			memorySettingsMaxChars: "Presupuesto de caracteres",
			memorySettingsButton: "Ajustes y estadísticas de memoria",
			memoryTypeFilterLabel: "Filtrar por tipo",
			memoryStatsTitle: "Estadísticas",
			memoryStatCaptureRuns: "Ejecuciones de captura",
			memoryStatCapturedEntries: "Entradas capturadas",
			memoryInjectionRate: "Utilización de inyección",
			memoryRetrievalRate: "Tasa de acierto de búsqueda",
			memoryRecentCaptures: "Capturas recientes",
			memoryCaptureWritten: "Escritas: {count}",
			memoryCaptureSkipped: "Omitida: {reason}",
			memoryUndoCapture: "Deshacer",
			memoryUndoCaptureDone: "Captura deshecha",
			memoryUndoCaptureFailed: "No se pudo deshacer: {message}",
			memoryCaptureUndone: "Deshecha",
			memoryRecentCapturesEmpty: "Sin capturas recientes",
			memorySortLabel: "Ordenar",
			memorySortDefault: "Por importancia",
			memorySortRecent: "Actualizadas recientemente",
			memoryClearTypeFilter: "Quitar el filtro de tipo",
			memoryClearTagFilter: "Quitar el filtro de etiqueta",
			memoryTagRemove: "Quitar la etiqueta {tag}",
			memoryTagFilterHint: "Haga clic para filtrar por esta etiqueta",
			memoryAuditButton: "Revisión de memoria",
			memoryAuditRunning: "Revisando…",
			memoryAuditTitle: "Revisión de memoria",
			memoryAuditStaleTitle: "Candidatos obsoletos",
			memoryAuditStaleHint: "Con voto de obsolescencia o desactivada; considere archivarla",
			memoryAuditDuplicateTitle: "Duplicados sospechosos",
			memoryAuditDuplicateHint: "Muy similar a otra entrada",
			memoryAuditLowValueTitle: "Entradas de poco valor",
			memoryAuditLowValueHint: "Sin cambios hace más de 30 días y sin refuerzo",
			memoryAuditKeep: "Sugerencia de conservar: {name}",
			memoryAuditEmpty: "No se encontraron problemas; la memoria está en buen estado.",
			memoryAuditSelected: "{count} seleccionadas",
			memoryAuditDeleteConfirm: "Se eliminarán las {count} entradas seleccionadas y no se puede deshacer.",
			memoryAuditDone: "Se procesaron {count} entradas",
			memoryAuditPartial: "{count} fallaron; ejecute la revisión de nuevo e inténtelo otra vez",
			memoryOpenNative: "Abrir en la aplicación del sistema",
			memoryBodyReadOnlyHint: "El contenido es de solo lectura; ábralo en la aplicación del sistema para leerlo.",
			memoryOpenNativeFailed: "No se pudo abrir en la aplicación del sistema: {message}",
			memoryOpenNativeUnavailable: "Este entorno no puede abrir archivos en la aplicación del sistema",
			memoryMaintenanceButton: "Optimizar memoria",
			memoryMaintenanceDueTitle: "Toca mantener la memoria",
			memoryMaintenanceDueHint: "{days} día(s) desde el último mantenimiento; {writes} entradas nuevas o reforzadas",
			memoryMaintenanceDueNeverHint: "Nunca se ha optimizado; {writes} entradas nuevas o reforzadas",
			memoryMaintenanceNotDueHint: "Por debajo del umbral de mantenimiento, ¿optimizar ahora de todos modos?",
			memoryMaintenanceConfirmTitle: "Optimizar memoria",
			memoryMaintenanceConfirmHint: "Combina duplicados, desactiva entradas obsoletas y elimina las de bajo valor. Las eliminaciones se respaldan y toda la ejecución se puede deshacer.",
			memoryMaintenanceRun: "Optimizar ahora",
			memoryMaintenanceRunning: "Optimizando…",
			memoryMaintenanceResultTitle: "Optimización completada",
			memoryMaintenanceResult: "Combinadas {merges}, desactivadas {staled}, restauradas {restored}, eliminadas {deleted}",
			memoryMaintenanceFailed: "Error al optimizar: {message}",
			memoryMaintenanceUndo: "Deshacer esta ejecución",
			memoryMaintenanceUndone: "Ejecución deshecha",
			memoryMaintenanceUndoFailed: "No se pudo deshacer: {message}",
			memoryMaintenanceRecent: "Ejecuciones recientes",
			memoryMaintenanceEmpty: "Aún no hay ejecuciones de mantenimiento",
			memoryMaintenanceStatusCompleted: "Completada",
			memoryMaintenanceStatusFailed: "Fallida",
			memoryMaintenanceStatusEmpty: "Sin cambios",
			memoryMaintenanceStatusUndone: "Deshecha",
			memoryMaintenanceModelInherit: "Déjalo vacío para heredar el modelo predeterminado del host",
			memoryMaintenanceProvider: "Proveedor del modelo de mantenimiento",
			memoryMaintenanceModel: "Modelo de mantenimiento",
			memoryMaintenanceLater: "Ahora no",
			memoryDiagnosisButton: "Diagnóstico",
			memoryDiagnosisTitle: "Diagnóstico de memoria",
			memoryDiagnosisEmpty: "Aún no hay registros",
			memoryDiagnosisInjections: "Inyecciones recientes",
			memoryDiagnosisCaptures: "Capturas recientes",
			memoryDiagnosisRetrievals: "Búsquedas recientes",
			memoryDiagnosisMaintenance: "Historial de mantenimiento",
			memoryDiagnosisEntries: "{count} entradas",
			memoryDiagnosisChars: "{count} caracteres",
			memoryDiagnosisTruncated: "Truncado",
			memoryDiagnosisQuery: "Consulta: {query}",
			memoryDiagnosisResults: "{count} resultados",
			memoryDiagnosisMore: "y {count} más",
			memoryDiagnosisUndo: "Deshacer",
			memoryDiagnosisUndoDone: "Mantenimiento deshecho",
			memoryDiagnosisUndoFailed: "Error al deshacer: {message}",
			memoryShowArchived: "Mostrar archivadas",
			memoryCopyId: "Copiar ID",
			memoryIdCopied: "ID copiado"
		};
		/** French dictionary (same key set as `zh`). */
		const fr = {
			tab: "Extension d’agent",
			title: "Extension d’agent",
			refresh: "Actualiser",
			refreshing: "Actualisation…",
			sources: "Sources de marketplace",
			add: "Ajouter",
			addMarketplace: "Ajouter un marketplace de plugins",
			manage: "Gérer les plugins",
			browseMarketplace: "Parcourir le marketplace de plugins",
			searchPlaceholder: "Rechercher des plugins",
			searchResults: "Résultats de recherche ({count})",
			searchEmpty: "Aucun plugin ne correspond à votre recherche",
			personalEmpty: "Aucun plugin provenant de sources personnelles pour le moment. Utilisez « Ajouter » en haut à droite pour ajouter une source de marketplace.",
			catalogLoading: "Chargement des plugins…",
			catalogEmpty: "Aucun plugin dans le marketplace pour le moment",
			marketEmpty: "Ce marketplace ne référence aucun plugin.",
			viewMore: "Voir {names} et {count} autres",
			viewMoreFew: "Voir {names}",
			andMore: "et {count} autres",
			showLess: "Afficher moins",
			install: "Installer",
			installing: "Installation…",
			installedToast: "{name} installé",
			update: "Mettre à jour",
			updating: "Mise à jour…",
			updatedToast: "{name} mis à jour",
			upToDate: "{name} est déjà à jour",
			updateAvailable: "Mise à jour disponible",
			updateAll: "Tout mettre à jour ({count})",
			updateAllDone: "Plugins mis à jour : {count}",
			updateAllPartial: "{succeeded} mis à jour, {failed} en échec : {plugins}",
			updateAllAborted: "La mise à jour globale a été interrompue ; plugins mis à jour : {count}",
			checkFound: "Mises à jour disponibles : {count}",
			checkNone: "Tous les plugins installés sont à jour",
			refreshPartial: "L’actualisation s’est terminée avec {count} échec(s) ; consultez les sources de marketplace",
			enable: "Activer",
			disable: "Désactiver",
			enabled: "Activé",
			disabled: "Désactivé",
			enabledToast: "{name} activé",
			disabledToast: "{name} désactivé",
			toggleFailed: "Impossible de mettre {name} à jour. Réessayez.",
			uninstall: "Désinstaller",
			uninstallTitle: "Désinstaller {name} ?",
			uninstallDescription: "Cette action supprime les fichiers en cache du plugin, son répertoire de données et sa configuration enregistrée. Elle est irréversible.",
			uninstalledToast: "{name} désinstallé",
			rollback: "Restaurer",
			rollbackTitle: "Restaurer {name} ?",
			rollbackDescription: "La copie installée sera ramenée à la version {version}. La version actuelle est conservée pour une autre restauration.",
			rollbackToast: "{name} a été restauré à la version {version}",
			back: "Retour",
			detail: "Détails",
			moreActions: "Plus d’actions",
			sectionMcp: "Serveurs MCP",
			sectionSkills: "Compétences",
			sectionCommands: "Commandes",
			sectionHooks: "Hooks",
			infoTitle: "Informations",
			infoDeveloper: "Développeur",
			infoCategory: "Catégorie",
			infoVersion: "Version",
			infoMarket: "Source",
			infoWebsite: "Site web",
			infoRepository: "Dépôt",
			infoLicense: "Licence",
			infoInstalledAt: "Date d’installation",
			moreDetails: "Détails avancés",
			rootPath: "Chemin d’installation",
			format: "Format",
			hooksSource: "Source des Hooks",
			mcpSource: "Source MCP",
			warnings: "Avertissements",
			rollbackVersions: "Versions restaurables",
			runtimeStatus: "État d’exécution",
			componentsLoading: "Chargement des composants…",
			componentsError: "Impossible de charger la liste des composants. Affichage des informations disponibles uniquement.",
			componentsRetry: "Réessayer",
			fetchDetail: "Récupérer les détails en ligne",
			fetchDetailHint: "Les détails ne sont pas encore en cache localement. Récupérez-les en ligne depuis la source de marketplace.",
			componentsEmpty: "Ce plugin ne déclare aucun composant, ou ceux-ci n’ont pas pu être lus.",
			componentsNotEffective: "Sans effet",
			componentsEffective: "Effectif",
			hostEvent: "Événement de l’hôte",
			canBlock: "peut bloquer",
			sourceMissing: "La source de marketplace est introuvable. Ce plugin reste utilisable, mais les mises à jour sont indisponibles.",
			sourceMissingShort: "Source introuvable",
			noDescription: "Aucune description",
			close: "Fermer",
			cancel: "Annuler",
			confirm: "Confirmer",
			addMarketTitle: "Ajouter un marketplace",
			addMarketSourceLabel: "Dépôt GitHub, URL git, fichier ou répertoire",
			addMarketHint: "Les répertoires locaux, les dépôts Git et les liens marketplace.json sont reconnus automatiquement.",
			addMarketRisk: "Les marketplaces de plugins non officielles peuvent contenir des plugins malveillants capables d’endommager votre appareil. Vérifiez la source et prenez des précautions avant d’ajouter.",
			addMarketRiskAck: "Je comprends les risques, j’ai vérifié la source et j’ai pris des précautions.",
			marketName: "Nom (facultatif)",
			adding: "Ajout…",
			addedToast: "Marketplace ajouté : {name} ({type}, {count} plugins)",
			detectedLocal: "répertoire local",
			detectedGit: "dépôt Git",
			detectedUrl: "URL marketplace.json",
			sourcesEmpty: "Aucune source de marketplace enregistrée pour le moment",
			sourcePluginCount: "{count} plugins",
			sourceUpdated: "Mis à jour : {time}",
			sourceRefreshFailed: "Échec de l’actualisation à {time} : {message}",
			sourceRefresh: "Actualiser ce marketplace",
			sourceRemove: "Retirer ce marketplace",
			refreshDone: "{name} actualisé",
			remove: "Retirer",
			removeMarketTitle: "Retirer le marketplace ?",
			removeMarketDescription: "Les plugins installés sont conservés et restent utilisables, mais ils perdent leur source et la possibilité d’être mis à jour. Ajoutez à nouveau la même source pour les restaurer.",
			removedMarketToast: "Marketplace retiré : {name}",
			orphanedToast: "{name} a été retiré ; {count} plugin(s) installé(s) sont devenus orphelins",
			installedGroup: "Installés",
			noInstalled: "Aucun plugin installé dans ce périmètre.",
			noInstalledTitle: "Aucun plugin installé",
			noInstalledDescription: "Parcourez le marketplace et installez des plugins pour ajouter MCP, compétences, commandes et Hooks.",
			filterAll: "Tous",
			filterEnabled: "Activés",
			filterDisabled: "Désactivés",
			version: "Version",
			updatesAvailable: "{count} mises à jour disponibles",
			operationBusy: "Une autre opération est en cours. Réessayez dans un instant.",
			errorForbidden: "Requête refusée : seules les pages locales de bouclage peuvent appeler cette API.",
			errorNotFound: "Introuvable. Le plugin ou le marketplace a peut-être été retiré ; actualisez puis réessayez.",
			errorConflict: "Conflit d’état : la cible existe déjà ou a changé. Actualisez puis réessayez.",
			errorSourceUnavailable: "La source de marketplace est indisponible pour le moment ; actualisez-la puis réessayez.",
			errorVersionInvalid: "Le numéro de version n’est pas valide.",
			errorNetwork: "Échec de la requête réseau. Vérifiez la connexion puis réessayez.",
			errorGit: "Échec de l’opération Git. Vérifiez l’URL du dépôt et votre connexion.",
			errorInternal: "Erreur interne. Consultez les journaux du hub pour plus de détails.",
			apiUnavailable: "API de l’extension d’agent indisponible",
			apiHint: "Cette page n’est pas servie depuis l’origine de bouclage locale, ou l’hôte n’a pas chargé le code actuel du plugin. Actualisez la page puis réessayez.",
			migrationError: "Échec de la migration des données : {message}. Vos données d’origine sont conservées dans le répertoire des journaux du hub.",
			retry: "Réessayer",
			unknownError: "Erreur inconnue",
			runtimeSkills: "Compétences",
			runtimeCommands: "Commandes",
			runtimeHooks: "Hooks",
			runtimeMcp: "MCP",
			runtimeNotEffective: "sans effet",
			runtimeEffective: "prêt",
			enabledCount: "{total} plugins · {enabled} activés",
			pluginCount: "{count} plugins",
			installedBadge: "Installé",
			updateBadge: "Mise à jour",
			notInstallable: "Non installable",
			menuEnable: "Activer",
			menuDisable: "Désactiver",
			menuUninstall: "Désinstaller",
			hooksInactive: "Sans effet : {reason}",
			clearSearch: "Effacer la recherche",
			allSources: "Toutes les sources",
			tabSources: "Mes marchés",
			tabRecommended: "Recommandés",
			storeTabsLabel: "Vues",
			tabPlugins: "Plugins",
			tabMemory: "Mémoire",
			tabSkills: "Compétences",
			sectionTabsLabel: "Sections",
			comingSoon: "Bientôt disponible",
			memoryPlaceholder: "La gestion de la mémoire arrive bientôt.",
			skillsPlaceholder: "La gestion des compétences arrive bientôt.",
			recommendedHint: "Sources de marketplace sélectionnées — ajoutez-en une pour parcourir et installer ses plugins.",
			addedBadge: "Ajouté",
			previewAddHint: "Ajoutez la source pour parcourir et installer tous ses plugins.",
			previewInstallBlocked: "Installable après ajout de la source",
			memoryTitle: "Mémoire",
			memoryScopeLabel: "Portée de la mémoire",
			memoryScopeGlobal: "Globale",
			memoryScopeProject: "Projet",
			memoryProjectLabel: "Projet",
			memoryProjectEmpty: "Aucun projet détecté pour le moment. Ouvrez une session dans le répertoire d’un projet pour utiliser la mémoire de projet ; la mémoire globale reste toujours disponible.",
			memorySearchPlaceholder: "Rechercher dans la mémoire",
			memoryTypeLabel: "Types de mémoire",
			memoryTypeAll: "Tous",
			memoryTypePreference: "Préférence",
			memoryTypeDecision: "Décision",
			memoryTypeGotcha: "Piège",
			memoryTypeProject: "Fait du projet",
			memoryTypeReference: "Référence",
			memoryStatusActive: "Active",
			memoryStatusStale: "Désactivée",
			memoryStatusArchived: "Archivée",
			memoryNew: "Nouvelle mémoire",
			memoryRetry: "Réessayer",
			memoryListTitle: "Mémoires",
			memoryLoading: "Chargement de la mémoire…",
			memoryListEmpty: "Aucune mémoire pour le moment. Choisissez « Nouvelle mémoire » pour créer la première.",
			memoryListEmptyFiltered: "Aucune mémoire ne correspond à ce filtre.",
			memoryCreateTitle: "Nouvelle mémoire",
			memoryEditTitle: "Modifier la mémoire",
			memoryFieldName: "Nom",
			memoryFieldDescription: "Description",
			memoryFieldType: "Type",
			memoryFieldTags: "Étiquettes",
			memoryFieldImportance: "Importance",
			memoryFieldContent: "Contenu",
			memoryTagsHint: "Appuyez sur Entrée ou une virgule pour ajouter l’étiquette",
			memoryImportanceHint: "0–100 ; les valeurs élevées sont injectées en premier",
			memorySave: "Enregistrer",
			memorySaving: "Enregistrement…",
			memorySaved: "Mémoire enregistrée",
			memoryNameRequired: "Saisissez un nom et un contenu.",
			memoryStatusDone: "Statut de la mémoire mis à jour",
			memoryDeactivate: "Désactiver",
			memoryArchive: "Archiver",
			memoryRestore: "Restaurer",
			memoryDelete: "Supprimer",
			memoryDeleteConfirm: "Confirmer la suppression",
			memoryDeleteDescription: "La suppression de « {name} » est irréversible.",
			memoryDeleting: "Suppression…",
			memoryDeleted: "Mémoire « {name} » supprimée",
			memoryExportMarkdown: "Exporter en Markdown",
			memoryExporting: "Exportation…",
			memoryExportDone: "{filename} exporté",
			memoryExportFailed: "Échec de l’export : {message}",
			memoryRefreshIndex: "Reconstruire l’index",
			memoryRefreshIndexDone: "Index mémoire reconstruit",
			memoryRefreshIndexFailed: "Échec de la reconstruction de l’index mémoire : {message}",
			memorySettingsTitle: "Capture et injection",
			memorySettingsCapture: "Capture automatique",
			memorySettingsCaptureSessionEnd: "Fin de session",
			memorySettingsInject: "Injection dans l’index",
			memorySettingsIndexGlobal: "Taille de l’index global",
			memorySettingsIndexProject: "Taille de l’index du projet",
			memorySettingsMaxChars: "Budget de caractères",
			memorySettingsButton: "Réglages et statistiques de mémoire",
			memoryTypeFilterLabel: "Filtrer par type",
			memoryStatsTitle: "Statistiques",
			memoryStatCaptureRuns: "Exécutions de capture",
			memoryStatCapturedEntries: "Entrées capturées",
			memoryInjectionRate: "Utilisation de l’injection",
			memoryRetrievalRate: "Taux de réussite de la recherche",
			memoryRecentCaptures: "Captures récentes",
			memoryCaptureWritten: "Écrites : {count}",
			memoryCaptureSkipped: "Ignorée : {reason}",
			memoryUndoCapture: "Annuler",
			memoryUndoCaptureDone: "Capture annulée",
			memoryUndoCaptureFailed: "Échec de l’annulation : {message}",
			memoryCaptureUndone: "Annulée",
			memoryRecentCapturesEmpty: "Aucune capture récente",
			memorySortLabel: "Tri",
			memorySortDefault: "Par importance",
			memorySortRecent: "Récemment mises à jour",
			memoryClearTypeFilter: "Effacer le filtre de type",
			memoryClearTagFilter: "Effacer le filtre d’étiquette",
			memoryTagRemove: "Supprimer l’étiquette {tag}",
			memoryTagFilterHint: "Cliquez pour filtrer par cette étiquette",
			memoryAuditButton: "Audit de mémoire",
			memoryAuditRunning: "Audit en cours…",
			memoryAuditTitle: "Audit de mémoire",
			memoryAuditStaleTitle: "Candidats obsolètes",
			memoryAuditStaleHint: "Vote d’obsolescence présent ou désactivée — archivage conseillé",
			memoryAuditDuplicateTitle: "Doublons suspectés",
			memoryAuditDuplicateHint: "Très similaire à une autre entrée",
			memoryAuditLowValueTitle: "Entrées de faible valeur",
			memoryAuditLowValueHint: "Inchangée depuis plus de 30 jours et jamais renforcée",
			memoryAuditKeep: "Conservation suggérée : {name}",
			memoryAuditEmpty: "Aucun problème détecté — la mémoire semble saine.",
			memoryAuditSelected: "{count} sélectionnée(s)",
			memoryAuditDeleteConfirm: "Les {count} entrées sélectionnées seront supprimées ; action irréversible.",
			memoryAuditDone: "{count} entrées traitées",
			memoryAuditPartial: "{count} échec(s) — relancez l’audit puis réessayez",
			memoryOpenNative: "Ouvrir dans l’application système",
			memoryBodyReadOnlyHint: "Le contenu est en lecture seule ; ouvrez-le dans l’application système pour le lire.",
			memoryOpenNativeFailed: "Impossible d’ouvrir dans l’application système : {message}",
			memoryOpenNativeUnavailable: "Cet environnement ne permet pas d’ouvrir des fichiers dans l’application système",
			memoryMaintenanceButton: "Optimiser la mémoire",
			memoryMaintenanceDueTitle: "La mémoire doit être optimisée",
			memoryMaintenanceDueHint: "Depuis le dernier entretien : {days} jour(s), {writes} entrée(s) nouvelle(s) ou renforcée(s)",
			memoryMaintenanceDueNeverHint: "Jamais optimisée ; {writes} entrée(s) nouvelle(s) ou renforcée(s)",
			memoryMaintenanceNotDueHint: "Sous le seuil d’entretien — optimiser quand même maintenant ?",
			memoryMaintenanceConfirmTitle: "Optimiser la mémoire",
			memoryMaintenanceConfirmHint: "Fusionne les doublons, désactive les entrées obsolètes et supprime celles de faible valeur. Les suppressions sont sauvegardées et toute l’exécution peut être annulée.",
			memoryMaintenanceRun: "Optimiser maintenant",
			memoryMaintenanceRunning: "Optimisation…",
			memoryMaintenanceResultTitle: "Optimisation terminée",
			memoryMaintenanceResult: "Fusionnées {merges}, désactivées {staled}, restaurées {restored}, supprimées {deleted}",
			memoryMaintenanceFailed: "Échec de l’optimisation : {message}",
			memoryMaintenanceUndo: "Annuler cette exécution",
			memoryMaintenanceUndone: "Exécution annulée",
			memoryMaintenanceUndoFailed: "Échec de l’annulation : {message}",
			memoryMaintenanceRecent: "Exécutions récentes",
			memoryMaintenanceEmpty: "Aucune exécution de maintenance",
			memoryMaintenanceStatusCompleted: "Terminée",
			memoryMaintenanceStatusFailed: "Échouée",
			memoryMaintenanceStatusEmpty: "Sans changement",
			memoryMaintenanceStatusUndone: "Annulée",
			memoryMaintenanceModelInherit: "Laisser vide pour hériter du modèle par défaut de l’hôte",
			memoryMaintenanceProvider: "Fournisseur du modèle de maintenance",
			memoryMaintenanceModel: "Modèle de maintenance",
			memoryMaintenanceLater: "Pas maintenant",
			memoryDiagnosisButton: "Diagnostic",
			memoryDiagnosisTitle: "Diagnostic de la mémoire",
			memoryDiagnosisEmpty: "Aucun enregistrement",
			memoryDiagnosisInjections: "Injections récentes",
			memoryDiagnosisCaptures: "Captures récentes",
			memoryDiagnosisRetrievals: "Recherches récentes",
			memoryDiagnosisMaintenance: "Historique de maintenance",
			memoryDiagnosisEntries: "{count} entrées",
			memoryDiagnosisChars: "{count} caractères",
			memoryDiagnosisTruncated: "Tronqué",
			memoryDiagnosisQuery: "Requête : {query}",
			memoryDiagnosisResults: "{count} résultats",
			memoryDiagnosisMore: "et {count} de plus",
			memoryDiagnosisUndo: "Annuler",
			memoryDiagnosisUndoDone: "Maintenance annulée",
			memoryDiagnosisUndoFailed: "Échec de l’annulation : {message}",
			memoryShowArchived: "Afficher les archivées",
			memoryCopyId: "Copier l’ID",
			memoryIdCopied: "ID copié"
		};
		/** German dictionary (same key set as `zh`). */
		const de = {
			tab: "Agent-Erweiterung",
			title: "Agent-Erweiterung",
			refresh: "Neu laden",
			refreshing: "Wird neu geladen…",
			sources: "Marketplace-Quellen",
			add: "Hinzufügen",
			addMarketplace: "Plugin-Marketplace hinzufügen",
			manage: "Plugins verwalten",
			browseMarketplace: "Plugin-Marketplace durchstöbern",
			searchPlaceholder: "Plugins suchen",
			searchResults: "Suchergebnisse ({count})",
			searchEmpty: "Keine passenden Plugins gefunden",
			personalEmpty: "Noch keine Plugins aus persönlichen Quellen. Fügen Sie oben rechts über „Hinzufügen“ eine Marketplace-Quelle hinzu.",
			catalogLoading: "Plugins werden geladen…",
			catalogEmpty: "Noch keine Marketplace-Plugins",
			marketEmpty: "Dieser Marketplace listet keine Plugins auf.",
			viewMore: "{names} und {count} weitere anzeigen",
			viewMoreFew: "{names} anzeigen",
			andMore: "und {count} weitere",
			showLess: "Weniger anzeigen",
			install: "Installieren",
			installing: "Wird installiert…",
			installedToast: "{name} installiert",
			update: "Aktualisieren",
			updating: "Wird aktualisiert…",
			updatedToast: "{name} aktualisiert",
			upToDate: "{name} ist bereits aktuell",
			updateAvailable: "Update verfügbar",
			updateAll: "Alle aktualisieren ({count})",
			updateAllDone: "{count} Plugin(s) aktualisiert",
			updateAllPartial: "{succeeded} aktualisiert, {failed} fehlgeschlagen: {plugins}",
			updateAllAborted: "Aktualisierung aller Plugins gestoppt; {count} Plugin(s) aktualisiert",
			checkFound: "{count} Plugin-Updates verfügbar",
			checkNone: "Alle installierten Plugins sind aktuell",
			refreshPartial: "Das Neuladen wurde mit {count} Fehler(n) abgeschlossen; siehe die Marketplace-Quellen",
			enable: "Aktivieren",
			disable: "Deaktivieren",
			enabled: "Aktiviert",
			disabled: "Deaktiviert",
			enabledToast: "{name} aktiviert",
			disabledToast: "{name} deaktiviert",
			toggleFailed: "{name} konnte nicht aktualisiert werden. Versuchen Sie es erneut.",
			uninstall: "Deinstallieren",
			uninstallTitle: "{name} deinstallieren?",
			uninstallDescription: "Dadurch werden die Cache-Dateien des Plugins, sein Datenverzeichnis und gespeicherte Einstellungen entfernt. Dies kann nicht rückgängig gemacht werden.",
			uninstalledToast: "{name} deinstalliert",
			rollback: "Rollback",
			rollbackTitle: "Rollback für {name}?",
			rollbackDescription: "Die installierte Kopie wird auf Version {version} zurückgesetzt. Die aktuelle Version bleibt erhalten und kann erneut zurückgesetzt werden.",
			rollbackToast: "{name} wurde auf Version {version} zurückgesetzt",
			back: "Zurück",
			detail: "Details",
			moreActions: "Weitere Aktionen",
			sectionMcp: "MCP-Server",
			sectionSkills: "Skills",
			sectionCommands: "Befehle",
			sectionHooks: "Hooks",
			infoTitle: "Informationen",
			infoDeveloper: "Entwickler",
			infoCategory: "Kategorie",
			infoVersion: "Version",
			infoMarket: "Quelle",
			infoWebsite: "Website",
			infoRepository: "Repository",
			infoLicense: "Lizenz",
			infoInstalledAt: "Installiert am",
			moreDetails: "Erweiterte Details",
			rootPath: "Installationspfad",
			format: "Format",
			hooksSource: "Hooks-Quelle",
			mcpSource: "MCP-Quelle",
			warnings: "Warnungen",
			rollbackVersions: "Rollback-Versionen",
			runtimeStatus: "Laufzeitstatus",
			componentsLoading: "Komponenten werden geladen…",
			componentsError: "Die Komponentenliste konnte nicht geladen werden. Es werden nur verfügbare Informationen angezeigt.",
			componentsRetry: "Erneut versuchen",
			fetchDetail: "Details online abrufen",
			fetchDetailHint: "Details sind noch nicht lokal im Cache. Rufen Sie sie online über die Marketplace-Quelle ab.",
			componentsEmpty: "Dieses Plugin deklariert keine Komponenten, oder sie konnten nicht gelesen werden.",
			componentsNotEffective: "Nicht wirksam",
			componentsEffective: "Wirksam",
			hostEvent: "Host-Ereignis",
			canBlock: "kann blockieren",
			sourceMissing: "Die Marketplace-Quelle fehlt. Das Plugin bleibt nutzbar, aber Updates sind nicht verfügbar.",
			sourceMissingShort: "Quelle fehlt",
			noDescription: "Keine Beschreibung",
			close: "Schließen",
			cancel: "Abbrechen",
			confirm: "Bestätigen",
			addMarketTitle: "Marketplace hinzufügen",
			addMarketSourceLabel: "GitHub-Repository, Git-URL, Datei oder Verzeichnis",
			addMarketHint: "Lokale Verzeichnisse, Git-Repositories und marketplace.json-Links werden automatisch erkannt.",
			addMarketRisk: "Inoffizielle Plugin-Marketplaces können bösartige Plugins enthalten, die Ihr Gerät schädigen können. Prüfen Sie die Quelle und treffen Sie Vorsichtsmaßnahmen, bevor Sie einen Marketplace hinzufügen.",
			addMarketRiskAck: "Ich verstehe die Risiken, habe die Quelle geprüft und Vorsichtsmaßnahmen getroffen.",
			marketName: "Name (optional)",
			adding: "Wird hinzugefügt…",
			addedToast: "Marketplace hinzugefügt: {name} ({type}, {count} Plugins)",
			detectedLocal: "lokales Verzeichnis",
			detectedGit: "Git-Repository",
			detectedUrl: "marketplace.json-URL",
			sourcesEmpty: "Noch keine Marketplace-Quellen registriert",
			sourcePluginCount: "{count} Plugins",
			sourceUpdated: "Aktualisiert: {time}",
			sourceRefreshFailed: "Neuladen fehlgeschlagen um {time}: {message}",
			sourceRefresh: "Diesen Marketplace neu laden",
			sourceRemove: "Diesen Marketplace entfernen",
			refreshDone: "{name} neu geladen",
			remove: "Entfernen",
			removeMarketTitle: "Marketplace entfernen?",
			removeMarketDescription: "Installierte Plugins bleiben erhalten und nutzbar, verlieren aber ihre Quelle und die Aktualisierungsfähigkeit. Fügen Sie dieselbe Quelle erneut hinzu, um sie wiederherzustellen.",
			removedMarketToast: "Marketplace entfernt: {name}",
			orphanedToast: "{name} entfernt; {count} installierte(s) Plugin(s) haben ihre Quelle verloren",
			installedGroup: "Installiert",
			noInstalled: "In diesem Bereich sind keine Plugins installiert.",
			noInstalledTitle: "Keine Plugins installiert",
			noInstalledDescription: "Durchstöbern Sie den Marketplace und installieren Sie Plugins, um MCP, Skills, Befehle und Hooks hinzuzufügen.",
			filterAll: "Alle",
			filterEnabled: "Aktiviert",
			filterDisabled: "Deaktiviert",
			version: "Version",
			updatesAvailable: "{count} Updates verfügbar",
			operationBusy: "Es läuft bereits ein anderer Vorgang. Versuchen Sie es in Kürze erneut.",
			errorForbidden: "Anfrage abgelehnt: Nur lokale Loopback-Seiten dürfen diese API aufrufen.",
			errorNotFound: "Nicht gefunden. Das Plugin oder der Marketplace wurde möglicherweise entfernt; laden Sie neu und versuchen Sie es erneut.",
			errorConflict: "Statuskonflikt: Das Ziel existiert bereits oder hat sich geändert. Laden Sie neu und versuchen Sie es erneut.",
			errorSourceUnavailable: "Die Marketplace-Quelle ist derzeit nicht verfügbar; laden Sie sie neu und versuchen Sie es erneut.",
			errorVersionInvalid: "Die Versionsnummer ist ungültig.",
			errorNetwork: "Netzwerkanfrage fehlgeschlagen. Prüfen Sie die Verbindung und versuchen Sie es erneut.",
			errorGit: "Git-Vorgang fehlgeschlagen. Prüfen Sie die Repository-URL und Ihre Netzwerkverbindung.",
			errorInternal: "Interner Fehler. Details finden Sie in den Hub-Protokollen.",
			apiUnavailable: "Agent-Erweiterung-API nicht verfügbar",
			apiHint: "Diese Seite wird nicht über den lokalen Loopback-Ursprung ausgeliefert, oder der Host hat den aktuellen Plugin-Code nicht geladen. Laden Sie die Seite neu und versuchen Sie es erneut.",
			migrationError: "Datenmigration fehlgeschlagen: {message}. Ihre ursprünglichen Daten bleiben im Hub-Protokollverzeichnis erhalten.",
			retry: "Erneut versuchen",
			unknownError: "Unbekannter Fehler",
			runtimeSkills: "Skills",
			runtimeCommands: "Befehle",
			runtimeHooks: "Hooks",
			runtimeMcp: "MCP",
			runtimeNotEffective: "nicht wirksam",
			runtimeEffective: "bereit",
			enabledCount: "{total} Plugins · {enabled} aktiviert",
			pluginCount: "{count} Plugins",
			installedBadge: "Installiert",
			updateBadge: "Update",
			notInstallable: "Nicht installierbar",
			menuEnable: "Aktivieren",
			menuDisable: "Deaktivieren",
			menuUninstall: "Deinstallieren",
			hooksInactive: "Nicht wirksam: {reason}",
			clearSearch: "Suche löschen",
			allSources: "Alle Quellen",
			tabSources: "Meine Märkte",
			tabRecommended: "Empfohlen",
			storeTabsLabel: "Ansichten",
			tabPlugins: "Plugins",
			tabMemory: "Gedächtnis",
			tabSkills: "Fähigkeiten",
			sectionTabsLabel: "Bereiche",
			comingSoon: "Demnächst verfügbar",
			memoryPlaceholder: "Die Gedächtnisverwaltung ist in Planung.",
			skillsPlaceholder: "Die Fähigkeitenverwaltung ist in Planung.",
			recommendedHint: "Ausgewählte Marketplace-Quellen – fügen Sie eine hinzu, um deren Plugins zu durchstöbern und zu installieren.",
			addedBadge: "Hinzugefügt",
			previewAddHint: "Fügen Sie die Quelle hinzu, um alle Plugins zu durchstöbern und zu installieren.",
			previewInstallBlocked: "Nach Hinzufügen der Quelle installierbar",
			memoryTitle: "Gedächtnis",
			memoryScopeLabel: "Gedächtnisbereich",
			memoryScopeGlobal: "Global",
			memoryScopeProject: "Projekt",
			memoryProjectLabel: "Projekt",
			memoryProjectEmpty: "Noch keine Projekte erkannt. Öffnen Sie eine Sitzung im Verzeichnis eines Projekts, um das Projektgedächtnis zu nutzen; das globale Gedächtnis ist immer verfügbar.",
			memorySearchPlaceholder: "Gedächtnis durchsuchen",
			memoryTypeLabel: "Gedächtnistypen",
			memoryTypeAll: "Alle",
			memoryTypePreference: "Präferenz",
			memoryTypeDecision: "Entscheidung",
			memoryTypeGotcha: "Stolperfalle",
			memoryTypeProject: "Projektfakt",
			memoryTypeReference: "Referenz",
			memoryStatusActive: "Aktiv",
			memoryStatusStale: "Deaktiviert",
			memoryStatusArchived: "Archiviert",
			memoryNew: "Neues Gedächtnis",
			memoryRetry: "Erneut versuchen",
			memoryListTitle: "Gedächtniseinträge",
			memoryLoading: "Gedächtnis wird geladen…",
			memoryListEmpty: "Noch keine Einträge. Wählen Sie „Neues Gedächtnis“, um den ersten zu erstellen.",
			memoryListEmptyFiltered: "Keine Einträge entsprechen diesem Filter.",
			memoryCreateTitle: "Neues Gedächtnis",
			memoryEditTitle: "Gedächtnis bearbeiten",
			memoryFieldName: "Name",
			memoryFieldDescription: "Beschreibung",
			memoryFieldType: "Typ",
			memoryFieldTags: "Tags",
			memoryFieldImportance: "Wichtigkeit",
			memoryFieldContent: "Inhalt",
			memoryTagsHint: "Tag mit Eingabetaste oder Komma hinzufügen",
			memoryImportanceHint: "0–100; höhere Werte werden zuerst injiziert",
			memorySave: "Speichern",
			memorySaving: "Speichern…",
			memorySaved: "Gedächtnis gespeichert",
			memoryNameRequired: "Geben Sie Name und Inhalt ein.",
			memoryStatusDone: "Gedächtnisstatus aktualisiert",
			memoryDeactivate: "Deaktivieren",
			memoryArchive: "Archivieren",
			memoryRestore: "Wiederherstellen",
			memoryDelete: "Löschen",
			memoryDeleteConfirm: "Löschen bestätigen",
			memoryDeleteDescription: "Das Löschen von „{name}“ kann nicht rückgängig gemacht werden.",
			memoryDeleting: "Löschen…",
			memoryDeleted: "Gedächtnis „{name}“ gelöscht",
			memoryExportMarkdown: "Markdown exportieren",
			memoryExporting: "Exportieren…",
			memoryExportDone: "{filename} exportiert",
			memoryExportFailed: "Export fehlgeschlagen: {message}",
			memoryRefreshIndex: "Index neu aufbauen",
			memoryRefreshIndexDone: "Speicherindex neu aufgebaut",
			memoryRefreshIndexFailed: "Speicherindex konnte nicht neu aufgebaut werden: {message}",
			memorySettingsTitle: "Erfassung und Injektion",
			memorySettingsCapture: "Automatische Erfassung",
			memorySettingsCaptureSessionEnd: "Sitzungsende-Abgleich",
			memorySettingsInject: "Index-Injektion",
			memorySettingsIndexGlobal: "Globaler Indexumfang",
			memorySettingsIndexProject: "Projekt-Indexumfang",
			memorySettingsMaxChars: "Zeichenbudget gesamt",
			memorySettingsButton: "Speichereinstellungen und Statistik",
			memoryTypeFilterLabel: "Nach Typ filtern",
			memoryStatsTitle: "Statistik",
			memoryStatCaptureRuns: "Erfassungsläufe",
			memoryStatCapturedEntries: "Erfasste Einträge",
			memoryInjectionRate: "Injektionsnutzung",
			memoryRetrievalRate: "Suchtrefferquote",
			memoryRecentCaptures: "Letzte Erfassungen",
			memoryCaptureWritten: "{count} geschrieben",
			memoryCaptureSkipped: "Übersprungen: {reason}",
			memoryUndoCapture: "Rückgängig",
			memoryUndoCaptureDone: "Erfassung rückgängig gemacht",
			memoryUndoCaptureFailed: "Rückgängig machen fehlgeschlagen: {message}",
			memoryCaptureUndone: "Rückgängig gemacht",
			memoryRecentCapturesEmpty: "Keine letzten Erfassungen",
			memorySortLabel: "Sortierung",
			memorySortDefault: "Nach Wichtigkeit",
			memorySortRecent: "Zuletzt aktualisiert",
			memoryClearTypeFilter: "Typfilter löschen",
			memoryClearTagFilter: "Tag-Filter löschen",
			memoryTagRemove: "Tag {tag} entfernen",
			memoryTagFilterHint: "Klicken, um nach diesem Tag zu filtern",
			memoryAuditButton: "Gedächtnis-Audit",
			memoryAuditRunning: "Audit läuft…",
			memoryAuditTitle: "Gedächtnis-Audit",
			memoryAuditStaleTitle: "Veraltungskandidaten",
			memoryAuditStaleHint: "Mit Veraltungsvotum oder deaktiviert — Archivieren empfohlen",
			memoryAuditDuplicateTitle: "Vermeintliche Duplikate",
			memoryAuditDuplicateHint: "Sehr ähnlich zu einem anderen Eintrag",
			memoryAuditLowValueTitle: "Einträge mit geringem Wert",
			memoryAuditLowValueHint: "Über 30 Tage unverändert und nie verstärkt",
			memoryAuditKeep: "Empfohlen zum Behalten: {name}",
			memoryAuditEmpty: "Keine Probleme gefunden — das Gedächtnis wirkt gesund.",
			memoryAuditSelected: "{count} ausgewählt",
			memoryAuditDeleteConfirm: "Die {count} ausgewählten Einträge werden gelöscht; das kann nicht rückgängig gemacht werden.",
			memoryAuditDone: "{count} Einträge verarbeitet",
			memoryAuditPartial: "{count} fehlgeschlagen — Audit erneut ausführen und wiederholen",
			memoryOpenNative: "In der System-App öffnen",
			memoryBodyReadOnlyHint: "Der Inhalt ist schreibgeschützt; öffnen Sie ihn in der System-App, um ihn zu lesen.",
			memoryOpenNativeFailed: "In der System-App konnte nicht geöffnet werden: {message}",
			memoryOpenNativeUnavailable: "Diese Umgebung kann Dateien nicht in einer System-App öffnen",
			memoryMaintenanceButton: "Speicher optimieren",
			memoryMaintenanceDueTitle: "Speicheroptimierung fällig",
			memoryMaintenanceDueHint: "Seit der letzten Wartung {days} Tag(e); {writes} neue oder bestärkte Einträge",
			memoryMaintenanceDueNeverHint: "Noch nie optimiert; {writes} neue oder bestärkte Einträge",
			memoryMaintenanceNotDueHint: "Unter der Wartungsschwelle — trotzdem jetzt optimieren?",
			memoryMaintenanceConfirmTitle: "Speicher optimieren",
			memoryMaintenanceConfirmHint: "Führt Duplikate zusammen, deaktiviert veraltete Einträge und löscht Einträge mit geringem Wert. Löschungen werden gesichert und der gesamte Lauf kann rückgängig gemacht werden.",
			memoryMaintenanceRun: "Jetzt optimieren",
			memoryMaintenanceRunning: "Optimierung läuft…",
			memoryMaintenanceResultTitle: "Optimierung abgeschlossen",
			memoryMaintenanceResult: "Zusammengeführt {merges}, deaktiviert {staled}, wiederhergestellt {restored}, gelöscht {deleted}",
			memoryMaintenanceFailed: "Optimierung fehlgeschlagen: {message}",
			memoryMaintenanceUndo: "Diesen Lauf rückgängig machen",
			memoryMaintenanceUndone: "Lauf rückgängig gemacht",
			memoryMaintenanceUndoFailed: "Rückgängig machen fehlgeschlagen: {message}",
			memoryMaintenanceRecent: "Letzte Läufe",
			memoryMaintenanceEmpty: "Noch keine Wartungsläufe",
			memoryMaintenanceStatusCompleted: "Abgeschlossen",
			memoryMaintenanceStatusFailed: "Fehlgeschlagen",
			memoryMaintenanceStatusEmpty: "Keine Änderungen",
			memoryMaintenanceStatusUndone: "Rückgängig gemacht",
			memoryMaintenanceModelInherit: "Leer lassen, um das Standardmodell des Hosts zu übernehmen",
			memoryMaintenanceProvider: "Anbieter des Wartungsmodells",
			memoryMaintenanceModel: "Wartungsmodell",
			memoryMaintenanceLater: "Nicht jetzt",
			memoryDiagnosisButton: "Diagnose",
			memoryDiagnosisTitle: "Gedächtnisdiagnose",
			memoryDiagnosisEmpty: "Noch keine Einträge",
			memoryDiagnosisInjections: "Letzte Injektionen",
			memoryDiagnosisCaptures: "Letzte Erfassungen",
			memoryDiagnosisRetrievals: "Letzte Suchvorgänge",
			memoryDiagnosisMaintenance: "Wartungsverlauf",
			memoryDiagnosisEntries: "{count} Einträge",
			memoryDiagnosisChars: "{count} Zeichen",
			memoryDiagnosisTruncated: "Abgeschnitten",
			memoryDiagnosisQuery: "Abfrage: {query}",
			memoryDiagnosisResults: "{count} Ergebnisse",
			memoryDiagnosisMore: "und {count} weitere",
			memoryDiagnosisUndo: "Rückgängig",
			memoryDiagnosisUndoDone: "Wartung rückgängig gemacht",
			memoryDiagnosisUndoFailed: "Rückgängig machen fehlgeschlagen: {message}",
			memoryShowArchived: "Archivierte anzeigen",
			memoryCopyId: "ID kopieren",
			memoryIdCopied: "ID kopiert"
		};
		/** Russian dictionary (same key set as `zh`). */
		const ru = {
			tab: "Расширение агента",
			title: "Расширение агента",
			refresh: "Обновить",
			refreshing: "Обновление…",
			sources: "Источники маркетплейсов",
			add: "Добавить",
			addMarketplace: "Добавить маркетплейс плагинов",
			manage: "Управление плагинами",
			browseMarketplace: "Обзор маркетплейса плагинов",
			searchPlaceholder: "Поиск плагинов",
			searchResults: "Результаты поиска ({count})",
			searchEmpty: "Подходящих плагинов не найдено",
			personalEmpty: "Плагинов из личных источников пока нет. Добавьте источник маркетплейса с помощью кнопки «Добавить» в правом верхнем углу.",
			catalogLoading: "Загрузка плагинов…",
			catalogEmpty: "В маркетплейсе пока нет плагинов",
			marketEmpty: "В этом маркетплейсе нет плагинов.",
			viewMore: "Показать {names} и ещё {count}",
			viewMoreFew: "Показать {names}",
			andMore: "и ещё {count}",
			showLess: "Свернуть",
			install: "Установить",
			installing: "Установка…",
			installedToast: "{name} установлен",
			update: "Обновить",
			updating: "Обновление…",
			updatedToast: "{name} обновлен",
			upToDate: "{name} уже последней версии",
			updateAvailable: "Есть обновление",
			updateAll: "Обновить все ({count})",
			updateAllDone: "Обновлено плагинов: {count}",
			updateAllPartial: "Обновлено {succeeded}, не удалось {failed}: {plugins}",
			updateAllAborted: "Массовое обновление остановлено; обновлено плагинов: {count}",
			checkFound: "Найдено обновлений: {count}",
			checkNone: "Все установленные плагины обновлены",
			refreshPartial: "Обновление завершилось; ошибок: {count}. Проверьте источники маркетплейсов",
			enable: "Включить",
			disable: "Отключить",
			enabled: "Включен",
			disabled: "Отключен",
			enabledToast: "{name} включен",
			disabledToast: "{name} отключен",
			toggleFailed: "Не удалось обновить {name}. Повторите попытку.",
			uninstall: "Удалить",
			uninstallTitle: "Удалить {name}?",
			uninstallDescription: "Будут удалены кэш-файлы плагина, каталог данных и сохраненные настройки. Это действие нельзя отменить.",
			uninstalledToast: "{name} удален",
			rollback: "Откатить",
			rollbackTitle: "Откатить {name}?",
			rollbackDescription: "Установленная копия будет переключена на версию {version}. Текущая версия сохранится, и откат можно будет повторить.",
			rollbackToast: "Выполнен откат {name} к версии {version}",
			back: "Назад",
			detail: "Подробнее",
			moreActions: "Другие действия",
			sectionMcp: "MCP-серверы",
			sectionSkills: "Навыки",
			sectionCommands: "Команды",
			sectionHooks: "Hooks",
			infoTitle: "Сведения",
			infoDeveloper: "Разработчик",
			infoCategory: "Категория",
			infoVersion: "Версия",
			infoMarket: "Источник",
			infoWebsite: "Сайт",
			infoRepository: "Репозиторий",
			infoLicense: "Лицензия",
			infoInstalledAt: "Дата установки",
			moreDetails: "Дополнительные сведения",
			rootPath: "Путь установки",
			format: "Формат",
			hooksSource: "Источник Hooks",
			mcpSource: "Источник MCP",
			warnings: "Предупреждения",
			rollbackVersions: "Версии для отката",
			runtimeStatus: "Состояние выполнения",
			componentsLoading: "Загрузка компонентов…",
			componentsError: "Не удалось загрузить список компонентов. Показаны только доступные сведения.",
			componentsRetry: "Повторить",
			fetchDetail: "Получить подробности онлайн",
			fetchDetailHint: "Подробности еще не сохранены в локальном кэше. Получите их онлайн из источника маркетплейса.",
			componentsEmpty: "Этот плагин не объявляет компонентов или их не удалось прочитать.",
			componentsNotEffective: "Не действует",
			componentsEffective: "Действует",
			hostEvent: "Событие хоста",
			canBlock: "может блокировать",
			sourceMissing: "Источник маркетплейса отсутствует. Плагин остается работоспособным, но обновления недоступны.",
			sourceMissingShort: "Нет источника",
			noDescription: "Нет описания",
			close: "Закрыть",
			cancel: "Отмена",
			confirm: "Подтвердить",
			addMarketTitle: "Добавить маркетплейс",
			addMarketSourceLabel: "Репозиторий GitHub, URL git, файл или каталог",
			addMarketHint: "Локальные каталоги, репозитории Git и ссылки на marketplace.json распознаются автоматически.",
			addMarketRisk: "Неофициальные маркетплейсы плагинов могут содержать вредоносные плагины, способные навредить вашему устройству. Прежде чем добавлять, проверьте источник и примите меры предосторожности.",
			addMarketRiskAck: "Я понимаю риски, проверил источник и принял меры предосторожности.",
			marketName: "Название (необязательно)",
			adding: "Добавление…",
			addedToast: "Маркетплейс добавлен: {name} ({type}, плагинов: {count})",
			detectedLocal: "локальный каталог",
			detectedGit: "репозиторий Git",
			detectedUrl: "URL marketplace.json",
			sourcesEmpty: "Источники маркетплейсов еще не добавлены",
			sourcePluginCount: "{count} плагин(ов)",
			sourceUpdated: "Обновлено: {time}",
			sourceRefreshFailed: "Не удалось обновить в {time}: {message}",
			sourceRefresh: "Обновить этот маркетплейс",
			sourceRemove: "Удалить этот маркетплейс",
			refreshDone: "{name} обновлен",
			remove: "Удалить",
			removeMarketTitle: "Удалить маркетплейс?",
			removeMarketDescription: "Установленные плагины сохранятся и останутся работоспособными, но потеряют источник и возможность обновления. Добавьте тот же источник снова, чтобы восстановить их.",
			removedMarketToast: "Маркетплейс удален: {name}",
			orphanedToast: "{name} удален; установленных плагинов без источника: {count}",
			installedGroup: "Установленные",
			noInstalled: "В этой области нет установленных плагинов.",
			noInstalledTitle: "Плагины не установлены",
			noInstalledDescription: "Просмотрите маркетплейс и установите плагины, чтобы добавить MCP, навыки, команды и Hooks.",
			filterAll: "Все",
			filterEnabled: "Включены",
			filterDisabled: "Отключены",
			version: "Версия",
			updatesAvailable: "Обновлений: {count}",
			operationBusy: "Выполняется другая операция. Повторите попытку чуть позже.",
			errorForbidden: "Запрос отклонен: этот API доступен только страницам на локальном loopback.",
			errorNotFound: "Не найдено. Плагин или маркетплейс могли быть удалены; обновите и повторите попытку.",
			errorConflict: "Конфликт состояния: цель уже существует или была изменена. Обновите и повторите попытку.",
			errorSourceUnavailable: "Источник маркетплейса сейчас недоступен; обновите его и повторите попытку.",
			errorVersionInvalid: "Недопустимый номер версии.",
			errorNetwork: "Сетевой запрос не удался. Проверьте подключение и повторите попытку.",
			errorGit: "Операция Git не удалась. Проверьте URL репозитория и ваше подключение.",
			errorInternal: "Внутренняя ошибка. Подробности в журналах hub.",
			apiUnavailable: "API расширения агента недоступна",
			apiHint: "Эта страница не обслуживается через локальный loopback, либо хост не загрузил актуальный код плагина. Обновите страницу и повторите попытку.",
			migrationError: "Сбой миграции данных: {message}. Исходные данные сохранены в каталоге журналов hub.",
			retry: "Повторить",
			unknownError: "Неизвестная ошибка",
			runtimeSkills: "Навыки",
			runtimeCommands: "Команды",
			runtimeHooks: "Hooks",
			runtimeMcp: "MCP",
			runtimeNotEffective: "не действует",
			runtimeEffective: "готов",
			enabledCount: "Плагинов: {total} · включено: {enabled}",
			pluginCount: "{count} плагин(ов)",
			installedBadge: "Установлен",
			updateBadge: "Обновление",
			notInstallable: "Установка невозможна",
			menuEnable: "Включить",
			menuDisable: "Отключить",
			menuUninstall: "Удалить",
			hooksInactive: "Не действует: {reason}",
			clearSearch: "Очистить поиск",
			allSources: "Все источники",
			tabSources: "Мои маркетплейсы",
			tabRecommended: "Рекомендации",
			storeTabsLabel: "Вид",
			tabPlugins: "Плагины",
			tabMemory: "Память",
			tabSkills: "Навыки",
			sectionTabsLabel: "Разделы",
			comingSoon: "Скоро",
			memoryPlaceholder: "Управление памятью появится в ближайшее время.",
			skillsPlaceholder: "Управление навыками появится в ближайшее время.",
			recommendedHint: "Отобранные источники маркетплейсов — добавьте один, чтобы просматривать и устанавливать его плагины.",
			addedBadge: "Добавлено",
			previewAddHint: "Добавьте источник, чтобы просматривать и устанавливать все его плагины.",
			previewInstallBlocked: "Установка после добавления источника",
			memoryTitle: "Память",
			memoryScopeLabel: "Область памяти",
			memoryScopeGlobal: "Глобальная",
			memoryScopeProject: "Проект",
			memoryProjectLabel: "Проект",
			memoryProjectEmpty: "Проекты пока не обнаружены. Откройте сессию в каталоге проекта, чтобы использовать память проекта; глобальная память доступна всегда.",
			memorySearchPlaceholder: "Поиск в памяти",
			memoryTypeLabel: "Типы памяти",
			memoryTypeAll: "Все",
			memoryTypePreference: "Предпочтение",
			memoryTypeDecision: "Решение",
			memoryTypeGotcha: "Подводный камень",
			memoryTypeProject: "Факт проекта",
			memoryTypeReference: "Справка",
			memoryStatusActive: "Активна",
			memoryStatusStale: "Отключена",
			memoryStatusArchived: "В архиве",
			memoryNew: "Новая память",
			memoryRetry: "Повторить",
			memoryListTitle: "Записи памяти",
			memoryLoading: "Загрузка памяти…",
			memoryListEmpty: "Записей пока нет. Нажмите «Новая память», чтобы создать первую.",
			memoryListEmptyFiltered: "Нет записей, подходящих под фильтр.",
			memoryCreateTitle: "Новая память",
			memoryEditTitle: "Редактирование памяти",
			memoryFieldName: "Название",
			memoryFieldDescription: "Описание",
			memoryFieldType: "Тип",
			memoryFieldTags: "Теги",
			memoryFieldImportance: "Важность",
			memoryFieldContent: "Содержание",
			memoryTagsHint: "Добавьте тег клавишей Enter или запятой",
			memoryImportanceHint: "0–100; чем выше, тем раньше внедряется",
			memorySave: "Сохранить",
			memorySaving: "Сохранение…",
			memorySaved: "Память сохранена",
			memoryNameRequired: "Укажите название и содержимое.",
			memoryStatusDone: "Статус памяти обновлен",
			memoryDeactivate: "Отключить",
			memoryArchive: "В архив",
			memoryRestore: "Восстановить",
			memoryDelete: "Удалить",
			memoryDeleteConfirm: "Подтвердить удаление",
			memoryDeleteDescription: "Удаление «{name}» нельзя отменить.",
			memoryDeleting: "Удаление…",
			memoryDeleted: "Память «{name}» удалена",
			memoryExportMarkdown: "Экспорт Markdown",
			memoryExporting: "Экспорт…",
			memoryExportDone: "Экспортирован {filename}",
			memoryExportFailed: "Ошибка экспорта: {message}",
			memoryRefreshIndex: "Перестроить индекс",
			memoryRefreshIndexDone: "Индекс памяти перестроен",
			memoryRefreshIndexFailed: "Не удалось перестроить индекс памяти: {message}",
			memorySettingsTitle: "Захват и внедрение",
			memorySettingsCapture: "Автоматический захват",
			memorySettingsCaptureSessionEnd: "Досбор по завершении сессии",
			memorySettingsInject: "Внедрение индекса",
			memorySettingsIndexGlobal: "Размер глобального индекса",
			memorySettingsIndexProject: "Размер индекса проекта",
			memorySettingsMaxChars: "Общий лимит символов",
			memorySettingsButton: "Настройки и статистика памяти",
			memoryTypeFilterLabel: "Фильтр по типу",
			memoryStatsTitle: "Статистика",
			memoryStatCaptureRuns: "Запусков захвата",
			memoryStatCapturedEntries: "Захвачено записей",
			memoryInjectionRate: "Использование инъекции",
			memoryRetrievalRate: "Доля успешных поисков",
			memoryRecentCaptures: "Недавние захваты",
			memoryCaptureWritten: "Записано: {count}",
			memoryCaptureSkipped: "Пропущено: {reason}",
			memoryUndoCapture: "Отменить",
			memoryUndoCaptureDone: "Захват отменен",
			memoryUndoCaptureFailed: "Не удалось отменить: {message}",
			memoryCaptureUndone: "Отменен",
			memoryRecentCapturesEmpty: "Недавних захватов нет",
			memorySortLabel: "Сортировка",
			memorySortDefault: "По важности",
			memorySortRecent: "Сначала недавние",
			memoryClearTypeFilter: "Сбросить фильтр по типу",
			memoryClearTagFilter: "Сбросить фильтр по тегу",
			memoryTagRemove: "Удалить тег {tag}",
			memoryTagFilterHint: "Нажмите, чтобы отфильтровать по этому тегу",
			memoryAuditButton: "Проверка памяти",
			memoryAuditRunning: "Проверка…",
			memoryAuditTitle: "Проверка памяти",
			memoryAuditStaleTitle: "Кандидаты на устаревание",
			memoryAuditStaleHint: "Есть голос за устаревание или запись отключена — рекомендуется архивировать",
			memoryAuditDuplicateTitle: "Возможные дубликаты",
			memoryAuditDuplicateHint: "Очень похожа на другую запись",
			memoryAuditLowValueTitle: "Малоценные записи",
			memoryAuditLowValueHint: "Без изменений более 30 дней и без подкрепления",
			memoryAuditKeep: "Рекомендуется сохранить: {name}",
			memoryAuditEmpty: "Проблем не найдено — память в хорошем состоянии.",
			memoryAuditSelected: "Выбрано: {count}",
			memoryAuditDeleteConfirm: "Выбранные {count} записей будут удалены; это нельзя отменить.",
			memoryAuditDone: "Обработано записей: {count}",
			memoryAuditPartial: "{count} не удалось — повторите проверку и попробуйте снова",
			memoryOpenNative: "Открыть в системном приложении",
			memoryBodyReadOnlyHint: "Содержимое доступно только для чтения; откройте его в системном приложении, чтобы прочитать.",
			memoryOpenNativeFailed: "Не удалось открыть в системном приложении: {message}",
			memoryOpenNativeUnavailable: "Эта среда не поддерживает открытие файлов в системном приложении",
			memoryMaintenanceButton: "Оптимизировать память",
			memoryMaintenanceDueTitle: "Пора оптимизировать память",
			memoryMaintenanceDueHint: "С последнего обслуживания прошло {days} дн.; новых или усиленных записей: {writes}",
			memoryMaintenanceDueNeverHint: "Оптимизация ещё не выполнялась; новых или усиленных записей: {writes}",
			memoryMaintenanceNotDueHint: "Порог обслуживания не достигнут — всё равно оптимизировать сейчас?",
			memoryMaintenanceConfirmTitle: "Оптимизировать память",
			memoryMaintenanceConfirmHint: "Объединяет дубликаты, отключает устаревшие записи и удаляет малополезные. Удаления сохраняются в резервной копии, весь запуск можно отменить.",
			memoryMaintenanceRun: "Оптимизировать сейчас",
			memoryMaintenanceRunning: "Оптимизация…",
			memoryMaintenanceResultTitle: "Оптимизация завершена",
			memoryMaintenanceResult: "Объединено {merges}, отключено {staled}, восстановлено {restored}, удалено {deleted}",
			memoryMaintenanceFailed: "Ошибка оптимизации: {message}",
			memoryMaintenanceUndo: "Отменить этот запуск",
			memoryMaintenanceUndone: "Запуск отменён",
			memoryMaintenanceUndoFailed: "Не удалось отменить: {message}",
			memoryMaintenanceRecent: "Последние запуски",
			memoryMaintenanceEmpty: "Запусков обслуживания пока нет",
			memoryMaintenanceStatusCompleted: "Завершён",
			memoryMaintenanceStatusFailed: "Ошибка",
			memoryMaintenanceStatusEmpty: "Без изменений",
			memoryMaintenanceStatusUndone: "Отменён",
			memoryMaintenanceModelInherit: "Оставьте пустым, чтобы наследовать модель хоста по умолчанию",
			memoryMaintenanceProvider: "Провайдер модели обслуживания",
			memoryMaintenanceModel: "Модель обслуживания",
			memoryMaintenanceLater: "Не сейчас",
			memoryDiagnosisButton: "Диагностика",
			memoryDiagnosisTitle: "Диагностика памяти",
			memoryDiagnosisEmpty: "Записей пока нет",
			memoryDiagnosisInjections: "Последние инъекции",
			memoryDiagnosisCaptures: "Последние захваты",
			memoryDiagnosisRetrievals: "Последние поиски",
			memoryDiagnosisMaintenance: "История обслуживания",
			memoryDiagnosisEntries: "Записей: {count}",
			memoryDiagnosisChars: "Символов: {count}",
			memoryDiagnosisTruncated: "Усечено",
			memoryDiagnosisQuery: "Запрос: {query}",
			memoryDiagnosisResults: "Результатов: {count}",
			memoryDiagnosisMore: "и ещё {count}",
			memoryDiagnosisUndo: "Отменить",
			memoryDiagnosisUndoDone: "Обслуживание отменено",
			memoryDiagnosisUndoFailed: "Не удалось отменить: {message}",
			memoryShowArchived: "Показать архивные",
			memoryCopyId: "Копировать ID",
			memoryIdCopied: "ID скопирован"
		};
		/** Portuguese dictionary (same key set as `zh`). */
		const pt = {
			tab: "Extensão de agente",
			title: "Extensão de agente",
			refresh: "Recarregar",
			refreshing: "Recarregando…",
			sources: "Fontes de marketplace",
			add: "Adicionar",
			addMarketplace: "Adicionar marketplace de plugins",
			manage: "Gerenciar plugins",
			browseMarketplace: "Explorar marketplace de plugins",
			searchPlaceholder: "Pesquisar plugins",
			searchResults: "Resultados da pesquisa ({count})",
			searchEmpty: "Nenhum plugin corresponde à pesquisa",
			personalEmpty: "Ainda não há plugins de fontes pessoais. Use “Adicionar” no canto superior direito para adicionar uma fonte de marketplace.",
			catalogLoading: "Carregando plugins…",
			catalogEmpty: "Ainda não há plugins no marketplace",
			marketEmpty: "Este marketplace não tem plugins.",
			viewMore: "Ver {names} e mais {count}",
			viewMoreFew: "Ver {names}",
			andMore: "e mais {count}",
			showLess: "Mostrar menos",
			install: "Instalar",
			installing: "Instalando…",
			installedToast: "{name} instalado",
			update: "Atualizar",
			updating: "Atualizando…",
			updatedToast: "{name} atualizado",
			upToDate: "{name} já está atualizado",
			updateAvailable: "Atualização disponível",
			updateAll: "Atualizar tudo ({count})",
			updateAllDone: "Plugins atualizados: {count}",
			updateAllPartial: "Atualizados {succeeded}, falharam {failed}: {plugins}",
			updateAllAborted: "A atualização geral foi interrompida; plugins atualizados: {count}",
			checkFound: "Atualizações disponíveis: {count}",
			checkNone: "Todos os plugins instalados estão atualizados",
			refreshPartial: "A recarga terminou com {count} erro(s); consulte as fontes de marketplace",
			enable: "Ativar",
			disable: "Desativar",
			enabled: "Ativado",
			disabled: "Desativado",
			enabledToast: "{name} ativado",
			disabledToast: "{name} desativado",
			toggleFailed: "Não foi possível atualizar {name}. Tente novamente.",
			uninstall: "Desinstalar",
			uninstallTitle: "Desinstalar {name}?",
			uninstallDescription: "Os arquivos de cache do plugin, o diretório de dados e as configurações salvas serão removidos. Esta ação não pode ser desfeita.",
			uninstalledToast: "{name} desinstalado",
			rollback: "Reverter",
			rollbackTitle: "Reverter {name}?",
			rollbackDescription: "A cópia instalada voltará para a versão {version}. A versão atual é mantida para permitir outra reversão.",
			rollbackToast: "{name} revertido para a versão {version}",
			back: "Voltar",
			detail: "Detalhes",
			moreActions: "Mais ações",
			sectionMcp: "Servidores MCP",
			sectionSkills: "Habilidades",
			sectionCommands: "Comandos",
			sectionHooks: "Hooks",
			infoTitle: "Informações",
			infoDeveloper: "Desenvolvedor",
			infoCategory: "Categoria",
			infoVersion: "Versão",
			infoMarket: "Fonte",
			infoWebsite: "Site",
			infoRepository: "Repositório",
			infoLicense: "Licença",
			infoInstalledAt: "Data de instalação",
			moreDetails: "Detalhes avançados",
			rootPath: "Caminho de instalação",
			format: "Formato",
			hooksSource: "Fonte dos Hooks",
			mcpSource: "Fonte do MCP",
			warnings: "Avisos",
			rollbackVersions: "Versões para reverter",
			runtimeStatus: "Estado de execução",
			componentsLoading: "Carregando componentes…",
			componentsError: "Não foi possível carregar a lista de componentes. Exibindo apenas as informações disponíveis.",
			componentsRetry: "Tentar novamente",
			fetchDetail: "Obter detalhes online",
			fetchDetailHint: "Os detalhes ainda não estão em cache local. Você pode obtê-los online pela fonte de marketplace.",
			componentsEmpty: "Este plugin não declara componentes ou eles não puderam ser lidos.",
			componentsNotEffective: "Sem efeito",
			componentsEffective: "Efetivo",
			hostEvent: "Evento do host",
			canBlock: "pode bloquear",
			sourceMissing: "A fonte de marketplace está ausente. O plugin continua utilizável, mas as atualizações não estão disponíveis.",
			sourceMissingShort: "Fonte ausente",
			noDescription: "Sem descrição",
			close: "Fechar",
			cancel: "Cancelar",
			confirm: "Confirmar",
			addMarketTitle: "Adicionar marketplace",
			addMarketSourceLabel: "Repositório do GitHub, URL de git, arquivo ou diretório",
			addMarketHint: "Diretórios locais, repositórios Git e links para marketplace.json são reconhecidos automaticamente.",
			addMarketRisk: "Marketplaces de plugins não oficiais podem conter plugins maliciosos capazes de danificar seu dispositivo. Verifique a fonte e tome precauções antes de adicionar.",
			addMarketRiskAck: "Entendo os riscos, verifiquei a fonte e tomei precauções.",
			marketName: "Nome (opcional)",
			adding: "Adicionando…",
			addedToast: "Marketplace adicionado: {name} ({type}, {count} plugins)",
			detectedLocal: "diretório local",
			detectedGit: "repositório Git",
			detectedUrl: "URL de marketplace.json",
			sourcesEmpty: "Ainda não há fontes de marketplace registradas",
			sourcePluginCount: "{count} plugins",
			sourceUpdated: "Atualizado: {time}",
			sourceRefreshFailed: "Falha ao recarregar às {time}: {message}",
			sourceRefresh: "Recarregar este marketplace",
			sourceRemove: "Remover este marketplace",
			refreshDone: "{name} recarregado",
			remove: "Remover",
			removeMarketTitle: "Remover o marketplace?",
			removeMarketDescription: "Os plugins instalados são mantidos e continuam utilizáveis, mas perdem a fonte e a capacidade de atualização. Adicione a mesma fonte novamente para restaurá-los.",
			removedMarketToast: "Marketplace removido: {name}",
			orphanedToast: "{name} removido; {count} plugin(s) instalado(s) ficaram órfãos",
			installedGroup: "Instalados",
			noInstalled: "Não há plugins instalados neste escopo.",
			noInstalledTitle: "Nenhum plugin instalado",
			noInstalledDescription: "Navegue pelo marketplace e instale plugins para adicionar MCP, habilidades, comandos e Hooks.",
			filterAll: "Todos",
			filterEnabled: "Ativados",
			filterDisabled: "Desativados",
			version: "Versão",
			updatesAvailable: "{count} atualizações disponíveis",
			operationBusy: "Há outra operação em andamento. Tente novamente em instantes.",
			errorForbidden: "Solicitação recusada: apenas páginas locais de loopback podem chamar esta API.",
			errorNotFound: "Não encontrado. O plugin ou o marketplace pode ter sido removido; recarregue e tente novamente.",
			errorConflict: "Conflito de estado: o destino já existe ou foi alterado. Recarregue e tente novamente.",
			errorSourceUnavailable: "A fonte de marketplace está indisponível no momento; recarregue-a e tente novamente.",
			errorVersionInvalid: "O número da versão não é válido.",
			errorNetwork: "Falha na solicitação de rede. Verifique a conexão e tente novamente.",
			errorGit: "Falha na operação Git. Verifique a URL do repositório e sua conexão.",
			errorInternal: "Erro interno. Consulte os logs do hub para mais detalhes.",
			apiUnavailable: "API da extensão de agente indisponível",
			apiHint: "Esta página não é servida pela origem de loopback local, ou o host não carregou o código atual do plugin. Recarregue a página e tente novamente.",
			migrationError: "Falha na migração de dados: {message}. Seus dados originais são preservados no diretório de logs do hub.",
			retry: "Tentar novamente",
			unknownError: "Erro desconhecido",
			runtimeSkills: "Habilidades",
			runtimeCommands: "Comandos",
			runtimeHooks: "Hooks",
			runtimeMcp: "MCP",
			runtimeNotEffective: "sem efeito",
			runtimeEffective: "pronto",
			enabledCount: "{total} plugins · {enabled} ativados",
			pluginCount: "{count} plugins",
			installedBadge: "Instalado",
			updateBadge: "Atualização",
			notInstallable: "Não instalável",
			menuEnable: "Ativar",
			menuDisable: "Desativar",
			menuUninstall: "Desinstalar",
			hooksInactive: "Sem efeito: {reason}",
			clearSearch: "Limpar pesquisa",
			allSources: "Todas as fontes",
			tabSources: "Meus mercados",
			tabRecommended: "Recomendados",
			storeTabsLabel: "Exibições",
			tabPlugins: "Plugins",
			tabMemory: "Memória",
			tabSkills: "Habilidades",
			sectionTabsLabel: "Seções",
			comingSoon: "Em breve",
			memoryPlaceholder: "O gerenciamento de memória estará disponível em breve.",
			skillsPlaceholder: "O gerenciamento de habilidades estará disponível em breve.",
			recommendedHint: "Fontes de marketplace selecionadas — adicione uma para explorar e instalar os plugins dela.",
			addedBadge: "Adicionado",
			previewAddHint: "Adicione a fonte para explorar e instalar todos os plugins dela.",
			previewInstallBlocked: "Instalável após adicionar a fonte",
			memoryTitle: "Memória",
			memoryScopeLabel: "Escopo da memória",
			memoryScopeGlobal: "Global",
			memoryScopeProject: "Projeto",
			memoryProjectLabel: "Projeto",
			memoryProjectEmpty: "Nenhum projeto detectado ainda. Abra uma sessão dentro do diretório de um projeto para usar a memória do projeto; a memória global está sempre disponível.",
			memorySearchPlaceholder: "Pesquisar na memória",
			memoryTypeLabel: "Tipos de memória",
			memoryTypeAll: "Todos",
			memoryTypePreference: "Preferência",
			memoryTypeDecision: "Decisão",
			memoryTypeGotcha: "Armadilha",
			memoryTypeProject: "Fato do projeto",
			memoryTypeReference: "Referência",
			memoryStatusActive: "Ativa",
			memoryStatusStale: "Desativada",
			memoryStatusArchived: "Arquivada",
			memoryNew: "Nova memória",
			memoryRetry: "Tentar novamente",
			memoryListTitle: "Memórias",
			memoryLoading: "Carregando memória…",
			memoryListEmpty: "Ainda não há memórias. Escolha “Nova memória” para criar a primeira.",
			memoryListEmptyFiltered: "Nenhuma memória corresponde a este filtro.",
			memoryCreateTitle: "Nova memória",
			memoryEditTitle: "Editar memória",
			memoryFieldName: "Nome",
			memoryFieldDescription: "Descrição",
			memoryFieldType: "Tipo",
			memoryFieldTags: "Etiquetas",
			memoryFieldImportance: "Importância",
			memoryFieldContent: "Conteúdo",
			memoryTagsHint: "Pressione Enter ou vírgula para adicionar a etiqueta",
			memoryImportanceHint: "0–100; valores maiores são injetados primeiro",
			memorySave: "Salvar",
			memorySaving: "Salvando…",
			memorySaved: "Memória salva",
			memoryNameRequired: "Informe um nome e um conteúdo.",
			memoryStatusDone: "Status da memória atualizado",
			memoryDeactivate: "Desativar",
			memoryArchive: "Arquivar",
			memoryRestore: "Restaurar",
			memoryDelete: "Excluir",
			memoryDeleteConfirm: "Confirmar exclusão",
			memoryDeleteDescription: "Excluir “{name}” não pode ser desfeito.",
			memoryDeleting: "Excluindo…",
			memoryDeleted: "Memória “{name}” excluída",
			memoryExportMarkdown: "Exportar Markdown",
			memoryExporting: "Exportando…",
			memoryExportDone: "{filename} exportado",
			memoryExportFailed: "Falha na exportação: {message}",
			memoryRefreshIndex: "Reconstruir índice",
			memoryRefreshIndexDone: "Índice de memória reconstruído",
			memoryRefreshIndexFailed: "Falha ao reconstruir o índice de memória: {message}",
			memorySettingsTitle: "Captura e injeção",
			memorySettingsCapture: "Captura automática",
			memorySettingsCaptureSessionEnd: "Fechamento de sessão",
			memorySettingsInject: "Injeção no índice",
			memorySettingsIndexGlobal: "Tamanho do índice global",
			memorySettingsIndexProject: "Tamanho do índice do projeto",
			memorySettingsMaxChars: "Orçamento de caracteres",
			memorySettingsButton: "Configurações e estatísticas de memória",
			memoryTypeFilterLabel: "Filtrar por tipo",
			memoryStatsTitle: "Estatísticas",
			memoryStatCaptureRuns: "Execuções de captura",
			memoryStatCapturedEntries: "Entradas capturadas",
			memoryInjectionRate: "Utilização da injeção",
			memoryRetrievalRate: "Taxa de acerto da busca",
			memoryRecentCaptures: "Capturas recentes",
			memoryCaptureWritten: "Gravadas: {count}",
			memoryCaptureSkipped: "Ignorada: {reason}",
			memoryUndoCapture: "Desfazer",
			memoryUndoCaptureDone: "Captura desfeita",
			memoryUndoCaptureFailed: "Falha ao desfazer: {message}",
			memoryCaptureUndone: "Desfeita",
			memoryRecentCapturesEmpty: "Nenhuma captura recente",
			memorySortLabel: "Ordenação",
			memorySortDefault: "Por importância",
			memorySortRecent: "Atualizadas recentemente",
			memoryClearTypeFilter: "Limpar o filtro de tipo",
			memoryClearTagFilter: "Limpar o filtro de etiqueta",
			memoryTagRemove: "Remover a etiqueta {tag}",
			memoryTagFilterHint: "Clique para filtrar por esta etiqueta",
			memoryAuditButton: "Auditoria de memória",
			memoryAuditRunning: "Auditando…",
			memoryAuditTitle: "Auditoria de memória",
			memoryAuditStaleTitle: "Candidatas obsoletas",
			memoryAuditStaleHint: "Com voto de obsolescência ou desativada — considere arquivar",
			memoryAuditDuplicateTitle: "Possíveis duplicatas",
			memoryAuditDuplicateHint: "Muito semelhante a outra entrada",
			memoryAuditLowValueTitle: "Entradas de baixo valor",
			memoryAuditLowValueHint: "Sem alterações há mais de 30 dias e nunca reforçada",
			memoryAuditKeep: "Sugestão de manter: {name}",
			memoryAuditEmpty: "Nenhum problema encontrado — a memória está saudável.",
			memoryAuditSelected: "{count} selecionada(s)",
			memoryAuditDeleteConfirm: "As {count} entradas selecionadas serão excluídas; não pode ser desfeito.",
			memoryAuditDone: "{count} entradas processadas",
			memoryAuditPartial: "{count} falharam — execute a auditoria novamente e tente outra vez",
			memoryOpenNative: "Abrir no aplicativo do sistema",
			memoryBodyReadOnlyHint: "O conteúdo é somente leitura; abra-o no aplicativo do sistema para ler.",
			memoryOpenNativeFailed: "Não foi possível abrir no aplicativo do sistema: {message}",
			memoryOpenNativeUnavailable: "Este ambiente não pode abrir arquivos no aplicativo do sistema",
			memoryMaintenanceButton: "Otimizar memória",
			memoryMaintenanceDueTitle: "Hora de otimizar a memória",
			memoryMaintenanceDueHint: "Desde a última manutenção: {days} dia(s); {writes} entradas novas ou reforçadas",
			memoryMaintenanceDueNeverHint: "Nunca otimizada; {writes} entradas novas ou reforçadas",
			memoryMaintenanceNotDueHint: "Abaixo do limite de manutenção — otimizar agora mesmo assim?",
			memoryMaintenanceConfirmTitle: "Otimizar memória",
			memoryMaintenanceConfirmHint: "Combina duplicatas, desativa entradas obsoletas e exclui as de baixo valor. As exclusões são copiadas e toda a execução pode ser desfeita.",
			memoryMaintenanceRun: "Otimizar agora",
			memoryMaintenanceRunning: "Otimizando…",
			memoryMaintenanceResultTitle: "Otimização concluída",
			memoryMaintenanceResult: "Combinadas {merges}, desativadas {staled}, restauradas {restored}, excluídas {deleted}",
			memoryMaintenanceFailed: "Falha na otimização: {message}",
			memoryMaintenanceUndo: "Desfazer esta execução",
			memoryMaintenanceUndone: "Execução desfeita",
			memoryMaintenanceUndoFailed: "Falha ao desfazer: {message}",
			memoryMaintenanceRecent: "Execuções recentes",
			memoryMaintenanceEmpty: "Nenhuma execução de manutenção ainda",
			memoryMaintenanceStatusCompleted: "Concluída",
			memoryMaintenanceStatusFailed: "Falhou",
			memoryMaintenanceStatusEmpty: "Sem alterações",
			memoryMaintenanceStatusUndone: "Desfeita",
			memoryMaintenanceModelInherit: "Deixe vazio para herdar o modelo padrão do host",
			memoryMaintenanceProvider: "Provedor do modelo de manutenção",
			memoryMaintenanceModel: "Modelo de manutenção",
			memoryMaintenanceLater: "Agora não",
			memoryDiagnosisButton: "Diagnóstico",
			memoryDiagnosisTitle: "Diagnóstico de memória",
			memoryDiagnosisEmpty: "Nenhum registro ainda",
			memoryDiagnosisInjections: "Injeções recentes",
			memoryDiagnosisCaptures: "Capturas recentes",
			memoryDiagnosisRetrievals: "Buscas recentes",
			memoryDiagnosisMaintenance: "Histórico de manutenção",
			memoryDiagnosisEntries: "{count} entradas",
			memoryDiagnosisChars: "{count} caracteres",
			memoryDiagnosisTruncated: "Truncado",
			memoryDiagnosisQuery: "Consulta: {query}",
			memoryDiagnosisResults: "{count} resultados",
			memoryDiagnosisMore: "e mais {count}",
			memoryDiagnosisUndo: "Desfazer",
			memoryDiagnosisUndoDone: "Manutenção desfeita",
			memoryDiagnosisUndoFailed: "Falha ao desfazer: {message}",
			memoryShowArchived: "Mostrar arquivadas",
			memoryCopyId: "Copiar ID",
			memoryIdCopied: "ID copiado"
		};
		// src/client/api.ts
		/** Envelope error carrying the host's stable code. */
		var ApiError = class extends Error {
			code;
			constructor(message, code) {
				super(message);
				this.name = "ApiError";
				this.code = code;
			}
		};
		const API_BASE = "/agent-plugin/api";
		/** Call one plugin API endpoint and return its `data`. */
		async function api(path, options = {}) {
			const method = options.method ?? "GET";
			const timeoutMs = options.timeoutMs ?? 12e4;
			const init = {
				method,
				cache: "no-store",
				headers: { "content-type": "application/json" }
			};
			if (options.body !== void 0) init.body = JSON.stringify(options.body);
			if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") init.signal = AbortSignal.timeout(timeoutMs);
			const response = await fetch(`${API_BASE}${path}`, init);
			let payload = null;
			try {
				payload = await response.json();
			} catch {
				payload = null;
			}
			if (!response.ok || payload === null || payload.ok !== true) throw new ApiError(payload !== null && typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`, payload !== null && typeof payload.code === "string" ? payload.code : "");
			return payload.data;
		}
		// src/location-key.ts
		/**
		* Canonical market location key shared by both halves: the server uses it for
		* add-time duplicate detection (same source under different spellings — bare
		* repo URL, `.git` suffix, raw manifest link — must not register twice), the
		* client for "already added" matching. Deliberately independent from
		* `marketIdFor`: ids stay stable for existing installs, this key only powers
		* equivalence checks.
		*
		* @module dsh-agent-extension/location-key
		*/
		/** Canonical key of one market location ('' for empty input). */
		function marketLocationKey(location) {
			const raw = String(location ?? "").trim();
			if (raw === "") return "";
			const scp = /^git@([^:/]+):(.+)$/i.exec(raw);
			if (scp) return gitKey(String(scp[1] ?? ""), String(scp[2] ?? ""));
			const ssh = /^ssh:\/\/(?:[^@/]+@)?([^:/]+)(?::\d+)?\/(.+)$/i.exec(raw);
			if (ssh) return gitKey(String(ssh[1] ?? ""), String(ssh[2] ?? ""));
			if (/^https?:\/\//i.test(raw)) try {
				const url = new URL(raw);
				const host = url.hostname.toLowerCase();
				const segments = url.pathname.split("/").filter((segment) => segment !== "");
				if ((host === "github.com" || host === "raw.githubusercontent.com") && segments.length >= 2) return gitKey("github.com", `${String(segments[0])}/${String(segments[1])}`);
				return `url:${host}/${segments.join("/")}`;
			} catch {
				return `url:${raw.toLowerCase()}`;
			}
			const normalized = raw.replace(/\\/g, "/").replace(/\/+$/, "");
			return `local:${/^[a-z]:\//i.test(normalized) || raw.includes("\\") ? normalized.toLowerCase() : normalized}`;
		}
		/** Key of a git-ish host/path pair: lowercase host and path, `.git` suffix stripped. */
		function gitKey(host, repoPath) {
			const segments = repoPath.replace(/\/+$/, "").toLowerCase().split("/").filter((segment) => segment !== "");
			const last = segments[segments.length - 1];
			if (last !== void 0) segments[segments.length - 1] = last.replace(/\.git$/i, "");
			return `git:${host.toLowerCase()}/${segments.join("/")}`;
		}
		// src/client/recommended.ts
		/**
		* Curated recommended market sources of the store's "Recommended" tab: a
		* package-level constant list the user can add with one click. Entries are
		* shaped like server-side display records so `displayOf` resolves their
		* localized title/description without new plumbing.
		*
		* @module dsh-agent-extension/client/recommended
		*/
		/** The curated list: Anthropic's official marketplace plus popular community collections. */
		const RECOMMENDED_SOURCES = Object.freeze([
			{
				id: "claude-plugins-official",
				location: "https://github.com/anthropics/claude-plugins-official",
				format: "claude",
				display: {
					title: "Anthropic Official Plugins",
					titleI18n: {
						zh: "Anthropic 官方插件市场",
						en: "Anthropic Official Plugins"
					},
					description: "Anthropic’s officially maintained catalog of high-quality Claude plugins.",
					descriptionI18n: {
						zh: "Anthropic 官方维护的高质量 Claude 插件目录，持续更新。",
						en: "Anthropic’s officially maintained catalog of high-quality Claude plugins."
					}
				}
			},
			{
				id: "superpowers",
				location: "https://github.com/obra/superpowers",
				format: "claude",
				display: {
					title: "Superpowers Skills",
					titleI18n: {
						zh: "Superpowers 技能合集",
						en: "Superpowers Skills"
					},
					description: "The popular community skills collection for Claude Code by obra.",
					descriptionI18n: {
						zh: "社区热门的 Claude 技能合集（obra/superpowers），为 Claude Code 注入超能力。",
						en: "The popular community skills collection for Claude Code by obra."
					}
				}
			},
			{
				id: "mattpocock-skills",
				location: "https://github.com/mattpocock/skills",
				format: "claude",
				display: {
					title: "Matt Pocock’s Skills",
					titleI18n: {
						zh: "Matt Pocock 技能市场",
						en: "Matt Pocock’s Skills"
					},
					description: "A Claude skills marketplace maintained by TypeScript educator Matt Pocock.",
					descriptionI18n: {
						zh: "由 TypeScript 教育者 Matt Pocock 维护的 Claude 技能市场。",
						en: "A Claude skills marketplace maintained by TypeScript educator Matt Pocock."
					}
				}
			}
		]);
		/**
		* The added market equivalent to a recommended location, if any. Prefers the
		* server-provided `locationKey` on market summaries; falls back to computing
		* the canonical key client-side.
		*/
		function addedMarketFor(markets, location) {
			const wanted = marketLocationKey(location);
			if (wanted === "") return null;
			for (const market of Array.isArray(markets) ? markets : []) {
				const record = market && typeof market === "object" ? market : {};
				if ((typeof record.locationKey === "string" && record.locationKey !== "" ? record.locationKey : marketLocationKey(record.location)) === wanted) return record;
			}
			return null;
		}
		/** Whether a market equivalent to the given location exists among the added markets. */
		function isSourceAdded(markets, location) {
			return addedMarketFor(markets, location) !== null;
		}
		// src/client/presentation.ts
		function isObject(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value);
		}
		function errorMessage(error) {
			if (error && typeof error.message === "string" && error.message !== "") return error.message;
			return String(error);
		}
		/** Host stable error code → locale key (bad_request keeps the server text). */
		const ERROR_MESSAGE_KEYS = {
			forbidden: "errorForbidden",
			not_found: "errorNotFound",
			conflict: "errorConflict",
			operation_in_progress: "operationBusy",
			market_unavailable: "errorSourceUnavailable",
			source_unavailable: "errorSourceUnavailable",
			version_invalid: "errorVersionInvalid",
			network_error: "errorNetwork",
			git_error: "errorGit",
			internal: "errorInternal"
		};
		/** Localize an error by its code; unknown codes fall back to the server text. */
		function errorMessageFor(error, t) {
			const code = error && typeof error.code === "string" ? error.code : "";
			const key = ERROR_MESSAGE_KEYS[code];
			if (key !== void 0) {
				const text = t(key);
				if (typeof text === "string" && text !== "" && text !== key) return text;
			}
			return errorMessage(error);
		}
		function pad2(value) {
			return String(value).padStart(2, "0");
		}
		/** `YYYY-MM-DD HH:mm` in local time; empty for absent/invalid values. */
		function formatTime(value) {
			if (typeof value !== "string" || value.trim() === "") return "";
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return "";
			return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
		}
		/** `plugin-name` → `Plugin Name` (title fallback). */
		function canonicalTitle(name) {
			const text = String(name ?? "");
			const words = text.split(/[-_\s]+/u).filter(Boolean);
			if (words.length === 0) return text;
			return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
		}
		/** Localized pick: exact locale → language prefix → base text. */
		function pickI18n(base, map, localeId) {
			const id = String(localeId ?? "").toLowerCase();
			if (isObject(map) && id !== "") {
				const exact = map[id];
				if (typeof exact === "string" && exact.trim() !== "") return exact;
				const prefix = id.split("-")[0] ?? "";
				for (const key of Object.keys(map)) {
					const keyId = key.toLowerCase();
					if (keyId === id || prefix !== "" && keyId.split("-")[0] === prefix) {
						const value = map[key];
						if (typeof value === "string" && value.trim() !== "") return value;
					}
				}
			}
			return typeof base === "string" && base.trim() !== "" ? base : "";
		}
		/** Display fields of one catalog item / installed item. */
		function displayOf(entity, localeId) {
			const record = isObject(entity) ? entity : {};
			const display = isObject(record.display) ? record.display : {};
			const title = pickI18n(display.title, display.titleI18n, localeId) || canonicalTitle(record.name);
			const description = pickI18n(display.description, display.descriptionI18n, localeId);
			const author = isObject(display.author) ? display.author : typeof display.author === "string" && display.author !== "" ? { name: display.author } : null;
			return {
				title,
				description,
				category: typeof display.category === "string" ? display.category : "",
				author,
				homepage: typeof display.homepage === "string" ? display.homepage : "",
				repository: typeof display.repository === "string" ? display.repository : "",
				license: typeof display.license === "string" ? display.license : "",
				keywords: Array.isArray(display.keywords) ? display.keywords : [],
				icon: isObject(display.icon) ? display.icon : {
					kind: "none",
					url: null
				}
			};
		}
		/** Only https links render as external anchors. */
		function httpsUrl(value) {
			return typeof value === "string" && /^https:\/\//iu.test(value) ? value : "";
		}
		/** Icon src: only the same-origin /icon route, https links, or allowed data rasters. */
		function iconSrc(icon) {
			if (!isObject(icon)) return "";
			if (icon.kind === "route" && typeof icon.url === "string" && icon.url.startsWith("/agent-plugin/api/icon")) return icon.url;
			if (icon.kind === "http" && typeof icon.url === "string" && httpsUrl(icon.url) !== "") return icon.url;
			if (icon.kind === "data" && typeof icon.url === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/iu.test(icon.url)) return icon.url;
			return "";
		}
		/** Search match: name/display/description/category/author/keywords/market, case-insensitive substring. */
		function matchQuery(item, query, localeId) {
			const keyword = String(query ?? "").trim().toLowerCase();
			if (keyword === "") return true;
			const record = isObject(item) ? item : {};
			const display = displayOf(item, localeId);
			const market = isObject(record.market) ? record.market : {};
			return [
				record.name,
				display.title,
				display.description,
				display.category,
				display.author && display.author.name,
				...display.keywords,
				market.name,
				market.title
			].some((value) => typeof value === "string" && value.toLowerCase().includes(keyword));
		}
		/** Market order: lastRefreshed descending, missing sinks to the bottom, ties by name. */
		function orderMarkets(markets) {
			return [...Array.isArray(markets) ? markets : []].sort((left, right) => {
				const a = left;
				const b = right;
				const leftTime = a && typeof a.lastRefreshed === "string" && a.lastRefreshed !== "" ? Date.parse(a.lastRefreshed) : 0;
				const rightTime = b && typeof b.lastRefreshed === "string" && b.lastRefreshed !== "" ? Date.parse(b.lastRefreshed) : 0;
				const leftValid = Number.isFinite(leftTime) && leftTime > 0;
				const rightValid = Number.isFinite(rightTime) && rightTime > 0;
				if (leftValid !== rightValid) return leftValid ? -1 : 1;
				if (leftValid && rightValid && leftTime !== rightTime) return rightTime - leftTime;
				const leftName = String(a && (a.title || a.name) || "");
				const rightName = String(b && (b.title || b.name) || "");
				return leftName.localeCompare(rightName);
			});
		}
		/** Personal section: items grouped by market source. */
		function groupItemsByMarket(items, markets) {
			const sortedMarkets = orderMarkets(markets);
			const buckets = /* @__PURE__ */ new Map();
			for (const item of Array.isArray(items) ? items : []) {
				const record = isObject(item) ? item : {};
				const market = isObject(record.market) ? record.market : null;
				const marketId = market ? String(market.id ?? "") : "";
				const bucket = buckets.get(marketId);
				if (bucket) bucket.push(record);
				else buckets.set(marketId, [record]);
			}
			const groups = [];
			for (const market of sortedMarkets) {
				const list = buckets.get(String(market.id ?? "")) ?? [];
				if (list.length === 0) continue;
				groups.push({
					market,
					items: [...list]
				});
				buckets.delete(String(market.id ?? ""));
			}
			for (const [marketId, list] of buckets) {
				if (list.length === 0) continue;
				const first = list[0];
				const market = (first && isObject(first.market) ? first.market : null) ?? {
					id: marketId,
					name: marketId,
					title: marketId
				};
				groups.push({
					market,
					items: [...list]
				});
			}
			for (const group of groups) group.items.sort((left, right) => displayOf(left, "").title.localeCompare(displayOf(right, "").title));
			return groups;
		}
		/** Updatable judgment: only `available` counts; `unknown` never misreports. */
		function updateAvailable(entity) {
			const record = isObject(entity) ? entity : null;
			return (record && isObject(record.update) ? record.update : null)?.state === "available";
		}
		/** Display names for a collapse row. */
		function displayNames(items, localeId, limit) {
			return items.slice(0, limit).map((item) => displayOf(item, localeId).title);
		}
		// src/client/store.ts
		/**
		* Client state of the plugin panel: a small snapshot-store engine (official
		* `createSnapshotStore` shape — getSnapshot/subscribe/update/set, stable
		* snapshot references, subscriber-safe notification) plus the hub controller
		* whose actions are the complete mutation API over the plugin HTTP API.
		*
		* Components never touch this module's sources directly: the slot
		* registration binds `hooks.hub` to a `useHub` selector hook and passes the
		* action callbacks through the inject face.
		*
		* @module dsh-agent-extension/client/store
		*/
		/** Create a snapshot store: stable snapshots, subscriber-safe dispatch. */
		function createSnapshotStore(init) {
			const listeners = /* @__PURE__ */ new Set();
			let state = init;
			return {
				getSnapshot: () => state,
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				update(mutator) {
					state = {
						...state,
						...mutator(state)
					};
					notify(listeners);
				},
				set(next) {
					state = next;
					notify(listeners);
				}
			};
		}
		/** Notify an observer set without letting one callback starve the rest. */
		function notify(listeners) {
			for (const listener of [...listeners]) try {
				listener();
			} catch {}
		}
		/** Initial client state. */
		function initialHubState() {
			return {
				status: "loading",
				error: "",
				snapshot: null,
				sectionTab: "plugins",
				view: "store",
				storeTab: "sources",
				storeSourceFilter: "",
				detailReturn: "store",
				marketDetail: null,
				marketPluginKey: null,
				detailKey: null,
				detail: null,
				detailStatus: "idle",
				detailError: "",
				query: "",
				manageQuery: "",
				manageFilter: "all",
				collapsed: {},
				busy: {},
				capBusy: {},
				marketBusy: {},
				loading: false,
				refreshing: false,
				updatingAll: false,
				dialogs: [],
				toasts: [],
				localeId: ""
			};
		}
		/**
		* Identity selector. The host binds `use<Name>` hooks straight onto
		* `useSyncExternalStoreWithSelector`, whose selector is required — a no-arg
		* call crashes with "selector is not a function", so whole-snapshot
		* subscriptions pass this explicitly.
		*/
		function identity(state) {
			return state;
		}
		/** Create the panel controller (one per apply; disposed with the plugin). */
		function createHubController(options) {
			const { translate: t, getLocaleId, openNativePath } = options;
			const store = createSnapshotStore({
				...initialHubState(),
				localeId: getLocaleId()
			});
			let started = false;
			let queue = Promise.resolve();
			let toastSeq = 0;
			let dialogSeq = 0;
			let disposed = false;
			const set = (patch) => {
				if (disposed) return;
				store.update((state) => typeof patch === "function" ? patch(state) : patch);
			};
			const toast = (kind, message, durationMs = 4500) => {
				if (disposed || typeof message !== "string" || message === "") return;
				toastSeq += 1;
				const id = toastSeq;
				set((state) => ({ toasts: [...state.toasts, {
					id,
					kind,
					message
				}].slice(-5) }));
				if (typeof window !== "undefined" && typeof window.setTimeout === "function") window.setTimeout(() => dismissToast(id), durationMs);
			};
			const dismissToast = (id) => {
				set((state) => ({ toasts: state.toasts.filter((toastItem) => toastItem.id !== id) }));
			};
			const pushDialog = (dialog) => {
				dialogSeq += 1;
				const id = `dialog-${dialogSeq}`;
				set((state) => ({ dialogs: [...state.dialogs, {
					...dialog,
					id
				}] }));
				return id;
			};
			const closeDialog = (id) => {
				set((state) => ({ dialogs: id === void 0 ? [] : state.dialogs.filter((dialog) => dialog.id !== id) }));
			};
			const setBusy = (key, label) => {
				set((state) => {
					const busy = { ...state.busy };
					if (label !== "") busy[key] = label;
					else delete busy[key];
					return { busy };
				});
			};
			const capBusyId = (pluginKey, kind, capability) => `${pluginKey}#${kind}:${capability}`;
			const setCapBusy = (pluginKey, kind, capability, busy) => {
				const id = capBusyId(pluginKey, kind, capability);
				set((state) => {
					const capBusy = { ...state.capBusy };
					if (busy) capBusy[id] = true;
					else delete capBusy[id];
					return { capBusy };
				});
			};
			const isCapBusy = (pluginKey, kind, capability) => {
				return Boolean(store.getSnapshot().capBusy[capBusyId(pluginKey, kind, capability)]);
			};
			let nativeOpenBusy = false;
			/**
			* Open one memory's body-only markdown in the user's associated system app.
			* The derived file keeps YAML frontmatter out of the editor view.
			*/
			const openMemoryInApp = (target) => {
				if (nativeOpenBusy) return;
				if (openNativePath === void 0) {
					toast("warn", t("memoryOpenNativeUnavailable"));
					return;
				}
				nativeOpenBusy = true;
				(async () => {
					try {
						const query = new URLSearchParams({
							scope: target.scope,
							id: target.id
						});
						if (target.scope === "project") query.set("project", target.project);
						const preview = await api(`/memory/preview-file?${query.toString()}`);
						const path = typeof preview.path === "string" ? preview.path : "";
						if (path === "") throw new ApiError(t("unknownError"), "internal");
						const result = await openNativePath(path);
						if (result.unavailable === true) toast("warn", t("memoryOpenNativeUnavailable"));
						else if (!result.ok) {
							const detail = result.error?.message !== void 0 && result.error.message !== "" ? result.error.message : t("unknownError");
							toast("error", t("memoryOpenNativeFailed", { message: detail }));
						}
					} catch (error) {
						toast("error", t("memoryOpenNativeFailed", { message: errorMessageFor(error, t) }));
					} finally {
						nativeOpenBusy = false;
					}
				})();
			};
			const setMarketBusy = (id, label) => {
				set((state) => {
					const marketBusy = { ...state.marketBusy };
					if (label !== "") marketBusy[id] = label;
					else delete marketBusy[id];
					return { marketBusy };
				});
			};
			/** Serialize mutating tasks; failures surface as error toasts. */
			const enqueue = (task) => {
				queue = queue.then(async () => {
					try {
						await task();
					} catch (error) {
						toast("error", errorMessageFor(error, t));
					}
				});
				return queue;
			};
			const load = async () => {
				if (!store.getSnapshot().snapshot) set({ status: "loading" });
				set({ loading: true });
				try {
					const snapshot = await api("/store");
					set({
						snapshot,
						status: "ready",
						error: ""
					});
				} catch (error) {
					set((state) => ({
						status: state.snapshot ? "ready" : "error",
						error: errorMessageFor(error, t)
					}));
				} finally {
					set({ loading: false });
				}
			};
			const loadDetail = async (force) => {
				const key = store.getSnapshot().detailKey;
				if (!key) return;
				const snapshot = store.getSnapshot().snapshot;
				if (!snapshot) return;
				const installed = (snapshot.installed ?? []).find((item) => item.key === key) ?? null;
				const item = (snapshot.items ?? []).find((entry) => entry.key === key) ?? null;
				set({
					detailStatus: "loading",
					detailError: ""
				});
				try {
					let data;
					if (installed) data = await api(`/describe?key=${encodeURIComponent(key)}`, { timeoutMs: 6e4 });
					else if (force && item) data = await api("/describe", {
						method: "POST",
						body: {
							market: item.market ? String(item.market.id ?? "") : "",
							name: item.name,
							fetch: true
						},
						timeoutMs: 18e4
					});
					else if (item) {
						const market = item.market ? String(item.market.id ?? "") : "";
						data = await api(`/describe?market=${encodeURIComponent(market)}&name=${encodeURIComponent(String(item.name ?? ""))}`, { timeoutMs: 6e4 });
					} else throw new ApiError(t("unknownError"), "not_found");
					if (store.getSnapshot().detailKey === key) set({
						detail: data,
						detailStatus: "ready"
					});
				} catch (error) {
					if (store.getSnapshot().detailKey === key) set({
						detailStatus: "error",
						detailError: errorMessageFor(error, t)
					});
				}
			};
			const actions = {
				init() {
					if (started) return;
					started = true;
					load();
				},
				load,
				openStore() {
					set({
						view: "store",
						detailKey: null,
						detail: null,
						detailStatus: "idle",
						detailError: "",
						marketDetail: null,
						marketPluginKey: null
					});
				},
				openManage() {
					set({
						view: "manage",
						detailKey: null,
						detail: null,
						detailStatus: "idle",
						detailError: ""
					});
				},
				setSectionTab(sectionTab) {
					set({ sectionTab });
				},
				openDetail(key, from = "store") {
					set({
						view: "detail",
						detailReturn: from,
						detailKey: key,
						detail: null,
						detailStatus: "loading",
						detailError: ""
					});
					loadDetail(false);
				},
				backFromDetail() {
					if (store.getSnapshot().detailReturn === "market" && store.getSnapshot().marketDetail !== null) {
						set({
							view: "market",
							detailKey: null,
							detail: null,
							detailStatus: "idle",
							detailError: ""
						});
						return;
					}
					actions.openStore();
				},
				openMarketDetail(entry, refresh = false) {
					const id = String(entry.id ?? "");
					const location = String(entry.location ?? "");
					if (id === "" || location === "") return;
					const state = store.getSnapshot();
					const matched = addedMarketFor((state.snapshot ?? {}).markets ?? [], location);
					const display = displayOf(RECOMMENDED_SOURCES.find((source) => source.id === id) ?? entry, getLocaleId());
					const previous = state.marketDetail;
					const previousData = previous?.entryId === id && previous.status === "ready" ? previous.data ?? null : null;
					let instantData = null;
					if (matched !== null) instantData = { plugins: ((state.snapshot ?? {}).items ?? []).filter((item) => (item.market ?? {}).id === matched.id) };
					const data = instantData ?? previousData;
					const ready = instantData !== null || !refresh && previousData !== null;
					set({
						view: "market",
						marketPluginKey: null,
						marketDetail: {
							entryId: id,
							title: display.title,
							location,
							status: ready ? "ready" : "loading",
							error: "",
							data
						}
					});
					if (ready) return;
					(async () => {
						try {
							const fetched = await api("/market/preview", {
								method: "POST",
								body: {
									location,
									...refresh ? { refresh: true } : {}
								},
								timeoutMs: 18e4
							});
							if (store.getSnapshot().marketDetail?.entryId === id) set((current) => ({ marketDetail: current.marketDetail ? {
								...current.marketDetail,
								status: "ready",
								error: "",
								data: fetched
							} : null }));
						} catch (error) {
							if (store.getSnapshot().marketDetail?.entryId === id) set((current) => ({ marketDetail: current.marketDetail ? {
								...current.marketDetail,
								status: "error",
								error: errorMessageFor(error, t)
							} : null }));
						}
					})();
				},
				closeMarketDetail() {
					set({
						view: "store",
						marketDetail: null,
						marketPluginKey: null
					});
				},
				openMarketPlugin(key) {
					set({ marketPluginKey: key });
				},
				closeMarketPlugin() {
					set({ marketPluginKey: null });
				},
				openMemoryInApp,
				loadDetail,
				setQuery(query) {
					set({ query });
				},
				setManageQuery(manageQuery) {
					set({ manageQuery });
				},
				setManageFilter(manageFilter) {
					set({ manageFilter });
				},
				setStoreTab(storeTab) {
					set({ storeTab });
				},
				setStoreSourceFilter(storeSourceFilter) {
					set({ storeSourceFilter });
				},
				setLocaleId(localeId) {
					set({ localeId });
				},
				toggleCollapse(groupKey) {
					set((state) => {
						const collapsed = { ...state.collapsed };
						if (collapsed[groupKey]) delete collapsed[groupKey];
						else collapsed[groupKey] = true;
						return { collapsed };
					});
				},
				async refreshAll() {
					if (store.getSnapshot().refreshing) return;
					set({ refreshing: true });
					try {
						const result = await api("/market/refresh", {
							method: "POST",
							body: {},
							timeoutMs: 18e4
						});
						await load();
						const updates = (store.getSnapshot().snapshot?.installed ?? []).filter((item) => updateAvailable(item)).length;
						toast("success", updates > 0 ? t("checkFound", { count: updates }) : t("checkNone"));
						const failures = result?.failures ?? [];
						if (failures.length > 0) toast("warn", t("refreshPartial", { count: failures.length }));
					} catch (error) {
						toast("error", errorMessageFor(error, t));
					} finally {
						set({ refreshing: false });
					}
				},
				install(item) {
					if (store.getSnapshot().busy[item.key]) return;
					setBusy(item.key, "install");
					enqueue(async () => {
						try {
							await api("/install", {
								method: "POST",
								body: {
									name: item.name,
									market: item.market?.id
								},
								timeoutMs: 18e4
							});
							await load();
							const state = store.getSnapshot();
							if (state.view === "detail" && state.detailKey === item.key) await loadDetail(false);
							toast("success", t("installedToast", { name: displayOf(item, getLocaleId()).title }));
						} finally {
							setBusy(item.key, "");
						}
					});
				},
				update(item) {
					if (store.getSnapshot().busy[item.key]) return;
					setBusy(item.key, "update");
					enqueue(async () => {
						try {
							const result = await api("/update", {
								method: "POST",
								body: { name: item.key },
								timeoutMs: 18e4
							});
							await load();
							const state = store.getSnapshot();
							if (state.view === "detail" && state.detailKey === item.key) await loadDetail(false);
							const name = displayOf(item, getLocaleId()).title;
							toast("success", result?.changed === false ? t("upToDate", { name }) : t("updatedToast", { name }));
						} finally {
							setBusy(item.key, "");
						}
					});
				},
				updateAll() {
					if (store.getSnapshot().updatingAll) return;
					set({ updatingAll: true });
					enqueue(async () => {
						try {
							const result = await api("/update-all", {
								method: "POST",
								body: {},
								timeoutMs: 3e5
							});
							await load();
							const succeeded = result?.succeeded ?? [];
							const failed = result?.failed ?? [];
							if (result?.aborted === true) toast("warn", t("updateAllAborted", { count: succeeded.length }));
							else if (failed.length > 0) {
								const failedNames = failed.map((entry) => String(entry.key ?? ""));
								const plugins = failedNames.length > 3 ? `${failedNames.slice(0, 3).join("、")} ${t("andMore", { count: failedNames.length - 3 })}` : failedNames.join("、");
								toast("warn", t("updateAllPartial", {
									succeeded: succeeded.length,
									failed: failed.length,
									plugins
								}));
							} else toast("success", t("updateAllDone", { count: succeeded.length }));
						} finally {
							set({ updatingAll: false });
						}
					});
				},
				toggleEnabled(entity, enabled) {
					const key = entity.key;
					if (store.getSnapshot().busy[key]) return;
					setBusy(key, "toggle");
					enqueue(async () => {
						try {
							await api("/enable", {
								method: "POST",
								body: {
									name: key,
									enabled
								}
							});
							await load();
							const state = store.getSnapshot();
							if (state.view === "detail" && state.detailKey === key) await loadDetail(false);
							const name = displayOf(entity, getLocaleId()).title;
							toast("success", enabled ? t("enabledToast", { name }) : t("disabledToast", { name }));
						} finally {
							setBusy(key, "");
						}
					});
				},
				askUninstall(entity) {
					const name = displayOf(entity, getLocaleId()).title;
					pushDialog({
						kind: "confirm",
						title: t("uninstallTitle", { name }),
						message: t("uninstallDescription"),
						confirmLabel: t("uninstall"),
						danger: true,
						onConfirm: async () => {
							await api("/uninstall", {
								method: "POST",
								body: { name: entity.key }
							});
							await load();
							const state = store.getSnapshot();
							if (state.view === "detail" && state.detailKey === entity.key) actions.openStore();
							toast("success", t("uninstalledToast", { name }));
						}
					});
				},
				askRollback(record, targetVersion) {
					const versions = record.previousVersions ?? [];
					const wanted = typeof targetVersion === "string" ? targetVersion : "";
					const target = wanted !== "" ? versions.find((item) => item.version === wanted && item.available !== false) : versions.filter((item) => item.available).slice(-1)[0];
					if (!target) return;
					const name = displayOf(record, getLocaleId()).title;
					pushDialog({
						kind: "confirm",
						title: t("rollbackTitle", { name }),
						message: t("rollbackDescription", { version: target.version }),
						confirmLabel: t("rollback"),
						danger: false,
						onConfirm: async () => {
							await api("/rollback", {
								method: "POST",
								body: {
									name: record.key,
									version: String(target.version)
								}
							});
							await load();
							await loadDetail(false);
							toast("success", t("rollbackToast", {
								name,
								version: String(target.version)
							}));
						}
					});
				},
				toggleCapability(pluginKey, kind, capability, enabled) {
					if (isCapBusy(pluginKey, kind, capability)) return;
					setCapBusy(pluginKey, kind, capability, true);
					enqueue(async () => {
						try {
							await api("/capability", {
								method: "POST",
								body: {
									name: pluginKey,
									kind,
									capability,
									enabled
								}
							});
							await load();
							await loadDetail(false);
						} finally {
							setCapBusy(pluginKey, kind, capability, false);
						}
					});
				},
				async addMarketSource(location, name) {
					const data = await api("/market/add", {
						method: "POST",
						body: {
							location,
							...name !== "" ? { name } : {}
						},
						timeoutMs: 18e4
					});
					await load();
					return data;
				},
				addRecommendedSource(entry) {
					const id = String(entry.id ?? "");
					const busyKey = `rec:${id}`;
					if (id === "" || store.getSnapshot().marketBusy[busyKey]) return;
					setMarketBusy(busyKey, "add");
					enqueue(async () => {
						try {
							const data = await actions.addMarketSource(String(entry.location ?? ""), "");
							const detected = data.detectedType === "git" ? t("detectedGit") : data.detectedType === "url" ? t("detectedUrl") : t("detectedLocal");
							const market = data.market ?? {};
							toast("success", t("addedToast", {
								name: String(market.title || market.name || String(entry.location ?? "")),
								type: detected,
								count: typeof data.pluginCount === "number" ? data.pluginCount : 0
							}));
						} finally {
							setMarketBusy(busyKey, "");
						}
					});
				},
				async refreshMarket(id) {
					if (store.getSnapshot().marketBusy[id]) return;
					setMarketBusy(id, "refresh");
					try {
						const result = await api("/market/refresh", {
							method: "POST",
							body: { id },
							timeoutMs: 18e4
						});
						await load();
						const market = (store.getSnapshot().snapshot?.markets ?? []).find((entry) => entry.id === id) ?? {};
						const failures = result?.failures ?? [];
						if (failures.length > 0) toast("warn", String(failures[0]?.error ?? t("unknownError")));
						else toast("success", t("refreshDone", { name: String(market.title || market.name || id) }));
					} finally {
						setMarketBusy(id, "");
					}
				},
				removeMarket(market) {
					const name = String(market.title || market.name || market.id);
					pushDialog({
						kind: "confirm",
						title: t("removeMarketTitle"),
						message: t("removeMarketDescription"),
						confirmLabel: t("remove"),
						danger: true,
						onConfirm: async () => {
							setMarketBusy(String(market.id), "remove");
							try {
								const result = await api("/market/remove", {
									method: "POST",
									body: { id: market.id },
									timeoutMs: 6e4
								});
								await load();
								const orphaned = result?.orphaned ?? [];
								if (orphaned.length > 0) toast("warn", t("orphanedToast", {
									name,
									count: orphaned.length
								}));
								else toast("success", t("removedMarketToast", { name }));
							} finally {
								setMarketBusy(String(market.id), "");
							}
						}
					});
				},
				openSources() {
					pushDialog({ kind: "sources" });
				},
				openAddSource() {
					pushDialog({ kind: "add-source" });
				},
				closeDialog,
				toast,
				dismissToast,
				isCapBusy,
				destroy() {
					disposed = true;
				}
			};
			return {
				store,
				actions
			};
		}
		// node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		// src/client/icons.tsx
		/** lucide path data, keyed by semantic name. */
		const ICONS = {
			refresh: [
				"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
				"M21 3v5h-5",
				"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
				"M8 16H3v5"
			],
			store: [
				"M2 7l4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7",
				"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8",
				"M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4",
				"M2 7h20",
				"M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"
			],
			plus: ["M12 5v14", "M5 12h14"],
			chevronDown: ["m6 9 6 6 6-6"],
			chevronRight: ["m9 18 6-6-6-6"],
			arrowLeft: ["M19 12H5", "m12 19-7-7 7-7"],
			arrowRight: ["M5 12h14", "m12 5 7 7-7 7"],
			more: [
				[
					5,
					12,
					1.4
				],
				[
					12,
					12,
					1.4
				],
				[
					19,
					12,
					1.4
				]
			],
			download: [
				"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
				"M7 10l5 5 5-5",
				"M12 15V3"
			],
			arrowUpRight: ["M7 7h10v10", "M7 17 17 7"],
			search: [{ circle: [
				11,
				11,
				8
			] }, "m21 21-4.3-4.3"],
			x: ["M18 6 6 18", "m6 6 12 12"],
			external: [
				"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
				"M15 3h6v6",
				"M10 14 21 3"
			],
			power: ["M12 2v10", "M18.4 6.6a9 9 0 1 1-12.77.04"],
			trash: [
				"M3 6h18",
				"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
				"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
				"M10 11v6",
				"M14 11v6"
			],
			alert: [
				"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
				"M12 9v4",
				"M12 17h.01"
			],
			blocks: [{ rect: [
				14,
				3,
				7,
				7,
				1
			] }, "M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"],
			puzzle: ["M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z"],
			rotateCcw: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"],
			server: [
				{ rect: [
					2,
					2,
					20,
					8,
					2
				] },
				{ rect: [
					2,
					14,
					20,
					8,
					2
				] },
				"M6 6h.01",
				"M6 18h.01"
			],
			wand: [
				"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72",
				"m14 7 3 3",
				"M5 6v4",
				"M19 14v4",
				"M10 2v2",
				"M7 8H3",
				"M21 16h-3",
				"M14 22v-2"
			],
			terminal: ["m4 17 6-6-6-6", "M12 19h8"],
			anchor: [
				{ circle: [
					12,
					5,
					3
				] },
				"M12 8v14",
				"M5 12H2a10 10 0 0 0 20 0h-3"
			],
			check: ["M20 6 9 17l-5-5"],
			clipboardCheck: [
				{ rect: [
					8,
					2,
					8,
					4,
					1
				] },
				"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
				"m9 14 2 2 4-4"
			],
			info: [
				{ circle: [
					12,
					12,
					10
				] },
				"M12 16v-4",
				"M12 8h.01"
			],
			folder: ["M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"],
			filter: ["M22 3H2l8 9.46V19l4 2v-8.54L22 3z"],
			settings: ["M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.24a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.24a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.24a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.24a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z", { circle: [
				12,
				12,
				3
			] }]
		};
		/**
		* Render one icon.
		* @param props.size - square size in pixels (default 16).
		* @param props.strokeWidth - stroke weight; inactive panel glyphs use 1.7.
		*/
		function Icon({ name, size = 16, strokeWidth = 2 }) {
			const shape = ICONS[name] ?? [];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				style: {
					display: "block",
					flex: "none"
				},
				children: shape.map((part, index) => {
					if (typeof part === "string") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: part }, index);
					if ("rect" in part) {
						const [x, y, width, height, rx] = part.rect;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
							x,
							y,
							width,
							height,
							rx
						}, index);
					}
					if ("circle" in part) {
						const [cx, cy, r] = part.circle;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
							cx,
							cy,
							r
						}, index);
					}
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: part[0],
						cy: part[1],
						r: part[2],
						fill: "currentColor",
						stroke: "none"
					}, index);
				})
			});
		}
		// src/client/overlay-hooks.ts
		/**
		* Overlay behavior hooks shared by menus and dialogs: Escape-close (capture
		* phase) and focus restore to the trigger on close.
		*
		* @module dsh-agent-extension/client/overlay-hooks
		*/
		/** While open, close on Escape (capture phase so the host shortcut does not double-fire). */
		function useEscapeClose(open, onClose) {
			(0, react.useEffect)(() => {
				if (!open || typeof document === "undefined" || typeof document.addEventListener !== "function") return void 0;
				const onKeyDown = (event) => {
					if (event.key === "Escape") {
						event.stopPropagation();
						onClose();
					}
				};
				document.addEventListener("keydown", onKeyDown, true);
				return () => document.removeEventListener("keydown", onKeyDown, true);
			}, [open, onClose]);
		}
		/** Restore focus to the trigger on the open → closed transition. */
		function useFocusRestore(triggerRef, open) {
			const wasOpen = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (wasOpen.current && !open && triggerRef.current && typeof triggerRef.current.focus === "function") triggerRef.current.focus();
				wasOpen.current = open;
			}, [open, triggerRef]);
		}
		// \0dsh-css:E:\workspace\dsh-plugins\packages\dsh-agent-extension\src\client\Menu.module.css.mjs
		const css$9 = ".mPZFjG_wrap{display:inline-flex;position:relative}.mPZFjG_trigger{border-radius:var(--dsw-radius-sm);width:32px;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;justify-content:center;align-items:center;display:inline-flex}.mPZFjG_trigger:disabled{cursor:not-allowed}.mPZFjG_trigger:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}@media (hover:hover){.mPZFjG_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}.mPZFjG_backdrop{z-index:40;background:0 0;position:fixed;inset:0}.mPZFjG_menu{z-index:41;border-radius:var(--dsw-radius-lg);background:var(--dsw-menu-surface-fill);min-width:168px;backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-panel);border:0;padding:4px;position:absolute;top:calc(100% + 4px);right:0}.mPZFjG_menuLeft{min-width:100%;max-width:min(320px,100vw - 32px);left:0;right:auto}.mPZFjG_item{border-radius:var(--dsw-radius-md);width:100%;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;white-space:nowrap;cursor:pointer;background:0 0;border:0;align-items:center;gap:8px;padding:7px 10px;font-size:14px;display:flex;overflow:hidden}.mPZFjG_item:disabled{opacity:.4;cursor:not-allowed}.mPZFjG_item:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}@media (hover:hover){.mPZFjG_item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}.mPZFjG_itemDanger{color:var(--dsw-alias-state-error-primary)}.mPZFjG_itemSelected{color:var(--dsw-alias-state-business-primary)}.mPZFjG_itemSelected>svg{flex:none}.mPZFjG_itemLabel{text-overflow:ellipsis;flex:1;min-width:0;overflow:hidden}.mPZFjG_separator{background:var(--dsw-alias-border-l2);height:.5px;margin:4px 6px}";
		const tagId$9 = "dsh-agent-extension/Menu.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$9) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-agent-extension";
			tag.dataset.pluginCss = tagId$9;
			tag.textContent = css$9;
			document.head.appendChild(tag);
		}
		var Menu_module_css_default = {
			"backdrop": "mPZFjG_backdrop",
			"item": "mPZFjG_item",
			"itemDanger": "mPZFjG_itemDanger",
			"itemLabel": "mPZFjG_itemLabel",
			"itemSelected": "mPZFjG_itemSelected",
			"menu": "mPZFjG_menu",
			"menuLeft": "mPZFjG_menuLeft",
			"separator": "mPZFjG_separator",
			"trigger": "mPZFjG_trigger",
			"wrap": "mPZFjG_wrap"
		};
		// \0dsh-css:E:\workspace\dsh-plugins\packages\dsh-agent-extension\src\client\controls.module.css.mjs
		const css$8 = "._5k4UIq_button{box-sizing:border-box;border-radius:var(--dsw-radius-md);height:36px;color:var(--dsw-alias-label-primary);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:0;justify-content:center;align-items:center;gap:6px;padding:0 14px;font-size:14px;font-weight:500;line-height:22px;transition:background .12s,color .12s,opacity .12s;display:inline-flex}._5k4UIq_button:disabled{cursor:not-allowed;opacity:.4}._5k4UIq_button:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}._5k4UIq_primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}._5k4UIq_secondary{background:var(--dsw-alias-bg-layer-3);box-shadow:inset 0 0 0 var(--dsh-hairline-width,.5px) var(--dsw-alias-border-l3)}._5k4UIq_danger{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-foreground)}@media (hover:hover){._5k4UIq_primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}._5k4UIq_secondary:hover:not(:disabled),._5k4UIq_ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}._5k4UIq_danger:hover:not(:disabled){background:var(--dsw-alias-state-error-secondary)}}._5k4UIq_primary:active:not(:disabled),._5k4UIq_secondary:active:not(:disabled),._5k4UIq_ghost:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}._5k4UIq_pill{corner-shape:round;border-radius:999px}._5k4UIq_iconButton{box-sizing:border-box;border-radius:var(--dsw-radius-sm);width:32px;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;justify-content:center;align-items:center;display:inline-flex}._5k4UIq_iconDanger{color:var(--dsw-alias-state-error-primary)}@media (hover:hover){._5k4UIq_iconButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}._5k4UIq_iconButton:disabled{opacity:.45;cursor:not-allowed}._5k4UIq_iconButton:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}._5k4UIq_buttonOutline{box-sizing:border-box;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);width:32px;height:32px;box-shadow:inset 0 0 0 var(--dsh-hairline-width,.5px) var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);cursor:pointer;border:.5px solid #0000;justify-content:center;align-items:center;padding:0;display:inline-flex}._5k4UIq_buttonOutline:disabled{opacity:.4;cursor:not-allowed}._5k4UIq_buttonOutline:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}@media (hover:hover){._5k4UIq_buttonOutline:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}._5k4UIq_badge{border:.5px solid var(--dsw-alias-border-l3);corner-shape:round;white-space:nowrap;height:20px;color:var(--dsw-alias-label-secondary);background:0 0;border-radius:999px;flex:none;align-items:center;gap:4px;padding:0 8px;font-size:11px;line-height:1;display:inline-flex}._5k4UIq_badgeSuccess{background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary);border-color:#0000}._5k4UIq_badgeWarn{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-primary);border-color:#0000}._5k4UIq_badgeError{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);color:var(--dsw-alias-state-error-primary);border-color:#0000}._5k4UIq_badgePlain{background:var(--dsw-alias-interactive-bg-hover);border-color:#0000}._5k4UIq_updateBadge{corner-shape:round;white-space:nowrap;height:20px;color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-tertiary);border-radius:999px;flex:none;align-items:center;gap:4px;padding:0 8px;font-size:11px;line-height:1;display:inline-flex}._5k4UIq_spinner{border:2px solid color-mix(in srgb, currentColor 30%, transparent);corner-shape:round;border-top-color:currentColor;border-radius:50%;flex:none;width:14px;height:14px;animation:.8s linear infinite _5k4UIq_spin;display:inline-block}._5k4UIq_spinnerLarge{border-width:2.5px;width:20px;height:20px}@keyframes _5k4UIq_spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){._5k4UIq_spinner{animation:none}}._5k4UIq_select{min-width:0;display:flex;position:relative}._5k4UIq_selectField{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);width:100%;min-width:0;height:36px;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;justify-content:space-between;align-items:center;gap:8px;padding:0 10px;font-size:14px;display:flex}._5k4UIq_selectFieldSm{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);min-width:0;height:28px;color:var(--dsw-alias-label-secondary);font:inherit;text-align:left;white-space:nowrap;cursor:pointer;justify-content:space-between;align-items:center;gap:6px;padding:0 8px;font-size:12px;display:flex}._5k4UIq_selectField>svg,._5k4UIq_selectFieldSm>svg{color:var(--dsw-alias-label-tertiary);flex:none}._5k4UIq_selectField:focus-visible,._5k4UIq_selectFieldSm:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}@media (hover:hover){._5k4UIq_selectField:hover,._5k4UIq_selectFieldSm:hover{border-color:var(--dsw-alias-border-l4)}}._5k4UIq_selectValue{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}._5k4UIq_selectTrigger{font:inherit;cursor:pointer;background:0 0;border:0;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex;position:relative}._5k4UIq_selectTrigger:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}._5k4UIq_search{flex:none;margin-left:auto;display:inline-flex;position:relative}._5k4UIq_searchActive{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary)}._5k4UIq_searchBackdrop{z-index:40;background:0 0;position:fixed;inset:0}._5k4UIq_searchPopover{z-index:41;border-radius:var(--dsw-radius-md);background:var(--dsw-menu-surface-fill);width:280px;max-width:calc(100vw - 32px);height:40px;backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-panel);border:0;align-items:center;gap:8px;padding:0 8px 0 10px;display:flex;position:absolute;top:calc(100% + 6px);right:0}._5k4UIq_searchPopover>svg{color:var(--dsw-alias-label-tertiary);flex:none}._5k4UIq_searchInput{min-width:0;height:100%;color:var(--dsw-alias-label-primary);font:inherit;background:0 0;border:0;outline:none;flex:1;padding:0;font-size:14px}._5k4UIq_searchInput::placeholder{color:var(--dsw-alias-label-tertiary)}._5k4UIq_searchInput::-webkit-search-decoration,._5k4UIq_searchInput::-webkit-search-cancel-button{-webkit-appearance:none;display:none}._5k4UIq_searchClear{border-radius:var(--dsw-radius-sm);width:24px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;flex:none;justify-content:center;align-items:center;padding:0;display:flex}._5k4UIq_searchClear:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}@media (hover:hover){._5k4UIq_searchClear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}._5k4UIq_avatar{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);width:40px;height:40px;color:var(--dsw-alias-label-secondary);flex:none;justify-content:center;align-items:center;display:flex;overflow:hidden}._5k4UIq_avatarLarge{border-radius:var(--dsw-radius-lg);width:64px;height:64px}._5k4UIq_avatar img{object-fit:contain;width:100%;height:100%}._5k4UIq_placeholder{border:.5px dashed var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);min-height:96px;color:var(--dsw-alias-label-secondary);text-align:center;overflow-wrap:anywhere;justify-content:center;align-items:center;gap:8px;padding:24px 16px;font-size:14px;display:flex}._5k4UIq_placeholderColumn{border:.5px dashed var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);min-height:96px;color:var(--dsw-alias-label-secondary);text-align:center;overflow-wrap:anywhere;flex-direction:column;justify-content:center;align-items:center;gap:12px;padding:24px 16px;font-size:14px;display:flex}._5k4UIq_placeholderTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500}._5k4UIq_placeholderDesc{max-width:420px;font-size:12px}";
		const tagId$8 = "dsh-agent-extension/controls.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$8) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-agent-extension";
			tag.dataset.pluginCss = tagId$8;
			tag.textContent = css$8;
			document.head.appendChild(tag);
		}
		var controls_module_css_default = {
			"avatar": "_5k4UIq_avatar",
			"avatarLarge": "_5k4UIq_avatarLarge",
			"badge": "_5k4UIq_badge",
			"badgeError": "_5k4UIq_badgeError",
			"badgePlain": "_5k4UIq_badgePlain",
			"badgeSuccess": "_5k4UIq_badgeSuccess",
			"badgeWarn": "_5k4UIq_badgeWarn",
			"button": "_5k4UIq_button",
			"buttonOutline": "_5k4UIq_buttonOutline",
			"danger": "_5k4UIq_danger",
			"ghost": "_5k4UIq_ghost",
			"iconButton": "_5k4UIq_iconButton",
			"iconDanger": "_5k4UIq_iconDanger",
			"pill": "_5k4UIq_pill",
			"placeholder": "_5k4UIq_placeholder",
			"placeholderColumn": "_5k4UIq_placeholderColumn",
			"placeholderDesc": "_5k4UIq_placeholderDesc",
			"placeholderTitle": "_5k4UIq_placeholderTitle",
			"primary": "_5k4UIq_primary",
			"search": "_5k4UIq_search",
			"searchActive": "_5k4UIq_searchActive",
			"searchBackdrop": "_5k4UIq_searchBackdrop",
			"searchClear": "_5k4UIq_searchClear",
			"searchInput": "_5k4UIq_searchInput",
			"searchPopover": "_5k4UIq_searchPopover",
			"secondary": "_5k4UIq_secondary",
			"select": "_5k4UIq_select",
			"selectField": "_5k4UIq_selectField",
			"selectFieldSm": "_5k4UIq_selectFieldSm",
			"selectTrigger": "_5k4UIq_selectTrigger",
			"selectValue": "_5k4UIq_selectValue",
			"spin": "_5k4UIq_spin",
			"spinner": "_5k4UIq_spinner",
			"spinnerLarge": "_5k4UIq_spinnerLarge",
			"updateBadge": "_5k4UIq_updateBadge"
		};
		// src/client/controls.tsx
		/**
		* Basic controls of the panel: Button, IconButton, Badge, Spinner, SearchBox,
		* Select, Avatar, and the empty/loading blocks. Pure props components styled
		* with the host theme tokens (see controls.module.css); markup and behavior
		* follow the official ui-primitives conventions (focus rings, aria labels,
		* disabled opacity) without importing the primitives package.
		*
		* @module dsh-agent-extension/client/controls
		*/
		/** Spinner: ring only, size 14 (or 20 large). */
		function Spinner({ large = false }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: clsx(controls_module_css_default.spinner, large && controls_module_css_default.spinnerLarge),
				"aria-hidden": true
			});
		}
		/**
		* Text button (md: 36px/R12; pill: capsule).
		* @param props.icon - leading lucide icon name.
		*/
		function Button({ variant = "secondary", pill = false, icon, disabled = false, title, onClick, children, type = "button" }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type,
				className: clsx(controls_module_css_default.button, variant === "primary" && controls_module_css_default.primary, variant === "secondary" && controls_module_css_default.secondary, variant === "danger" && controls_module_css_default.danger, variant === "ghost" && controls_module_css_default.ghost, pill && controls_module_css_default.pill),
				disabled,
				title,
				"aria-label": title,
				onClick,
				children: [icon !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
					name: icon,
					size: 14
				}) : null, children]
			});
		}
		/**
		* Square icon button.
		* @param props.busy - show a spinner instead of the glyph.
		* @param props.danger - warn-toned glyph.
		* @param props.outline - outlined square (toolbar shape).
		*/
		function IconButton({ icon, title, disabled = false, onClick, busy = false, danger = false, outline = false }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: clsx(outline ? controls_module_css_default.buttonOutline : controls_module_css_default.iconButton, danger && !outline && controls_module_css_default.iconDanger),
				title,
				"aria-label": title,
				disabled,
				onClick,
				children: busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
					name: icon,
					size: 16
				})
			});
		}
		/** Small status badge. */
		function Badge({ tone, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: clsx(controls_module_css_default.badge, tone === "success" && controls_module_css_default.badgeSuccess, tone === "warn" && controls_module_css_default.badgeWarn, tone === "error" && controls_module_css_default.badgeError, tone === "plain" && controls_module_css_default.badgePlain),
				children
			});
		}
		/** Update-available pill. */
		function UpdateBadge({ label }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: controls_module_css_default.updateBadge,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
					name: "download",
					size: 12
				}), label]
			});
		}
		/**
		* Single-choice dropdown that replaces the native `<select>`: the closed
		* trigger is a themed field, the open menu uses the theme-owned menu material
		* (same surface as Menu), so the popup follows the app palette in light and
		* dark themes. Escape closes, backdrop click closes, focus returns to the
		* trigger on close. ArrowUp/ArrowDown on the trigger open the menu.
		* @param props.size - field geometry: md (36px, form) or sm (28px, toolbars).
		* @param props.align - menu anchor side; a left-anchored menu matches the
		*   trigger width (min-width: 100%).
		* @param props.trigger - custom trigger content (e.g. an icon button); omit to
		*   render the standard value label + chevron field.
		*/
		function Select({ label, title, value, options, onChange, size = "md", align = "left", className, trigger, triggerClassName }) {
			const [open, setOpen] = (0, react.useState)(false);
			const triggerRef = (0, react.useRef)(null);
			useEscapeClose(open, () => {
				setOpen(false);
			});
			useFocusRestore(triggerRef, open);
			const selected = options.find((option) => option.value === value);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(controls_module_css_default.select, className),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					ref: triggerRef,
					className: clsx(trigger === void 0 ? size === "sm" ? controls_module_css_default.selectFieldSm : controls_module_css_default.selectField : controls_module_css_default.selectTrigger, triggerClassName),
					"aria-label": label,
					title,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					onClick: () => {
						setOpen((current) => !current);
					},
					onKeyDown: (event) => {
						if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
						event.preventDefault();
						setOpen(true);
					},
					children: trigger ?? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: controls_module_css_default.selectValue,
						children: selected?.label ?? ""
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
						name: "chevronDown",
						size: 14
					})] })
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: Menu_module_css_default.backdrop,
					onClick: () => {
						setOpen(false);
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: clsx(Menu_module_css_default.menu, align === "left" && Menu_module_css_default.menuLeft),
					role: "menu",
					"aria-label": label,
					children: options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						role: "menuitemradio",
						"aria-checked": option.value === value,
						className: clsx(Menu_module_css_default.item, option.value === value && Menu_module_css_default.itemSelected),
						onClick: () => {
							setOpen(false);
							onChange(option.value);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: Menu_module_css_default.itemLabel,
							children: option.label
						}), option.value === value ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "check",
							size: 14
						}) : null]
					}, option.value))
				})] }) : null]
			});
		}
		/**
		* Compact search control: an outlined icon button with the same 32px geometry
		* as the toolbar icon buttons; clicking it floats an input field below the
		* trigger. The trigger stays marked while a query is active, closing keeps the
		* query, and focus returns to the trigger on close.
		* @param props.clearable - show a clear affordance while text is present.
		*/
		function SearchBox({ value, onChange, placeholder, clearable = false, clearLabel }) {
			const [open, setOpen] = (0, react.useState)(false);
			const triggerRef = (0, react.useRef)(null);
			const inputRef = (0, react.useRef)(null);
			const popoverId = (0, react.useId)();
			useEscapeClose(open, () => {
				setOpen(false);
			});
			useFocusRestore(triggerRef, open);
			(0, react.useEffect)(() => {
				if (!open) return;
				const input = inputRef.current;
				if (!input) return;
				input.focus();
				input.select();
			}, [open]);
			const filtering = value !== "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: controls_module_css_default.search,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					ref: triggerRef,
					className: clsx(controls_module_css_default.buttonOutline, filtering && controls_module_css_default.searchActive),
					title: placeholder,
					"aria-label": placeholder,
					"aria-expanded": open,
					"aria-controls": open ? popoverId : void 0,
					onClick: () => {
						setOpen((current) => !current);
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
						name: "search",
						size: 16
					})
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: controls_module_css_default.searchBackdrop,
					onClick: () => {
						setOpen(false);
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					id: popoverId,
					className: controls_module_css_default.searchPopover,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "search",
							size: 16
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							ref: inputRef,
							type: "search",
							className: controls_module_css_default.searchInput,
							value,
							placeholder,
							"aria-label": placeholder,
							onChange: (event) => onChange(event.target.value)
						}),
						clearable && filtering ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: controls_module_css_default.searchClear,
							title: clearLabel,
							"aria-label": clearLabel,
							onClick: () => onChange(""),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "x",
								size: 14
							})
						}) : null
					]
				})] }) : null]
			});
		}
		/**
		* Plugin avatar: resolved icon when renderable, a neutral Blocks glyph as the
		* missing/failure fallback (no initial-letter decoration).
		*/
		function Avatar({ display, large = false }) {
			const src = iconSrc(display.icon);
			const [failed, setFailed] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				setFailed(false);
			}, [src]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: clsx(controls_module_css_default.avatar, large && controls_module_css_default.avatarLarge),
				children: src !== "" && !failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src,
					alt: "",
					loading: "lazy",
					onError: () => setFailed(true)
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
					name: "blocks",
					size: large ? 24 : 16
				})
			});
		}
		/** Empty-state block (dashed placeholder). */
		function EmptyBlock({ title, description, action }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: controls_module_css_default.placeholderColumn,
				children: [
					title !== void 0 && title !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: controls_module_css_default.placeholderTitle,
						children: title
					}) : null,
					description !== void 0 && description !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: controls_module_css_default.placeholderDesc,
						children: description
					}) : null,
					action ?? null
				]
			});
		}
		/** Loading block with a spinner. */
		function LoadingBlock({ text }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: controls_module_css_default.placeholder,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: text })]
			});
		}
		/** Inline style helper the views use for one-off layout gaps. */
		function columnGap(gap) {
			return {
				display: "flex",
				flexDirection: "column",
				gap
			};
		}
		// \0dsh-css:E:\workspace\dsh-plugins\packages\dsh-agent-extension\src\client\panel.module.css.mjs
		const css$7 = ".X-8QFa_root{height:100%;min-height:0;color:var(--dsw-alias-label-primary);overflow-wrap:break-word;font-size:14px;line-height:1.5;position:relative;overflow:hidden auto;container-type:inline-size}.X-8QFa_root *{box-sizing:border-box}.X-8QFa_page{flex-direction:column;gap:20px;width:100%;max-width:896px;min-height:100%;margin:0 auto;padding:20px 16px 32px;display:flex;position:relative}@container (width>=1024px){.X-8QFa_page{padding-left:32px;padding-right:32px}}.X-8QFa_header{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px 16px;width:100%;max-width:896px;margin:0 auto;padding:20px 16px 0;display:flex}@container (width>=1024px){.X-8QFa_header{padding-left:32px;padding-right:32px}}.X-8QFa_topbar{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;display:flex}.X-8QFa_title{overflow-wrap:anywhere;letter-spacing:-.01em;min-width:0;color:var(--dsw-alias-label-primary);margin:0;font-size:18px;font-weight:600}.X-8QFa_titleRow{align-items:center;gap:8px;min-width:0;display:flex}.X-8QFa_actions{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.X-8QFa_toolbar{flex-wrap:wrap;align-items:center;gap:12px 16px;display:flex}.X-8QFa_toolbarTrail{flex-wrap:wrap;flex:auto;justify-content:flex-end;align-items:center;gap:12px;min-width:0;display:flex}.X-8QFa_segmented{flex-wrap:wrap;align-items:center;gap:6px;display:inline-flex}.X-8QFa_segment{corner-shape:round;color:var(--dsw-alias-label-secondary);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:0;border-radius:999px;align-items:center;gap:6px;padding:4px 12px;font-size:14px;font-weight:500;transition:background .12s,color .12s;display:inline-flex}.X-8QFa_segment:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.X-8QFa_segment[aria-pressed=true],.X-8QFa_segment[aria-selected=true]{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary)}@media (hover:hover){.X-8QFa_segment:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}.X-8QFa_section{flex-direction:column;display:flex}.X-8QFa_sectionHead{justify-content:space-between;align-items:baseline;gap:8px;padding:0 8px 8px;display:flex}.X-8QFa_sectionTitle{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500}.X-8QFa_sectionCount{white-space:nowrap;color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px}.X-8QFa_divider{background:var(--dsw-alias-border-l2);height:.5px}.X-8QFa_grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 24px;margin-top:8px;display:grid}.X-8QFa_recHint{color:var(--dsw-alias-label-secondary);margin:0 8px;font-size:13px}.X-8QFa_recList{flex-direction:column;margin-top:8px;display:flex}.X-8QFa_recRow{border-radius:var(--dsw-radius-sm);width:100%;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:16px;padding:12px 8px;display:flex}.X-8QFa_recRow:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}@media (hover:hover){.X-8QFa_recRow:hover{background:var(--dsw-alias-interactive-bg-hover)}}.X-8QFa_recRow+.X-8QFa_recRow{border-top:.5px solid var(--dsw-alias-border-l3)}.X-8QFa_recMain{flex:1;min-width:0}.X-8QFa_recHead{align-items:center;gap:8px;min-width:0;display:flex}.X-8QFa_recName{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500}.X-8QFa_recDesc{color:var(--dsw-alias-label-secondary);margin-top:2px;font-size:13px}.X-8QFa_recLocation{color:var(--dsw-alias-label-tertiary);word-break:break-all;margin-top:4px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}.X-8QFa_recAction{flex:none;align-items:center;gap:8px;display:flex}.X-8QFa_recChevron{color:var(--dsw-alias-label-tertiary);display:inline-flex}.X-8QFa_pluginDesc{color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 8px 0;font-size:14px}.X-8QFa_gridSingle{grid-template-columns:minmax(0,1fr);margin-top:8px;display:grid}@container (width<=640px){.X-8QFa_grid,.X-8QFa_gridSingle{grid-template-columns:minmax(0,1fr)}}.X-8QFa_collapseRow{border-radius:var(--dsw-radius-md);width:100%;color:var(--dsw-alias-label-secondary);font:inherit;text-align:left;white-space:nowrap;cursor:pointer;background:0 0;border:0;align-items:center;gap:8px;margin-top:8px;padding:8px;font-size:14px;display:flex}.X-8QFa_collapseRow:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}@media (hover:hover){.X-8QFa_collapseRow:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}.X-8QFa_collapseAvatars{flex:none;align-items:center;gap:6px;display:flex}.X-8QFa_collapseLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.X-8QFa_errorBanner{border:.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent);border-radius:var(--dsw-radius-sm);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;word-break:break-word;padding:10px 12px;font-size:13px}.X-8QFa_warningBanner{border:.5px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 35%, transparent);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-primary);word-break:break-word;align-items:flex-start;gap:8px;padding:10px 12px;font-size:13px;display:flex}.X-8QFa_warningBanner>span{overflow-wrap:anywhere;min-width:0}.X-8QFa_inlineButton{color:inherit;font:inherit;cursor:pointer;background:0 0;border:0;align-items:center;gap:4px;padding:0;font-size:13px;display:inline-flex}@media (hover:hover){.X-8QFa_inlineButton:hover{text-decoration:underline}}.X-8QFa_warningBanner .X-8QFa_inlineButton{margin-left:auto}.X-8QFa_footer{color:var(--dsw-alias-label-secondary);flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;padding-top:8px;font-size:12px;display:flex}.X-8QFa_runtimeRow{color:var(--dsw-alias-label-secondary);flex-wrap:wrap;align-items:center;gap:8px;padding-top:8px;font-size:12px;display:flex}.X-8QFa_back{border-radius:var(--dsw-radius-sm);width:fit-content;height:28px;color:var(--dsw-alias-label-secondary);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:0;align-items:center;gap:6px;margin-left:-8px;padding:0 8px;font-size:14px;display:inline-flex}.X-8QFa_back:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}@media (hover:hover){.X-8QFa_back:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}.X-8QFa_mono{color:var(--dsw-alias-label-secondary);word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}.X-8QFa_listBlock{flex-direction:column;gap:6px;display:flex}.X-8QFa_listTitle{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500}.X-8QFa_listRow{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);overflow-wrap:anywhere;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;padding:8px 10px;font-size:13px;display:flex}.X-8QFa_listRowMain{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}";
		const tagId$7 = "dsh-agent-extension/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$7) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-agent-extension";
			tag.dataset.pluginCss = tagId$7;
			tag.textContent = css$7;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"actions": "X-8QFa_actions",
			"back": "X-8QFa_back",
			"collapseAvatars": "X-8QFa_collapseAvatars",
			"collapseLabel": "X-8QFa_collapseLabel",
			"collapseRow": "X-8QFa_collapseRow",
			"divider": "X-8QFa_divider",
			"errorBanner": "X-8QFa_errorBanner",
			"footer": "X-8QFa_footer",
			"grid": "X-8QFa_grid",
			"gridSingle": "X-8QFa_gridSingle",
			"header": "X-8QFa_header",
			"inlineButton": "X-8QFa_inlineButton",
			"listBlock": "X-8QFa_listBlock",
			"listRow": "X-8QFa_listRow",
			"listRowMain": "X-8QFa_listRowMain",
			"listTitle": "X-8QFa_listTitle",
			"mono": "X-8QFa_mono",
			"page": "X-8QFa_page",
			"pluginDesc": "X-8QFa_pluginDesc",
			"recAction": "X-8QFa_recAction",
			"recChevron": "X-8QFa_recChevron",
			"recDesc": "X-8QFa_recDesc",
			"recHead": "X-8QFa_recHead",
			"recHint": "X-8QFa_recHint",
			"recList": "X-8QFa_recList",
			"recLocation": "X-8QFa_recLocation",
			"recMain": "X-8QFa_recMain",
			"recName": "X-8QFa_recName",
			"recRow": "X-8QFa_recRow",
			"root": "X-8QFa_root",
			"runtimeRow": "X-8QFa_runtimeRow",
			"section": "X-8QFa_section",
			"sectionCount": "X-8QFa_sectionCount",
			"sectionHead": "X-8QFa_sectionHead",
			"sectionTitle": "X-8QFa_sectionTitle",
			"segment": "X-8QFa_segment",
			"segmented": "X-8QFa_segmented",
			"title": "X-8QFa_title",
			"titleRow": "X-8QFa_titleRow",
			"toolbar": "X-8QFa_toolbar",
			"toolbarTrail": "X-8QFa_toolbarTrail",
			"topbar": "X-8QFa_topbar",
			"warningBanner": "X-8QFa_warningBanner"
		};
		// src/client/Tabs.tsx
		/**
		* Render a segmented tablist; the caller owns the matching tabpanel.
		* @param props.idPrefix - prefix of the tab element ids (`<prefix>-<value>`).
		* @param props.panelId - id of the tabpanel the tabs control.
		*/
		function Tabs({ items, value, onChange, label, idPrefix, panelId }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.segmented,
				role: "tablist",
				"aria-label": label,
				children: items.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					role: "tab",
					id: `${idPrefix}-${entry.value}`,
					className: panel_module_css_default.segment,
					"aria-selected": value === entry.value,
					"aria-controls": panelId,
					tabIndex: value === entry.value ? 0 : -1,
					onClick: () => onChange(entry.value),
					onKeyDown: (event) => {
						if (![
							"ArrowLeft",
							"ArrowUp",
							"ArrowRight",
							"ArrowDown",
							"Home",
							"End"
						].includes(event.key)) return;
						event.preventDefault();
						const current = items.findIndex((item) => item.value === value);
						const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (current + items.length - 1) % items.length : (current + 1) % items.length;
						const target = items[next];
						if (!target) return;
						onChange(target.value);
						event.currentTarget.parentElement?.querySelectorAll("[role=\"tab\"]")[next]?.focus();
					},
					children: entry.label
				}, entry.value))
			});
		}
		// src/client/AddMenu.tsx
		/**
		* Topbar "Add" dropdown with the add-marketplace entry.
		*
		* @module dsh-agent-extension/client/AddMenu
		*/
		/** Render the add dropdown. */
		function AddMenu({ t, onAdd }) {
			const [open, setOpen] = (0, react.useState)(false);
			const wrapRef = (0, react.useRef)(null);
			useEscapeClose(open, () => {
				setOpen(false);
			});
			useFocusRestore(wrapRef, open);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: wrapRef,
				className: Menu_module_css_default.wrap,
				tabIndex: -1,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
					variant: "secondary",
					onClick: (event) => {
						event.stopPropagation();
						setOpen((value) => !value);
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "plus",
							size: 14
						}),
						t("add"),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "chevronDown",
							size: 14
						})
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: Menu_module_css_default.backdrop,
					onClick: () => {
						setOpen(false);
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: Menu_module_css_default.menu,
					role: "menu",
					style: { minWidth: 200 },
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						role: "menuitem",
						className: Menu_module_css_default.item,
						onClick: () => {
							setOpen(false);
							onAdd();
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "plus",
							size: 15
						}), t("addMarketplace")]
					})
				})] }) : null]
			});
		}
		// src/client/Menu.tsx
		/**
		* Dropdown menu: trigger button, transparent backdrop, and an elevated menu
		* surface built on the theme-owned menu material (`--dsw-menu-surface-fill` +
		* `--dsw-menu-backdrop-filter`), outer R16 with 4px padding and R12 items per
		* the radius standard. Escape closes (capture phase so the host shortcut does
		* not double-fire), and focus restores to the trigger on close.
		*
		* @module dsh-agent-extension/client/Menu
		*/
		/** Card row menu ("more actions"). */
		function Menu({ t, items, busy = false }) {
			const [open, setOpen] = (0, react.useState)(false);
			const triggerRef = (0, react.useRef)(null);
			useEscapeClose(open, () => {
				setOpen(false);
			});
			useFocusRestore(triggerRef, open);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Menu_module_css_default.wrap,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					ref: triggerRef,
					className: Menu_module_css_default.trigger,
					title: t("moreActions"),
					"aria-label": t("moreActions"),
					"aria-haspopup": "menu",
					"aria-expanded": open,
					disabled: busy,
					onClick: (event) => {
						event.stopPropagation();
						setOpen((value) => !value);
					},
					children: busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
						name: "more",
						size: 16
					})
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: Menu_module_css_default.backdrop,
					onClick: () => {
						setOpen(false);
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: Menu_module_css_default.menu,
					role: "menu",
					children: items.filter(Boolean).map((entry, index) => entry.sep ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: Menu_module_css_default.separator }, `sep-${index}`) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						role: "menuitem",
						className: clsx(Menu_module_css_default.item, entry.danger && Menu_module_css_default.itemDanger),
						disabled: entry.disabled === true,
						onClick: (event) => {
							event.stopPropagation();
							setOpen(false);
							entry.onSelect();
						},
						children: [entry.icon !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: entry.icon,
							size: 16
						}) : null, entry.label]
					}, entry.key ?? index))
				})] }) : null]
			});
		}
		// \0dsh-css:E:\workspace\dsh-plugins\packages\dsh-agent-extension\src\client\Switch.module.css.mjs
		const css$6 = ".G-jj1a_switch{box-sizing:border-box;corner-shape:round;background:var(--dsw-alias-border-l3);cursor:pointer;border:0;border-radius:999px;flex:none;width:36px;height:20px;padding:2px;transition:background .15s;position:relative}.G-jj1a_switch[aria-checked=true]{background:var(--dsw-alias-brand-primary)}.G-jj1a_switch:disabled{cursor:not-allowed;opacity:.5}.G-jj1a_switch:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.G-jj1a_thumb{corner-shape:round;background:var(--dsw-alias-label-primary-foreground);border-radius:50%;width:16px;height:16px;transition:transform .12s;display:block}.G-jj1a_switch[aria-checked=false] .G-jj1a_thumb{background:var(--dsw-alias-switch-thumb)}.G-jj1a_switch[aria-checked=true] .G-jj1a_thumb{transform:translate(16px)}";
		const tagId$6 = "dsh-agent-extension/Switch.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$6) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-agent-extension";
			tag.dataset.pluginCss = tagId$6;
			tag.textContent = css$6;
			document.head.appendChild(tag);
		}
		var Switch_module_css_default = {
			"switch": "G-jj1a_switch",
			"thumb": "G-jj1a_thumb"
		};
		// src/client/Switch.tsx
		/**
		* Render a toggle switch.
		* @param props.checked - the current state; the control is fully controlled.
		* @param props.onChange - called with the state the click asks for.
		* @param props.label - localized accessible name, owned by the render site.
		* @param props.disabled - whether the control refuses input; owners also set it while a write is in flight.
		* @param props.onToggleClick - extra click interception for row activation (stops propagation).
		*/
		function Switch({ checked, onChange, label, disabled = false, onToggleClick }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				role: "switch",
				"aria-checked": checked,
				"aria-label": label,
				title: label,
				disabled,
				className: Switch_module_css_default.switch,
				onClick: (event) => {
					onToggleClick?.(event);
					event.stopPropagation();
					if (!disabled) onChange(!checked);
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: Switch_module_css_default.thumb })
			});
		}
		// \0dsh-css:E:\workspace\dsh-plugins\packages\dsh-agent-extension\src\client\StoreCard.module.css.mjs
		const css$5 = ".Ye8fha_card{box-sizing:border-box;border-radius:var(--dsw-radius-md);width:100%;min-width:0;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:12px;padding:12px 8px;transition:background .12s;display:flex}.Ye8fha_card:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}@media (hover:hover){.Ye8fha_card:hover{background:var(--dsw-alias-interactive-bg-hover)}}.Ye8fha_body{flex-direction:column;flex:1;min-width:0;display:flex}.Ye8fha_titleLine{align-items:center;gap:6px;min-width:0;display:flex}.Ye8fha_title{text-overflow:ellipsis;white-space:nowrap;flex-shrink:1;min-width:0;font-size:14px;font-weight:500;line-height:20px;overflow:hidden}.Ye8fha_desc{min-height:20px;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;margin-top:2px;font-size:13px;line-height:20px;overflow:hidden}.Ye8fha_sub{color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;margin-top:1px;font-size:12px;line-height:18px;overflow:hidden}.Ye8fha_warning{color:var(--dsw-alias-state-warn-primary);text-overflow:ellipsis;white-space:nowrap;align-items:center;gap:4px;margin-top:2px;font-size:12px;display:flex;overflow:hidden}.Ye8fha_actions{flex:none;align-items:center;gap:6px;display:flex;position:relative}";
		const tagId$5 = "dsh-agent-extension/StoreCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$5) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-agent-extension";
			tag.dataset.pluginCss = tagId$5;
			tag.textContent = css$5;
			document.head.appendChild(tag);
		}
		var StoreCard_module_css_default = {
			"actions": "Ye8fha_actions",
			"body": "Ye8fha_body",
			"card": "Ye8fha_card",
			"desc": "Ye8fha_desc",
			"sub": "Ye8fha_sub",
			"title": "Ye8fha_title",
			"titleLine": "Ye8fha_titleLine",
			"warning": "Ye8fha_warning"
		};
		// src/client/StoreCard.tsx
		/** Render one plugin card. */
		function StoreCard({ item, useHub, actions, t, localeId, management = false, onOpenDetail }) {
			const state = useHub(identity);
			const display = displayOf(item, localeId);
			const installed = item.installed === true;
			const orphan = item.orphan === true;
			const key = String(item.key ?? "");
			const busy = (state.busy[key] ?? "") !== "";
			const canInstall = item.installable !== false && !item.blockedReason;
			const updatable = !orphan && updateAvailable(item);
			const enabled = item.installedEnabled !== void 0 && item.installedEnabled !== null ? item.installedEnabled === true : item.enabled === true;
			const menuItems = installed ? [
				{
					key: "toggle",
					icon: "power",
					label: enabled ? t("menuDisable") : t("menuEnable"),
					disabled: busy,
					onSelect: () => actions.toggleEnabled(item, !enabled)
				},
				{
					sep: true,
					label: "",
					onSelect: () => {}
				},
				{
					key: "uninstall",
					icon: "trash",
					label: t("menuUninstall"),
					danger: true,
					disabled: busy,
					onSelect: () => actions.askUninstall(item)
				}
			] : [];
			const versionText = `${t("version")} ${String(item.installedVersion || item.version || "—")}`;
			const market = item.market;
			const subTitle = [
				versionText,
				market ? String(market.title || market.name || "") : "",
				orphan ? t("sourceMissingShort") : ""
			].filter(Boolean).join(" · ");
			const activate = () => {
				if (installed || item.name) onOpenDetail(key);
			};
			const onKeyDown = (event) => {
				if (event.target !== event.currentTarget) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					activate();
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: StoreCard_module_css_default.card,
				role: "button",
				tabIndex: 0,
				"aria-label": display.title,
				onClick: activate,
				onKeyDown,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, { display }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: StoreCard_module_css_default.body,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: StoreCard_module_css_default.titleLine,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: StoreCard_module_css_default.title,
										title: display.title,
										children: display.title
									}),
									updatable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UpdateBadge, { label: t("updateBadge") }) : null,
									orphan ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
										tone: "warn",
										children: t("sourceMissingShort")
									}) : null
								]
							}),
							orphan ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: StoreCard_module_css_default.warning,
								title: t("sourceMissing"),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "alert",
									size: 12
								}), t("sourceMissing")]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: StoreCard_module_css_default.desc,
								title: display.description || t("noDescription"),
								children: display.description || t("noDescription")
							}),
							management || installed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: StoreCard_module_css_default.sub,
								title: subTitle,
								children: subTitle
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: StoreCard_module_css_default.actions,
						children: [
							!installed && canInstall ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
								variant: "secondary",
								pill: true,
								disabled: busy || state.busy[key] === "install",
								onClick: (event) => {
									event.stopPropagation();
									actions.install(item);
								},
								children: [busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, busy ? t("installing") : t("install")]
							}) : null,
							!installed && !canInstall ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								variant: "secondary",
								pill: true,
								disabled: true,
								title: item.blockedReason === void 0 || item.blockedReason === null ? t("notInstallable") : String(item.blockedReason),
								children: t("notInstallable")
							}) : null,
							installed && updatable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
								variant: "secondary",
								pill: true,
								disabled: busy || state.busy[key] === "update",
								onClick: (event) => {
									event.stopPropagation();
									actions.update(item);
								},
								children: [busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "download",
									size: 14
								}), busy ? t("updating") : t("update")]
							}) : null,
							installed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Menu, {
								t,
								items: menuItems,
								busy
							}) : null,
							installed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
								checked: enabled,
								disabled: busy,
								label: `${enabled ? t("disable") : t("enable")} ${display.title}`,
								onChange: (next) => actions.toggleEnabled(item, next)
							}) : null
						]
					})
				]
			});
		}
		// src/client/StoreView.tsx
		/** Collapsed-rows expander under one market group. */
		function CollapseRow({ hidden, localeId, onExpand, t }) {
			const names = displayNames(hidden, localeId, 2);
			const label = hidden.length > 2 ? t("viewMore", {
				names: names.join("、"),
				count: hidden.length - names.length
			}) : t("viewMoreFew", { names: names.join("、") });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: panel_module_css_default.collapseRow,
				onClick: onExpand,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.collapseAvatars,
					"aria-hidden": true,
					children: hidden.slice(0, 3).map((item, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, { display: displayOf(item, localeId) }, String(item.key ?? index)))
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.collapseLabel,
					children: label
				})]
			});
		}
		/** Curated recommended sources: one-click add and click-to-preview plugin lists. */
		function RecommendedList({ useHub, actions, t }) {
			const state = useHub(identity);
			const markets = (state.snapshot ?? {}).markets ?? [];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: panel_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.recHint,
						children: t("recommendedHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.divider }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.recList,
						children: RECOMMENDED_SOURCES.map((entry) => {
							const added = isSourceAdded(markets, entry.location);
							const busy = state.marketBusy[`rec:${entry.id}`] === "add";
							const display = displayOf(entry, state.localeId);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: panel_module_css_default.recRow,
								title: display.title,
								onClick: () => actions.openMarketDetail({
									id: entry.id,
									location: entry.location
								}),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.recMain,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.recHead,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.recName,
												children: display.title
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
												tone: "plain",
												children: entry.format
											})]
										}),
										display.description !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: panel_module_css_default.recDesc,
											children: display.description
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: panel_module_css_default.recLocation,
											children: entry.location
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.recAction,
									children: [added ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
										tone: "success",
										children: t("addedBadge")
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
										variant: "secondary",
										icon: "plus",
										disabled: busy,
										onClick: (event) => {
											event.stopPropagation();
											actions.addRecommendedSource({
												id: entry.id,
												location: entry.location
											});
										},
										children: [busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, busy ? t("adding") : t("add")]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.recChevron,
										"aria-hidden": true,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "chevronRight",
											size: 16
										})
									})]
								})]
							}, entry.id);
						})
					})
				]
			});
		}
		/** Render the store view. */
		function StoreView({ useHub, actions, t }) {
			const state = useHub(identity);
			const localeId = state.localeId;
			const snapshot = state.snapshot ?? {};
			const markets = snapshot.markets ?? [];
			const items = snapshot.items ?? [];
			const query = state.query;
			const storeTabs = [{
				value: "sources",
				label: t("tabSources")
			}, {
				value: "recommended",
				label: t("tabRecommended")
			}];
			const searching = query.trim() !== "";
			const sourceFilter = state.storeSourceFilter;
			const filteredItems = sourceFilter === "" ? items : items.filter((item) => (item.market ?? {}).id === sourceFilter);
			const groups = searching ? [] : groupItemsByMarket(filteredItems, markets);
			const searchResults = searching ? filteredItems.filter((item) => matchQuery(item, query, localeId)) : [];
			let content;
			if (searching) content = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: panel_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.sectionHead,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: panel_module_css_default.sectionTitle,
							children: t("searchResults", { count: searchResults.length })
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.divider }),
					searchResults.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 8 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyBlock, { description: t("searchEmpty") })
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.grid,
						children: searchResults.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StoreCard, {
							item,
							useHub,
							actions,
							t,
							localeId,
							onOpenDetail: actions.openDetail
						}, String(item.key)))
					})
				]
			});
			else if (markets.length === 0) content = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyBlock, {
				description: t("personalEmpty"),
				action: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					variant: "primary",
					icon: "plus",
					onClick: actions.openAddSource,
					children: t("addMarketplace")
				})
			});
			else if (filteredItems.length === 0) content = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyBlock, { description: t("catalogEmpty") });
			else content = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: columnGap(32),
				children: groups.map((group) => {
					const groupKey = `market:${String(group.market.id ?? "")}`;
					const collapsed = state.collapsed[groupKey] === true;
					const hidden = collapsed ? group.items.slice(6) : [];
					const visible = collapsed ? group.items.slice(0, 6) : group.items;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: panel_module_css_default.section,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.sectionHead,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									className: panel_module_css_default.sectionTitle,
									children: String(group.market.title || group.market.name || group.market.id)
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.divider }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.grid,
								children: visible.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StoreCard, {
									item,
									useHub,
									actions,
									t,
									localeId,
									onOpenDetail: actions.openDetail
								}, String(item.key)))
							}),
							hidden.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CollapseRow, {
								hidden,
								localeId,
								onExpand: () => actions.toggleCollapse(groupKey),
								t
							}) : null,
							!collapsed && group.items.length > 6 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.collapseRow,
								onClick: () => actions.toggleCollapse(groupKey),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.collapseLabel,
									children: t("showLess")
								})
							}) : null
						]
					}, groupKey);
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.toolbar,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tabs, {
							items: storeTabs,
							value: state.storeTab,
							onChange: actions.setStoreTab,
							label: t("storeTabsLabel"),
							idPrefix: "aph-store-tab",
							panelId: "aph-store-panel"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.toolbarTrail,
							children: [state.storeTab === "sources" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchBox, {
								value: query,
								onChange: actions.setQuery,
								placeholder: t("searchPlaceholder"),
								clearable: true,
								clearLabel: t("clearSearch")
							}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.actions,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
										icon: "refresh",
										title: state.refreshing ? t("refreshing") : t("refresh"),
										busy: state.refreshing,
										disabled: state.refreshing,
										outline: true,
										onClick: () => {
											actions.refreshAll();
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
										icon: "store",
										title: t("sources"),
										outline: true,
										onClick: actions.openSources
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AddMenu, {
										t,
										onAdd: actions.openAddSource
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
										variant: "primary",
										onClick: actions.openManage,
										children: t("manage")
									})
								]
							})]
						})]
					}),
					state.storeTab === "sources" && markets.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.toolbar,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.segmented,
							role: "group",
							"aria-label": t("allSources"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.segment,
								"aria-pressed": sourceFilter === "",
								onClick: () => actions.setStoreSourceFilter(""),
								children: t("allSources")
							}), markets.map((market) => {
								const id = String(market.id ?? "");
								const title = String(market.title || market.name || market.id);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.segment,
									"aria-pressed": sourceFilter === id,
									title,
									onClick: () => actions.setStoreSourceFilter(id),
									children: title
								}, id);
							})]
						})
					}) : null,
					state.error !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.errorBanner,
						children: state.error
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						id: "aph-store-panel",
						role: "tabpanel",
						"aria-labelledby": `aph-store-tab-${state.storeTab}`,
						children: state.storeTab === "recommended" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RecommendedList, {
							useHub,
							actions,
							t
						}) : content
					})
				]
			});
		}
		// src/client/ManageView.tsx
		/** Render the management view. */
		function ManageView({ useHub, actions, t }) {
			const state = useHub(identity);
			const localeId = state.localeId;
			const snapshot = state.snapshot ?? {};
			const installed = snapshot.installed ?? [];
			const query = state.manageQuery;
			const filter = state.manageFilter;
			const filtered = installed.filter((item) => {
				if (filter === "enabled" && item.enabled !== true) return false;
				if (filter === "disabled" && item.enabled === true) return false;
				if (query.trim() === "") return true;
				const display = displayOf(item, localeId);
				return `${display.title} ${display.description} ${String(item.name ?? "")}`.toLowerCase().includes(query.trim().toLowerCase());
			});
			const updates = installed.filter((item) => !item.orphan && updateAvailable(item)).length;
			const runtime = snapshot.runtime ?? {};
			const skills = runtime.skills;
			const commands = runtime.commands;
			const hooks = runtime.hooks;
			const mcp = runtime.mcp;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: panel_module_css_default.topbar,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.titleRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.back,
								onClick: actions.openStore,
								"aria-label": t("back"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "arrowLeft",
									size: 16
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
								className: panel_module_css_default.title,
								children: t("manage")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.actions,
							children: [
								updates > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
									variant: "secondary",
									icon: "download",
									disabled: state.updatingAll,
									onClick: actions.updateAll,
									children: [state.updatingAll ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, t("updateAll", { count: updates })]
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
									icon: "refresh",
									title: state.loading ? t("refreshing") : t("refresh"),
									busy: state.loading,
									disabled: state.loading,
									onClick: () => {
										actions.load();
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									variant: "secondary",
									onClick: actions.openStore,
									children: t("browseMarketplace")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AddMenu, {
									t,
									onAdd: actions.openAddSource
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.toolbar,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.segmented,
							children: [
								["all", t("filterAll")],
								["enabled", t("filterEnabled")],
								["disabled", t("filterDisabled")]
							].map(([value, label]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.segment,
								"aria-pressed": filter === value,
								onClick: () => actions.setManageFilter(value),
								children: label
							}, value))
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchBox, {
							value: query,
							onChange: actions.setManageQuery,
							placeholder: t("searchPlaceholder"),
							clearable: true,
							clearLabel: t("clearSearch")
						})]
					}),
					state.error !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.errorBanner,
						children: state.error
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: columnGap(32),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: panel_module_css_default.section,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.sectionHead,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
										className: panel_module_css_default.sectionTitle,
										children: [
											t("installedGroup"),
											" ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.sectionCount,
												children: String(filtered.length)
											})
										]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.divider }),
								filtered.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: { marginTop: 8 },
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyBlock, {
										title: installed.length === 0 ? t("noInstalledTitle") : t("noInstalled"),
										description: installed.length === 0 ? t("noInstalledDescription") : "",
										action: installed.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
											variant: "primary",
											onClick: actions.openStore,
											children: t("browseMarketplace")
										}) : null
									})
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.gridSingle,
									children: filtered.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StoreCard, {
										item: {
											...item,
											installed: true,
											installable: true
										},
										useHub,
										actions,
										t,
										localeId,
										management: true,
										onOpenDetail: actions.openDetail
									}, String(item.key)))
								})
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.footer,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("enabledCount", {
							total: installed.length,
							enabled: installed.filter((item) => item.enabled === true).length
						}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.runtimeRow,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: skills?.registered === true ? "success" : "warn",
									children: `${t("runtimeSkills")} ${typeof skills?.skills === "number" ? skills.skills : 0}`
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: commands?.available === true ? "success" : "warn",
									children: `${t("runtimeCommands")} ${Array.isArray(commands?.registered) ? (commands?.registered).length : 0}`
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: hooks?.attached === true ? "success" : "warn",
									children: t("runtimeHooks")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: mcp?.available === true ? "success" : "warn",
									children: `${t("runtimeMcp")} ${mcp?.available === true ? t("runtimeEffective") : t("runtimeNotEffective")}`
								})
							]
						})]
					})
				]
			});
		}
		// \0dsh-css:E:\workspace\dsh-plugins\packages\dsh-agent-extension\src\client\DetailView.module.css.mjs
		const css$4 = ".LeSgqW_detail{gap:32px}.LeSgqW_head{flex-wrap:wrap;align-items:flex-start;gap:16px;min-width:0;display:flex}.LeSgqW_headMain{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.LeSgqW_titleLine{flex-wrap:wrap;align-items:center;gap:8px;min-width:0;display:flex}.LeSgqW_title{word-break:break-word;min-width:0;color:var(--dsw-alias-label-primary);margin:0;font-size:18px;font-weight:500}.LeSgqW_desc{color:var(--dsw-alias-label-secondary);white-space:pre-line;overflow-wrap:anywhere;margin:0;font-size:14px}.LeSgqW_warningLine{overflow-wrap:anywhere;color:var(--dsw-alias-state-warn-primary);flex-wrap:wrap;align-items:center;gap:6px;font-size:14px;display:flex}.LeSgqW_actions{flex-wrap:wrap;flex:none;align-items:center;gap:8px;margin-left:auto;display:flex}.LeSgqW_compHead{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:baseline;gap:8px;padding-bottom:8px;display:flex}.LeSgqW_compTitle{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:600}.LeSgqW_compCount{color:var(--dsw-alias-label-secondary);font-size:14px}.LeSgqW_compList{flex-direction:column;margin-top:4px;display:flex}.LeSgqW_compRow{border-bottom:.5px solid color-mix(in srgb, var(--dsw-alias-border-l2) 55%, transparent);align-items:center;gap:12px;min-width:0;padding:10px 0;display:flex}.LeSgqW_compRow:last-child{border-bottom:0}.LeSgqW_compIcon{border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);width:28px;height:28px;color:var(--dsw-alias-label-secondary);flex:none;justify-content:center;align-items:center;display:flex}.LeSgqW_compBody{flex-direction:column;flex:1;min-width:0;display:flex}.LeSgqW_compName{max-width:100%;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;overflow:hidden}.LeSgqW_compDesc{max-width:100%;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;margin-top:2px;font-size:14px;overflow:hidden}.LeSgqW_compSide{flex:none;align-items:center;gap:8px;display:flex}.LeSgqW_compSideStack{align-items:center;gap:8px;display:flex}.LeSgqW_info{flex-direction:column;gap:10px;display:flex}.LeSgqW_infoRow{grid-template-columns:128px minmax(0,1fr);align-items:baseline;gap:12px;display:grid}.LeSgqW_infoLabel{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-size:14px}.LeSgqW_infoValue{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:14px;overflow:hidden}.LeSgqW_infoValue a{min-width:0;max-width:100%;color:var(--dsw-alias-label-primary);align-items:center;gap:4px;text-decoration:none;display:inline-flex;overflow:hidden}.LeSgqW_infoValue a>span{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.LeSgqW_infoValue a>svg{flex:none}@media (hover:hover){.LeSgqW_infoValue a:hover{color:var(--dsw-alias-link);text-underline-offset:3px;text-decoration:underline dotted}}.LeSgqW_advanced{border-top:.5px solid var(--dsw-alias-border-l2);padding-top:16px}.LeSgqW_advanced summary{overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);cursor:pointer;align-items:center;gap:8px;font-size:14px;font-weight:500;list-style:none;display:flex}.LeSgqW_advanced summary::-webkit-details-marker{display:none}.LeSgqW_advanced summary:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}@media (hover:hover){.LeSgqW_advanced summary:hover{color:var(--dsw-alias-label-primary)}}.LeSgqW_chev{transition:transform .15s;display:inline-flex}.LeSgqW_advanced[open] .LeSgqW_chev{transform:rotate(90deg)}.LeSgqW_advancedBody{flex-direction:column;gap:12px;margin-top:12px;display:flex}";
		const tagId$4 = "dsh-agent-extension/DetailView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$4) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-agent-extension";
			tag.dataset.pluginCss = tagId$4;
			tag.textContent = css$4;
			document.head.appendChild(tag);
		}
		var DetailView_module_css_default = {
			"actions": "LeSgqW_actions",
			"advanced": "LeSgqW_advanced",
			"advancedBody": "LeSgqW_advancedBody",
			"chev": "LeSgqW_chev",
			"compBody": "LeSgqW_compBody",
			"compCount": "LeSgqW_compCount",
			"compDesc": "LeSgqW_compDesc",
			"compHead": "LeSgqW_compHead",
			"compIcon": "LeSgqW_compIcon",
			"compList": "LeSgqW_compList",
			"compName": "LeSgqW_compName",
			"compRow": "LeSgqW_compRow",
			"compSide": "LeSgqW_compSide",
			"compSideStack": "LeSgqW_compSideStack",
			"compTitle": "LeSgqW_compTitle",
			"desc": "LeSgqW_desc",
			"detail": "LeSgqW_detail",
			"head": "LeSgqW_head",
			"headMain": "LeSgqW_headMain",
			"info": "LeSgqW_info",
			"infoLabel": "LeSgqW_infoLabel",
			"infoRow": "LeSgqW_infoRow",
			"infoValue": "LeSgqW_infoValue",
			"title": "LeSgqW_title",
			"titleLine": "LeSgqW_titleLine",
			"warningLine": "LeSgqW_warningLine"
		};
		// src/client/DetailView.tsx
		/** One external https link row value. */
		function ExternalValue({ url, label }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
				href: url,
				target: "_blank",
				rel: "noopener noreferrer",
				title: url,
				"aria-label": `${label}: ${url}`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: url }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
					name: "external",
					size: 14
				})]
			});
		}
		/** One capability section (skipped when empty). */
		function ComponentSection({ title, items, rows }) {
			if (items.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: panel_module_css_default.section,
				style: { gap: 0 },
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: DetailView_module_css_default.compHead,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: DetailView_module_css_default.compTitle,
						children: title
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: DetailView_module_css_default.compCount,
						children: String(items.length)
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: DetailView_module_css_default.compList,
					children: rows
				})]
			});
		}
		/** Render the detail view. */
		function DetailView({ useHub, actions, t }) {
			const state = useHub(identity);
			const localeId = state.localeId;
			const snapshot = state.snapshot ?? {};
			const key = state.detailKey ?? "";
			const installedList = snapshot.installed ?? [];
			const itemsList = snapshot.items ?? [];
			const installed = installedList.find((item) => item.key === key) ?? null;
			const catalogItem = itemsList.find((item) => item.key === key) ?? null;
			const detail = state.detail;
			const detailRecord = detail ?? {};
			const display = detailRecord.display ?? {};
			const installedFlag = detail ? Boolean(detailRecord.installed?.installed) : Boolean(installed);
			const currentVersion = detailRecord.version ? String(detailRecord.version) : installed ? String(installed.version ?? "") : catalogItem ? String(catalogItem.version ?? "") : "";
			const market = detailRecord.market ?? (installed ? installed.market : catalogItem ? catalogItem.market : null);
			const nameForTitle = detail ? detailRecord.name : installed ? installed.name : catalogItem ? catalogItem.name : "";
			const title = pickI18n(display.title, display.titleI18n, localeId) || canonicalTitle(nameForTitle);
			const description = pickI18n(display.description, display.descriptionI18n, localeId) || (catalogItem ? displayOf(catalogItem, localeId).description : "");
			const orphan = detail ? detailRecord.orphan === true || installed?.orphan === true : Boolean(installed?.orphan);
			const updatable = !orphan && detail ? updateAvailable(detail) : Boolean(installed && updateAvailable(installed));
			const busy = key !== "" && Boolean(state.busy[key]);
			const installedState = detailRecord.installed ?? null;
			const enabled = detail && installedState && installedState.enabled !== void 0 ? installedState.enabled === true : Boolean(installed?.enabled);
			const capabilities = detail?.capabilities ?? null;
			const runtime = snapshot.runtime ?? {};
			const displayBlock = displayOf({
				display,
				name: title
			}, localeId);
			const entityForActions = installed ?? catalogItem;
			const actionMenu = installedFlag ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Menu, {
				t,
				busy,
				items: [
					{
						key: "toggle",
						icon: "power",
						label: enabled ? t("menuDisable") : t("menuEnable"),
						disabled: busy,
						onSelect: () => {
							if (entityForActions) actions.toggleEnabled(entityForActions, !enabled);
						}
					},
					{
						sep: true,
						onSelect: () => {}
					},
					{
						key: "uninstall",
						icon: "trash",
						label: t("menuUninstall"),
						danger: true,
						disabled: busy,
						onSelect: () => {
							if (entityForActions) actions.askUninstall(entityForActions);
						}
					}
				]
			}) : null;
			const header = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
				className: DetailView_module_css_default.head,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Avatar, {
						display: displayBlock,
						large: true
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: DetailView_module_css_default.headMain,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: DetailView_module_css_default.titleLine,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
									className: DetailView_module_css_default.title,
									children: title
								}), market ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: "plain",
									children: String(market.title || market.name || market.id)
								}) : null]
							}),
							description !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: DetailView_module_css_default.desc,
								children: description
							}) : null,
							orphan ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: DetailView_module_css_default.warningLine,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "alert",
									size: 14
								}), t("sourceMissing")]
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: DetailView_module_css_default.actions,
						children: [
							updatable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								variant: "secondary",
								pill: true,
								icon: "download",
								disabled: busy,
								onClick: () => {
									if (entityForActions) actions.update(entityForActions);
								},
								children: t("update")
							}) : null,
							actionMenu,
							!installedFlag ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
								variant: "primary",
								pill: true,
								disabled: busy || !catalogItem || catalogItem.installable === false || Boolean(catalogItem.blockedReason),
								title: catalogItem ? catalogItem.blockedReason === void 0 || catalogItem.blockedReason === null ? void 0 : String(catalogItem.blockedReason) : t("sourceMissing"),
								onClick: () => {
									if (catalogItem) actions.install(catalogItem);
								},
								children: [busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, t("install")]
							}) : null
						]
					})
				]
			});
			let components;
			if (state.detailStatus === "error") {
				const canFetch = !installedFlag && Boolean(catalogItem);
				components = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.warningBanner,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "alert",
							size: 14
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { flex: 1 },
							children: canFetch ? t("fetchDetailHint") : t("componentsError")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: panel_module_css_default.inlineButton,
							onClick: () => {
								actions.loadDetail(true);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "refresh",
								size: 14
							}), canFetch ? t("fetchDetail") : t("componentsRetry")]
						})
					]
				});
			} else if (!detail || state.detailStatus === "loading") components = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingBlock, { text: t("componentsLoading") });
			else if (!capabilities) {
				const source = detailRecord.source ?? {};
				components = !installedFlag && Boolean(catalogItem) && source.resolved === false ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.warningBanner,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "alert",
							size: 14
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { flex: 1 },
							children: t("fetchDetailHint")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: panel_module_css_default.inlineButton,
							onClick: () => {
								actions.loadDetail(true);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "refresh",
								size: 14
							}), t("fetchDetail")]
						})
					]
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyBlock, { description: detailRecord.blockedReason ? String(detailRecord.blockedReason) : t("componentsEmpty") });
			} else {
				const capBusyFor = (kind, name) => actions.isCapBusy(key, kind, name);
				const switchOf = (kind, name, item) => installedFlag && item.enabled !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
					checked: item.enabled === true,
					disabled: capBusyFor(kind, name),
					label: `${item.enabled ? t("disable") : t("enable")} ${name}`,
					onChange: (next) => actions.toggleCapability(key, kind, name, next)
				}) : null;
				const rowOf = (rowKey, iconName, name, descriptionText, side) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: DetailView_module_css_default.compRow,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: DetailView_module_css_default.compIcon,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: iconName,
								size: 16
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: DetailView_module_css_default.compBody,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: DetailView_module_css_default.compName,
								title: name,
								children: name
							}), descriptionText !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: DetailView_module_css_default.compDesc,
								title: descriptionText,
								children: descriptionText
							}) : null]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: DetailView_module_css_default.compSide,
							children: side
						})
					]
				}, rowKey);
				const skills = capabilities.skills ?? [];
				const commands = capabilities.commands ?? [];
				const hooks = capabilities.hooks ?? [];
				const mcpServers = capabilities.mcpServers ?? [];
				components = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: columnGap(32),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComponentSection, {
							title: t("sectionMcp"),
							items: mcpServers,
							rows: mcpServers.map((item) => rowOf(`mcpServers:${String(item.name)}`, "server", String(item.name ?? ""), [
								item.transport,
								item.command,
								...Array.isArray(item.args) ? item.args : []
							].filter(Boolean).join(" ") || String(item.url ?? "") || t("componentsNotEffective"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: DetailView_module_css_default.compSideStack,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: "warn",
									children: t("componentsNotEffective")
								}), switchOf("mcpServers", String(item.name ?? ""), item)]
							})))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComponentSection, {
							title: t("sectionSkills"),
							items: skills,
							rows: skills.map((item) => rowOf(`skills:${String(item.name)}`, "wand", String(item.name ?? ""), String(item.description ?? ""), switchOf("skills", String(item.name ?? ""), item)))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComponentSection, {
							title: t("sectionCommands"),
							items: commands,
							rows: commands.map((item) => rowOf(`commands:${String(item.name)}`, "terminal", `/${String(item.hostName || item.name)}`, String(item.description ?? ""), switchOf("commands", String(item.name ?? ""), item)))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComponentSection, {
							title: t("sectionHooks"),
							items: hooks,
							rows: hooks.map((item) => rowOf(`hooks:${String(item.event)}`, "anchor", String(item.event ?? ""), item.host ? `${t("hostEvent")}: ${String(item.host)}${item.canBlock === true ? `（${t("canBlock")}）` : ""}` : t("hooksInactive", { reason: item.reason ? String(item.reason) : t("componentsNotEffective") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: DetailView_module_css_default.compSideStack,
								children: [item.effective === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: "success",
									children: t("componentsEffective")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: "warn",
									children: t("componentsNotEffective")
								}), switchOf("hooks", String(item.event ?? ""), item)]
							})))
						})
					]
				});
			}
			const author = display.author?.name;
			const homepage = httpsUrl(display.homepage);
			const repository = httpsUrl(display.repository);
			const infoRows = [
				{
					key: "developer",
					label: t("infoDeveloper"),
					value: typeof author === "string" ? author : ""
				},
				{
					key: "category",
					label: t("infoCategory"),
					value: typeof display.category === "string" ? display.category : ""
				},
				{
					key: "version",
					label: t("infoVersion"),
					value: currentVersion
				},
				{
					key: "market",
					label: t("infoMarket"),
					value: market ? String(market.title || market.name) : ""
				},
				{
					key: "website",
					label: t("infoWebsite"),
					url: homepage
				},
				{
					key: "repository",
					label: t("infoRepository"),
					url: repository
				},
				{
					key: "license",
					label: t("infoLicense"),
					value: typeof display.license === "string" ? display.license : ""
				},
				{
					key: "installedAt",
					label: t("infoInstalledAt"),
					value: installedFlag && installed ? formatTime(installed.installedAt) : ""
				}
			].filter((row) => row.url !== void 0 ? row.url !== "" : (row.value ?? "") !== "");
			const advanced = [];
			const format = detailRecord.format ? String(detailRecord.format) : installed ? String(installed.format ?? "") : catalogItem ? String(catalogItem.format || catalogItem.market?.format || "") : "";
			if (format !== "") advanced.push(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: DetailView_module_css_default.infoRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: DetailView_module_css_default.infoLabel,
					children: t("format")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: DetailView_module_css_default.infoValue,
					title: format,
					children: format
				})]
			}, "format"));
			if (installedFlag && installed && typeof installed.installedPath === "string" && installed.installedPath !== "") advanced.push(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.listBlock,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.listTitle,
					children: t("rootPath")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.mono,
					children: installed.installedPath
				})]
			}, "path"));
			const previousVersions = installed?.previousVersions ?? [];
			if (installedFlag && installed && previousVersions.length > 0) advanced.push(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.listBlock,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.listTitle,
					children: t("rollbackVersions")
				}), previousVersions.map((version) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.listRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.listRowMain,
						title: `v${String(version.version)}${version.available ? "" : ` · ${t("sourceMissingShort")}`}`,
						children: `v${String(version.version)}${version.available ? "" : ` · ${t("sourceMissingShort")}`}`
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						variant: "secondary",
						icon: "rotateCcw",
						disabled: busy || version.available === false,
						onClick: () => actions.askRollback(installed, String(version.version)),
						children: t("rollback")
					})]
				}, String(version.version)))]
			}, "rollback"));
			if (detail && typeof detailRecord.hooksSource === "string" && detailRecord.hooksSource !== "") advanced.push(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: DetailView_module_css_default.infoRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: DetailView_module_css_default.infoLabel,
					children: t("hooksSource")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: DetailView_module_css_default.infoValue,
					title: detailRecord.hooksSource,
					children: detailRecord.hooksSource
				})]
			}, "hooks-source"));
			if (detail && typeof detailRecord.mcpSource === "string" && detailRecord.mcpSource !== "") advanced.push(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: DetailView_module_css_default.infoRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: DetailView_module_css_default.infoLabel,
					children: t("mcpSource")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: DetailView_module_css_default.infoValue,
					title: detailRecord.mcpSource,
					children: detailRecord.mcpSource
				})]
			}, "mcp-source"));
			const warnings = detailRecord.warnings ?? [];
			if (warnings.length > 0) advanced.push(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.listBlock,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.listTitle,
					children: t("warnings")
				}), warnings.map((warning, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.warningBanner,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
						name: "alert",
						size: 13
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: warning })]
				}, index))]
			}, "warnings"));
			if (installedFlag && installed) {
				const caps = installed.capabilities ?? {};
				const list = (name) => Array.isArray(caps[name]) ? caps[name].length : 0;
				advanced.push(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.listBlock,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.listTitle,
						children: t("runtimeStatus")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.runtimeRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
								tone: installed.enabled === true ? "success" : "warn",
								children: installed.enabled === true ? t("enabled") : t("disabled")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, { children: `${t("runtimeSkills")} ${list("skills")}` }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, { children: `${t("runtimeCommands")} ${list("commands")}` }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, { children: `${t("runtimeHooks")} ${list("hooks")}` }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, { children: `${t("runtimeMcp")} ${runtime.mcp && runtime.mcp.available ? t("runtimeEffective") : t("runtimeNotEffective")}` })
						]
					})]
				}, "runtime"));
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${panel_module_css_default.page} ${DetailView_module_css_default.detail}`,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: panel_module_css_default.back,
						onClick: actions.backFromDetail,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "arrowLeft",
							size: 16
						}), t("back")]
					}),
					header,
					state.error !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.errorBanner,
						children: state.error
					}) : null,
					components,
					infoRows.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: panel_module_css_default.section,
						style: { gap: 0 },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: DetailView_module_css_default.compHead,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								className: DetailView_module_css_default.compTitle,
								children: t("infoTitle")
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: DetailView_module_css_default.info,
							style: { marginTop: 12 },
							children: infoRows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: DetailView_module_css_default.infoRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: DetailView_module_css_default.infoLabel,
									children: row.label
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: DetailView_module_css_default.infoValue,
									children: row.url !== void 0 && row.url !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ExternalValue, {
										url: row.url,
										label: row.label
									}) : row.value ?? ""
								})]
							}, row.key))
						})]
					}) : null,
					advanced.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						className: DetailView_module_css_default.advanced,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: DetailView_module_css_default.chev,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "chevronRight",
								size: 14
							})
						}), t("moreDetails")] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: DetailView_module_css_default.advancedBody,
							children: advanced
						})]
					}) : null
				]
			});
		}
		// src/client/MarketView.tsx
		/** Pseudo card key prefix of preview entries (un-added sources). */
		const PREVIEW_KEY_PREFIX = "preview:";
		function previewKey(name) {
			return `${PREVIEW_KEY_PREFIX}${String(name ?? "")}`;
		}
		/** The recommended entry behind the open detail view. */
		function knownEntry(entryId) {
			const known = RECOMMENDED_SOURCES.find((source) => source.id === entryId);
			return known === void 0 ? null : known;
		}
		/** Full-description pane of one preview plugin (un-added sources). */
		function PluginPreviewPane({ plugin, marketTitle, useHub, actions, t }) {
			const display = displayOf(plugin, useHub(identity).localeId);
			const rows = [];
			if (typeof plugin.version === "string" && plugin.version !== "") rows.push({
				label: t("version"),
				value: plugin.version
			});
			if (display.author !== null && typeof display.author.name === "string" && display.author.name !== "") rows.push({
				label: t("infoDeveloper"),
				value: display.author.name
			});
			if (display.category !== "") rows.push({
				label: t("infoCategory"),
				value: display.category
			});
			if (display.homepage !== "") rows.push({
				label: t("infoWebsite"),
				value: display.homepage
			});
			if (display.repository !== "") rows.push({
				label: t("infoRepository"),
				value: display.repository
			});
			if (display.license !== "") rows.push({
				label: t("infoLicense"),
				value: display.license
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.page,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: panel_module_css_default.back,
					onClick: actions.closeMarketPlugin,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
						name: "arrowLeft",
						size: 16
					}), t("back")]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: panel_module_css_default.section,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.sectionHead,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.recHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									className: panel_module_css_default.sectionTitle,
									children: display.title
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: "plain",
									children: marketTitle
								})]
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.divider }),
						display.description !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.pluginDesc,
							children: display.description
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.pluginDesc,
							children: t("noDescription")
						}),
						rows.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.listBlock,
							children: rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.listRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.listTitle,
									children: row.label
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.listRowMain,
									children: row.value
								})]
							}, row.label))
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.recHint,
							children: t("previewInstallBlocked")
						})
					]
				})]
			});
		}
		/** Render the market detail view. */
		function MarketView({ useHub, actions, t }) {
			const state = useHub(identity);
			const detail = state.marketDetail;
			if (detail === null) return null;
			const matched = addedMarketFor((state.snapshot ?? {}).markets ?? [], detail.location);
			const known = knownEntry(detail.entryId);
			const format = known !== null && typeof known.format === "string" ? known.format : String((detail.data ?? {}).format ?? "");
			const display = displayOf(known ?? { display: { title: detail.title } }, state.localeId);
			const plugins = (detail.data ?? {}).plugins ?? [];
			const refreshing = detail.status === "loading" && detail.data !== null;
			const groupKey = `market:${matched?.id ?? detail.entryId}`;
			const collapsed = state.collapsed[groupKey] === true;
			const pluginKey = state.marketPluginKey;
			if (pluginKey !== null && matched === null) {
				const plugin = plugins.find((entry) => previewKey(entry.name) === pluginKey);
				if (plugin !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginPreviewPane, {
					plugin,
					marketTitle: display.title,
					useHub,
					actions,
					t
				});
			}
			let grid;
			if (detail.status === "loading" && detail.data === null) grid = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingBlock, { text: t("catalogLoading") });
			else if (detail.status === "error" && detail.data === null) grid = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.errorBanner,
				children: detail.error
			});
			else if (plugins.length === 0) grid = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.emptyRow,
				children: t("marketEmpty")
			});
			else if (matched !== null) {
				const visible = collapsed ? plugins.slice(0, 6) : plugins;
				const hidden = collapsed ? plugins.slice(6) : [];
				grid = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.grid,
						children: visible.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StoreCard, {
							item,
							useHub,
							actions,
							t,
							localeId: state.localeId,
							onOpenDetail: (key) => actions.openDetail(key, "market")
						}, String(item.key)))
					}),
					hidden.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CollapseRow, {
						hidden,
						localeId: state.localeId,
						onExpand: () => actions.toggleCollapse(groupKey),
						t
					}) : null,
					!collapsed && plugins.length > 6 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.collapseRow,
						onClick: () => actions.toggleCollapse(groupKey),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.collapseLabel,
							children: t("showLess")
						})
					}) : null
				] });
			} else {
				const previewItems = plugins.map((plugin) => ({
					...plugin,
					key: previewKey(plugin.name),
					installable: false,
					blockedReason: t("previewInstallBlocked")
				}));
				grid = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.grid,
					children: previewItems.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StoreCard, {
						item,
						useHub,
						actions,
						t,
						localeId: state.localeId,
						onOpenDetail: actions.openMarketPlugin
					}, String(item.key)))
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("header", {
						className: panel_module_css_default.topbar,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: panel_module_css_default.back,
							onClick: actions.closeMarketDetail,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "arrowLeft",
								size: 16
							}), t("back")]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: panel_module_css_default.section,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.sectionHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.recHead,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
											className: panel_module_css_default.title,
											children: display.title
										}),
										format !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
											tone: "plain",
											children: format
										}) : null,
										matched !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
											tone: "success",
											children: t("addedBadge")
										}) : null
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.actions,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
										icon: "refresh",
										title: refreshing ? t("refreshing") : t("refresh"),
										busy: refreshing || matched !== null && (state.marketBusy[String(matched.id ?? "")] ?? "") === "refresh",
										disabled: refreshing,
										onClick: () => {
											if (matched !== null) actions.refreshMarket(String(matched.id ?? ""));
											else actions.openMarketDetail({
												id: detail.entryId,
												location: detail.location
											}, true);
										}
									}), matched === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
										variant: "primary",
										icon: "plus",
										onClick: () => actions.addRecommendedSource({
											id: detail.entryId,
											location: detail.location
										}),
										children: t("add")
									}) : null]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.divider }),
							display.description !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default.recDesc,
								children: display.description
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.recLocation,
								children: detail.location
							}),
							matched === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.recHint,
								children: t("previewAddHint")
							}) : null
						]
					}),
					grid,
					detail.status === "error" && detail.data !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.errorBanner,
						children: detail.error
					}) : null
				]
			});
		}
		/** 归一化：小写并去掉全部空白。 */
		function normalizeText(value) {
			return value.toLowerCase().replace(/\s+/gu, "");
		}
		/** 一个文本的字符 bigram 集合；单字文本退化成一个标记。 */
		function bigramsOf(value) {
			const flat = normalizeText(value);
			const grams = /* @__PURE__ */ new Set();
			if (flat.length <= 1) {
				if (flat !== "") grams.add(flat);
				return grams;
			}
			for (let index = 0; index < flat.length - 1; index += 1) grams.add(flat.slice(index, index + 2));
			return grams;
		}
		/** 两个 bigram 集合的 Jaccard 相似度，落在 `[0, 1]`。 */
		function jaccard(left, right) {
			if (left.size === 0 || right.size === 0) return 0;
			let shared = 0;
			for (const gram of left) if (right.has(gram)) shared += 1;
			return shared / (left.size + right.size - shared);
		}
		/** 两段文本的 bigram-Jaccard 相似度，落在 `[0, 1]`。 */
		function similarity(left, right) {
			return jaccard(bigramsOf(left), bigramsOf(right));
		}
		// src/client/audit.ts
		/**
		* Pure client-side rules of the memory health audit: stale candidates,
		* suspected duplicate pairs, and low-value entries, computed in the browser
		* over a full list fetch (no host round-trips per rule, no model embedding).
		*
		* Similarity is character-bigram Jaccard over the concatenated
		* name + description + content, which works for CJK and Latin text alike; the
		* pure rule lives in `shared/memory-similarity.ts` so the host-side maintenance
		* run can reuse it. Re-exported here to keep the historical import surface.
		*
		* @module dsh-agent-extension/client/audit
		*/
		/** Full similarity text of one entry. */
		function auditTextOf(entry) {
			return `${entry.name} ${entry.description} ${entry.content}`;
		}
		/** Which of two entries to keep: more important, then more reinforced, then newer. */
		function preferKeep(left, right) {
			if (left.importance !== right.importance) return left.importance > right.importance ? left : right;
			if (left.reinforcement !== right.reinforcement) return left.reinforcement > right.reinforcement ? left : right;
			return left.updatedAt >= right.updatedAt ? left : right;
		}
		/** Entries carrying an obsolete vote or already deactivated (archived excluded). */
		function findStaleCandidates(entries) {
			return entries.filter((entry) => entry.status !== "archived" && (entry.obsoleteVotes > 0 || entry.status === "stale"));
		}
		/** Suspected duplicate pairs inside one scope (archived entries never pair). */
		function findDuplicatePairs(entries) {
			const live = entries.filter((entry) => entry.status !== "archived");
			const pairs = [];
			for (let left = 0; left < live.length; left += 1) for (let right = left + 1; right < live.length; right += 1) {
				const first = live[left];
				const second = live[right];
				if (similarity(auditTextOf(first), auditTextOf(second)) >= .6) pairs.push({
					left: first,
					right: second,
					keep: preferKeep(first, second)
				});
			}
			return pairs;
		}
		/** Active entries that were never reinforced and went untouched for 30+ days. */
		function findLowValueEntries(entries, now) {
			const floor = now - 2592e6;
			return entries.filter((entry) => entry.status === "active" && entry.reinforcement <= 1 && Number.isFinite(Date.parse(entry.updatedAt)) && Date.parse(entry.updatedAt) < floor);
		}
		/** Run all rules over one full entry list (per scope / project). */
		function runAudit(entries, now) {
			return {
				stale: findStaleCandidates(entries),
				duplicates: findDuplicatePairs(entries),
				lowValue: findLowValueEntries(entries, now)
			};
		}
		// \0dsh-css:E:\workspace\dsh-plugins\packages\dsh-agent-extension\src\client\dialogs.module.css.mjs
		const css$3 = ".pJiaRa_regionLayer{z-index:40;position:fixed;inset:0}.pJiaRa_mask{background:var(--dsw-alias-bg-mask-3);backdrop-filter:var(--dsw-mask-blur);pointer-events:auto;justify-content:center;align-items:center;padding:24px;display:flex;position:absolute;inset:0}.pJiaRa_dialog{box-sizing:border-box;border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);width:min(480px,100%);max-height:100%;box-shadow:var(--dsw-elevation-prominent);pointer-events:auto;border:0;flex-direction:column;gap:16px;padding:16px 0;display:flex}.pJiaRa_dialog:focus{outline:none}.pJiaRa_dialogNarrow{width:min(420px,100%)}.pJiaRa_dialogWide{width:min(640px,100%)}.pJiaRa_head{align-items:center;gap:8px;padding:0 12px 0 16px;display:flex}.pJiaRa_title{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-primary);flex:1;margin:0;font-size:16px;font-weight:500;overflow:hidden}.pJiaRa_body{overflow-wrap:anywhere;flex-direction:column;gap:12px;min-height:0;padding:0 16px;display:flex;overflow-y:auto}.pJiaRa_foot{flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:0 16px;display:flex}.pJiaRa_footInline{justify-content:flex-end;width:100%;display:flex}.pJiaRa_field{flex-direction:column;gap:6px;display:flex}.pJiaRa_fieldLabel{color:var(--dsw-alias-label-secondary);font-size:12px}.pJiaRa_fieldHint{color:var(--dsw-alias-label-tertiary);font-size:12px}.pJiaRa_input{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);width:100%;height:36px;color:var(--dsw-alias-label-primary);font:inherit;padding:0 12px;font-size:14px}.pJiaRa_input::placeholder{color:var(--dsw-alias-label-tertiary)}@media (hover:hover){.pJiaRa_input:hover{border-color:var(--dsw-alias-border-l4)}}.pJiaRa_input:focus{border-color:var(--dsw-alias-border-l4);outline:none}.pJiaRa_risk{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-primary);word-break:break-word;align-items:flex-start;gap:8px;padding:12px;font-size:13px;display:flex}.pJiaRa_risk>span{overflow-wrap:anywhere;min-width:0}.pJiaRa_check{color:var(--dsw-alias-label-secondary);cursor:pointer;word-break:break-word;align-items:flex-start;gap:8px;font-size:13px;display:flex}.pJiaRa_check>span{overflow-wrap:anywhere;min-width:0}.pJiaRa_check input{accent-color:var(--dsw-alias-brand-primary);flex:none;margin:3px 0 0}.pJiaRa_confirmMessage{color:var(--dsw-alias-label-secondary);white-space:pre-wrap;font-size:14px}.pJiaRa_error{border:.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent);border-radius:var(--dsw-radius-sm);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;word-break:break-word;padding:10px 12px;font-size:13px}.pJiaRa_sourceList{flex-direction:column;gap:2px;max-height:min(420px,60vh);display:flex;overflow-y:auto}.pJiaRa_emptyRow{border:.5px dashed var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);min-height:96px;color:var(--dsw-alias-label-secondary);text-align:center;justify-content:center;align-items:center;padding:24px 16px;font-size:14px;display:flex}.pJiaRa_sourceRow{border-radius:var(--dsw-radius-sm);align-items:center;gap:12px;padding:8px;display:flex}@media (hover:hover){.pJiaRa_sourceRow:hover{background:var(--dsw-alias-interactive-bg-hover)}}.pJiaRa_sourceMain{flex-direction:column;flex:1;min-width:0;display:flex}.pJiaRa_sourceName{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;overflow:hidden}.pJiaRa_sourceSub{color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;margin-top:2px;font-size:12px;overflow:hidden}.pJiaRa_sourceError{color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;word-break:break-word;align-items:flex-start;gap:4px;margin-top:4px;font-size:12px;display:flex}";
		const tagId$3 = "dsh-agent-extension/dialogs.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-agent-extension";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var dialogs_module_css_default = {
			"body": "pJiaRa_body",
			"check": "pJiaRa_check",
			"confirmMessage": "pJiaRa_confirmMessage",
			"dialog": "pJiaRa_dialog",
			"dialogNarrow": "pJiaRa_dialogNarrow",
			"dialogWide": "pJiaRa_dialogWide",
			"emptyRow": "pJiaRa_emptyRow",
			"error": "pJiaRa_error",
			"field": "pJiaRa_field",
			"fieldHint": "pJiaRa_fieldHint",
			"fieldLabel": "pJiaRa_fieldLabel",
			"foot": "pJiaRa_foot",
			"footInline": "pJiaRa_footInline",
			"head": "pJiaRa_head",
			"input": "pJiaRa_input",
			"mask": "pJiaRa_mask",
			"regionLayer": "pJiaRa_regionLayer",
			"risk": "pJiaRa_risk",
			"sourceError": "pJiaRa_sourceError",
			"sourceList": "pJiaRa_sourceList",
			"sourceMain": "pJiaRa_sourceMain",
			"sourceName": "pJiaRa_sourceName",
			"sourceRow": "pJiaRa_sourceRow",
			"sourceSub": "pJiaRa_sourceSub",
			"title": "pJiaRa_title"
		};
		// src/client/dialogs.tsx
		/**
		* Dialogs hosted in `shell.overlay`: add-source, marketplace sources, and the
		* generic confirm. The shell renders only the top dialog of the stack; the
		* mask material and dialog geometry follow the official Modal (prominent
		* elevation, panel radius, theme-owned mask).
		*
		* @module dsh-agent-extension/client/dialogs
		*/
		/** Scrollable ancestor that is the host's main-panel viewport, if any. */
		function panelViewportOf(node) {
			for (let parent = node.parentElement; parent !== null; parent = parent.parentElement) {
				const overflowY = getComputedStyle(parent).overflowY;
				if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") return parent;
			}
			return null;
		}
		/**
		* In-panel dialog layer: anchors the mask to the host main-panel viewport
		* instead of the whole window, so dialogs stay centered in the content area
		* while sidebars, split panes, or the window change size. Falls back to the
		* viewport when the panel has no scrollable ancestor (tests, plain DOM).
		*/
		function PanelDialogLayer({ children }) {
			const layerRef = (0, react.useRef)(null);
			const [style, setStyle] = (0, react.useState)(void 0);
			(0, react.useLayoutEffect)(() => {
				const layer = layerRef.current;
				if (layer === null) return void 0;
				const viewport = panelViewportOf(layer);
				if (viewport === null) return void 0;
				const measure = () => {
					const box = viewport.getBoundingClientRect();
					const width = viewport.clientWidth;
					const height = viewport.clientHeight;
					if (width <= 0 || height <= 0) return;
					setStyle({
						left: box.left,
						top: box.top,
						width,
						height
					});
				};
				measure();
				const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : void 0;
				observer?.observe(viewport);
				window.addEventListener("resize", measure);
				return () => {
					observer?.disconnect();
					window.removeEventListener("resize", measure);
				};
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: layerRef,
				className: dialogs_module_css_default.regionLayer,
				style,
				children
			});
		}
		/** Focusable descendants of the dialog, in document order. */
		function focusablesIn(dialog) {
			return Array.from(dialog.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")).filter((element) => {
				if (element.hasAttribute("disabled")) return false;
				if (element.getAttribute("tabindex") === "-1") return false;
				if (element.getAttribute("aria-hidden") === "true") return false;
				return true;
			});
		}
		/** Shell of every dialog: mask, card, header, body, footer. */
		function DialogShell({ t, title, titleMeta, children, footer, narrow = false, wide = false, onClose }) {
			const dialogRef = (0, react.useRef)(null);
			const trapFocus = (event) => {
				if (event.key !== "Tab") return;
				const dialog = dialogRef.current;
				if (dialog === null) return;
				const focusables = focusablesIn(dialog);
				if (focusables.length === 0) {
					event.preventDefault();
					dialog.focus();
					return;
				}
				const first = focusables[0];
				const last = focusables[focusables.length - 1];
				const active = document.activeElement;
				const outside = active === null || active === dialog || !dialog.contains(active);
				if (event.shiftKey ? active === first || outside : active === last || outside) {
					event.preventDefault();
					if (event.shiftKey) last.focus();
					else first.focus();
				}
			};
			(0, react.useEffect)(() => {
				if (typeof document === "undefined") return void 0;
				const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
				if (dialogRef.current && typeof dialogRef.current.focus === "function") dialogRef.current.focus();
				return () => {
					if (previous && typeof previous.focus === "function") previous.focus();
				};
			}, []);
			useEscapeClose(true, () => {
				onClose?.();
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: dialogs_module_css_default.mask,
				onClick: (event) => {
					if (event.target === event.currentTarget && onClose) onClose();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: dialogRef,
					className: clsx(dialogs_module_css_default.dialog, narrow && dialogs_module_css_default.dialogNarrow, wide && dialogs_module_css_default.dialogWide),
					role: "dialog",
					"aria-modal": "true",
					"aria-label": title,
					tabIndex: -1,
					onKeyDown: trapFocus,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: dialogs_module_css_default.head,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									className: dialogs_module_css_default.title,
									title,
									children: title
								}),
								titleMeta ?? null,
								onClose ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
									icon: "x",
									title: t("close"),
									onClick: onClose
								}) : null
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: dialogs_module_css_default.body,
							children
						}),
						footer ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: dialogs_module_css_default.foot,
							children: footer
						}) : null
					]
				})
			});
		}
		/** Add-marketplace dialog: source input, optional alias, risk acknowledgment. */
		function AddSourceDialog({ store, t, dialog }) {
			const [location, setLocation] = (0, react.useState)("");
			const [name, setName] = (0, react.useState)("");
			const [risk, setRisk] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const inputRef = (0, react.useRef)(null);
			const close = () => {
				store.actions.closeDialog(dialog.id);
			};
			(0, react.useEffect)(() => {
				if (inputRef.current && typeof inputRef.current.focus === "function") inputRef.current.focus();
			}, []);
			const submit = async () => {
				if (busy || location.trim() === "" || !risk) return;
				setBusy(true);
				setError("");
				try {
					const data = await store.actions.addMarketSource(location.trim(), name.trim());
					const detected = data.detectedType === "git" ? t("detectedGit") : data.detectedType === "url" ? t("detectedUrl") : t("detectedLocal");
					const market = data.market ?? {};
					store.actions.toast("success", t("addedToast", {
						name: String(market.title || market.name || location.trim()),
						type: detected,
						count: typeof data.pluginCount === "number" ? data.pluginCount : 0
					}));
					close();
				} catch (submitError) {
					setError(errorMessageFor(submitError, t));
				} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
				t,
				title: t("addMarketTitle"),
				narrow: true,
				onClose: () => {
					if (!busy) close();
				},
				footer: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					disabled: busy,
					onClick: close,
					children: t("cancel")
				}, "cancel"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
					variant: "primary",
					icon: "plus",
					disabled: busy || location.trim() === "" || !risk,
					onClick: () => {
						submit();
					},
					children: [busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, busy ? t("adding") : t("add")]
				}, "add")],
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: dialogs_module_css_default.risk,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "alert",
							size: 14
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("addMarketRisk") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: dialogs_module_css_default.field,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: dialogs_module_css_default.fieldLabel,
								htmlFor: "aph-add-source-input",
								children: t("addMarketSourceLabel")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								id: "aph-add-source-input",
								ref: inputRef,
								className: dialogs_module_css_default.input,
								value: location,
								placeholder: t("addMarketSourceLabel"),
								"aria-label": t("addMarketSourceLabel"),
								onChange: (event) => setLocation(event.target.value),
								onKeyDown: (event) => {
									if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: dialogs_module_css_default.fieldHint,
								children: t("addMarketHint")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: dialogs_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: dialogs_module_css_default.fieldLabel,
							htmlFor: "aph-add-source-name",
							children: t("marketName")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "aph-add-source-name",
							className: dialogs_module_css_default.input,
							value: name,
							placeholder: t("marketName"),
							onChange: (event) => setName(event.target.value)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: dialogs_module_css_default.check,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: risk,
							onChange: (event) => setRisk(event.target.checked)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("addMarketRiskAck") })]
					}),
					error !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: dialogs_module_css_default.error,
						role: "alert",
						children: error
					}) : null
				]
			});
		}
		/** Marketplace sources dialog: list with per-market refresh/remove. */
		function SourcesDialog({ useHub, store, t }) {
			const state = useHub(identity);
			const markets = orderMarkets((state.snapshot ?? {}).markets ?? []);
			const dialog = state.dialogs.find((entry) => entry.kind === "sources") ?? { id: "" };
			const list = markets.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: dialogs_module_css_default.emptyRow,
				children: t("sourcesEmpty")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: dialogs_module_css_default.sourceList,
				children: markets.map((market) => {
					const busyLabel = state.marketBusy[String(market.id ?? "")] ?? "";
					const nameText = String(market.title || market.name || market.id);
					const subText = t("sourcePluginCount", { count: typeof market.pluginCount === "number" ? market.pluginCount : 0 }) + (typeof market.lastRefreshed === "string" && market.lastRefreshed !== "" ? ` · ${t("sourceUpdated", { time: formatTime(market.lastRefreshed) })}` : "");
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: dialogs_module_css_default.sourceRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: dialogs_module_css_default.sourceMain,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: dialogs_module_css_default.sourceName,
										title: nameText,
										children: nameText
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: dialogs_module_css_default.sourceSub,
										title: subText,
										children: subText
									}),
									market.refreshError ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: dialogs_module_css_default.sourceError,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "alert",
											size: 12
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("sourceRefreshFailed", {
											time: formatTime(market.lastRefreshed),
											message: String(market.refreshError)
										}) })]
									}) : null
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
								icon: "refresh",
								title: t("sourceRefresh"),
								busy: busyLabel === "refresh",
								disabled: busyLabel !== "",
								onClick: () => {
									store.actions.refreshMarket(String(market.id ?? ""));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
								icon: "trash",
								title: t("sourceRemove"),
								danger: true,
								busy: busyLabel === "remove",
								disabled: busyLabel !== "",
								onClick: () => store.actions.removeMarket(market)
							})
						]
					}, String(market.id ?? ""));
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DialogShell, {
				t,
				title: t("sources"),
				onClose: () => store.actions.closeDialog(dialog.id),
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: dialogs_module_css_default.footInline,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						variant: "secondary",
						onClick: () => store.actions.closeDialog(dialog.id),
						children: t("close")
					})
				}),
				children: list
			});
		}
		/** Generic confirm dialog with an async confirm action. */
		function ConfirmDialog({ store, t, dialog }) {
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const close = () => {
				if (!busy) store.actions.closeDialog(dialog.id);
			};
			const confirm = async () => {
				if (busy) return;
				setBusy(true);
				setError("");
				try {
					await dialog.onConfirm?.();
					store.actions.closeDialog(dialog.id);
				} catch (confirmError) {
					setError(errorMessageFor(confirmError, t));
				} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
				t,
				title: dialog.title ?? "",
				narrow: true,
				onClose: close,
				footer: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					disabled: busy,
					onClick: close,
					children: t("cancel")
				}, "cancel"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
					variant: dialog.danger === true ? "danger" : "primary",
					disabled: busy,
					onClick: () => {
						confirm();
					},
					children: [busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, dialog.confirmLabel || t("confirm")]
				}, "confirm")],
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: dialogs_module_css_default.confirmMessage,
					children: dialog.message ?? ""
				}), error !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: dialogs_module_css_default.error,
					role: "alert",
					children: error
				}) : null]
			});
		}
		// src/client/host-ui.ts
		/** 缓存：`undefined` 表示还没探测过，`null` 表示宿主不提供。 */
		let cached;
		/**
		* 探测并返回宿主 `MarkdownText`，拿不到返回 `null`。
		*
		* 只探测一次；失败结果同样缓存，避免每次渲染都触发异常路径。
		*/
		function loadHostMarkdownText() {
			if (cached !== void 0) return cached;
			cached = null;
			try {
				const component = require("@deepseek-ai/dsh-client-ui-primitives")?.MarkdownText;
				if (typeof component === "function" || typeof component === "object" && component !== null) cached = component;
			} catch {
				cached = null;
			}
			return cached;
		}
		// src/shared/memory-wire.ts
		/** 默认设置：捕获与注入开启，各 20 条索引、总预算 3,000 字符（ADR-0005）。 */
		function defaultSettings() {
			return {
				captureEnabled: true,
				captureSessionEnd: true,
				injectEnabled: true,
				indexLimitGlobal: 20,
				indexLimitProject: 20,
				maxChars: 3e3,
				maintenanceProvider: "",
				maintenanceModel: "",
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			};
		}
		/** 召回索引的字符预算上限（ADR-0005）：设置只能调小，不能突破。 */
		const RECALL_MAX_CHARS = 3e3;
		// \0dsh-css:E:\workspace\dsh-plugins\packages\dsh-agent-extension\src\client\memory.module.css.mjs
		const css$2 = ".Iw3mRa_view{gap:20px}.Iw3mRa_topbar{flex-wrap:wrap;align-items:center;gap:12px;display:flex}.Iw3mRa_segmented{flex-wrap:wrap;flex:none;align-items:center;gap:6px;display:inline-flex}.Iw3mRa_projectSelect{flex:0 150px;min-width:0}.Iw3mRa_actions{flex-wrap:wrap;flex:none;justify-content:flex-end;align-items:center;gap:8px;margin-left:auto;display:flex}.Iw3mRa_searchWrap{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);min-width:190px;height:36px;color:var(--dsw-alias-label-tertiary);flex:210px;align-items:center;gap:6px;padding:0 10px;display:flex}.Iw3mRa_searchWrap>svg{flex:none}.Iw3mRa_searchInput{min-width:0;height:100%;color:var(--dsw-alias-label-primary);font:inherit;background:0 0;border:0;outline:none;flex:1;padding:0;font-size:14px}.Iw3mRa_searchInput::placeholder{color:var(--dsw-alias-label-tertiary)}.Iw3mRa_searchInput::-webkit-search-decoration,.Iw3mRa_searchInput::-webkit-search-cancel-button{-webkit-appearance:none;display:none}.Iw3mRa_searchClear{border-radius:var(--dsw-radius-sm);width:24px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;flex:none;justify-content:center;align-items:center;padding:0;display:flex}.Iw3mRa_searchClear:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}@media (hover:hover){.Iw3mRa_searchClear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}.Iw3mRa_filterTrigger{border-radius:var(--dsw-radius-sm);width:24px;height:24px;color:var(--dsw-alias-label-secondary);background:0 0;border:0;justify-content:center;align-items:center;display:flex}.Iw3mRa_filterTrigger:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}@media (hover:hover){.Iw3mRa_filterTrigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}.Iw3mRa_filterDot{corner-shape:round;background:var(--dsw-alias-state-business-primary);border-radius:999px;width:6px;height:6px;position:absolute;top:2px;right:2px}.Iw3mRa_filterChip{corner-shape:round;background:var(--dsw-alias-interactive-bg-hover);min-width:0;max-width:120px;color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;align-items:center;gap:2px;padding:0 2px 0 6px;font-size:11px;line-height:18px;display:inline-flex}.Iw3mRa_filterChipText{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.Iw3mRa_filterChipMore{letter-spacing:1px;color:var(--dsw-alias-label-tertiary);flex:none;padding:0 1px;font-size:11px}.Iw3mRa_filterChipClear{corner-shape:round;width:16px;height:16px;color:inherit;cursor:pointer;background:0 0;border:0;border-radius:999px;flex:none;justify-content:center;align-items:center;padding:0;display:flex}.Iw3mRa_filterChipClear:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}@media (hover:hover){.Iw3mRa_filterChipClear:hover{background:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}}.Iw3mRa_listPane{flex-direction:column;gap:8px;min-width:0;display:flex}.Iw3mRa_listHead{justify-content:space-between;align-items:baseline;gap:8px;padding:0 8px 8px;display:flex}.Iw3mRa_sectionTitle{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500}.Iw3mRa_sectionCount{vertical-align:super;white-space:nowrap;color:var(--dsw-alias-label-tertiary);margin-left:4px;font-size:12px;font-weight:400}.Iw3mRa_listHeadTools{align-items:center;gap:8px;display:flex}.Iw3mRa_entryGrid{grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;display:grid}.Iw3mRa_entryCard{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);min-width:0;color:inherit;font:inherit;text-align:left;cursor:pointer;flex-direction:column;gap:6px;padding:14px;transition:background .12s,border-color .12s;display:flex}.Iw3mRa_entryCard:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}@media (hover:hover){.Iw3mRa_entryCard:hover{border-color:var(--dsw-alias-border-l4);background:var(--dsw-alias-interactive-bg-hover)}}.Iw3mRa_entryTitleRow{align-items:center;gap:6px;min-width:0;display:flex}.Iw3mRa_entryName{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500}.Iw3mRa_entryImportance{corner-shape:round;background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent);color:var(--dsw-alias-state-warn-primary);border-radius:999px;flex:none;align-self:flex-start;margin-left:auto;padding:0 6px;font-size:11px;font-weight:600;line-height:18px}.Iw3mRa_entryDesc{-webkit-line-clamp:2;overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-secondary);-webkit-box-orient:vertical;font-size:13px;display:-webkit-box;overflow:hidden}.Iw3mRa_entryMeta{flex-wrap:wrap;align-items:center;gap:6px;display:flex}.Iw3mRa_entryTime{color:var(--dsw-alias-label-tertiary);margin-left:auto;font-size:12px}.Iw3mRa_entryTag{corner-shape:round;background:var(--dsw-alias-interactive-bg-hover);max-width:120px;color:var(--dsw-alias-label-secondary);font:inherit;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;border:0;border-radius:999px;flex:none;padding:0 6px;font-size:11px;line-height:18px;overflow:hidden}.Iw3mRa_entryTag:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}@media (hover:hover){.Iw3mRa_entryTag:hover{background:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}}.Iw3mRa_entryTagMore{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px}.Iw3mRa_editor{flex-direction:column;gap:12px;min-width:0;display:flex}.Iw3mRa_editorStatus{align-items:center;display:flex}.Iw3mRa_formGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;display:grid}@container (width<=720px){.Iw3mRa_formGrid{grid-template-columns:minmax(0,1fr)}}.Iw3mRa_field{flex-direction:column;gap:4px;min-width:0;display:flex}.Iw3mRa_fieldLabel{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500}.Iw3mRa_fieldHint{color:var(--dsw-alias-label-tertiary);font-size:11px}.Iw3mRa_input{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);width:100%;min-width:0;height:36px;color:var(--dsw-alias-label-primary);font:inherit;padding:0 10px;font-size:14px}.Iw3mRa_input:focus-visible,.Iw3mRa_textarea:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}.Iw3mRa_input::-webkit-inner-spin-button,.Iw3mRa_input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}.Iw3mRa_input[type=number]{appearance:textfield}.Iw3mRa_rangeRow{align-items:center;gap:8px;display:flex}.Iw3mRa_rangeInput{-webkit-appearance:none;appearance:none;cursor:pointer;background:0 0;flex:1;min-width:0;height:36px;margin:0;padding:0}.Iw3mRa_rangeInput:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px;border-radius:var(--dsw-radius-sm)}.Iw3mRa_rangeInput::-webkit-slider-runnable-track{corner-shape:round;background:linear-gradient(to right, var(--dsw-alias-brand-primary) 0 var(--range-fill,50%), var(--dsw-alias-border-l3) var(--range-fill,50%) 100%);border-radius:999px;height:4px}.Iw3mRa_rangeInput::-webkit-slider-thumb{-webkit-appearance:none;corner-shape:round;background:var(--dsw-alias-brand-primary);border:0;border-radius:50%;width:16px;height:16px;margin-top:-6px}.Iw3mRa_rangeInput::-moz-range-track{corner-shape:round;background:var(--dsw-alias-border-l3);border-radius:999px;height:4px}.Iw3mRa_rangeInput::-moz-range-progress{corner-shape:round;background:var(--dsw-alias-brand-primary);border-radius:999px;height:4px}.Iw3mRa_rangeInput::-moz-range-thumb{corner-shape:round;background:var(--dsw-alias-brand-primary);border:0;border-radius:50%;width:16px;height:16px}.Iw3mRa_rangeValue{text-align:right;font-variant-numeric:tabular-nums;min-width:28px;color:var(--dsw-alias-label-primary);flex:none;font-size:13px}.Iw3mRa_tagBox{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);cursor:text;flex-wrap:wrap;align-items:center;gap:6px;min-height:36px;padding:4px 8px;display:flex}.Iw3mRa_tagBox:focus-within{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}.Iw3mRa_tagChip{corner-shape:round;background:var(--dsw-alias-interactive-bg-hover);max-width:160px;color:var(--dsw-alias-label-primary);border-radius:999px;align-items:center;gap:2px;padding:0 4px 0 8px;font-size:12px;line-height:22px;display:inline-flex}.Iw3mRa_tagChipText{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.Iw3mRa_tagChipRemove{corner-shape:round;width:16px;height:16px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:999px;flex:none;justify-content:center;align-items:center;padding:0;display:flex}.Iw3mRa_tagChipRemove:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}@media (hover:hover){.Iw3mRa_tagChipRemove:hover{color:var(--dsw-alias-label-primary)}}.Iw3mRa_tagInput{min-width:80px;height:26px;color:var(--dsw-alias-label-primary);font:inherit;background:0 0;border:0;outline:none;flex:80px;padding:0;font-size:13px}.Iw3mRa_readonlyBox{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;min-height:36px;padding:8px 10px;display:flex}.Iw3mRa_readonlyHint{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;font-size:13px}.Iw3mRa_previewBox{flex-direction:column;justify-content:flex-start;align-items:stretch;max-height:320px;overflow:auto}.Iw3mRa_previewBody{overflow-wrap:anywhere;font-size:13px;line-height:1.6}.Iw3mRa_previewBody img,.Iw3mRa_previewBody pre{max-width:100%}.Iw3mRa_textarea{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);width:100%;min-height:180px;color:var(--dsw-alias-label-primary);font:inherit;resize:vertical;padding:8px 10px;font-size:14px;line-height:1.5}.Iw3mRa_formActions{flex-wrap:wrap;align-items:center;gap:8px;padding-top:4px;display:flex}.Iw3mRa_formActionsRight{flex-wrap:wrap;flex:auto;justify-content:flex-end;align-items:center;gap:8px;min-width:0;display:flex}.Iw3mRa_confirmArea{border:.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent);border-radius:var(--dsw-radius-sm);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;display:flex}.Iw3mRa_confirmText{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;font-size:13px}.Iw3mRa_settingList{flex-direction:column;display:flex}.Iw3mRa_settingRow{justify-content:space-between;align-items:center;gap:12px;padding:8px 0;display:flex}.Iw3mRa_settingRow+.Iw3mRa_settingRow{border-top:.5px solid var(--dsw-alias-border-l3)}.Iw3mRa_settingLabel{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-primary);font-size:14px}.Iw3mRa_numberGrid{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;display:grid}@container (width<=720px){.Iw3mRa_numberGrid{grid-template-columns:minmax(0,1fr)}}.Iw3mRa_divider{background:var(--dsw-alias-border-l2);height:.5px}.Iw3mRa_statsTitle{color:var(--dsw-alias-label-primary);margin:0;font-size:14px;font-weight:500}.Iw3mRa_statGrid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;display:grid}.Iw3mRa_stat{border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);flex-direction:column;gap:2px;padding:10px 12px;display:flex}.Iw3mRa_statLabel{color:var(--dsw-alias-label-secondary);font-size:12px}.Iw3mRa_statValue{color:var(--dsw-alias-label-primary);font-size:16px;font-weight:600}.Iw3mRa_auditGroups{flex-direction:column;gap:16px;display:flex}.Iw3mRa_auditGroup{flex-direction:column;gap:6px;display:flex}.Iw3mRa_auditGroupTitle{color:var(--dsw-alias-label-primary);align-items:center;gap:6px;margin:0;font-size:14px;font-weight:500;display:flex}.Iw3mRa_auditCount{corner-shape:round;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:0 6px;font-size:11px;line-height:18px}.Iw3mRa_auditHint{min-width:0;color:var(--dsw-alias-label-tertiary);font-size:12px}.Iw3mRa_auditRow{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);cursor:pointer;align-items:flex-start;gap:8px;padding:10px;display:flex}.Iw3mRa_auditCheck{width:16px;height:16px;accent-color:var(--dsw-alias-state-business-primary);flex:none;margin:2px 0 0}.Iw3mRa_auditSummary{flex-direction:column;flex:1;gap:6px;min-width:0;display:flex}.Iw3mRa_auditPair{flex-direction:column;gap:6px;display:flex}.Iw3mRa_auditPairKeep{color:var(--dsw-alias-state-business-primary);font-size:12px}.Iw3mRa_auditBar{border-top:.5px solid var(--dsw-alias-border-l2);flex-wrap:wrap;align-items:center;gap:8px;margin-top:4px;padding-top:8px;display:flex}.Iw3mRa_auditBarCount{min-width:0;color:var(--dsw-alias-label-secondary);flex:auto;font-size:13px}.Iw3mRa_errorBox{border:.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent);border-radius:var(--dsw-radius-sm);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-state-error-primary);flex-wrap:wrap;align-items:flex-start;gap:8px;padding:10px 12px;font-size:13px;display:flex}.Iw3mRa_errorText{overflow-wrap:anywhere;white-space:pre-wrap;flex:160px;min-width:0}.Iw3mRa_maintenanceStack{flex-direction:column;gap:12px;min-width:0;display:flex}.Iw3mRa_maintenanceNotice{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);overflow-wrap:anywhere;padding:10px 12px;font-size:13px;line-height:1.5}.Iw3mRa_maintenanceHint{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;font-size:12px}.Iw3mRa_maintenanceRunning{color:var(--dsw-alias-label-secondary);align-items:center;gap:8px;font-size:13px;display:flex}.Iw3mRa_maintenanceSection{border-top:.5px solid var(--dsw-alias-border-l2);flex-direction:column;gap:6px;min-width:0;padding-top:8px;display:flex}.Iw3mRa_maintenanceResult{flex-wrap:wrap;align-items:center;gap:8px;min-width:0;display:flex}.Iw3mRa_maintenanceResultCounts{min-width:0;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere;font-size:13px}.Iw3mRa_maintenanceError{border:.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent);border-radius:var(--dsw-radius-sm);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;white-space:pre-wrap;padding:10px 12px;font-size:13px}.Iw3mRa_maintenanceList{flex-direction:column;gap:6px;display:flex}.Iw3mRa_maintenanceRow{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;display:flex}.Iw3mRa_maintenanceRowTime{color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px}.Iw3mRa_maintenanceRowMain{min-width:0;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;flex:auto;font-size:12px}.Iw3mRa_archiveToggle{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);height:28px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;flex:none;align-items:center;gap:4px;padding:0 8px;font-size:12px;display:inline-flex}.Iw3mRa_archiveToggle[aria-pressed=true]{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.Iw3mRa_archiveToggle:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}@media (hover:hover){.Iw3mRa_archiveToggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}.Iw3mRa_detailIdRow{flex:none;align-items:center;gap:2px;min-width:0;display:flex}.Iw3mRa_detailId{text-overflow:ellipsis;white-space:nowrap;min-width:0;max-width:180px;color:var(--dsw-alias-label-tertiary);user-select:all;font-size:12px;overflow:hidden}.Iw3mRa_diagnosisStack{flex-direction:column;gap:16px;min-width:0;display:flex}.Iw3mRa_diagnosisSection{flex-direction:column;gap:6px;min-width:0;display:flex}.Iw3mRa_diagnosisList{flex-direction:column;gap:6px;display:flex}.Iw3mRa_diagnosisRow{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;display:flex}.Iw3mRa_diagnosisRowTime{color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px}.Iw3mRa_diagnosisRowMain{min-width:0;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;flex-wrap:wrap;flex:auto;align-items:center;gap:8px;font-size:13px;display:flex}.Iw3mRa_diagnosisRowIds{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:12px;overflow:hidden}.Iw3mRa_diagnosisMore>summary{color:var(--dsw-alias-label-secondary);cursor:pointer;padding:2px 0;font-size:12px}.Iw3mRa_diagnosisMore>summary:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}.Iw3mRa_diagnosisMore[open]>summary{margin-bottom:6px}";
		const tagId$2 = "dsh-agent-extension/memory.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-agent-extension";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var memory_module_css_default = {
			"actions": "Iw3mRa_actions",
			"archiveToggle": "Iw3mRa_archiveToggle",
			"auditBar": "Iw3mRa_auditBar",
			"auditBarCount": "Iw3mRa_auditBarCount",
			"auditCheck": "Iw3mRa_auditCheck",
			"auditCount": "Iw3mRa_auditCount",
			"auditGroup": "Iw3mRa_auditGroup",
			"auditGroupTitle": "Iw3mRa_auditGroupTitle",
			"auditGroups": "Iw3mRa_auditGroups",
			"auditHint": "Iw3mRa_auditHint",
			"auditPair": "Iw3mRa_auditPair",
			"auditPairKeep": "Iw3mRa_auditPairKeep",
			"auditRow": "Iw3mRa_auditRow",
			"auditSummary": "Iw3mRa_auditSummary",
			"confirmArea": "Iw3mRa_confirmArea",
			"confirmText": "Iw3mRa_confirmText",
			"detailId": "Iw3mRa_detailId",
			"detailIdRow": "Iw3mRa_detailIdRow",
			"diagnosisList": "Iw3mRa_diagnosisList",
			"diagnosisMore": "Iw3mRa_diagnosisMore",
			"diagnosisRow": "Iw3mRa_diagnosisRow",
			"diagnosisRowIds": "Iw3mRa_diagnosisRowIds",
			"diagnosisRowMain": "Iw3mRa_diagnosisRowMain",
			"diagnosisRowTime": "Iw3mRa_diagnosisRowTime",
			"diagnosisSection": "Iw3mRa_diagnosisSection",
			"diagnosisStack": "Iw3mRa_diagnosisStack",
			"divider": "Iw3mRa_divider",
			"editor": "Iw3mRa_editor",
			"editorStatus": "Iw3mRa_editorStatus",
			"entryCard": "Iw3mRa_entryCard",
			"entryDesc": "Iw3mRa_entryDesc",
			"entryGrid": "Iw3mRa_entryGrid",
			"entryImportance": "Iw3mRa_entryImportance",
			"entryMeta": "Iw3mRa_entryMeta",
			"entryName": "Iw3mRa_entryName",
			"entryTag": "Iw3mRa_entryTag",
			"entryTagMore": "Iw3mRa_entryTagMore",
			"entryTime": "Iw3mRa_entryTime",
			"entryTitleRow": "Iw3mRa_entryTitleRow",
			"errorBox": "Iw3mRa_errorBox",
			"errorText": "Iw3mRa_errorText",
			"field": "Iw3mRa_field",
			"fieldHint": "Iw3mRa_fieldHint",
			"fieldLabel": "Iw3mRa_fieldLabel",
			"filterChip": "Iw3mRa_filterChip",
			"filterChipClear": "Iw3mRa_filterChipClear",
			"filterChipMore": "Iw3mRa_filterChipMore",
			"filterChipText": "Iw3mRa_filterChipText",
			"filterDot": "Iw3mRa_filterDot",
			"filterTrigger": "Iw3mRa_filterTrigger",
			"formActions": "Iw3mRa_formActions",
			"formActionsRight": "Iw3mRa_formActionsRight",
			"formGrid": "Iw3mRa_formGrid",
			"input": "Iw3mRa_input",
			"listHead": "Iw3mRa_listHead",
			"listHeadTools": "Iw3mRa_listHeadTools",
			"listPane": "Iw3mRa_listPane",
			"maintenanceError": "Iw3mRa_maintenanceError",
			"maintenanceHint": "Iw3mRa_maintenanceHint",
			"maintenanceList": "Iw3mRa_maintenanceList",
			"maintenanceNotice": "Iw3mRa_maintenanceNotice",
			"maintenanceResult": "Iw3mRa_maintenanceResult",
			"maintenanceResultCounts": "Iw3mRa_maintenanceResultCounts",
			"maintenanceRow": "Iw3mRa_maintenanceRow",
			"maintenanceRowMain": "Iw3mRa_maintenanceRowMain",
			"maintenanceRowTime": "Iw3mRa_maintenanceRowTime",
			"maintenanceRunning": "Iw3mRa_maintenanceRunning",
			"maintenanceSection": "Iw3mRa_maintenanceSection",
			"maintenanceStack": "Iw3mRa_maintenanceStack",
			"numberGrid": "Iw3mRa_numberGrid",
			"previewBody": "Iw3mRa_previewBody",
			"previewBox": "Iw3mRa_previewBox",
			"projectSelect": "Iw3mRa_projectSelect",
			"rangeInput": "Iw3mRa_rangeInput",
			"rangeRow": "Iw3mRa_rangeRow",
			"rangeValue": "Iw3mRa_rangeValue",
			"readonlyBox": "Iw3mRa_readonlyBox",
			"readonlyHint": "Iw3mRa_readonlyHint",
			"searchClear": "Iw3mRa_searchClear",
			"searchInput": "Iw3mRa_searchInput",
			"searchWrap": "Iw3mRa_searchWrap",
			"sectionCount": "Iw3mRa_sectionCount",
			"sectionTitle": "Iw3mRa_sectionTitle",
			"segmented": "Iw3mRa_segmented",
			"settingLabel": "Iw3mRa_settingLabel",
			"settingList": "Iw3mRa_settingList",
			"settingRow": "Iw3mRa_settingRow",
			"stat": "Iw3mRa_stat",
			"statGrid": "Iw3mRa_statGrid",
			"statLabel": "Iw3mRa_statLabel",
			"statValue": "Iw3mRa_statValue",
			"statsTitle": "Iw3mRa_statsTitle",
			"tagBox": "Iw3mRa_tagBox",
			"tagChip": "Iw3mRa_tagChip",
			"tagChipRemove": "Iw3mRa_tagChipRemove",
			"tagChipText": "Iw3mRa_tagChipText",
			"tagInput": "Iw3mRa_tagInput",
			"textarea": "Iw3mRa_textarea",
			"topbar": "Iw3mRa_topbar",
			"view": "Iw3mRa_view"
		};
		// src/client/MemoryView.tsx
		/**
		* Memory tab of the Agent Extension panel: one compact toolbar row (scope
		* switch, narrowed project select, the search field with inline active-filter
		* chips and type-filter dropdown, then the action cluster with 「新建记忆」
		* rightmost), the entry list as a full-width card grid
		* with tag-chip filtering and a recency sort, a wide detail dialog for
		* create / edit / save / deactivate / archive / restore / two-step delete,
		* the Markdown export plus an index-refresh action, a settings dialog
		* (capture-injection switches and limits persist immediately; per-session
		* statistics and the recent-capture list with its one-shot undo live there
		* too), and a
		* health-audit dialog (stale / duplicate / low-value findings with batch
		* archive / deactivate / delete reusing the existing endpoints), and the
		* maintenance dialog (threshold prompt, confirm / run / result, and the
		* recent-run list with its whole-run undo).
		*
		* The view owns its local state (the hub snapshot only carries the section
		* tab) and talks to the host's `/memory/*` routes through `api()`; all copy
		* comes from `t()` and every toast goes through `actions.toast`.
		*
		* @module dsh-agent-extension/client/MemoryView
		*/
		const TYPE_VALUES = [
			"preference",
			"decision",
			"gotcha",
			"project",
			"reference"
		];
		const TYPE_LABEL_KEYS = {
			preference: "memoryTypePreference",
			decision: "memoryTypeDecision",
			gotcha: "memoryTypeGotcha",
			project: "memoryTypeProject",
			reference: "memoryTypeReference"
		};
		const STATUS_LABEL_KEYS = {
			active: "memoryStatusActive",
			stale: "memoryStatusStale",
			archived: "memoryStatusArchived"
		};
		const DEFAULT_SETTINGS = defaultSettings();
		/** 「最近捕获」最多展示的条数（stats.recentCaptures 顺序即最新在前）。 */
		const RECENT_CAPTURE_ROWS = 5;
		/** 维护对话框里展示的最近运行条数。 */
		const RECENT_MAINTENANCE_ROWS = 3;
		/** 诊断对话框每块默认展示的条数，其余折叠。 */
		const DIAGNOSIS_ROWS = 10;
		const EMPTY_FORM = {
			name: "",
			description: "",
			type: "preference",
			tags: [],
			importance: 50,
			content: ""
		};
		/** Loose JSON object guard. */
		function record(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
		}
		/** Coerce to a trimmed string; missing values become the fallback. */
		function text(value, fallback = "") {
			return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
		}
		/** Coerce to a clamped integer; NaN falls back. */
		function integer(value, min, max, fallback) {
			const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
			if (!Number.isFinite(parsed)) return fallback;
			return Math.min(max, Math.max(min, Math.round(parsed)));
		}
		/** Normalize one list row. */
		function normalizeSummary(raw) {
			const item = record(raw);
			return {
				id: text(item.id),
				name: text(item.name),
				description: text(item.description),
				type: text(item.type),
				tags: Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === "string") : [],
				importance: integer(item.importance, 0, 100, 50),
				status: text(item.status),
				reinforcement: integer(item.reinforcement, 0, Number.MAX_SAFE_INTEGER, 0),
				createdAt: text(item.createdAt),
				updatedAt: text(item.updatedAt)
			};
		}
		/** Normalize one full entry. */
		function normalizeEntry(raw) {
			const item = record(raw);
			return {
				...normalizeSummary(item),
				content: text(item.content),
				originSessionId: text(item.originSessionId),
				supersedes: Array.isArray(item.supersedes) ? item.supersedes.filter((id) => typeof id === "string") : [],
				obsoleteVotes: integer(item.obsoleteVotes, 0, Number.MAX_SAFE_INTEGER, 0)
			};
		}
		/** 归一化项目数组，按 lastSeen 从新到旧排序。 */
		function normalizeProjects(raw) {
			const list = Array.isArray(raw) ? raw : [];
			const projects = [];
			for (const entry of list) {
				const item = record(entry);
				const key = text(item.key);
				if (key === "") continue;
				projects.push({
					key,
					displayName: text(item.displayName) || key,
					source: text(item.source),
					identity: text(item.identity),
					lastSeen: text(item.lastSeen),
					entryCount: integer(item.entryCount, 0, Number.MAX_SAFE_INTEGER, 0)
				});
			}
			return projects.sort((left, right) => timeOf(right.lastSeen) - timeOf(left.lastSeen));
		}
		function timeOf(value) {
			const time = Date.parse(value);
			return Number.isFinite(time) ? time : 0;
		}
		/** 归一化设置块（维护模型缺省为空串：继承宿主默认模型）。 */
		function normalizeSettings(raw) {
			const item = record(raw);
			return {
				captureEnabled: item.captureEnabled !== false,
				captureSessionEnd: item.captureSessionEnd !== false,
				injectEnabled: item.injectEnabled !== false,
				indexLimitGlobal: integer(item.indexLimitGlobal, 0, 20, DEFAULT_SETTINGS.indexLimitGlobal),
				indexLimitProject: integer(item.indexLimitProject, 0, 20, DEFAULT_SETTINGS.indexLimitProject),
				maxChars: integer(item.maxChars, 1e3, RECALL_MAX_CHARS, DEFAULT_SETTINGS.maxChars),
				maintenanceProvider: text(item.maintenanceProvider),
				maintenanceModel: text(item.maintenanceModel),
				updatedAt: text(item.updatedAt)
			};
		}
		/** 归一化统计块（v2：会话命中、跳过原因与最近样本；检索样本缺省 []）。 */
		function normalizeStats(raw) {
			const item = record(raw);
			const sessions = (Array.isArray(item.sessions) ? item.sessions : []).map((entry) => {
				const session = record(entry);
				return {
					sessionId: text(session.sessionId),
					injected: integer(session.injected, 0, Number.MAX_SAFE_INTEGER, 0),
					injectedUsed: integer(session.injectedUsed, 0, Number.MAX_SAFE_INTEGER, 0),
					searched: integer(session.searched, 0, Number.MAX_SAFE_INTEGER, 0),
					searchUsed: integer(session.searchUsed, 0, Number.MAX_SAFE_INTEGER, 0),
					overflow: integer(session.overflow, 0, Number.MAX_SAFE_INTEGER, 0),
					updatedAt: text(session.updatedAt)
				};
			});
			const skipReasons = {};
			for (const [reason, count] of Object.entries(record(item.skipReasons))) skipReasons[reason] = integer(count, 0, Number.MAX_SAFE_INTEGER, 0);
			const recentInjections = (Array.isArray(item.recentInjections) ? item.recentInjections : []).map(record).map((sample) => ({
				sessionId: text(sample.sessionId),
				at: text(sample.at),
				entries: integer(sample.entries, 0, Number.MAX_SAFE_INTEGER, 0),
				chars: integer(sample.chars, 0, Number.MAX_SAFE_INTEGER, 0),
				truncated: sample.truncated === true
			}));
			const recentCaptures = (Array.isArray(item.recentCaptures) ? item.recentCaptures : []).map(record).map((sample) => {
				const skippedReason = text(sample.skippedReason);
				const error = text(sample.error);
				const created = (Array.isArray(sample.created) ? sample.created : []).map(record).map((entry) => ({
					id: text(entry.id),
					scope: entry.scope === "project" ? "project" : "global",
					project: text(entry.project)
				}));
				return {
					id: text(sample.id),
					at: text(sample.at),
					sessionId: text(sample.sessionId),
					written: integer(sample.written, 0, Number.MAX_SAFE_INTEGER, 0),
					created,
					undone: sample.undone === true,
					...skippedReason === "" ? {} : { skippedReason },
					...error === "" ? {} : { error }
				};
			});
			const recentRetrievals = (Array.isArray(item.recentRetrievals) ? item.recentRetrievals : []).map(record).map((sample) => ({
				at: text(sample.at),
				sessionId: text(sample.sessionId),
				query: text(sample.query),
				results: integer(sample.results, 0, Number.MAX_SAFE_INTEGER, 0),
				ids: Array.isArray(sample.ids) ? sample.ids.filter((id) => typeof id === "string") : []
			}));
			return {
				captureRuns: integer(item.captureRuns, 0, Number.MAX_SAFE_INTEGER, 0),
				capturedEntries: integer(item.capturedEntries, 0, Number.MAX_SAFE_INTEGER, 0),
				captureSkips: integer(item.captureSkips, 0, Number.MAX_SAFE_INTEGER, 0),
				sessions,
				skipReasons,
				recentInjections,
				recentCaptures,
				recentRetrievals
			};
		}
		/** 归一化一次维护运行；未知状态按「无变更」处理。 */
		function normalizeMaintenanceRun(raw) {
			const item = record(raw);
			const counts = record(item.counts);
			return {
				id: text(item.id),
				at: text(item.at),
				status: item.status === "completed" || item.status === "failed" || item.status === "empty" ? item.status : "empty",
				counts: {
					candidates: integer(counts.candidates, 0, Number.MAX_SAFE_INTEGER, 0),
					merges: integer(counts.merges, 0, Number.MAX_SAFE_INTEGER, 0),
					staled: integer(counts.staled, 0, Number.MAX_SAFE_INTEGER, 0),
					restored: integer(counts.restored, 0, Number.MAX_SAFE_INTEGER, 0),
					deleted: integer(counts.deleted, 0, Number.MAX_SAFE_INTEGER, 0)
				},
				error: text(item.error),
				undone: item.undone === true
			};
		}
		/** 归一化维护概览；未知/失败载荷读作「未达阈值」。 */
		function normalizeMaintenance(raw) {
			const item = record(raw);
			return {
				due: item.due === true,
				reason: text(item.reason),
				writesSince: integer(item.writesSince, 0, Number.MAX_SAFE_INTEGER, 0),
				daysSince: integer(item.daysSince, -1, Number.MAX_SAFE_INTEGER, -1),
				recentRuns: (Array.isArray(item.recentRuns) ? item.recentRuns : []).map(normalizeMaintenanceRun)
			};
		}
		/** 维护状态文案 key。 */
		function maintenanceStatusKey(status) {
			if (status === "completed") return "memoryMaintenanceStatusCompleted";
			if (status === "failed") return "memoryMaintenanceStatusFailed";
			return "memoryMaintenanceStatusEmpty";
		}
		/** 维护状态徽章色。 */
		function maintenanceTone(run) {
			if (run.undone) return "plain";
			return run.status === "completed" ? "success" : run.status === "failed" ? "error" : "plain";
		}
		/** 阈值原因：优先本地化的条数/天数，服务端 reason 只作兜底。 */
		function maintenanceDueText(info, t) {
			if (info.daysSince < 0) return t("memoryMaintenanceDueNeverHint", { writes: info.writesSince });
			if (info.writesSince > 0 || info.daysSince > 0) return t("memoryMaintenanceDueHint", {
				writes: info.writesSince,
				days: info.daysSince
			});
			return info.reason !== "" ? info.reason : t("memoryMaintenanceDueHint", {
				writes: 0,
				days: 0
			});
		}
		/** Form values of one loaded entry. */
		function formOf(entry) {
			const type = TYPE_VALUES.find((value) => value === entry.type) ?? "preference";
			return {
				name: entry.name,
				description: entry.description,
				type,
				tags: [...entry.tags],
				importance: entry.importance,
				content: entry.content
			};
		}
		/** Localized type label; unknown values fall back to the raw server text. */
		function typeLabel(value, t) {
			const type = TYPE_VALUES.find((entry) => entry === value);
			return type ? t(TYPE_LABEL_KEYS[type]) : value;
		}
		/** Localized status label; unknown values fall back to the raw server text. */
		function statusLabel(value, t) {
			const status = value === "active" || value === "stale" || value === "archived" ? value : null;
			return status ? t(STATUS_LABEL_KEYS[status]) : value;
		}
		/** Badge tone of one status. */
		function statusTone(value) {
			return value === "active" ? "success" : value === "stale" ? "warn" : "plain";
		}
		/**
		* Trigger a browser download of an exported Markdown file.
		* Throws when the environment has no object-URL support so the caller can
		* degrade with a toast (jsdom and some embedded webviews lack it).
		*/
		function downloadFile(filename, content) {
			if (typeof document === "undefined") throw new Error("download unsupported");
			const createObjectURL = typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL.bind(URL) : null;
			if (createObjectURL === null) throw new Error("object URL unsupported");
			const href = createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
			const anchor = document.createElement("a");
			anchor.href = href;
			anchor.download = filename;
			anchor.rel = "noopener";
			document.body.append(anchor);
			anchor.click();
			anchor.remove();
			if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(href);
		}
		/** 百分比展示；分母为 0（尚无会话数据）时显示破折号。 */
		function percentText(used, total) {
			return total <= 0 ? "—" : `${Math.round(used / total * 100)}%`;
		}
		/** 汇总所有会话的注入与检索计数。 */
		function recallTotalsOf(stats) {
			const totals = {
				injected: 0,
				injectedUsed: 0,
				searched: 0,
				searchUsed: 0
			};
			for (const session of stats?.sessions ?? []) {
				totals.injected += session.injected;
				totals.injectedUsed += session.injectedUsed;
				totals.searched += session.searched ?? 0;
				totals.searchUsed += session.searchUsed ?? 0;
			}
			return totals;
		}
		/** 捕获行的说明文本：错误优先，其次跳过原因；都没有时为空串。 */
		function captureNoteOf(row, t) {
			if (row.error !== void 0 && row.error !== "") return row.error;
			if (row.skippedReason !== void 0 && row.skippedReason !== "") return t("memoryCaptureSkipped", { reason: row.skippedReason });
			return "";
		}
		/** Render the memory tab. */
		function MemoryView({ actions, t }) {
			const [stateReady, setStateReady] = (0, react.useState)(false);
			const [stateBusy, setStateBusy] = (0, react.useState)(false);
			const [stateError, setStateError] = (0, react.useState)("");
			const [stateToken, setStateToken] = (0, react.useState)(0);
			const [projects, setProjects] = (0, react.useState)([]);
			const [stats, setStats] = (0, react.useState)(null);
			const [scope, setScope] = (0, react.useState)("global");
			const [project, setProject] = (0, react.useState)("");
			const [query, setQuery] = (0, react.useState)("");
			const [appliedQuery, setAppliedQuery] = (0, react.useState)("");
			const [typeFilter, setTypeFilter] = (0, react.useState)("");
			const [entries, setEntries] = (0, react.useState)([]);
			const [listReady, setListReady] = (0, react.useState)(false);
			const [listBusy, setListBusy] = (0, react.useState)(false);
			const [listError, setListError] = (0, react.useState)("");
			const [listToken, setListToken] = (0, react.useState)(0);
			const [selectedId, setSelectedId] = (0, react.useState)(null);
			const [entry, setEntry] = (0, react.useState)(null);
			const [creating, setCreating] = (0, react.useState)(false);
			const [detailStatus, setDetailStatus] = (0, react.useState)("idle");
			const [detailError, setDetailError] = (0, react.useState)("");
			const [form, setForm] = (0, react.useState)(EMPTY_FORM);
			const [saveBusy, setSaveBusy] = (0, react.useState)(false);
			const [statusBusy, setStatusBusy] = (0, react.useState)(false);
			const [deleteBusy, setDeleteBusy] = (0, react.useState)(false);
			const [confirmDelete, setConfirmDelete] = (0, react.useState)(false);
			const [exportBusy, setExportBusy] = (0, react.useState)(false);
			const [refreshIndexBusy, setRefreshIndexBusy] = (0, react.useState)(false);
			const [settings, setSettings] = (0, react.useState)(DEFAULT_SETTINGS);
			const [settingsOpen, setSettingsOpen] = (0, react.useState)(false);
			const [maintenance, setMaintenance] = (0, react.useState)(null);
			const [maintenanceOpen, setMaintenanceOpen] = (0, react.useState)(false);
			const [maintenancePrompt, setMaintenancePrompt] = (0, react.useState)(false);
			const [maintenanceBusy, setMaintenanceBusy] = (0, react.useState)(false);
			const [maintenanceRunning, setMaintenanceRunning] = (0, react.useState)(false);
			const [maintenanceUndoBusy, setMaintenanceUndoBusy] = (0, react.useState)(false);
			const [maintenanceResult, setMaintenanceResult] = (0, react.useState)(null);
			const [undoBusyId, setUndoBusyId] = (0, react.useState)(null);
			const [undoneCaptureIds, setUndoneCaptureIds] = (0, react.useState)([]);
			const [tagFilter, setTagFilter] = (0, react.useState)("");
			const [sort, setSort] = (0, react.useState)("default");
			const [tagDraft, setTagDraft] = (0, react.useState)("");
			const [auditOpen, setAuditOpen] = (0, react.useState)(false);
			const [auditBusy, setAuditBusy] = (0, react.useState)(false);
			const [auditResult, setAuditResult] = (0, react.useState)(null);
			const [auditSelected, setAuditSelected] = (0, react.useState)([]);
			const [auditConfirmDelete, setAuditConfirmDelete] = (0, react.useState)(false);
			const [auditBatchBusy, setAuditBatchBusy] = (0, react.useState)(false);
			const [showArchived, setShowArchived] = (0, react.useState)(false);
			const [diagnosisOpen, setDiagnosisOpen] = (0, react.useState)(false);
			const [diagnosisBusy, setDiagnosisBusy] = (0, react.useState)(false);
			const [diagnosisError, setDiagnosisError] = (0, react.useState)("");
			const [diagnosisStats, setDiagnosisStats] = (0, react.useState)(null);
			const [diagnosisRuns, setDiagnosisRuns] = (0, react.useState)([]);
			const [diagnosisUndoBusyId, setDiagnosisUndoBusyId] = (0, react.useState)(null);
			const userChoseRef = (0, react.useRef)(false);
			const detailSeq = (0, react.useRef)(0);
			const idTextRef = (0, react.useRef)(null);
			const settingsRef = (0, react.useRef)(DEFAULT_SETTINGS);
			const savedSettingsRef = (0, react.useRef)(DEFAULT_SETTINGS);
			const settingsTimer = (0, react.useRef)(null);
			const maintenanceOpenRef = (0, react.useRef)(false);
			const maintenancePromptedRef = (0, react.useRef)(false);
			(0, react.useEffect)(() => () => {
				if (settingsTimer.current !== null) clearTimeout(settingsTimer.current);
			}, []);
			(0, react.useEffect)(() => {
				let cancelled = false;
				setStateBusy(true);
				setStateError("");
				(async () => {
					try {
						const data = await api("/memory/state");
						if (cancelled) return;
						const nextProjects = normalizeProjects(data.projects);
						setProjects(nextProjects);
						setStats(normalizeStats(data.stats));
						const nextSettings = normalizeSettings(data.settings);
						savedSettingsRef.current = nextSettings;
						settingsRef.current = nextSettings;
						setSettings(nextSettings);
						if (!userChoseRef.current) {
							const latest = nextProjects[0];
							setScope(latest ? "project" : "global");
							setProject(latest ? latest.key : "");
						} else setProject((current) => current === "" ? nextProjects[0]?.key ?? "" : nextProjects.some((item) => item.key === current) ? current : nextProjects[0]?.key ?? "");
						setStateReady(true);
					} catch (error) {
						if (!cancelled) setStateError(errorMessageFor(error, t));
					} finally {
						if (!cancelled) setStateBusy(false);
					}
				})();
				return () => {
					cancelled = true;
				};
			}, [stateToken, t]);
			(0, react.useEffect)(() => {
				if (!stateReady) return;
				let cancelled = false;
				(async () => {
					try {
						const data = await api("/memory/maintenance");
						if (cancelled) return;
						const info = normalizeMaintenance(data);
						setMaintenance(info);
						if (info.due && !maintenancePromptedRef.current && !maintenanceOpenRef.current) {
							maintenancePromptedRef.current = true;
							maintenanceOpenRef.current = true;
							setMaintenanceResult(null);
							setMaintenancePrompt(true);
							setMaintenanceOpen(true);
						}
					} catch {}
				})();
				return () => {
					cancelled = true;
				};
			}, [stateReady, stateToken]);
			(0, react.useEffect)(() => {
				if (query === appliedQuery) return;
				const timer = setTimeout(() => {
					setAppliedQuery(query);
				}, 300);
				return () => {
					clearTimeout(timer);
				};
			}, [query, appliedQuery]);
			(0, react.useEffect)(() => {
				if (!stateReady) return;
				if (scope === "project" && project === "") {
					setEntries([]);
					setListReady(true);
					setListError("");
					return;
				}
				setListBusy(true);
				setListError("");
				let cancelled = false;
				const params = new URLSearchParams();
				params.set("scope", scope);
				if (scope === "project") params.set("project", project);
				params.set("query", appliedQuery);
				if (typeFilter !== "") params.set("type", typeFilter);
				if (showArchived) params.set("includeArchived", "1");
				(async () => {
					try {
						const data = await api(`/memory/list?${params.toString()}`);
						if (cancelled) return;
						const list = Array.isArray(data.entries) ? data.entries : [];
						setEntries(list.map(normalizeSummary));
						setListReady(true);
					} catch (error) {
						if (!cancelled) {
							setListError(errorMessageFor(error, t));
							setListReady(true);
						}
					} finally {
						if (!cancelled) setListBusy(false);
					}
				})();
				return () => {
					cancelled = true;
				};
			}, [
				stateReady,
				scope,
				project,
				appliedQuery,
				typeFilter,
				showArchived,
				listToken,
				t
			]);
			const latestProjectKey = (list) => list[0]?.key ?? "";
			const closeEditor = () => {
				detailSeq.current += 1;
				setSelectedId(null);
				setEntry(null);
				setCreating(false);
				setConfirmDelete(false);
				setDetailStatus("idle");
				setDetailError("");
				setTagDraft("");
			};
			const chooseScope = (next) => {
				userChoseRef.current = true;
				setScope(next);
				closeEditor();
				if (next === "project" && project === "") setProject(latestProjectKey(projects));
			};
			const chooseProject = (next) => {
				userChoseRef.current = true;
				setProject(next);
				closeEditor();
			};
			const startCreate = () => {
				detailSeq.current += 1;
				setCreating(true);
				setSelectedId(null);
				setEntry(null);
				setForm(EMPTY_FORM);
				setDetailStatus("idle");
				setDetailError("");
				setConfirmDelete(false);
				setTagDraft("");
			};
			const openEntry = (id) => {
				const seq = ++detailSeq.current;
				setCreating(false);
				setSelectedId(id);
				setEntry(null);
				setForm(EMPTY_FORM);
				setConfirmDelete(false);
				setTagDraft("");
				setDetailStatus("loading");
				setDetailError("");
				const params = new URLSearchParams();
				params.set("scope", scope);
				if (scope === "project") params.set("project", project);
				params.set("id", id);
				(async () => {
					try {
						const data = await api(`/memory/get?${params.toString()}`);
						if (seq !== detailSeq.current) return;
						const loaded = normalizeEntry(data.entry);
						setEntry(loaded);
						setForm(formOf(loaded));
						setDetailStatus("ready");
					} catch (error) {
						if (seq !== detailSeq.current) return;
						setDetailError(errorMessageFor(error, t));
						setDetailStatus("error");
					}
				})();
			};
			const saveEntry = async () => {
				if (saveBusy) return;
				const name = form.name.trim();
				if (name === "" || form.content.trim() === "") {
					actions.toast("warn", t("memoryNameRequired"));
					return;
				}
				if (scope === "project" && project === "") {
					actions.toast("warn", t("memoryProjectEmpty"));
					return;
				}
				setSaveBusy(true);
				try {
					const body = {
						scope,
						name,
						description: form.description.trim(),
						type: form.type,
						content: form.content,
						tags: form.tags,
						importance: form.importance
					};
					if (scope === "project") body.project = project;
					if (!creating && entry) body.id = entry.id;
					const saved = normalizeEntry((await api("/memory/save", {
						method: "POST",
						body
					})).entry);
					setEntry(saved);
					setForm(formOf(saved));
					setTagDraft("");
					setSelectedId(saved.id);
					setCreating(false);
					setDetailStatus("ready");
					actions.toast("success", t("memorySaved"));
					setListToken((token) => token + 1);
				} catch (error) {
					actions.toast("error", errorMessageFor(error, t));
				} finally {
					setSaveBusy(false);
				}
			};
			const changeStatus = async (status) => {
				if (entry === null || statusBusy) return;
				setStatusBusy(true);
				try {
					const body = {
						scope,
						id: entry.id,
						status
					};
					if (scope === "project") body.project = project;
					const updated = normalizeEntry((await api("/memory/status", {
						method: "POST",
						body
					})).entry);
					setEntry(updated);
					setForm(formOf(updated));
					setConfirmDelete(false);
					actions.toast("success", t("memoryStatusDone"));
					setListToken((token) => token + 1);
				} catch (error) {
					actions.toast("error", errorMessageFor(error, t));
				} finally {
					setStatusBusy(false);
				}
			};
			const removeEntry = async () => {
				if (entry === null || deleteBusy) return;
				setDeleteBusy(true);
				try {
					const body = {
						scope,
						id: entry.id
					};
					if (scope === "project") body.project = project;
					await api("/memory/delete", {
						method: "POST",
						body
					});
					actions.toast("success", t("memoryDeleted", { name: entry.name }));
					closeEditor();
					setListToken((token) => token + 1);
				} catch (error) {
					actions.toast("error", errorMessageFor(error, t));
				} finally {
					setDeleteBusy(false);
				}
			};
			/** POST the current settings; a failure toasts and rolls the UI back. */
			const persistSettings = async () => {
				settingsTimer.current = null;
				try {
					const data = await api("/memory/settings", {
						method: "POST",
						body: settingsRef.current
					});
					savedSettingsRef.current = normalizeSettings(data.settings);
				} catch (error) {
					actions.toast("error", errorMessageFor(error, t));
					settingsRef.current = savedSettingsRef.current;
					setSettings(savedSettingsRef.current);
				}
			};
			/**
			* Merge one partial settings patch into the local state and persist.
			* Switches persist immediately; numeric and model fields debounce by 500 ms.
			*/
			const patchSettings = (partial, debounce = false) => {
				const next = {
					...settingsRef.current,
					...partial
				};
				settingsRef.current = next;
				setSettings(next);
				if (settingsTimer.current !== null) clearTimeout(settingsTimer.current);
				if (debounce) settingsTimer.current = setTimeout(() => {
					persistSettings();
				}, 500);
				else persistSettings();
			};
			const exportMarkdown = async () => {
				if (exportBusy || scope === "project" && project === "") return;
				setExportBusy(true);
				try {
					const body = { scope };
					if (scope === "project") body.project = project;
					const data = await api("/memory/export", {
						method: "POST",
						body
					});
					const filename = text(data.filename) || "memory.md";
					downloadFile(filename, text(data.content));
					actions.toast("success", t("memoryExportDone", { filename }));
				} catch (error) {
					actions.toast("error", t("memoryExportFailed", { message: errorMessageFor(error, t) }));
				} finally {
					setExportBusy(false);
				}
			};
			/** 重建提示词索引：只改变注入内容，本视图的条目列表不重载。 */
			const refreshIndex = async () => {
				if (refreshIndexBusy) return;
				setRefreshIndexBusy(true);
				try {
					await api("/memory/refresh-index", { method: "POST" });
					actions.toast("success", t("memoryRefreshIndexDone"));
				} catch (error) {
					actions.toast("error", t("memoryRefreshIndexFailed", { message: errorMessageFor(error, t) }));
				} finally {
					setRefreshIndexBusy(false);
				}
			};
			/** 关闭维护对话框；运行/撤销进行中保持打开。 */
			const closeMaintenance = () => {
				if (maintenanceRunning || maintenanceUndoBusy) return;
				maintenanceOpenRef.current = false;
				setMaintenanceOpen(false);
				setMaintenancePrompt(false);
				setMaintenanceResult(null);
			};
			/** 工具条入口：先取阈值概览，再打开确认对话框。 */
			const openMaintenance = async () => {
				if (maintenanceBusy || maintenanceRunning) return;
				setMaintenanceBusy(true);
				setMaintenancePrompt(false);
				setMaintenanceResult(null);
				try {
					const data = await api("/memory/maintenance");
					setMaintenance(normalizeMaintenance(data));
					maintenanceOpenRef.current = true;
					setMaintenanceOpen(true);
				} catch (error) {
					actions.toast("error", errorMessageFor(error, t));
				} finally {
					setMaintenanceBusy(false);
				}
			};
			/** 运行维护：范围由服务端决定（全局 + 最久未维护的项目）。 */
			const runMaintenance = async () => {
				if (maintenanceRunning || maintenance === null) return;
				setMaintenanceRunning(true);
				try {
					const data = await api("/memory/maintenance/run", {
						method: "POST",
						body: {}
					});
					setMaintenanceResult(normalizeMaintenanceRun(data.run));
					setStateToken((token) => token + 1);
				} catch (error) {
					actions.toast("error", t("memoryMaintenanceFailed", { message: errorMessageFor(error, t) }));
				} finally {
					setMaintenanceRunning(false);
				}
			};
			/** 撤销一次维护：本地标记撤销，随后经 stateToken 重拉概览与面板状态。 */
			const undoMaintenance = async (runId) => {
				if (maintenanceUndoBusy || runId === "") return;
				setMaintenanceUndoBusy(true);
				try {
					await api("/memory/maintenance/undo", {
						method: "POST",
						body: { runId }
					});
					setMaintenance((current) => current === null ? current : {
						...current,
						recentRuns: current.recentRuns.map((run) => run.id === runId ? {
							...run,
							undone: true
						} : run)
					});
					setMaintenanceResult((current) => current !== null && current.id === runId ? {
						...current,
						undone: true
					} : current);
					actions.toast("success", t("memoryMaintenanceUndone"));
					setStateToken((token) => token + 1);
				} catch (error) {
					actions.toast("error", t("memoryMaintenanceUndoFailed", { message: errorMessageFor(error, t) }));
				} finally {
					setMaintenanceUndoBusy(false);
				}
			};
			/** 撤销一次捕获：归档该次写入，随后重拉 /memory/state 刷新统计。 */
			const undoCapture = async (id) => {
				if (undoBusyId !== null || id === "") return;
				setUndoBusyId(id);
				try {
					await api("/memory/undo-capture", {
						method: "POST",
						body: { id }
					});
					setUndoneCaptureIds((current) => current.includes(id) ? current : [...current, id]);
					actions.toast("success", t("memoryUndoCaptureDone"));
					setStateToken((token) => token + 1);
				} catch (error) {
					actions.toast("error", t("memoryUndoCaptureFailed", { message: errorMessageFor(error, t) }));
				} finally {
					setUndoBusyId(null);
				}
			};
			/** 重拉诊断所需的两个数据面：统计（注入/捕获/检索样本）与维护流水。 */
			const loadDiagnosis = async () => {
				setDiagnosisBusy(true);
				setDiagnosisError("");
				try {
					const [stateData, maintenanceData] = await Promise.all([api("/memory/state"), api("/memory/maintenance")]);
					setDiagnosisStats(normalizeStats(stateData.stats));
					setDiagnosisRuns(normalizeMaintenance(maintenanceData).recentRuns);
				} catch (error) {
					setDiagnosisError(errorMessageFor(error, t));
				} finally {
					setDiagnosisBusy(false);
				}
			};
			/** 打开诊断对话框：每次打开都拉新快照，避免展示过期样本。 */
			const openDiagnosis = () => {
				setDiagnosisOpen(true);
				setDiagnosisStats(null);
				setDiagnosisRuns([]);
				setDiagnosisError("");
				loadDiagnosis();
			};
			/** 撤销一次维护；成功后全体重拉两块诊断数据。 */
			const undoDiagnosisRun = async (runId) => {
				if (diagnosisUndoBusyId !== null || runId === "") return;
				setDiagnosisUndoBusyId(runId);
				try {
					await api("/memory/maintenance/undo", {
						method: "POST",
						body: { runId }
					});
					setDiagnosisRuns((current) => current.map((run) => run.id === runId ? {
						...run,
						undone: true
					} : run));
					actions.toast("success", t("memoryDiagnosisUndoDone"));
					await loadDiagnosis();
				} catch (error) {
					actions.toast("error", t("memoryDiagnosisUndoFailed", { message: errorMessageFor(error, t) }));
				} finally {
					setDiagnosisUndoBusyId(null);
				}
			};
			/**
			* 复制记忆 id：优先剪贴板；环境不提供或写入失败时静默降级为全选 id 文本
			* （不弹错误，用户可直接 Ctrl/Cmd+C）。
			*/
			const copyEntryId = async (id) => {
				try {
					const clipboard = typeof navigator === "undefined" ? void 0 : navigator.clipboard;
					if (clipboard === void 0 || typeof clipboard.writeText !== "function") throw new Error("clipboard unavailable");
					await clipboard.writeText(id);
					actions.toast("success", t("memoryIdCopied"));
					return;
				} catch {}
				const node = idTextRef.current;
				if (node === null || typeof document === "undefined" || typeof window === "undefined") return;
				const selection = window.getSelection();
				if (selection === null) return;
				const range = document.createRange();
				range.selectNodeContents(node);
				selection.removeAllRanges();
				selection.addRange(range);
			};
			/** Full-list fetch + client-side audit rules for the current scope. */
			const openAudit = async () => {
				if (auditBusy || scope === "project" && project === "") return;
				setAuditBusy(true);
				try {
					const params = new URLSearchParams();
					params.set("scope", scope);
					if (scope === "project") params.set("project", project);
					params.set("includeArchived", "1");
					params.set("content", "1");
					const data = await api(`/memory/list?${params.toString()}`);
					const list = Array.isArray(data.entries) ? data.entries : [];
					setAuditResult(runAudit(list.map(normalizeEntry), Date.now()));
					setAuditSelected([]);
					setAuditConfirmDelete(false);
					setAuditOpen(true);
				} catch (error) {
					actions.toast("error", errorMessageFor(error, t));
				} finally {
					setAuditBusy(false);
				}
			};
			/** Select / unselect one audit finding row. */
			const toggleAuditSelect = (id) => {
				setAuditSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
			};
			/** Run a batch action over the selected rows, reusing the existing endpoints. */
			const runAuditBatch = async (action) => {
				if (auditBatchBusy || auditSelected.length === 0) return;
				if (action === "delete" && !auditConfirmDelete) {
					setAuditConfirmDelete(true);
					return;
				}
				setAuditBatchBusy(true);
				const ids = [...auditSelected];
				let failed = 0;
				try {
					for (const id of ids) {
						const body = {
							scope,
							id
						};
						if (scope === "project") body.project = project;
						try {
							if (action === "delete") await api("/memory/delete", {
								method: "POST",
								body
							});
							else await api("/memory/status", {
								method: "POST",
								body: {
									...body,
									status: action === "archive" ? "archived" : "stale"
								}
							});
						} catch {
							failed += 1;
						}
					}
					actions.toast(failed === 0 ? "success" : "warn", failed === 0 ? t("memoryAuditDone", { count: ids.length }) : t("memoryAuditPartial", { count: failed }));
					setAuditOpen(false);
					setListToken((token) => token + 1);
				} finally {
					setAuditBatchBusy(false);
					setAuditConfirmDelete(false);
					setAuditSelected([]);
				}
			};
			const submitSearch = () => {
				if (query === appliedQuery) setListToken((token) => token + 1);
				else setAppliedQuery(query);
			};
			/** Append comma-separated text as deduplicated tag chips. */
			const appendTags = (raw) => {
				const parts = raw.split(/[,，]/u).map((part) => part.trim()).filter((part) => part !== "");
				if (parts.length === 0) return;
				setForm((current) => {
					const tags = [...current.tags];
					for (const part of parts) if (!tags.includes(part)) tags.push(part);
					return {
						...current,
						tags
					};
				});
			};
			/** Commit the pending tag draft (Enter / comma / blur). */
			const commitTagDraft = () => {
				if (tagDraft === "") return;
				const raw = tagDraft;
				setTagDraft("");
				appendTags(raw);
			};
			const projectRequired = scope === "project" && project === "";
			const projectMissing = scope === "project" && projects.length === 0;
			const activeFilters = [];
			if (typeFilter !== "") activeFilters.push({
				kind: "type",
				label: typeLabel(typeFilter, t),
				clearLabel: t("memoryClearTypeFilter")
			});
			if (tagFilter !== "") activeFilters.push({
				kind: "tag",
				label: tagFilter,
				clearLabel: t("memoryClearTagFilter")
			});
			const visibleFilter = activeFilters[0] ?? null;
			const hiddenFilterCount = activeFilters.length - (visibleFilter === null ? 0 : 1);
			const recallTotals = recallTotalsOf(stats);
			const injectionRate = percentText(recallTotals.injectedUsed, recallTotals.injected);
			const retrievalRate = percentText(recallTotals.searchUsed, recallTotals.searched);
			const recentCaptureRows = (stats?.recentCaptures ?? []).slice(0, RECENT_CAPTURE_ROWS);
			const showEditor = creating || selectedId !== null;
			const HostMarkdownText = loadHostMarkdownText();
			const typeOptions = [{
				value: "",
				label: t("memoryTypeAll")
			}, ...TYPE_VALUES.map((value) => ({
				value,
				label: t(TYPE_LABEL_KEYS[value])
			}))];
			const visibleEntries = (showArchived ? entries : entries.filter((item) => item.status !== "archived")).filter((item) => tagFilter === "" || item.tags.includes(tagFilter));
			const sortedEntries = sort === "recent" ? [...visibleEntries].sort((left, right) => timeOf(right.updatedAt) - timeOf(left.updatedAt)) : visibleEntries;
			const auditEmpty = auditResult !== null && auditResult.stale.length === 0 && auditResult.duplicates.length === 0 && auditResult.lowValue.length === 0;
			/** 诊断对话框的一块：前 10 条直接展示，其余折叠在 details 里。 */
			const diagnosisSection = (title, rows, empty) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: memory_module_css_default.diagnosisSection,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					className: memory_module_css_default.statsTitle,
					children: title
				}), rows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: memory_module_css_default.statLabel,
					children: empty
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: memory_module_css_default.diagnosisList,
					children: rows.slice(0, DIAGNOSIS_ROWS)
				}), rows.length > DIAGNOSIS_ROWS ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
					className: memory_module_css_default.diagnosisMore,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("memoryDiagnosisMore", { count: rows.length - DIAGNOSIS_ROWS }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: memory_module_css_default.diagnosisList,
						children: rows.slice(DIAGNOSIS_ROWS)
					})]
				}) : null] })]
			});
			const diagnosisEmptyText = t("memoryDiagnosisEmpty");
			const injectionRows = (diagnosisStats?.recentInjections ?? []).map((row, index) => {
				const at = formatTime(row.at);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: memory_module_css_default.diagnosisRow,
					children: [at !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: memory_module_css_default.diagnosisRowTime,
						children: at
					}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: memory_module_css_default.diagnosisRowMain,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("memoryDiagnosisEntries", { count: row.entries }) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("memoryDiagnosisChars", { count: row.chars }) }),
							row.truncated ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
								tone: "warn",
								children: t("memoryDiagnosisTruncated")
							}) : null
						]
					})]
				}, `${index}-${row.at}-${row.sessionId}`);
			});
			const captureRows = (diagnosisStats?.recentCaptures ?? []).map((row, index) => {
				const at = formatTime(row.at);
				const note = captureNoteOf(row, t);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: memory_module_css_default.diagnosisRow,
					children: [
						at !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: memory_module_css_default.diagnosisRowTime,
							children: at
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: memory_module_css_default.diagnosisRowMain,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("memoryCaptureWritten", { count: row.written }) }), note !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								title: note,
								children: note
							}) : null]
						}),
						row.undone === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
							tone: "plain",
							children: t("memoryCaptureUndone")
						}) : null
					]
				}, `${index}-${row.id}`);
			});
			const retrievalRows = (diagnosisStats?.recentRetrievals ?? []).map((row, index) => {
				const at = formatTime(row.at);
				const query = row.query.trim();
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: memory_module_css_default.diagnosisRow,
					children: [at !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: memory_module_css_default.diagnosisRowTime,
						children: at
					}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: memory_module_css_default.diagnosisRowMain,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								title: query,
								children: t("memoryDiagnosisQuery", { query: query === "" ? "—" : query })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("memoryDiagnosisResults", { count: row.results }) }),
							row.ids.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: memory_module_css_default.diagnosisRowIds,
								children: row.ids.slice(0, 3).join(", ")
							}) : null
						]
					})]
				}, `${index}-${row.at}-${row.sessionId}`);
			});
			const maintenanceRunRows = diagnosisRuns.map((run) => {
				const at = formatTime(run.at);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: memory_module_css_default.diagnosisRow,
					children: [
						at !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: memory_module_css_default.diagnosisRowTime,
							children: at
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
							tone: maintenanceTone(run),
							children: run.undone ? t("memoryMaintenanceStatusUndone") : t(maintenanceStatusKey(run.status))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: memory_module_css_default.diagnosisRowMain,
							children: t("memoryMaintenanceResult", { ...run.counts })
						}),
						run.status === "completed" && !run.undone && run.id !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
							variant: "ghost",
							icon: "rotateCcw",
							disabled: diagnosisUndoBusyId !== null,
							onClick: () => {
								undoDiagnosisRun(run.id);
							},
							children: [diagnosisUndoBusyId === run.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, t("memoryDiagnosisUndo")]
						}) : null
					]
				}, run.id !== "" ? run.id : `${run.at}-${run.status}`);
			});
			/** One selectable audit finding row (checkbox + card summary + suggestion). */
			const auditRow = (item, hint) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: memory_module_css_default.auditRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					className: memory_module_css_default.auditCheck,
					type: "checkbox",
					"aria-label": item.name,
					checked: auditSelected.includes(item.id),
					onChange: () => toggleAuditSelect(item.id)
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: memory_module_css_default.auditSummary,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: memory_module_css_default.entryTitleRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: memory_module_css_default.entryName,
								children: item.name
							}), item.importance >= 80 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: memory_module_css_default.entryImportance,
								children: String(item.importance)
							}) : null]
						}),
						item.description !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: memory_module_css_default.entryDesc,
							children: item.description
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: memory_module_css_default.entryMeta,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
								tone: "plain",
								children: typeLabel(item.type, t)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: memory_module_css_default.auditHint,
								children: hint
							})]
						})
					]
				})]
			}, item.id);
			/** Group heading with its finding count. */
			const auditGroupTitle = (title, count) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
				className: memory_module_css_default.auditGroupTitle,
				children: [title, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: memory_module_css_default.auditCount,
					children: String(count)
				})]
			});
			const maintenanceRuns = (maintenance?.recentRuns ?? []).slice(0, RECENT_MAINTENANCE_ROWS);
			const maintenanceTitle = maintenanceResult !== null ? maintenanceResult.status === "failed" ? t("memoryMaintenanceConfirmTitle") : t("memoryMaintenanceResultTitle") : maintenancePrompt ? t("memoryMaintenanceDueTitle") : t("memoryMaintenanceConfirmTitle");
			let maintenanceBody = null;
			let maintenanceFooter = null;
			if (maintenanceResult !== null) {
				maintenanceBody = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: memory_module_css_default.maintenanceStack,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: memory_module_css_default.maintenanceResult,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
								tone: maintenanceTone(maintenanceResult),
								children: maintenanceResult.undone ? t("memoryMaintenanceStatusUndone") : t(maintenanceStatusKey(maintenanceResult.status))
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: memory_module_css_default.maintenanceResultCounts,
								children: t("memoryMaintenanceResult", { ...maintenanceResult.counts })
							})]
						}),
						maintenanceResult.status === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: memory_module_css_default.maintenanceError,
							role: "alert",
							children: t("memoryMaintenanceFailed", { message: maintenanceResult.error !== "" ? maintenanceResult.error : t("unknownError") })
						}) : null,
						maintenanceResult.undone ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: memory_module_css_default.maintenanceHint,
							children: t("memoryMaintenanceUndone")
						}) : null
					]
				});
				maintenanceFooter = [maintenanceResult.status === "completed" && !maintenanceResult.undone ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
					variant: "ghost",
					icon: "rotateCcw",
					disabled: maintenanceUndoBusy,
					onClick: () => {
						undoMaintenance(maintenanceResult.id);
					},
					children: [maintenanceUndoBusy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, t("memoryMaintenanceUndo")]
				}, "undo") : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					disabled: maintenanceUndoBusy,
					onClick: closeMaintenance,
					children: t("close")
				}, "close")];
			} else if (maintenancePrompt && maintenance !== null) {
				maintenanceBody = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: memory_module_css_default.maintenanceStack,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: memory_module_css_default.maintenanceNotice,
						children: maintenanceDueText(maintenance, t)
					})
				});
				maintenanceFooter = [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					onClick: closeMaintenance,
					children: t("memoryMaintenanceLater")
				}, "later"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					variant: "primary",
					icon: "wand",
					onClick: () => {
						setMaintenancePrompt(false);
					},
					children: t("memoryMaintenanceRun")
				}, "continue")];
			} else if (maintenance !== null) {
				maintenanceBody = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: memory_module_css_default.maintenanceStack,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: memory_module_css_default.maintenanceNotice,
							children: maintenance.due ? maintenanceDueText(maintenance, t) : t("memoryMaintenanceNotDueHint")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: memory_module_css_default.maintenanceHint,
							children: t("memoryMaintenanceConfirmHint")
						}),
						maintenanceRunning ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: memory_module_css_default.maintenanceRunning,
							role: "status",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("memoryMaintenanceRunning") })]
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: memory_module_css_default.maintenanceSection,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: memory_module_css_default.statsTitle,
								children: t("memoryMaintenanceRecent")
							}), maintenanceRuns.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: memory_module_css_default.statLabel,
								children: t("memoryMaintenanceEmpty")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: memory_module_css_default.maintenanceList,
								children: maintenanceRuns.map((run) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: memory_module_css_default.maintenanceRow,
									children: [
										formatTime(run.at) !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.maintenanceRowTime,
											children: formatTime(run.at)
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
											tone: maintenanceTone(run),
											children: run.undone ? t("memoryMaintenanceStatusUndone") : t(maintenanceStatusKey(run.status))
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.maintenanceRowMain,
											children: t("memoryMaintenanceResult", { ...run.counts })
										}),
										run.status === "completed" && !run.undone && run.id !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
											variant: "ghost",
											icon: "rotateCcw",
											disabled: maintenanceUndoBusy,
											onClick: () => {
												undoMaintenance(run.id);
											},
											children: [maintenanceUndoBusy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, t("memoryMaintenanceUndo")]
										}) : null
									]
								}, run.id !== "" ? run.id : `${run.at}-${run.status}`))
							})]
						})
					]
				});
				maintenanceFooter = [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					disabled: maintenanceRunning,
					onClick: closeMaintenance,
					children: t("cancel")
				}, "cancel"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
					variant: "primary",
					icon: "wand",
					disabled: maintenanceRunning,
					onClick: () => {
						runMaintenance();
					},
					children: [maintenanceRunning ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, t("memoryMaintenanceRun")]
				}, "run")];
			}
			let workspace = null;
			if (!stateReady) workspace = stateError !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: memory_module_css_default.errorBox,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: memory_module_css_default.errorText,
					children: stateError
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					icon: "refresh",
					onClick: () => setStateToken((token) => token + 1),
					children: t("memoryRetry")
				})]
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingBlock, { text: t("memoryLoading") });
			else if (projectMissing) workspace = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyBlock, {
				title: t("memoryScopeProject"),
				description: t("memoryProjectEmpty")
			});
			else workspace = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: memory_module_css_default.listPane,
				"aria-label": t("memoryListTitle"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: memory_module_css_default.listHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
							className: memory_module_css_default.sectionTitle,
							children: [t("memoryListTitle"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: memory_module_css_default.sectionCount,
								children: String(sortedEntries.length)
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: memory_module_css_default.listHeadTools,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: memory_module_css_default.archiveToggle,
								"aria-pressed": showArchived,
								title: t("memoryShowArchived"),
								onClick: () => {
									setShowArchived((current) => !current);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "folder",
									size: 14
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("memoryShowArchived") })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
								label: t("memorySortLabel"),
								size: "sm",
								align: "right",
								value: sort,
								options: [{
									value: "default",
									label: t("memorySortDefault")
								}, {
									value: "recent",
									label: t("memorySortRecent")
								}],
								onChange: (next) => {
									setSort(next === "recent" ? "recent" : "default");
								}
							})]
						})]
					}),
					stateError !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: memory_module_css_default.errorBox,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: memory_module_css_default.errorText,
							children: stateError
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
							variant: "secondary",
							icon: "refresh",
							onClick: () => setStateToken((token) => token + 1),
							children: t("memoryRetry")
						})]
					}) : null,
					listError !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: memory_module_css_default.errorBox,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: memory_module_css_default.errorText,
							children: listError
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
							variant: "secondary",
							icon: "refresh",
							onClick: () => setListToken((token) => token + 1),
							children: t("memoryRetry")
						})]
					}) : null,
					!listReady && listBusy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingBlock, { text: t("memoryLoading") }) : null,
					listReady && listError === "" && sortedEntries.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyBlock, {
						description: appliedQuery !== "" || typeFilter !== "" || tagFilter !== "" || !showArchived && entries.length > 0 ? t("memoryListEmptyFiltered") : t("memoryListEmpty"),
						action: appliedQuery === "" && typeFilter === "" && tagFilter === "" && (showArchived || entries.length === 0) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
							variant: "primary",
							icon: "plus",
							disabled: projectRequired,
							onClick: startCreate,
							children: t("memoryNew")
						}) : null
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: memory_module_css_default.entryGrid,
						children: sortedEntries.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							role: "button",
							tabIndex: 0,
							className: memory_module_css_default.entryCard,
							onClick: () => openEntry(item.id),
							onKeyDown: (event) => {
								if (event.key !== "Enter" && event.key !== " ") return;
								event.preventDefault();
								openEntry(item.id);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: memory_module_css_default.entryTitleRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: memory_module_css_default.entryName,
										children: item.name
									}), item.importance >= 80 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: memory_module_css_default.entryImportance,
										title: t("memoryFieldImportance"),
										children: String(item.importance)
									}) : null]
								}),
								item.description !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: memory_module_css_default.entryDesc,
									children: item.description
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: memory_module_css_default.entryMeta,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
											tone: "plain",
											children: typeLabel(item.type, t)
										}),
										item.status !== "active" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
											tone: statusTone(item.status),
											children: statusLabel(item.status, t)
										}) : null,
										item.tags.slice(0, 2).map((tag, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: memory_module_css_default.entryTag,
											title: t("memoryTagFilterHint"),
											onClick: (event) => {
												event.stopPropagation();
												setTagFilter(tag);
											},
											onKeyDown: (event) => {
												if (event.key === "Enter" || event.key === " ") event.stopPropagation();
											},
											children: tag
										}, `${index}-${tag}`)),
										item.tags.length > 2 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.entryTagMore,
											children: `+${item.tags.length - 2}`
										}) : null,
										formatTime(item.updatedAt) !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.entryTime,
											children: formatTime(item.updatedAt)
										}) : null
									]
								})
							]
						}, item.id))
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${panel_module_css_default.page} ${memory_module_css_default.view}`,
				role: "region",
				"aria-label": t("memoryTitle"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: memory_module_css_default.topbar,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: memory_module_css_default.segmented,
								role: "group",
								"aria-label": t("memoryScopeLabel"),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.segment,
									"aria-pressed": scope === "global",
									onClick: () => chooseScope("global"),
									children: t("memoryScopeGlobal")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.segment,
									"aria-pressed": scope === "project",
									onClick: () => chooseScope("project"),
									children: t("memoryScopeProject")
								})]
							}),
							scope === "project" && projects.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
								label: t("memoryProjectLabel"),
								className: memory_module_css_default.projectSelect,
								value: project,
								options: projects.map((item) => ({
									value: item.key,
									label: item.displayName
								})),
								onChange: chooseProject
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: memory_module_css_default.searchWrap,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
										name: "search",
										size: 16
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: memory_module_css_default.searchInput,
										type: "search",
										value: query,
										placeholder: t("memorySearchPlaceholder"),
										"aria-label": t("memorySearchPlaceholder"),
										onChange: (event) => {
											setQuery(event.target.value);
										},
										onKeyDown: (event) => {
											if (event.key !== "Enter") return;
											event.preventDefault();
											submitSearch();
										}
									}),
									query !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: memory_module_css_default.searchClear,
										title: t("clearSearch"),
										"aria-label": t("clearSearch"),
										onClick: () => {
											setQuery("");
											setAppliedQuery("");
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "x",
											size: 14
										})
									}) : null,
									visibleFilter !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: memory_module_css_default.filterChip,
										title: activeFilters.map((item) => item.label).join(" · "),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: memory_module_css_default.filterChipText,
												children: visibleFilter.label
											}),
											hiddenFilterCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: memory_module_css_default.filterChipMore,
												"aria-hidden": "true",
												children: "…"
											}) : null,
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: memory_module_css_default.filterChipClear,
												"aria-label": visibleFilter.clearLabel,
												onClick: () => {
													if (visibleFilter.kind === "type") setTypeFilter("");
													else setTagFilter("");
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
													name: "x",
													size: 10
												})
											})
										]
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
										label: t("memoryTypeFilterLabel"),
										title: t("memoryTypeFilterLabel"),
										align: "right",
										value: typeFilter,
										options: typeOptions,
										onChange: (next) => {
											setTypeFilter(next === "" ? "" : TYPE_VALUES.find((value) => value === next) ?? "");
										},
										triggerClassName: memory_module_css_default.filterTrigger,
										trigger: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "filter",
											size: 14
										}), typeFilter !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: memory_module_css_default.filterDot }) : null] })
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: memory_module_css_default.actions,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
										icon: "download",
										title: exportBusy ? t("memoryExporting") : t("memoryExportMarkdown"),
										busy: exportBusy,
										disabled: exportBusy || projectRequired,
										onClick: () => {
											exportMarkdown();
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
										icon: "settings",
										title: t("memorySettingsButton"),
										onClick: () => {
											setSettingsOpen(true);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
										icon: "info",
										title: t("memoryDiagnosisButton"),
										onClick: openDiagnosis
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
										icon: "clipboardCheck",
										title: auditBusy ? t("memoryAuditRunning") : t("memoryAuditButton"),
										busy: auditBusy,
										disabled: auditBusy || projectRequired,
										onClick: () => {
											openAudit();
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
										icon: "wand",
										title: t("memoryMaintenanceButton"),
										busy: maintenanceBusy,
										disabled: maintenanceBusy || maintenanceRunning,
										onClick: () => {
											openMaintenance();
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
										icon: "refresh",
										title: stateBusy || listBusy ? t("refreshing") : t("refresh"),
										busy: stateBusy || listBusy,
										disabled: stateBusy || listBusy,
										onClick: () => {
											setStateToken((token) => token + 1);
											setListToken((token) => token + 1);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
										variant: "primary",
										icon: "plus",
										disabled: projectMissing,
										onClick: startCreate,
										children: t("memoryNew")
									})
								]
							})
						]
					}),
					workspace,
					stateReady && showEditor ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelDialogLayer, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
						t,
						title: creating ? t("memoryCreateTitle") : t("memoryEditTitle"),
						titleMeta: entry !== null && !creating ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: memory_module_css_default.detailIdRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
								ref: idTextRef,
								className: memory_module_css_default.detailId,
								title: entry.id,
								children: entry.id
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconButton, {
								icon: "clipboardCheck",
								title: t("memoryCopyId"),
								onClick: () => {
									copyEntryId(entry.id);
								}
							})]
						}) : void 0,
						wide: true,
						onClose: closeEditor,
						children: [
							entry !== null && !creating ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: memory_module_css_default.editorStatus,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Badge, {
									tone: statusTone(entry.status),
									children: statusLabel(entry.status, t)
								})
							}) : null,
							detailStatus === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingBlock, { text: t("memoryLoading") }) : null,
							detailStatus === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: memory_module_css_default.errorBox,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: memory_module_css_default.errorText,
									children: detailError
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									variant: "secondary",
									icon: "refresh",
									onClick: () => {
										if (selectedId !== null) openEntry(selectedId);
									},
									children: t("memoryRetry")
								})]
							}) : null,
							detailStatus === "idle" || detailStatus === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: columnGap(12),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: memory_module_css_default.formGrid,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: memory_module_css_default.field,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: memory_module_css_default.fieldLabel,
													children: t("memoryFieldName")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													className: memory_module_css_default.input,
													type: "text",
													"aria-label": t("memoryFieldName"),
													value: form.name,
													onChange: (event) => {
														setForm((current) => ({
															...current,
															name: event.target.value
														}));
													}
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: memory_module_css_default.field,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: memory_module_css_default.fieldLabel,
													children: t("memoryFieldDescription")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													className: memory_module_css_default.input,
													type: "text",
													"aria-label": t("memoryFieldDescription"),
													value: form.description,
													onChange: (event) => {
														setForm((current) => ({
															...current,
															description: event.target.value
														}));
													}
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: memory_module_css_default.field,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: memory_module_css_default.fieldLabel,
													children: t("memoryFieldType")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Select, {
													label: t("memoryFieldType"),
													value: form.type,
													options: TYPE_VALUES.map((value) => ({
														value,
														label: t(TYPE_LABEL_KEYS[value])
													})),
													onChange: (next) => {
														const type = TYPE_VALUES.find((value) => value === next) ?? "preference";
														setForm((current) => ({
															...current,
															type
														}));
													}
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: memory_module_css_default.field,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: memory_module_css_default.fieldLabel,
														children: t("memoryFieldImportance")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: memory_module_css_default.rangeRow,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
															className: memory_module_css_default.rangeInput,
															type: "range",
															min: 0,
															max: 100,
															step: 1,
															"aria-label": t("memoryFieldImportance"),
															value: form.importance,
															style: { "--range-fill": `${form.importance}%` },
															onChange: (event) => {
																setForm((current) => ({
																	...current,
																	importance: integer(event.target.value, 0, 100, current.importance)
																}));
															}
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: memory_module_css_default.rangeValue,
															children: String(form.importance)
														})]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: memory_module_css_default.fieldHint,
														children: t("memoryImportanceHint")
													})
												]
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: memory_module_css_default.field,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: memory_module_css_default.fieldLabel,
												children: t("memoryFieldTags")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: memory_module_css_default.tagBox,
												children: [form.tags.map((tag, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: memory_module_css_default.tagChip,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: memory_module_css_default.tagChipText,
														children: tag
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: memory_module_css_default.tagChipRemove,
														"aria-label": t("memoryTagRemove", { tag }),
														onClick: () => {
															setForm((current) => ({
																...current,
																tags: current.tags.filter((_, tagIndex) => tagIndex !== index)
															}));
														},
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
															name: "x",
															size: 12
														})
													})]
												}, `${index}-${tag}`)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													className: memory_module_css_default.tagInput,
													type: "text",
													"aria-label": t("memoryFieldTags"),
													value: tagDraft,
													onChange: (event) => {
														const next = event.target.value;
														if (next.endsWith(",") || next.endsWith("，")) {
															appendTags(next);
															setTagDraft("");
														} else setTagDraft(next);
													},
													onKeyDown: (event) => {
														if (event.key === "Enter" || event.key === ",") {
															event.preventDefault();
															commitTagDraft();
															return;
														}
														if (event.key === "Backspace" && tagDraft === "" && form.tags.length > 0) {
															event.preventDefault();
															setForm((current) => ({
																...current,
																tags: current.tags.slice(0, -1)
															}));
														}
													},
													onBlur: commitTagDraft
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: memory_module_css_default.fieldHint,
												children: t("memoryTagsHint")
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: memory_module_css_default.field,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.fieldLabel,
											children: t("memoryFieldContent")
										}), creating ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
											className: memory_module_css_default.textarea,
											rows: 8,
											"aria-label": t("memoryFieldContent"),
											value: form.content,
											onChange: (event) => {
												setForm((current) => ({
													...current,
													content: event.target.value
												}));
											}
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: `${memory_module_css_default.readonlyBox}${HostMarkdownText === null ? "" : ` ${memory_module_css_default.previewBox}`}`,
											children: [HostMarkdownText !== null && entry !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: memory_module_css_default.previewBody,
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HostMarkdownText, {
													text: entry.content,
													variant: "body"
												})
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: memory_module_css_default.readonlyHint,
												children: t("memoryBodyReadOnlyHint")
											}), entry !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
												variant: "secondary",
												icon: "arrowUpRight",
												onClick: () => {
													actions.openMemoryInApp({
														scope,
														project,
														id: entry.id
													});
												},
												children: t("memoryOpenNative")
											}) : null]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: memory_module_css_default.formActions,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
												variant: "primary",
												disabled: saveBusy || projectRequired,
												onClick: () => {
													saveEntry();
												},
												children: [saveBusy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, saveBusy ? t("memorySaving") : t("memorySave")]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
												variant: "secondary",
												onClick: closeEditor,
												children: t("cancel")
											}),
											entry !== null && !creating ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: memory_module_css_default.formActionsRight,
												children: [
													entry.status !== "active" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
														variant: "ghost",
														icon: "check",
														disabled: statusBusy,
														onClick: () => {
															changeStatus("active");
														},
														children: t("memoryRestore")
													}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
														variant: "ghost",
														icon: "power",
														disabled: statusBusy,
														onClick: () => {
															changeStatus("stale");
														},
														children: t("memoryDeactivate")
													}),
													entry.status !== "archived" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
														variant: "ghost",
														icon: "folder",
														disabled: statusBusy,
														onClick: () => {
															changeStatus("archived");
														},
														children: t("memoryArchive")
													}) : null,
													confirmDelete ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: memory_module_css_default.confirmArea,
														role: "group",
														"aria-label": t("memoryDelete"),
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: memory_module_css_default.confirmText,
																children: t("memoryDeleteDescription", { name: entry.name })
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
																variant: "danger",
																disabled: deleteBusy,
																onClick: () => {
																	removeEntry();
																},
																children: [deleteBusy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, deleteBusy ? t("memoryDeleting") : t("memoryDeleteConfirm")]
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
																variant: "secondary",
																onClick: () => setConfirmDelete(false),
																children: t("cancel")
															})
														]
													}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
														variant: "danger",
														icon: "trash",
														onClick: () => setConfirmDelete(true),
														children: t("memoryDelete")
													})
												]
											}) : null
										]
									})
								]
							}) : null
						]
					}) }) : null,
					stateReady && maintenanceOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelDialogLayer, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DialogShell, {
						t,
						title: maintenanceTitle,
						wide: true,
						...maintenanceRunning || maintenanceUndoBusy ? {} : { onClose: closeMaintenance },
						footer: maintenanceFooter,
						children: maintenanceBody
					}) }) : null,
					stateReady && settingsOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelDialogLayer, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
						t,
						title: t("memorySettingsTitle"),
						onClose: () => {
							setSettingsOpen(false);
						},
						footer: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
							variant: "secondary",
							icon: "refresh",
							disabled: refreshIndexBusy,
							onClick: () => {
								refreshIndex();
							},
							children: [refreshIndexBusy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, t("memoryRefreshIndex")]
						}, "refresh-index")],
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: memory_module_css_default.settingList,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: memory_module_css_default.settingRow,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.settingLabel,
											children: t("memorySettingsCapture")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
											checked: settings.captureEnabled,
											label: t("memorySettingsCapture"),
											onChange: (next) => {
												patchSettings({ captureEnabled: next });
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: memory_module_css_default.settingRow,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.settingLabel,
											children: t("memorySettingsCaptureSessionEnd")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
											checked: settings.captureSessionEnd,
											label: t("memorySettingsCaptureSessionEnd"),
											onChange: (next) => {
												patchSettings({ captureSessionEnd: next });
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: memory_module_css_default.settingRow,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.settingLabel,
											children: t("memorySettingsInject")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
											checked: settings.injectEnabled,
											label: t("memorySettingsInject"),
											onChange: (next) => {
												patchSettings({ injectEnabled: next });
											}
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: memory_module_css_default.numberGrid,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: memory_module_css_default.field,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.fieldLabel,
											children: t("memorySettingsIndexGlobal")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: memory_module_css_default.input,
											type: "number",
											min: 0,
											max: 20,
											"aria-label": t("memorySettingsIndexGlobal"),
											value: settings.indexLimitGlobal,
											onChange: (event) => {
												patchSettings({ indexLimitGlobal: integer(event.target.value, 0, 20, settingsRef.current.indexLimitGlobal) }, true);
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: memory_module_css_default.field,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.fieldLabel,
											children: t("memorySettingsIndexProject")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: memory_module_css_default.input,
											type: "number",
											min: 0,
											max: 20,
											"aria-label": t("memorySettingsIndexProject"),
											value: settings.indexLimitProject,
											onChange: (event) => {
												patchSettings({ indexLimitProject: integer(event.target.value, 0, 20, settingsRef.current.indexLimitProject) }, true);
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: memory_module_css_default.field,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.fieldLabel,
											children: t("memorySettingsMaxChars")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: memory_module_css_default.input,
											type: "number",
											min: 1e3,
											max: RECALL_MAX_CHARS,
											step: 500,
											"aria-label": t("memorySettingsMaxChars"),
											value: settings.maxChars,
											onChange: (event) => {
												patchSettings({ maxChars: integer(event.target.value, 1e3, RECALL_MAX_CHARS, settingsRef.current.maxChars) }, true);
											}
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: memory_module_css_default.divider }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: memory_module_css_default.formGrid,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: memory_module_css_default.field,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: memory_module_css_default.fieldLabel,
										children: t("memoryMaintenanceProvider")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: memory_module_css_default.input,
										type: "text",
										"aria-label": t("memoryMaintenanceProvider"),
										placeholder: t("memoryMaintenanceModelInherit"),
										value: settings.maintenanceProvider,
										onChange: (event) => {
											patchSettings({ maintenanceProvider: event.target.value }, true);
										}
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: memory_module_css_default.field,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: memory_module_css_default.fieldLabel,
										children: t("memoryMaintenanceModel")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: memory_module_css_default.input,
										type: "text",
										"aria-label": t("memoryMaintenanceModel"),
										placeholder: t("memoryMaintenanceModelInherit"),
										value: settings.maintenanceModel,
										onChange: (event) => {
											patchSettings({ maintenanceModel: event.target.value }, true);
										}
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: memory_module_css_default.fieldHint,
								children: t("memoryMaintenanceModelInherit")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: memory_module_css_default.divider }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: memory_module_css_default.statsTitle,
								children: t("memoryStatsTitle")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: memory_module_css_default.statGrid,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: memory_module_css_default.stat,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.statLabel,
											children: t("memoryStatCaptureRuns")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.statValue,
											children: String(stats?.captureRuns ?? 0)
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: memory_module_css_default.stat,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.statLabel,
											children: t("memoryStatCapturedEntries")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.statValue,
											children: String(stats?.capturedEntries ?? 0)
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: memory_module_css_default.stat,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.statLabel,
											children: t("memoryInjectionRate")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.statValue,
											children: injectionRate
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: memory_module_css_default.stat,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.statLabel,
											children: t("memoryRetrievalRate")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: memory_module_css_default.statValue,
											children: retrievalRate
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: memory_module_css_default.divider }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: columnGap(8),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									className: memory_module_css_default.statsTitle,
									children: t("memoryRecentCaptures")
								}), recentCaptureRows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: memory_module_css_default.statLabel,
									children: t("memoryRecentCapturesEmpty")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.listBlock,
									children: recentCaptureRows.map((row, index) => {
										const at = formatTime(row.at);
										const note = captureNoteOf(row, t);
										const undoId = row.id ?? "";
										const undone = row.undone === true || undoneCaptureIds.includes(undoId);
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.listRow,
											children: [
												at !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: memory_module_css_default.statLabel,
													children: at
												}) : null,
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("memoryCaptureWritten", { count: row.written }) }),
												note !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.listRowMain,
													title: note,
													children: note
												}) : null,
												undone ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: memory_module_css_default.statLabel,
													children: t("memoryCaptureUndone")
												}) : (row.created ?? []).length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
													variant: "ghost",
													icon: "rotateCcw",
													disabled: undoBusyId !== null || undoId === "",
													onClick: () => {
														undoCapture(undoId);
													},
													children: [undoBusyId === undoId ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, t("memoryUndoCapture")]
												}) : null
											]
										}, `${index}-${undoId}`);
									})
								})]
							})
						]
					}) }) : null,
					stateReady && auditOpen && auditResult !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelDialogLayer, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
						t,
						title: t("memoryAuditTitle"),
						wide: true,
						onClose: () => {
							setAuditOpen(false);
						},
						children: [auditEmpty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyBlock, { description: t("memoryAuditEmpty") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: memory_module_css_default.auditGroups,
							children: [
								auditResult.stale.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
									className: memory_module_css_default.auditGroup,
									children: [auditGroupTitle(t("memoryAuditStaleTitle"), auditResult.stale.length), auditResult.stale.map((item) => auditRow(item, t("memoryAuditStaleHint")))]
								}) : null,
								auditResult.duplicates.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
									className: memory_module_css_default.auditGroup,
									children: [auditGroupTitle(t("memoryAuditDuplicateTitle"), auditResult.duplicates.length), auditResult.duplicates.map((pair) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: memory_module_css_default.auditPair,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: memory_module_css_default.auditPairKeep,
												children: t("memoryAuditKeep", { name: pair.keep.name })
											}),
											auditRow(pair.left, t("memoryAuditDuplicateHint")),
											auditRow(pair.right, t("memoryAuditDuplicateHint"))
										]
									}, `${pair.left.id}-${pair.right.id}`))]
								}) : null,
								auditResult.lowValue.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
									className: memory_module_css_default.auditGroup,
									children: [auditGroupTitle(t("memoryAuditLowValueTitle"), auditResult.lowValue.length), auditResult.lowValue.map((item) => auditRow(item, t("memoryAuditLowValueHint")))]
								}) : null
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: memory_module_css_default.auditBar,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: memory_module_css_default.auditBarCount,
								children: t("memoryAuditSelected", { count: auditSelected.length })
							}), auditConfirmDelete ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: memory_module_css_default.confirmArea,
								role: "group",
								"aria-label": t("memoryAuditDeleteConfirm", { count: auditSelected.length }),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: memory_module_css_default.confirmText,
										children: t("memoryAuditDeleteConfirm", { count: auditSelected.length })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
										variant: "danger",
										disabled: auditBatchBusy,
										onClick: () => {
											runAuditBatch("delete");
										},
										children: [auditBatchBusy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}) : null, auditBatchBusy ? t("memoryDeleting") : t("memoryDeleteConfirm")]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
										variant: "secondary",
										onClick: () => setAuditConfirmDelete(false),
										children: t("cancel")
									})
								]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									variant: "secondary",
									disabled: auditSelected.length === 0 || auditBatchBusy,
									onClick: () => {
										runAuditBatch("archive");
									},
									children: t("memoryArchive")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									variant: "secondary",
									disabled: auditSelected.length === 0 || auditBatchBusy,
									onClick: () => {
										runAuditBatch("stale");
									},
									children: t("memoryDeactivate")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									variant: "danger",
									icon: "trash",
									disabled: auditSelected.length === 0 || auditBatchBusy,
									onClick: () => setAuditConfirmDelete(true),
									children: t("memoryDelete")
								})
							] })]
						})]
					}) }) : null,
					stateReady && diagnosisOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelDialogLayer, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DialogShell, {
						t,
						title: t("memoryDiagnosisTitle"),
						wide: true,
						onClose: () => {
							if (diagnosisUndoBusyId === null) setDiagnosisOpen(false);
						},
						footer: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
							variant: "secondary",
							disabled: diagnosisUndoBusyId !== null,
							onClick: () => {
								if (diagnosisUndoBusyId === null) setDiagnosisOpen(false);
							},
							children: t("close")
						}, "close")],
						children: diagnosisBusy && diagnosisStats === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingBlock, { text: t("memoryLoading") }) : diagnosisError !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: memory_module_css_default.errorBox,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: memory_module_css_default.errorText,
								children: diagnosisError
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								variant: "secondary",
								icon: "refresh",
								onClick: () => {
									loadDiagnosis();
								},
								children: t("memoryRetry")
							})]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: memory_module_css_default.diagnosisStack,
							children: [
								diagnosisSection(t("memoryDiagnosisInjections"), injectionRows, diagnosisEmptyText),
								diagnosisSection(t("memoryDiagnosisCaptures"), captureRows, diagnosisEmptyText),
								diagnosisSection(t("memoryDiagnosisRetrievals"), retrievalRows, diagnosisEmptyText),
								diagnosisSection(t("memoryDiagnosisMaintenance"), maintenanceRunRows, diagnosisEmptyText)
							]
						})
					}) }) : null
				]
			});
		}
		// src/client/Panel.tsx
		/**
		* Main panel of the store: hosts the section header (memory / skills /
		* plugins), the three plugin views (store / manage / detail), keeps the store
		* list's scroll position across view switches, and renders the migration /
		* API banners. The memory tab renders its own self-contained view; skills is
		* still a placeholder.
		*
		* @module dsh-agent-extension/client/Panel
		*/
		/** Section tabs, in display order: memory first, then skills, then plugins. */
		function sectionTabs(t) {
			return [
				{
					value: "memory",
					label: t("tabMemory")
				},
				{
					value: "skills",
					label: t("tabSkills")
				},
				{
					value: "plugins",
					label: t("tabPlugins")
				}
			];
		}
		/** Render the main panel. */
		function Panel({ useHub, actions, t }) {
			const state = useHub(identity);
			const scrollRef = (0, react.useRef)(null);
			const listScroll = (0, react.useRef)(0);
			const lastView = (0, react.useRef)(state.view);
			(0, react.useEffect)(() => {
				actions.init();
			}, [actions]);
			(0, react.useEffect)(() => {
				const previous = lastView.current;
				if (previous === state.view) return;
				if (previous === "store" && scrollRef.current) listScroll.current = scrollRef.current.scrollTop;
				if (state.view === "store" && scrollRef.current) scrollRef.current.scrollTop = listScroll.current;
				lastView.current = state.view;
			}, [state.view]);
			const snapshot = state.snapshot;
			const pluginsSection = state.sectionTab === "plugins";
			let body;
			let withHeader = true;
			if (!pluginsSection) body = state.sectionTab === "memory" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemoryView, {
				actions,
				t
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.page,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyBlock, {
					title: t("comingSoon"),
					description: t("skillsPlaceholder")
				})
			});
			else if (state.status === "loading" && !snapshot) body = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.page,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingBlock, { text: t("catalogLoading") })
			});
			else if (!snapshot) body = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.page,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EmptyBlock, {
					title: t("apiUnavailable"),
					description: `${state.error || t("unknownError")}\n${t("apiHint")}`,
					action: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						variant: "primary",
						icon: "refresh",
						onClick: () => {
							actions.load();
						},
						children: t("retry")
					})
				})
			});
			else {
				const banners = [];
				if (typeof snapshot.migrationError === "string" && snapshot.migrationError !== "") banners.push(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.warningBanner,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
						name: "alert",
						size: 14
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("migrationError", { message: snapshot.migrationError }) })]
				}, "migration"));
				const ui = snapshot.ui;
				if (ui && ui.active === false) banners.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.errorBanner,
					children: `${t("apiUnavailable")}：${String(ui.reason ?? "")}\n${t("apiHint")}`
				}, "ui"));
				const view = state.view === "detail" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailView, {
					useHub,
					actions,
					t
				}, "detail") : state.view === "manage" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ManageView, {
					useHub,
					actions,
					t
				}, "manage") : state.view === "market" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarketView, {
					useHub,
					actions,
					t
				}, "market") : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StoreView, {
					useHub,
					actions,
					t
				}, "store");
				body = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column"
					},
					children: [banners, view]
				});
				withHeader = state.view === "store";
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.root,
				ref: scrollRef,
				children: [withHeader ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: panel_module_css_default.header,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
						className: panel_module_css_default.title,
						children: t("title")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tabs, {
						items: sectionTabs(t),
						value: state.sectionTab,
						onChange: actions.setSectionTab,
						label: t("sectionTabsLabel"),
						idPrefix: "aph-section-tab",
						panelId: "aph-section-panel"
					})]
				}) : null, withHeader ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					id: "aph-section-panel",
					role: "tabpanel",
					"aria-labelledby": `aph-section-tab-${state.sectionTab}`,
					children: body
				}) : body]
			});
		}
		// src/client/PanelIcon.tsx
		/** Render the sidebar entry glyph. */
		function PanelIcon({ size, active }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
				name: "puzzle",
				size: Math.round(typeof size === "number" ? size : 20),
				strokeWidth: active === true ? 2 : 1.7
			});
		}
		// \0dsh-css:E:\workspace\dsh-plugins\packages\dsh-agent-extension\src\client\Toasts.module.css.mjs
		const css$1 = ".dtmz1a_toasts{pointer-events:none;flex-direction:column;gap:8px;max-width:min(400px,100vw - 40px);display:flex;position:absolute;bottom:20px;right:20px}.dtmz1a_toast{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-toast-bg);color:var(--dsw-alias-toast-label);box-shadow:var(--dsw-elevation-panel);pointer-events:auto;border:0;align-items:flex-start;gap:8px;padding:10px 12px;font-size:13px;animation:.18s dtmz1a_toastIn;display:flex}@media (prefers-reduced-motion:reduce){.dtmz1a_toast{animation:none}}.dtmz1a_toastSuccess{box-shadow:var(--dsw-elevation-panel), 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent)}.dtmz1a_toastWarn{box-shadow:var(--dsw-elevation-panel), 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent)}.dtmz1a_toastError{box-shadow:var(--dsw-elevation-panel), 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent)}.dtmz1a_body{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;flex:1;min-width:0}.dtmz1a_close{border-radius:var(--dsw-radius-xs);color:color-mix(in srgb, currentColor 65%, transparent);cursor:pointer;background:0 0;border:0;flex:none;padding:2px;display:flex}@media (hover:hover){.dtmz1a_close:hover{color:currentColor}}@keyframes dtmz1a_toastIn{0%{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}";
		const tagId$1 = "dsh-agent-extension/Toasts.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-agent-extension";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var Toasts_module_css_default = {
			"body": "dtmz1a_body",
			"close": "dtmz1a_close",
			"toast": "dtmz1a_toast",
			"toastError": "dtmz1a_toastError",
			"toastIn": "dtmz1a_toastIn",
			"toastSuccess": "dtmz1a_toastSuccess",
			"toastWarn": "dtmz1a_toastWarn",
			"toasts": "dtmz1a_toasts"
		};
		// src/client/Toasts.tsx
		/** Render the toast stack (null when empty). */
		function Toasts({ useHub, actions, t }) {
			const state = useHub(identity);
			if (state.toasts.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: Toasts_module_css_default.toasts,
				role: "status",
				"aria-live": "polite",
				children: state.toasts.map((toastItem) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: `${Toasts_module_css_default.toast} ${toastItem.kind === "success" ? Toasts_module_css_default.toastSuccess : toastItem.kind === "warn" ? Toasts_module_css_default.toastWarn : toastItem.kind === "error" ? Toasts_module_css_default.toastError : ""}`,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: toastItem.kind === "success" ? "check" : toastItem.kind === "error" || toastItem.kind === "warn" ? "alert" : "info",
							size: 16
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: Toasts_module_css_default.body,
							children: toastItem.message
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: Toasts_module_css_default.close,
							title: t("close"),
							"aria-label": t("close"),
							onClick: () => actions.dismissToast(toastItem.id),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "x",
								size: 14
							})
						})
					]
				}, toastItem.id))
			});
		}
		// \0dsh-css:E:\workspace\dsh-plugins\packages\dsh-agent-extension\src\client\overlay.module.css.mjs
		const css = ".dzau5G_overlayRoot{z-index:30;color:var(--dsw-alias-label-primary);overflow-wrap:break-word;pointer-events:none;font-size:14px;position:absolute;inset:0}.dzau5G_overlayRoot>*{pointer-events:none}";
		const tagId = "dsh-agent-extension/overlay.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-agent-extension";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var overlay_module_css_default = { "overlayRoot": "dzau5G_overlayRoot" };
		// src/client/OverlayHost.tsx
		/** Render the overlay host (null while no dialog and no toast is active). */
		function OverlayHost({ useHub, actions, t }) {
			const state = useHub(identity);
			if (state.dialogs.length === 0 && state.toasts.length === 0) return null;
			const toasts = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toasts, {
				useHub,
				actions,
				t
			});
			const top = state.dialogs.length > 0 ? state.dialogs[state.dialogs.length - 1] : null;
			const store = { actions };
			let dialog = null;
			if (top) {
				if (top.kind === "add-source") dialog = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AddSourceDialog, {
					store,
					t,
					dialog: top
				}, top.id);
				else if (top.kind === "sources") dialog = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourcesDialog, {
					useHub,
					store,
					t
				}, top.id);
				else if (top.kind === "confirm") dialog = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfirmDialog, {
					store,
					t,
					dialog: top
				}, top.id);
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: overlay_module_css_default.overlayRoot,
				children: [dialog, toasts]
			});
		}
		// src/client/index.ts
		/** Required browser services: slots, copy, and the Session Remote for native file opening. */
		const inject = [
			"slots",
			"locale",
			"remote",
			"remote.session"
		];
		/** The panel id shared by the sidebar entry and the main panel. */
		const PANEL_ID = "agent-extension";
		/**
		* Contribute the Agent Extension entry, panel, and overlay.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			ctx.effect(() => {
				ctx.locale.register(NS, {
					zh,
					en,
					ja,
					es,
					fr,
					de,
					ru,
					pt
				});
			}, "dsh-agent-extension: dictionaries");
			const locale = ctx.locale;
			const bound = typeof locale?.bind === "function" ? locale.bind(NS) : null;
			const getLocaleId = () => {
				try {
					return String(locale?.getLocale?.().active ?? "").toLowerCase() || "zh";
				} catch {
					return "zh";
				}
			};
			const staticDict = () => {
				const id = getLocaleId();
				return id.startsWith("zh") || id === "" ? zh : en;
			};
			const t = (key, vars) => {
				let text = typeof bound === "function" ? bound(key) : "";
				if (typeof text !== "string" || text === "") text = staticDict()[key] ?? key;
				if (vars !== void 0) for (const name of Object.keys(vars)) text = text.split(`{${name}}`).join(String(vars[name]));
				return text;
			};
			const controller = createHubController({
				translate: t,
				getLocaleId,
				openNativePath: async (path) => {
					try {
						const can = await ctx.remote.session.canOpenWorkspacePath();
						if (!can.ok || can.value !== true) return {
							ok: false,
							unavailable: true
						};
						const result = await ctx.remote.session.openWorkspacePath({ path });
						if (result.ok) return { ok: true };
						return {
							ok: false,
							error: { message: result.error?.message ?? "" }
						};
					} catch (error) {
						return {
							ok: false,
							error: { message: error instanceof Error ? error.message : String(error) }
						};
					}
				}
			});
			ctx.effect(() => () => controller.actions.destroy(), "dsh-agent-extension: controller");
			ctx.effect(() => ctx.locale.subscribe?.(() => controller.actions.setLocaleId(getLocaleId())), "dsh-agent-extension: locale tracking");
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 5,
				label: () => t("tab"),
				locale: NS
			}, PanelIcon));
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				locale: NS,
				inject: () => ({
					hooks: { hub: controller.store },
					actions: controller.actions
				})
			}, Panel));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "agent-extension-overlay",
				order: 60,
				label: () => t("tab"),
				locale: NS,
				inject: () => ({
					hooks: { hub: controller.store },
					actions: controller.actions
				})
			}, OverlayHost));
		}
		exports.PANEL_ID = PANEL_ID;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map