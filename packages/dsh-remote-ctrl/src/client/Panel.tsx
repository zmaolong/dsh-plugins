/**
 * Remote Control dialog body (ZCode's remote-control layout): the left card
 * carries the status strip, the copy-link row, the pairing token and the QR
 * code; the right card carries the LAN-address switcher. Picking an address
 * re-points both the QR code and the copied link; the token only rotates
 * through the explicit confirm step.
 *
 * @module dsh-remote-ctrl/client/Panel
 */

import { useState, type ReactNode } from 'react'
import qrcode from './qrcode.ts'
import { identity, type PanelActions, type UseRemote, type PanelState } from './store.ts'
import type { Translate } from './store.ts'
import css from './panel.module.css'

/** Props of Panel (bound from the slot inject face). */
export interface PanelProps {
  useRemote: UseRemote
  actions: PanelActions
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

/** Render the dialog body. */
export function Panel({ useRemote, actions, t }: PanelProps): ReactNode {
  const state: PanelState = useRemote(identity)
  const [selectedUrl, setSelectedUrl] = useState<string>()
  const [confirmRefresh, setConfirmRefresh] = useState(false)
  const data = state.data

  if (state.status === 'loading' && data === null) {
    return <div className={css.stateBlock}><p className={css.hint}>{t('subtitle')}</p></div>
  }

  if (data === null) {
    return (
      <div className={css.stateBlock}>
        <p className={css.errorText}>{`${t('apiUnavailable')}：${state.error || t('unknownError')}`}</p>
        <p className={css.hint}>{t('apiHint')}</p>
        <button type="button" className={css.actionButton} onClick={() => { actions.load() }}>{t('retry')}</button>
      </div>
    )
  }

  const addresses = Array.isArray(data.addresses) ? data.addresses : []
  const selected = addresses.find(entry => entry.url === selectedUrl)
    ?? addresses.find(entry => entry.url === data.recommendedUrl)
    ?? addresses[0]
  const link = selected === undefined ? '' : `${selected.url}?token=${encodeURIComponent(data.token)}`
  const qr = link === '' ? '' : qrSvg(link)
  const copiedLink = state.copied === 'link'

  return (
    <div className={css.page}>
      <div className={css.grid}>
        <section className={css.card} data-remote-ctrl-scan-card>
          <div className={css.cardHead}>
            <span className={css.cardIcon} aria-hidden="true"><PanelGlyph /></span>
            <div className={css.cardTitles}>
              <h3 className={css.cardTitle}>{t('qrTitle')}</h3>
              <p className={css.hint}>{t('qrHint')}</p>
            </div>
          </div>

          <div className={css.connectionCard}>
            <div className={css.connectionRow}>
              <div className={css.connectionText}>
                <div className={css.statusRow}>
                  <span className={data.listening ? css.statusRunning : css.statusStopped}>
                    {data.listening ? t('running') : t('stopped')}
                  </span>
                  <span className={css.statusTag} data-on={data.listening}>
                    <span className={css.statusDot} aria-hidden="true" />
                    {data.listening ? t('enabledTag') : t('disabledTag')}
                  </span>
                </div>
                {data.listening && <p className={css.detail}>{t('clients', { count: data.clientCount })}</p>}
                {data.error !== '' && <p className={css.errorText} role="alert">{`${t('serverError')}：${data.error}`}</p>}
                {!data.upstream.ready && <p className={css.detail}>{t('upstreamMissing')}</p>}
              </div>
              <button
                type="button"
                className={data.listening ? css.outlineButton : css.actionButton}
                disabled={state.pending}
                data-remote-ctrl-toggle={data.listening ? 'stop' : 'start'}
                onClick={() => { void (data.listening ? actions.stop() : actions.start()) }}
              >
                {data.listening ? t('stop') : t('start')}
              </button>
            </div>
            {state.error !== '' && <p className={css.errorText} role="alert">{state.error}</p>}
            <div className={css.copyRow}>
              <span className={css.detail}>{t('copyLinkDesc')}</span>
              <button
                type="button"
                className={css.outlineButton}
                disabled={link === '' || !data.listening || state.pending}
                data-remote-ctrl-copy-link
                onClick={() => { void actions.copy(link, 'link') }}
              >
                {copiedLink ? t('copied') : t('copyLink')}
              </button>
            </div>
          </div>

          <div className={css.tokenSection}>
            <div className={css.cardTitles}>
              <h3 className={css.cardTitle}>{t('tokenTitle')}</h3>
              <p className={css.hint}>{data.tokenPinned ? t('tokenPinned') : t('tokenPermanent')}</p>
            </div>
            <div className={css.tokenRow}>
              <code className={css.tokenValue}>{data.token}</code>
              {confirmRefresh
                ? (
                    <>
                      <button
                        type="button"
                        className={css.actionButton}
                        disabled={state.pending}
                        data-remote-ctrl-refresh-confirm
                        onClick={() => { setConfirmRefresh(false); void actions.refreshToken() }}
                      >
                        {t('refreshConfirm')}
                      </button>
                      <button type="button" className={css.outlineButton} onClick={() => { setConfirmRefresh(false) }}>
                        {t('cancel')}
                      </button>
                    </>
                  )
                : (
                    <button
                      type="button"
                      className={css.outlineButton}
                      disabled={state.pending || data.tokenPinned}
                      data-remote-ctrl-refresh-token
                      onClick={() => { setConfirmRefresh(true) }}
                    >
                      {t('refreshToken')}
                    </button>
                  )}
            </div>
          </div>

          <div className={css.qrArea}>
            {data.listening && qr !== ''
              ? <div className={css.qrImage} data-testid="qr" dangerouslySetInnerHTML={{ __html: qr }} />
              : <p className={css.hint}>{data.listening ? (link || t('noAddress')) : t('stoppedHint')}</p>}
          </div>
        </section>

        <section className={css.card} data-remote-ctrl-address-card>
          <div className={css.cardHead}>
            <span className={css.cardIcon} aria-hidden="true"><NetworkGlyph /></span>
            <div className={css.cardTitles}>
              <h3 className={css.cardTitle}>{t('addresses')}</h3>
              <p className={css.hint}>{t('addressesDesc')}</p>
            </div>
          </div>

          {addresses.length === 0
            ? <p className={css.hint}>{t('noAddress')}</p>
            : (
                <div className={css.addressList} role="radiogroup" aria-label={t('addresses')} data-remote-ctrl-address-list>
                  {addresses.map(entry => {
                    const checked = entry.url === selected?.url
                    return (
                      <button
                        key={entry.url}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        className={css.addressOption}
                        data-address={entry.address}
                        data-checked={checked}
                        onClick={() => { setSelectedUrl(entry.url) }}
                      >
                        <span className={css.addressHead}>
                          <code className={css.addressIp}>{entry.address}</code>
                          <span className={css.scopeTag}>{scopeLabel(String(entry.scope), t)}</span>
                          {entry.url === data.recommendedUrl && <span className={css.recommendTag}>{t('recommended')}</span>}
                        </span>
                        <span className={css.addressUrl}>{entry.url}</span>
                      </button>
                    )
                  })}
                </div>
              )}

          <p className={css.hint}>{t('securityHint')}</p>
        </section>
      </div>
    </div>
  )
}

/** Small phone glyph for the scan card head. */
function PanelGlyph(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </svg>
  )
}

/** Small network glyph for the address card head. */
function NetworkGlyph(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <path d="M10 6.5h4a3 3 0 0 1 3 3v4" />
    </svg>
  )
}