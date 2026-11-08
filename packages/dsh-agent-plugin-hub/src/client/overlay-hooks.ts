/**
 * Overlay behavior hooks shared by menus and dialogs: Escape-close (capture
 * phase) and focus restore to the trigger on close.
 *
 * @module dsh-agent-plugin-hub/client/overlay-hooks
 */

import { useEffect, useRef, type RefObject } from 'react'

/** While open, close on Escape (capture phase so the host shortcut does not double-fire). */
export function useEscapeClose(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])
}

/** Restore focus to the trigger on the open → closed transition. */
export function useFocusRestore(triggerRef: RefObject<HTMLElement | null>, open: boolean): void {
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !open && triggerRef.current && typeof triggerRef.current.focus === 'function') {
      triggerRef.current.focus()
    }
    wasOpen.current = open
  }, [open, triggerRef])
}
