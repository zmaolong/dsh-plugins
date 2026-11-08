/**
 * Version parse / compare / classify specs, ported from test/version.test.mjs
 * (node:test → vitest, zero-dependency SemVer approximation). Pure in-memory.
 */

import { expect, it } from 'vitest'

import {
  classifyUpdate,
  compareVersions,
  isInstallableVersion,
  parseVersion,
} from '../src/version.ts'

it('parseVersion：基本三段 / v 前缀 / = 前缀 / 缺段补 0 / 预发布与构建', () => {
  const basic = parseVersion('1.2.3')!
  expect(basic.major).toBe(1)
  expect(basic.minor).toBe(2)
  expect(basic.patch).toBe(3)
  expect(basic.prerelease).toBe(null)
  expect(parseVersion('v1.2.3')!.major).toBe(1)
  expect(parseVersion('V1.2.3')!.major).toBe(1)
  expect(parseVersion('=1.2.3')!.patch).toBe(3)
  expect(parseVersion('1.2')).toEqual({ major: 1, minor: 2, patch: 0, prerelease: null, raw: '1.2' })
  expect(parseVersion('1')).toEqual({ major: 1, minor: 0, patch: 0, prerelease: null, raw: '1' })
  expect(parseVersion('1.2.3-beta.1')!.prerelease).toEqual(['beta', '1'])
  expect(parseVersion('1.2.3+build.9')!.prerelease).toBe(null)
  expect(parseVersion('1.2.3-beta.1+build.9')!.prerelease?.join('.')).toBe('beta.1')
})

it('parseVersion：非法版本一律 null', () => {
  for (const value of ['', '   ', 'abc', '1.2.3.4', '1..3', '1.2.3-', '-1.2.3', null, undefined, 123]) {
    expect(parseVersion(value), `应拒绝：${String(value)}`).toBe(null)
  }
})

it('compareVersions：数值比较、v 前缀、缺段、build 忽略', () => {
  expect(compareVersions('0.2.0', '0.1.0')! > 0).toBe(true)
  expect(compareVersions('0.1.0', '0.1.0')).toBe(0)
  expect(compareVersions('v0.1.0', '0.1.0')).toBe(0)
  expect(compareVersions('1.0', '1.0.0')).toBe(0)
  expect(compareVersions('1.0.0+build.1', '1.0.0')).toBe(0)
  expect(compareVersions('2.0.0', '1.99.99')! > 0).toBe(true)
  expect(compareVersions('1.0.0', '1.0.1')! < 0).toBe(true)
})

it('compareVersions：预发布按 SemVer 排序（beta.10 > beta.2、数字 < 字母、少段更小、正式版更大）', () => {
  expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.2')! > 0, 'beta.10 应大于 beta.2').toBe(true)
  expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.10')! < 0).toBe(true)
  expect(compareVersions('1.0.0-beta', '1.0.0-beta.1')! < 0, '少段预发布更小').toBe(true)
  expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta')! < 0, '数字标识符 < 字母标识符').toBe(true)
  expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')! < 0).toBe(true)
  expect(compareVersions('1.0.0', '1.0.0-beta.999')! > 0, '正式版大于任意预发布').toBe(true)
  expect(compareVersions('1.0.0-rc.1', '1.0.0')! < 0).toBe(true)
})

it('compareVersions：任一侧不可比较返回 null', () => {
  expect(compareVersions('abc', '1.0.0')).toBe(null)
  expect(compareVersions('1.0.0', '')).toBe(null)
  expect(compareVersions(null, '1.0.0')).toBe(null)
  expect(compareVersions('1.2.3.4', '1.2.3')).toBe(null)
})

it('classifyUpdate：available / current / installed-newer / unknown 四态', () => {
  expect(classifyUpdate('0.1.0', '0.2.0')).toBe('available')
  expect(classifyUpdate('0.2.0', '0.2.0')).toBe('current')
  expect(classifyUpdate('0.3.0', '0.2.0')).toBe('installed-newer')
  expect(classifyUpdate('abc', '0.2.0')).toBe('unknown')
  expect(classifyUpdate('0.1.0', '')).toBe('unknown')
  expect(classifyUpdate('0.1.0', '1.0.0-beta.10')).toBe('available')
  expect(classifyUpdate('1.0.0-beta.10', '1.0.0-beta.2')).toBe('installed-newer')
})

it('isInstallableVersion：严格三段（拒绝 v 前缀 / 两段 / 四段）', () => {
  expect(isInstallableVersion('1.2.3')).toBe(true)
  expect(isInstallableVersion('1.2.3-beta.1')).toBe(true)
  expect(isInstallableVersion('1.2.3+build.9')).toBe(true)
  expect(isInstallableVersion(' v1.2.3 ')).toBe(false)
  expect(isInstallableVersion('1.2')).toBe(false)
  expect(isInstallableVersion('1.2.3.4')).toBe(false)
  expect(isInstallableVersion('')).toBe(false)
  expect(isInstallableVersion(null)).toBe(false)
})
