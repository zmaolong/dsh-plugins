/**
 * Basic controls of the panel: Button, IconButton, Badge, Spinner, SearchBox,
 * Select, Avatar, and the empty/loading blocks. Pure props components styled
 * with the host theme tokens (see controls.module.css); markup and behavior
 * follow the official ui-primitives conventions (focus rings, aria labels,
 * disabled opacity) without importing the primitives package.
 *
 * @module dsh-agent-extension/client/controls
 */

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import clsx from 'clsx'
import { Icon } from './icons.tsx'
import { useEscapeClose, useFocusRestore } from './overlay-hooks.ts'
import { iconSrc, type ResolvedDisplay } from './presentation.ts'
import menuCss from './Menu.module.css'
import css from './controls.module.css'

/** Spinner: ring only, size 14 (or 20 large). */
export function Spinner({ large = false }: { large?: boolean }): ReactNode {
  return <span className={clsx(css.spinner, large && css.spinnerLarge)} aria-hidden />
}

/** Button variants. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

/**
 * Text button (md: 36px/R12; pill: capsule).
 * @param props.icon - leading lucide icon name.
 */
export function Button({ variant = 'secondary', pill = false, icon, disabled = false, title, onClick, children, type = 'button' }: {
  variant?: ButtonVariant
  pill?: boolean
  icon?: string
  disabled?: boolean
  title?: string | undefined
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  children?: ReactNode
  type?: 'button' | 'submit'
}): ReactNode {
  return (
    <button
      type={type}
      className={clsx(css.button, variant === 'primary' && css.primary, variant === 'secondary' && css.secondary,
        variant === 'danger' && css.danger, variant === 'ghost' && css.ghost, pill && css.pill)}
      disabled={disabled}
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      {icon !== undefined ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  )
}

/**
 * Square icon button.
 * @param props.busy - show a spinner instead of the glyph.
 * @param props.danger - warn-toned glyph.
 * @param props.outline - outlined square (toolbar shape).
 */
export function IconButton({ icon, title, disabled = false, onClick, busy = false, danger = false, outline = false }: {
  icon: string
  title: string
  disabled?: boolean
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  busy?: boolean
  danger?: boolean
  outline?: boolean
}): ReactNode {
  return (
    <button
      type="button"
      className={clsx(outline ? css.buttonOutline : css.iconButton, danger && !outline && css.iconDanger)}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {busy ? <Spinner /> : <Icon name={icon} size={16} />}
    </button>
  )
}

/** Badge tones. */
export type BadgeTone = 'success' | 'warn' | 'error' | 'plain'

/** Small status badge. */
export function Badge({ tone, children }: { tone?: BadgeTone, children: ReactNode }): ReactNode {
  return <span className={clsx(css.badge, tone === 'success' && css.badgeSuccess, tone === 'warn' && css.badgeWarn,
    tone === 'error' && css.badgeError, tone === 'plain' && css.badgePlain)}>{children}</span>
}

/** Update-available pill. */
export function UpdateBadge({ label }: { label: string }): ReactNode {
  return <span className={css.updateBadge}><Icon name="download" size={12} />{label}</span>
}

/** One option of a Select. */
export interface SelectOption {
  value: string
  label: string
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
export function Select({ label, title, value, options, onChange, size = 'md', align = 'left', className, trigger, triggerClassName }: {
  label: string
  title?: string | undefined
  value: string
  options: ReadonlyArray<SelectOption>
  onChange: (value: string) => void
  size?: 'md' | 'sm'
  align?: 'left' | 'right'
  className?: string | undefined
  trigger?: ReactNode
  triggerClassName?: string | undefined
}): ReactNode {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  useEscapeClose(open, () => { setOpen(false) })
  useFocusRestore(triggerRef, open)
  const selected = options.find(option => option.value === value)
  return (
    <div className={clsx(css.select, className)}>
      <button
        type="button"
        ref={triggerRef}
        className={clsx(trigger === undefined
          ? (size === 'sm' ? css.selectFieldSm : css.selectField)
          : css.selectTrigger,
        triggerClassName)}
        aria-label={label}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { setOpen(current => !current) }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          setOpen(true)
        }}
      >
        {trigger ?? (
          <>
            <span className={css.selectValue}>{selected?.label ?? ''}</span>
            <Icon name="chevronDown" size={14} />
          </>
        )}
      </button>
      {open
        ? (
          <div>
            <div className={menuCss.backdrop} onClick={() => { setOpen(false) }} />
            <div
              className={clsx(menuCss.menu, align === 'left' && menuCss.menuLeft)}
              role="menu"
              aria-label={label}
            >
              {options.map(option => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.value === value}
                  className={clsx(menuCss.item, option.value === value && menuCss.itemSelected)}
                  onClick={() => {
                    setOpen(false)
                    onChange(option.value)
                  }}
                >
                  <span className={menuCss.itemLabel}>{option.label}</span>
                  {option.value === value ? <Icon name="check" size={14} /> : null}
                </button>
              ))}
            </div>
          </div>
        )
        : null}
    </div>
  )
}

/**
 * Compact search control: an outlined icon button with the same 32px geometry
 * as the toolbar icon buttons; clicking it floats an input field below the
 * trigger. The trigger stays marked while a query is active, closing keeps the
 * query, and focus returns to the trigger on close.
 * @param props.clearable - show a clear affordance while text is present.
 */
export function SearchBox({ value, onChange, placeholder, clearable = false, clearLabel }: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  clearable?: boolean
  clearLabel?: string | undefined
}): ReactNode {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const popoverId = useId()
  useEscapeClose(open, () => { setOpen(false) })
  useFocusRestore(triggerRef, open)
  useEffect(() => {
    if (!open) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [open])
  const filtering = value !== ''
  return (
    <div className={css.search}>
      <button
        type="button"
        ref={triggerRef}
        className={clsx(css.buttonOutline, filtering && css.searchActive)}
        title={placeholder}
        aria-label={placeholder}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => { setOpen(current => !current) }}
      >
        <Icon name="search" size={16} />
      </button>
      {open
        ? (
          <div>
            <div className={css.searchBackdrop} onClick={() => { setOpen(false) }} />
            <div id={popoverId} className={css.searchPopover}>
              <Icon name="search" size={16} />
              <input
                ref={inputRef}
                type="search"
                className={css.searchInput}
                value={value}
                placeholder={placeholder}
                aria-label={placeholder}
                onChange={event => onChange(event.target.value)}
              />
              {clearable && filtering
                ? (
                  <button
                    type="button"
                    className={css.searchClear}
                    title={clearLabel}
                    aria-label={clearLabel}
                    onClick={() => onChange('')}
                  >
                    <Icon name="x" size={14} />
                  </button>
                )
                : null}
            </div>
          </div>
        )
        : null}
    </div>
  )
}

/**
 * Plugin avatar: resolved icon when renderable, a neutral Blocks glyph as the
 * missing/failure fallback (no initial-letter decoration).
 */
export function Avatar({ display, large = false }: { display: ResolvedDisplay, large?: boolean }): ReactNode {
  const src = iconSrc(display.icon)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [src])
  return (
    <div className={clsx(css.avatar, large && css.avatarLarge)}>
      {src !== '' && !failed
        ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
          />
        )
        : <Icon name="blocks" size={large ? 24 : 16} />}
    </div>
  )
}

/** Empty-state block (dashed placeholder). */
export function EmptyBlock({ title, description, action }: {
  title?: string
  description?: string
  action?: ReactNode
}): ReactNode {
  return (
    <div className={css.placeholderColumn}>
      {title !== undefined && title !== '' ? <div className={css.placeholderTitle}>{title}</div> : null}
      {description !== undefined && description !== '' ? <div className={css.placeholderDesc}>{description}</div> : null}
      {action ?? null}
    </div>
  )
}

/** Loading block with a spinner. */
export function LoadingBlock({ text }: { text: string }): ReactNode {
  return <div className={css.placeholder}><Spinner /><span>{text}</span></div>
}

/** Inline style helper the views use for one-off layout gaps. */
export function columnGap(gap: number): CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap }
}
