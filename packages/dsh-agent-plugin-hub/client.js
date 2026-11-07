/**
 * 插件页「Agent Plugin」Tab 的浏览器端。
 *
 * 纯 JS，无构建步骤：由 `dsh.client` 清单加载，向 `window.__ModuleLoader__`
 * 注册同名模块；通过宿主 `ctx.slots` 注册到 `settings.plugins.tab`。
 * 数据来自 Host 的 `/agent-plugin/api/*`（本机回环同源）。
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

    const EN = {
      tab: 'Agent Extensions',
      title: 'Agent Extensions Hub',
      subtitle: 'Marketplaces, installs, and capability toggles for agent extensions.',
      refresh: 'Refresh',
      loading: 'Loading…',
      installed: 'Installed',
      markets: 'Marketplaces',
      emptyInstalled: 'No agent extensions installed yet. Open “Marketplaces” to add a source and install one.',
      emptyMarkets: 'No marketplace added yet. Three source types are supported.',
      noPluginsInMarket: 'This marketplace lists no extensions.',
      addMarket: 'Add marketplace',
      marketType: 'Source type',
      location: 'Location',
      marketName: 'Name (optional)',
      add: 'Add',
      refreshMarket: 'Refresh',
      removeMarket: 'Remove',
      install: 'Install',
      update: 'Update',
      rollback: 'Rollback',
      uninstall: 'Uninstall',
      enable: 'Enable',
      disable: 'Disable',
      detail: 'Details',
      back: 'Back to list',
      plugin: 'Extension',
      format: 'Format',
      market: 'Marketplace',
      installedAt: 'Installed at',
      previousVersions: 'Rollback versions',
      version: 'Version',
      capabilities: 'Capabilities',
      skills: 'Skills',
      commands: 'Commands',
      hooks: 'Hooks',
      mcpServers: 'MCP servers',
      enabled: 'Enabled',
      disabled: 'Disabled',
      effective: 'Effective',
      notEffective: 'Not effective',
      hostEvent: 'Host event',
      registered: 'Registered in DSH',
      notRegistered: 'Not registered (disabled or conflict)',
      noCapability: '(none)',
      warnings: 'Warnings',
      statusReady: 'Ready',
      statusMissing: 'Not effective',
      canBlock: 'can block',
      mcpReason: 'The host exposes no runtime MCP mount API, so this list is informational; toggles only change the stored flag.',
      apiUnavailable: 'Agent Extensions API unavailable',
      apiHint: 'This page is not served over the loopback origin, or the host has not loaded the new plugin code. Refresh the page and retry.',
      busy: 'Working…',
      done: 'Done',
      unknownError: 'Unknown error',
      addHint: 'local = directory; git = repository URL; url = direct marketplace.json URL.',
      togglePlugin: 'Extension master switch',
      toggleCapabilityHint: 'Item toggles update DSH registrations immediately (except the MCP list).',
    }
    const ZH = {
      tab: '智能体扩展',
      title: '智能体扩展中心',
      subtitle: '智能体扩展的市场、安装与能力管理',
      refresh: '刷新',
      loading: '加载中…',
      installed: '已安装',
      markets: '市场',
      emptyInstalled: '还没有安装任何智能体扩展。切换到「市场」添加市场并安装。',
      emptyMarkets: '还没有添加市场。下面是支持的三种来源。',
      noPluginsInMarket: '该市场里没有扩展条目。',
      addMarket: '添加市场',
      marketType: '来源类型',
      location: '地址',
      marketName: '名称（可选）',
      add: '添加',
      refreshMarket: '刷新',
      removeMarket: '移除',
      install: '安装',
      update: '更新',
      rollback: '回滚',
      uninstall: '卸载',
      enable: '启用',
      disable: '禁用',
      detail: '详情',
      back: '返回列表',
      plugin: '扩展',
      format: '格式',
      market: '市场',
      installedAt: '安装时间',
      previousVersions: '可回滚版本',
      version: '版本',
      capabilities: '能力',
      skills: '技能',
      commands: '命令',
      hooks: 'Hooks',
      mcpServers: 'MCP 清单',
      enabled: '已启用',
      disabled: '已禁用',
      effective: '已生效',
      notEffective: '未生效',
      hostEvent: '宿主事件',
      registered: '已注册到 DSH',
      notRegistered: '未注册（禁用或冲突）',
      noCapability: '（无）',
      warnings: '告警',
      statusReady: '就绪',
      statusMissing: '未生效',
      canBlock: '可阻断',
      mcpReason: '宿主没有运行时 MCP 挂载接口，清单仅展示；启停只影响这里的显示。',
      apiUnavailable: '智能体扩展 API 不可用',
      apiHint: '当前页面不是通过本机回环访问，或宿主尚未加载新版代码。刷新页面后重试。',
      busy: '执行中…',
      done: '完成',
      unknownError: '未知错误',
      addHint: 'local 填目录；git 填仓库地址；url 填 marketplace.json 直链。',
      togglePlugin: '扩展总开关',
      toggleCapabilityHint: '逐项启停会立即更新 DSH 里的注册（MCP 清单除外）。',
    }

    const COLOR = {
      primary: 'var(--dsw-alias-label-primary)',
      secondary: 'var(--dsw-alias-label-secondary)',
      border: 'var(--dsw-alias-border-l1)',
      border2: 'var(--dsw-alias-border-l2)',
      layer1: 'var(--dsw-alias-bg-layer-1)',
      layer2: 'var(--dsw-alias-bg-layer-2)',
      brand: 'var(--dsw-alias-brand-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
    }

    function buttonStyle(extra) {
      return Object.assign({
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
        border: `1px solid ${COLOR.border2}`, background: COLOR.layer2, color: COLOR.primary,
        cursor: 'pointer', fontSize: 12, lineHeight: '18px', fontFamily: 'inherit', whiteSpace: 'nowrap',
      }, extra)
    }
    function primaryButton(extra) {
      return buttonStyle(Object.assign({ background: COLOR.brand, color: '#fff', border: '1px solid transparent' }, extra))
    }
    function dangerButton(extra) {
      return buttonStyle(Object.assign({ color: COLOR.error, borderColor: COLOR.error }, extra))
    }
    const cardStyle = {
      border: `1px solid ${COLOR.border}`, borderRadius: 10, background: COLOR.layer1,
      padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
    }
    const rowStyle = {
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '8px 10px', border: `1px solid ${COLOR.border}`, borderRadius: 8, background: COLOR.layer2,
    }
    const monoStyle = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 11, color: COLOR.secondary }
    const badgeStyle = {
      display: 'inline-flex', alignItems: 'center', padding: '0 6px', borderRadius: 999,
      fontSize: 11, lineHeight: '18px', border: `1px solid ${COLOR.border2}`, color: COLOR.secondary,
    }

    function badge(text, color) {
      return h('span', { style: Object.assign({}, badgeStyle, color ? { color, borderColor: color } : {}) }, text)
    }

    function Switch({ checked, disabled, label, onChange }) {
      return h('button', {
        type: 'button', role: 'switch', 'aria-checked': checked, 'aria-label': label,
        title: label, disabled: disabled === true, onClick: onChange,
        style: {
          appearance: 'none', width: 34, height: 20, borderRadius: 999, padding: 0, position: 'relative',
          border: `1px solid ${checked ? COLOR.brand : COLOR.border2}`,
          background: checked ? COLOR.brand : COLOR.layer2,
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, flex: 'none',
        },
      }, h('span', {
        style: {
          position: 'absolute', top: 2, left: checked ? 16 : 2, width: 14, height: 14, borderRadius: '50%',
          background: checked ? '#fff' : COLOR.secondary, transition: 'left 120ms ease',
        },
      }))
    }

    async function api(path, options) {
      const init = Object.assign({ cache: 'no-store', headers: { 'content-type': 'application/json' } }, options)
      const response = await fetch(`${API_BASE}${path}`, init)
      let body = null
      try {
        body = await response.json()
      } catch {
        body = null
      }
      if (!response.ok || body === null || body.ok !== true) {
        throw new Error(body && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
      }
      return body.data
    }

    /** 订阅 locale 变化以触发重渲染（tab 标签由 thunk 自己更新）。 */
    function useLocaleVersion(locale) {
      const [, setVersion] = useState(0)
      useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => setVersion((value) => value + 1))
      }, [locale])
    }

    function StatusLine({ data, t }) {
      const runtime = data.runtime || {}
      const skills = runtime.skills || {}
      const commands = runtime.commands || {}
      const hooks = runtime.hooks || {}
      const mcp = data.mcp || {}
      const items = [
        { key: 'skills', ok: skills.registered === true, text: `${t('skills')} ${skills.skills ?? 0}` },
        { key: 'commands', ok: commands.available === true, text: `${t('commands')} ${(commands.registered || []).length}` },
        { key: 'hooks', ok: hooks.attached === true, text: t('hooks') },
        { key: 'mcp', ok: mcp.available === true, text: 'MCP' },
      ]
      return h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
        items.map((item) => badge(
          `${item.text} · ${item.ok ? t('statusReady') : t('statusMissing')}`,
          item.ok ? COLOR.success : COLOR.warn,
        )),
        badge(`v${data.version || ''}`),
      )
    }

    function PluginRow({ plugin, t, busy, onOpen, onEnable, onUpdate, onRollback, onUninstall, hasUpdateHint }) {
      const disabled = busy === true
      return h('div', { style: rowStyle },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 180, flex: 1 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
            h('strong', { style: { fontSize: 13 } }, plugin.name),
            h('span', { style: monoStyle }, `@${plugin.version}`),
            badge(plugin.format),
            plugin.enabled ? null : badge(t('disabled'), COLOR.warn),
          ),
          h('div', { style: { color: COLOR.secondary, fontSize: 11 } },
            `${t('skills')} ${(plugin.capabilities.skills || []).length} · ${t('commands')} ${(plugin.capabilities.commands || []).length} · ${t('hooks')} ${(plugin.capabilities.hooks || []).length} · MCP ${(plugin.capabilities.mcpServers || []).length}`,
          ),
        ),
        h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } },
          h(Switch, { checked: plugin.enabled, disabled, label: t('togglePlugin'), onChange: () => onEnable(plugin, !plugin.enabled) }),
          h('button', { type: 'button', style: buttonStyle(), disabled, onClick: () => onOpen(plugin) }, t('detail')),
          h('button', { type: 'button', style: buttonStyle(), disabled, onClick: () => onUpdate(plugin) }, t('update')),
          h('button', { type: 'button', style: buttonStyle(), disabled: disabled || (plugin.previousVersions || []).length === 0, onClick: () => onRollback(plugin) }, t('rollback')),
          h('button', { type: 'button', style: dangerButton(), disabled, onClick: () => onUninstall(plugin) }, t('uninstall')),
        ),
      )
    }

    function CapabilitySection({ title, hint, children }) {
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
          h('strong', { style: { fontSize: 12 } }, title),
          hint ? h('span', { style: { color: COLOR.secondary, fontSize: 11 } }, hint) : null,
        ),
        children,
      )
    }

    function DetailView({ detail, loading, error, t, busy, onBack, onToggle, plugin }) {
      if (loading) return h('div', { style: { color: COLOR.secondary, fontSize: 12 } }, t('loading'))
      if (error) return h('div', { style: { color: COLOR.error, fontSize: 12 } }, error)
      if (!detail) return null
      const caps = detail.capabilities || {}
      const pluginInfo = detail.plugin || plugin || {}
      const disabled = busy === true
      const every = (list, kind, render) => (list.length === 0
        ? h('div', { style: { color: COLOR.secondary, fontSize: 11 } }, t('noCapability'))
        : list.map((item) => h('div', { key: `${kind}:${item.name ?? item.event}`, style: rowStyle },
          ...render(item, kind).map((child, index) => (child === null || child === undefined
            ? null
            : React.cloneElement(child, { key: index }))),
        )))
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          h('button', { type: 'button', style: buttonStyle(), onClick: onBack }, `← ${t('back')}`),
          h('strong', {}, `${pluginInfo.name}@${pluginInfo.version}`),
          badge(pluginInfo.format),
          badge(pluginInfo.enabled ? t('enabled') : t('disabled'), pluginInfo.enabled ? COLOR.success : COLOR.warn),
          badge(t('toggleCapabilityHint')),
        ),
        h('div', { style: { color: COLOR.secondary, fontSize: 11, display: 'flex', gap: 14, flexWrap: 'wrap' } },
          h('span', {}, `${t('market')}: ${pluginInfo.market}`),
          h('span', {}, `${t('installedAt')}: ${pluginInfo.installedAt || ''}`),
          (pluginInfo.previousVersions || []).length > 0
            ? h('span', {}, `${t('previousVersions')}: ${pluginInfo.previousVersions.join(', ')}`)
            : null,
        ),
        h(CapabilitySection, { title: `${t('skills')}（${(caps.skills || []).length}）` },
          every(caps.skills || [], 'skills', (item) => [
            h('div', { key: 'info', style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 220, flex: 1 } },
              h('strong', { style: { fontSize: 12 } }, item.name),
              h('span', { style: { color: COLOR.secondary, fontSize: 11 } }, item.description || ''),
            ),
            h(Switch, { checked: item.enabled, disabled, label: `${item.name}`, onChange: () => onToggle('skills', item.name, !item.enabled) }),
          ])),
        h(CapabilitySection, { title: `${t('commands')}（${(caps.commands || []).length}）` },
          every(caps.commands || [], 'commands', (item) => [
            h('div', { key: 'info', style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 220, flex: 1 } },
              h('strong', { style: { fontSize: 12 } }, `/${item.hostName}`),
              h('span', { style: { color: COLOR.secondary, fontSize: 11 } }, item.description || ''),
              h('span', { style: monoStyle }, item.registered ? t('registered') : t('notRegistered')),
            ),
            h(Switch, { checked: item.enabled, disabled, label: item.name, onChange: () => onToggle('commands', item.name, !item.enabled) }),
          ])),
        h(CapabilitySection, { title: `${t('hooks')}（${(caps.hooks || []).length}）` },
          every(caps.hooks || [], 'hooks', (item) => [
            h('div', { key: 'info', style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 240, flex: 1 } },
              h('strong', { style: { fontSize: 12 } }, item.event),
              h('span', { style: { color: COLOR.secondary, fontSize: 11 } },
                item.host ? `${t('hostEvent')}: ${item.host}${item.canBlock ? ` (${t('canBlock')})` : ''}` : (item.reason || t('notEffective'))),
            ),
            badge(item.effective ? t('effective') : t('notEffective'), item.effective ? COLOR.success : COLOR.warn),
            h(Switch, { checked: item.enabled, disabled, label: item.event, onChange: () => onToggle('hooks', item.event, !item.enabled) }),
          ])),
        h(CapabilitySection, { title: `${t('mcpServers')}（${(caps.mcpServers || []).length}）`, hint: t('mcpReason') },
          every(caps.mcpServers || [], 'mcpServers', (item) => [
            h('div', { key: 'info', style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 240, flex: 1 } },
              h('strong', { style: { fontSize: 12 } }, item.name),
              h('span', { style: monoStyle }, [item.transport, item.command, ...(item.args || [])].filter(Boolean).join(' ') || item.url),
            ),
            badge(t('notEffective'), COLOR.warn),
            h(Switch, { checked: item.enabled, disabled, label: item.name, onChange: () => onToggle('mcpServers', item.name, !item.enabled) }),
          ])),
        (detail.warnings || []).length > 0
          ? h('div', { style: { color: COLOR.warn, fontSize: 11 } }, h('div', {}, t('warnings')), ...detail.warnings.map((item, index) => h('div', { key: index }, `· ${item}`)))
          : null,
      )
    }

    function MarketCard({ market, t, busy, onRefresh, onRemove, onInstall, installedNames }) {
      const disabled = busy === true
      const plugins = market.plugins || []
      return h('div', { style: cardStyle },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h('strong', { style: { fontSize: 13 } }, market.name || market.id),
          badge(market.type),
          badge(market.format || ''),
          h('span', { style: monoStyle }, market.location || ''),
          h('div', { style: { flex: 1 } }),
          h('button', { type: 'button', style: buttonStyle(), disabled, onClick: () => onRefresh(market) }, t('refreshMarket')),
          h('button', { type: 'button', style: dangerButton(), disabled, onClick: () => onRemove(market) }, t('removeMarket')),
        ),
        market.refreshError ? h('div', { style: { color: COLOR.error, fontSize: 11 } }, market.refreshError) : null,
        plugins.length === 0
          ? h('div', { style: { color: COLOR.secondary, fontSize: 11 } }, t('noPluginsInMarket'))
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
            plugins.map((plugin) => h('div', { key: plugin.name, style: rowStyle },
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 200, flex: 1 } },
                h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
                  h('strong', { style: { fontSize: 12 } }, plugin.name),
                  plugin.version ? h('span', { style: monoStyle }, `@${plugin.version}`) : null,
                  installedNames.has(plugin.name) ? badge(t('installed'), COLOR.success) : null,
                  plugin.warning ? badge(plugin.warning, COLOR.warn) : null,
                ),
                plugin.description ? h('span', { style: { color: COLOR.secondary, fontSize: 11 } }, plugin.description) : null,
              ),
              h('button', {
                type: 'button', style: primaryButton(), disabled: disabled || plugin.installable === false,
                onClick: () => onInstall(plugin, market),
              }, t('install')),
            )),
          ),
      )
    }

    function Page({ t, locale }) {
      useLocaleVersion(locale)
      const [data, setData] = useState(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [busy, setBusy] = useState(false)
      const [view, setView] = useState('installed')
      const [selectedKey, setSelectedKey] = useState(null)
      const [detail, setDetail] = useState(null)
      const [detailLoading, setDetailLoading] = useState(false)
      const [detailError, setDetailError] = useState('')
      const [form, setForm] = useState({ type: 'local', location: '', name: '' })
      const noticeTimer = useRef(null)

      const flash = useCallback((text) => {
        setNotice(text)
        if (noticeTimer.current) clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => setNotice(''), 5000)
      }, [])
      useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current) }, [])

      const load = useCallback(async () => {
        setLoading(true)
        try {
          const next = await api('/state')
          setData(next)
          setError('')
        } catch (loadError) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        } finally {
          setLoading(false)
        }
      }, [])

      const loadDetail = useCallback(async (key) => {
        setDetailLoading(true)
        setDetailError('')
        try {
          const next = await api(`/plugin?key=${encodeURIComponent(key)}`)
          setDetail(next)
        } catch (detailLoadError) {
          setDetailError(detailLoadError instanceof Error ? detailLoadError.message : String(detailLoadError))
        } finally {
          setDetailLoading(false)
        }
      }, [])

      useEffect(() => { load() }, [load])

      const run = useCallback(async (action, options) => {
        setBusy(true)
        setError('')
        try {
          const result = await action()
          if (result && typeof result.message === 'string') flash(result.message)
          await load()
          if (selectedKey && !(options && options.closeDetail)) await loadDetail(selectedKey)
        } catch (actionError) {
          setError(actionError instanceof Error ? actionError.message : String(actionError))
        } finally {
          setBusy(false)
        }
      }, [flash, load, loadDetail, selectedKey])

      const openDetail = useCallback((plugin) => {
        setSelectedKey(plugin.key)
        setDetail(null)
        loadDetail(plugin.key)
      }, [loadDetail])

      const toggleCapability = useCallback((kind, capability, enabled) => {
        if (!selectedKey) return
        run(() => api('/capability', {
          method: 'POST',
          body: JSON.stringify({ name: selectedKey, kind, capability, enabled }),
        }))
      }, [run, selectedKey])

      if (loading && data === null) {
        return h('div', { style: { padding: 16, color: COLOR.secondary, fontSize: 12 } }, t('loading'))
      }
      if (data === null) {
        return h('div', { style: { padding: 16, color: COLOR.error, fontSize: 12 } }, `${t('apiUnavailable')}：${error || t('unknownError')}`)
      }

      const plugins = data.plugins || []
      const installedNames = new Set(plugins.map((plugin) => plugin.name))
      const selectedPlugin = plugins.find((plugin) => plugin.key === selectedKey) || null

      const header = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
          h('strong', { style: { fontSize: 15 } }, t('title')),
          h('span', { style: { color: COLOR.secondary, fontSize: 12 } }, data.subtitle || ''),
          h('div', { style: { flex: 1 } }),
          h('button', { type: 'button', style: buttonStyle(), disabled: busy, onClick: () => run(() => api('/state').then(() => ({ message: t('done') }))) }, t('refresh')),
        ),
        h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: COLOR.secondary } },
          h('span', { style: monoStyle }, data.home || ''),
          h(StatusLine, { data, t }),
        ),
        data.ui && data.ui.active === false
          ? h('div', { style: { color: COLOR.warn, fontSize: 11 } }, `${t('apiUnavailable')}：${data.ui.reason || ''} ${t('apiHint')}`)
          : null,
      )

      const tabs = h('div', { style: { display: 'flex', gap: 6, borderBottom: `1px solid ${COLOR.border}`, paddingBottom: 6 } },
        ['installed', 'markets'].map((key) => h('button', {
          key, type: 'button',
          style: buttonStyle({ border: 'none', background: view === key ? COLOR.layer2 : 'transparent', fontWeight: view === key ? 600 : 400 }),
          onClick: () => { setView(key); setSelectedKey(null); setDetail(null) },
        }, key === 'installed' ? `${t('installed')}（${plugins.length}）` : t('markets'))))

      let body
      if (view === 'installed') {
        if (selectedKey) {
          body = h(DetailView, {
            detail, loading: detailLoading, error: detailError, t, busy, plugin: selectedPlugin,
            onBack: () => { setSelectedKey(null); setDetail(null) },
            onToggle: toggleCapability,
          })
        } else if (plugins.length === 0) {
          body = h('div', { style: { color: COLOR.secondary, fontSize: 12 } }, t('emptyInstalled'))
        } else {
          body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            plugins.map((plugin) => h(PluginRow, {
              key: plugin.key, plugin, t, busy,
              onOpen: openDetail,
              onEnable: (item, enabled) => run(() => api('/enable', { method: 'POST', body: JSON.stringify({ name: item.key, enabled }) })),
              onUpdate: (item) => run(() => api('/update', { method: 'POST', body: JSON.stringify({ name: item.key }) })),
              onRollback: (item) => run(() => api('/rollback', { method: 'POST', body: JSON.stringify({ name: item.key }) })),
              onUninstall: (item) => run(() => api('/uninstall', { method: 'POST', body: JSON.stringify({ name: item.key }) }), { closeDetail: true }),
            })),
          )
        }
      } else {
        const addForm = h('div', { style: cardStyle },
          h('strong', { style: { fontSize: 13 } }, t('addMarket')),
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
            h('select', {
              value: form.type, onChange: (event) => setForm(Object.assign({}, form, { type: event.target.value })),
              style: buttonStyle({ padding: '4px 6px' }),
            }, ['local', 'git', 'url'].map((type) => h('option', { key: type, value: type }, type))),
            h('input', {
              value: form.location, placeholder: t('location'),
              onChange: (event) => setForm(Object.assign({}, form, { location: event.target.value })),
              style: buttonStyle({ minWidth: 280, flex: 1, cursor: 'text' }),
            }),
            h('input', {
              value: form.name, placeholder: t('marketName'),
              onChange: (event) => setForm(Object.assign({}, form, { name: event.target.value })),
              style: buttonStyle({ width: 160, cursor: 'text' }),
            }),
            h('button', {
              type: 'button', style: primaryButton(), disabled: busy || form.location.trim() === '',
              onClick: () => run(() => api('/market/add', {
                method: 'POST',
                body: JSON.stringify({ type: form.type, location: form.location.trim(), name: form.name.trim() || undefined }),
              }).then((result) => { setForm({ type: form.type, location: '', name: '' }); return result })),
            }, t('add')),
          ),
          h('div', { style: { color: COLOR.secondary, fontSize: 11 } }, t('addHint')),
        )
        const markets = data.markets || []
        body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          addForm,
          markets.length === 0
            ? h('div', { style: { color: COLOR.secondary, fontSize: 12 } }, t('emptyMarkets'))
            : markets.map((market) => h(MarketCard, {
              key: market.id, market, t, busy, installedNames,
              onRefresh: (item) => run(() => api('/market/refresh', { method: 'POST', body: JSON.stringify({ id: item.id }) })),
              onRemove: (item) => run(() => api('/market/remove', { method: 'POST', body: JSON.stringify({ id: item.id }) })),
              onInstall: (plugin, owner) => run(() => api('/install', {
                method: 'POST',
                body: JSON.stringify({ name: plugin.name, market: owner.id }),
              }), { closeDetail: true }),
            })),
        )
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0 24px', color: COLOR.primary, fontSize: 13, minHeight: 320 } },
        header,
        error ? h('div', { style: { color: COLOR.error, fontSize: 12 } }, error) : null,
        notice ? h('div', { style: { color: COLOR.success, fontSize: 12 } }, notice) : null,
        busy ? h('div', { style: { color: COLOR.secondary, fontSize: 11 } }, t('busy')) : null,
        tabs,
        body,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.locale
        for (const [id, dict] of Object.entries({ en: EN, 'zh-cn': ZH })) {
          try {
            locale?.register?.(NS, id, dict)
          } catch {
            /* 注册失败不影响页面（翻译回退到 key） */
          }
        }
        let translate = (key) => (ZH[key] ?? key)
        try {
          const bound = locale?.bind?.(NS)
          if (typeof bound === 'function') translate = bound
        } catch {
          /* 保持回退实现 */
        }
        const t = (key) => {
          try {
            const value = translate(key)
            return typeof value === 'string' && value !== '' ? value : (ZH[key] ?? key)
          } catch {
            return ZH[key] ?? key
          }
        }
        ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'agent-plugin',
          order: 50,
          label: () => t('tab'),
        }, (props) => h(Page, Object.assign({}, props, { t, locale }))))
      },
    }
  },
})