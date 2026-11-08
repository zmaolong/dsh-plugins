/**
 * LAN address enumeration. The plugin's own HTTP server binds once
 * (default `0.0.0.0`), so every interface address is reachable; these
 * helpers turn `os.networkInterfaces()` into the candidate URL list for
 * the panel and the Host-header allowlist for the request gate.
 *
 * @module dsh-remote-ctrl/ip
 */

import os from 'node:os'

/** Reachability class of one interface address. */
export type AddressScope = 'private' | 'public' | 'link-local'

/** One non-internal interface address. */
export interface LanAddress {
  address: string
  family: 4 | 6
  scope: AddressScope
}

function isPrivateIPv4(address: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(address)
  if (match === null) return false
  const first = Number(match[1])
  const second = Number(match[2])
  if (first === 10) return true
  if (first === 172 && second >= 16 && second <= 31) return true
  if (first === 192 && second === 168) return true
  return false
}

function scopeOf(address: string, family: 4 | 6): AddressScope {
  if (family === 4) {
    if (address.startsWith('169.254.')) return 'link-local'
    return isPrivateIPv4(address) ? 'private' : 'public'
  }
  const lowered = address.toLowerCase()
  if (lowered.startsWith('fe80:')) return 'link-local'
  // fc00::/7 unique-local addresses behave like RFC1918 for LAN reachability.
  return lowered.startsWith('f') && (lowered.startsWith('fc') || lowered.startsWith('fd')) ? 'private' : 'public'
}

/**
 * Every non-internal interface address, IPv4 before IPv6, private before
 * public before link-local. Recomputed per call so DHCP changes are picked
 * up without a plugin reload.
 */
export function lanAddresses(): LanAddress[] {
  const result: LanAddress[] = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const info of list ?? []) {
      if (!info || info.internal) continue
      // 新版 node 返回 'IPv4'/'IPv6' 字符串，旧版返回数字，这里统一归一。
      const familyRaw = String(info.family)
      const family = familyRaw === 'IPv4' ? 4 : familyRaw === 'IPv6' ? 6 : Number(familyRaw)
      if (family !== 4 && family !== 6) continue
      const address = String(info.address)
      if (address === '') continue
      result.push({ address, family, scope: scopeOf(address, family) })
    }
  }
  const scopeOrder: Record<AddressScope, number> = { private: 0, public: 1, 'link-local': 2 }
  return result.sort((left, right) =>
    (left.family - right.family) || (scopeOrder[left.scope] - scopeOrder[right.scope]))
}

/** Host header values this machine answers on: loopback spellings plus every interface address. */
export function localHostNames(): Set<string> {
  const names = new Set<string>(['127.0.0.1', 'localhost', '[::1]', '::1'])
  for (const entry of lanAddresses()) {
    const lowered = entry.address.toLowerCase()
    names.add(lowered)
    if (entry.family === 6) names.add(`[${lowered}]`)
  }
  return names
}
