/**
 * Remote Control panel: server status, per-address LAN URLs, the QR code of
 * the recommended address (token embedded), the pairing token, and the
 * connected-device count. Data arrives from the loopback `/remote-ctrl/api`
 * surface on the host webServer.
 *
 * @module dsh-remote-ctrl/client/Panel
 */

import { useEffect, type ReactNode } from 'react'
import qrcode from './qrcode.ts'
import { identity, type UseRemote, type PanelState } from './store.ts'
import type { Translate } from './store.ts'
import css from './panel.module.css'

/** Props of Panel (bound from the slot inject face). */
export interface PanelProps {
  useRemote: UseRemote
  actions: {
    init: () => void
    load: () => void
    copy: (value: string, key: string) => Promise<void>
    destroy: () => void
  }
  t: Translate
}

/** QR payload → SVG markup ('' when the payload cannot be encoded). */
export function qrSvg(payload: string): string {
  if (payload === '') return ''
  try {
    const qr = qrcode(0, 'M')
    qr.addData(payload)
    qr.make()
    return String(qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }))
  } catch {
    return ''
  }
}

function scopeLabel(scope: string, t: Translate): string {
  if (scope === 'private') return t('scopePrivate')
  if (scope === 'public') return t('scopePublic')
  if (scope === 'link-local') return t('scopeLinkLocal')
  return scope
}

/** Render the main panel. */
export function Panel({ useRemote, actions, t }: PanelProps): ReactNode {
  const state: PanelState = useRemote(identity)
  useEffect(() => {
    actions.init()
    return () => actions.destroy()
  }, [actions])
  const data = state.data

  let body: ReactNode
  if (state.status === 'loading' && data === null) {
    body = <p className={css.hint}>{t('subtitle')}</p>
  } else if (data === null) {
    body = (
      <div className={css.page}>
        <p className={css.errorText}>{`${t('apiUnavailable')}：${state.error || t('unknownError')}`}</p>
        <p className={css.hint}>{t('apiHint')}</p>
        <button type="button" className={css.button} onClick={() => actions.load()}>{t('retry')}</button>
      </div>
    )
  } else {
    const addresses = Array.isArray(data.addresses) ? data.addresses : []
    const qr = qrSvg(data.qrUrl)
    body = (
      <div className={css.page}>
        {state.error !== '' && <p className={css.errorText}>{state.error}</p>}
        {data.error !== '' && <p className={css.errorText}>{`${t('serverError')}：${data.error}`}</p>}
        <section className={css.card}>
          <div className={css.rowBetween}>
            <h2 className={css.cardTitle}>{t('title')}</h2>
            <span className={data.listening ? css.badgeRunning : css.badgeStopped}>
              {data.listening ? t('running') : t('stopped')}
            </span>
          </div>
          <p className={css.hint}>{t('listenAt', { host: data.host, port: data.port })}</p>
          <p className={css.hint}>{t('clients', { count: data.clientCount })}</p>
          {!data.upstream.ready && <p className={css.hint}>{t('upstreamMissing')}</p>}
        </section>

        {data.listening && (
          <section className={css.card}>
            <h2 className={css.cardTitle}>{t('qrTitle')}</h2>
            {qr !== ''
              ? (
                  <div className={css.qrBox} data-testid="qr">
                    <div className={css.qrInner} dangerouslySetInnerHTML={{ __html: qr }} />
                    <div className={css.qrUrl}>{data.qrUrl}</div>
                  </div>
                )
              : <p className={css.hint}>{data.qrUrl}</p>}
            <p className={css.hint}>{t('qrHint')}</p>
          </section>
        )}

        <section className={css.card}>
          <h2 className={css.cardTitle}>{t('addresses')}</h2>
          {addresses.length === 0
            ? <p className={css.hint}>{t('noAddress')}</p>
            : (
                <ul className={css.addressList}>
                  {addresses.map(entry => (
                    <li key={entry.url} className={css.addressRow}>
                      <code className={css.addressText}>{entry.url}</code>
                      <span className={css.scopeBadge}>{scopeLabel(String(entry.scope), t)}</span>
                      <button
                        type="button"
                        className={css.button}
                        onClick={() => { void actions.copy(entry.url, `addr:${entry.url}`) }}
                      >
                        {state.copied === `addr:${entry.url}` ? t('copied') : t('copy')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
        </section>

        <section className={css.card}>
          <h2 className={css.cardTitle}>{t('tokenTitle')}</h2>
          <div className={css.addressRow}>
            <code className={css.addressText}>{data.token}</code>
            <button
              type="button"
              className={css.button}
              onClick={() => { void actions.copy(data?.token ?? '', 'token') }}
            >
              {state.copied === 'token' ? t('copied') : t('copy')}
            </button>
          </div>
          <p className={css.hint}>{t('tokenHint')}</p>
          <p className={css.hint}>{t('securityHint')}</p>
        </section>
      </div>
    )
  }

  return <div className={css.root}>{body}</div>
}
