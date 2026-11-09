/**
 * Re-home a `sidebar.footer.action` entry into the shipped settings trigger row.
 *
 * The shipped sidebar renders footer actions in their own full-width row above
 * the settings row, and the settings row has no plugin seat of its own. When the
 * sidebar is expanded this hook inserts one wrapper element into the settings
 * row, right after the account launcher, so a footer action can sit beside the
 * avatar; the slot entry portals its button into that wrapper. Collapsed rails
 * keep the original footer row (the rail row is 36px wide and has no room).
 *
 * The anchor is derived from the mount node the entry renders by walking a few
 * ancestors: the sidebar foot is the element whose two children are the footer
 * actions cell (this entry's ancestor) and the settings column, and the row is
 * the column's first layout child, recognized by the trigger it contains.
 * Slot outlets sit in the tree as `display: contents` wrappers, so both the
 * column and the row lookups step through them; that keeps the anchor correct
 * without depending on hashed class names. It is still the shipped DOM
 * structure: when it does not match (or the settings shell is not mounted), the
 * hook resolves to `null` and the entry stays in its own footer row instead of
 * breaking the page.
 *
 * @module dsh-remote-ctrl/client/sidebar-row
 */

import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Portal target state: `undefined` while the anchor is being resolved, `null`
 * when the entry should keep rendering in its own footer row.
 */
export type SidebarRowAnchor = HTMLElement | null | undefined

/** Mount node and portal target of one footer action. */
export interface SidebarRowPlacement {
  /** Hidden span the entry must render inside its slot output. */
  readonly mountRef: RefObject<HTMLSpanElement>
  /** Wrapper inserted into the settings row, or the footer fallback state. */
  readonly anchor: SidebarRowAnchor
}

/** Ancestors walked above the mount node before giving up on the anchor. */
const MAX_SLOT_DEPTH = 6

/** Whether the element is a shadow-less wrapper for layout purposes. */
function isContents(element: Element): boolean {
  if (typeof getComputedStyle !== 'function') return false
  return getComputedStyle(element).display === 'contents'
}

/** First element that actually participates in layout below a container. */
function layoutChild(container: Element | null | undefined): Element | null {
  let node = container?.firstElementChild ?? null
  while (node !== null && isContents(node)) node = node.firstElementChild
  return node
}

interface FootStructure {
  /** Footer actions cell that contains the mount node. */
  readonly actions: HTMLElement
  /** Sidebar foot owning the actions cell and the settings column. */
  readonly foot: HTMLElement
}

/**
 * Find the sidebar foot around the mount node.
 *
 * @param mount - the entry's hidden mount span.
 * @returns the foot and its actions cell, or null for another layout.
 */
function findFoot(mount: HTMLElement): FootStructure | null {
  let candidate = mount.parentElement
  for (let depth = 0; candidate !== null && depth < MAX_SLOT_DEPTH; depth += 1) {
    const foot = candidate.parentElement
    const siblings = foot === null ? [] : Array.from(foot.children)
    if (foot !== null && siblings.length === 2 && siblings[0] === candidate) {
      const row = layoutChild(siblings[1])
      // The settings column starts with the trigger row, which holds either
      // the account launcher or the shell's fallback settings button.
      if (row !== null && row.querySelector('button') !== null) {
        return { actions: candidate, foot }
      }
    }
    candidate = candidate.parentElement
  }
  return null
}

/**
 * Resolve the settings trigger row for one footer entry and keep it anchored.
 *
 * @param enabled - whether the sidebar shows wide content (rail = false).
 * @returns the hidden mount ref and the current portal target.
 */
export function useSidebarRowAnchor(enabled: boolean): SidebarRowPlacement {
  const mountRef = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<SidebarRowAnchor>(enabled ? undefined : null)

  useEffect(() => {
    const mount = mountRef.current
    if (!enabled || mount === null || typeof MutationObserver === 'undefined') {
      setAnchor(null)
      return
    }
    const structure = findFoot(mount)
    if (structure === null) {
      setAnchor(null)
      return
    }
    const { actions, foot } = structure

    const wrapper = document.createElement('span')
    wrapper.dataset['remoteCtrlRow'] = ''
    wrapper.style.display = 'inline-flex'
    wrapper.style.alignItems = 'center'
    wrapper.style.flex = 'none'

    const place = (): void => {
      const siblings = Array.from(foot.children)
      const area = siblings.length === 2 && siblings[0] === actions ? siblings[1] : undefined
      const row = layoutChild(area)
      if (row === null || row.querySelector('button') === null) {
        wrapper.remove()
        setAnchor(null)
        return
      }
      // Second child = right after the account launcher or settings trigger,
      // before the shell-owned connection and update indicators.
      if (wrapper.parentElement !== row) row.insertBefore(wrapper, row.children[1] ?? null)
      setAnchor(wrapper)
    }

    place()
    // The settings shell may mount after this entry, and re-render can replace
    // the row node: re-place on every structural change under the sidebar foot.
    const observer = new MutationObserver(place)
    observer.observe(foot, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      wrapper.remove()
      setAnchor(null)
    }
  }, [enabled])

  return { mountRef, anchor }
}