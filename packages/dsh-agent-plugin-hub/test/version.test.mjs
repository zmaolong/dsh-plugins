/**
 * 版本解析 / 比较 / 更新判定单元测试（零依赖 SemVer 近似）。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  classifyUpdate,
  compareVersions,
  isInstallableVersion,
  parseVersion,
} from '../lib/version.js'

test('parseVersion：基本三段 / v 前缀 / = 前缀 / 缺段补 0 / 预发布与构建', () => {
  const basic = parseVersion('1.2.3')
  assert.equal(basic.major, 1)
  assert.equal(basic.minor, 2)
  assert.equal(basic.patch, 3)
  assert.equal(basic.prerelease, null)
  assert.equal(parseVersion('v1.2.3').major, 1)
  assert.equal(parseVersion('V1.2.3').major, 1)
  assert.equal(parseVersion('=1.2.3').patch, 3)
  assert.deepEqual(parseVersion('1.2'), { major: 1, minor: 2, patch: 0, prerelease: null, raw: '1.2' })
  assert.deepEqual(parseVersion('1'), { major: 1, minor: 0, patch: 0, prerelease: null, raw: '1' })
  assert.deepEqual(parseVersion('1.2.3-beta.1').prerelease, ['beta', '1'])
  assert.equal(parseVersion('1.2.3+build.9').prerelease, null)
  assert.equal(parseVersion('1.2.3-beta.1+build.9').prerelease.join('.'), 'beta.1')
})

test('parseVersion：非法版本一律 null', () => {
  for (const value of ['', '   ', 'abc', '1.2.3.4', '1..3', '1.2.3-', '-1.2.3', null, undefined, 123]) {
    assert.equal(parseVersion(value), null, `应拒绝：${String(value)}`)
  }
})

test('compareVersions：数值比较、v 前缀、缺段、build 忽略', () => {
  assert.ok(compareVersions('0.2.0', '0.1.0') > 0)
  assert.equal(compareVersions('0.1.0', '0.1.0'), 0)
  assert.equal(compareVersions('v0.1.0', '0.1.0'), 0)
  assert.equal(compareVersions('1.0', '1.0.0'), 0)
  assert.equal(compareVersions('1.0.0+build.1', '1.0.0'), 0)
  assert.ok(compareVersions('2.0.0', '1.99.99') > 0)
  assert.ok(compareVersions('1.0.0', '1.0.1') < 0)
})

test('compareVersions：预发布按 SemVer 排序（beta.10 > beta.2、数字 < 字母、少段更小、正式版更大）', () => {
  assert.ok(compareVersions('1.0.0-beta.10', '1.0.0-beta.2') > 0, 'beta.10 应大于 beta.2')
  assert.ok(compareVersions('1.0.0-beta.2', '1.0.0-beta.10') < 0)
  assert.ok(compareVersions('1.0.0-beta', '1.0.0-beta.1') < 0, '少段预发布更小')
  assert.ok(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta') < 0, '数字标识符 < 字母标识符')
  assert.ok(compareVersions('1.0.0-alpha', '1.0.0-alpha.1') < 0)
  assert.ok(compareVersions('1.0.0', '1.0.0-beta.999') > 0, '正式版大于任意预发布')
  assert.ok(compareVersions('1.0.0-rc.1', '1.0.0') < 0)
})

test('compareVersions：任一侧不可比较返回 null', () => {
  assert.equal(compareVersions('abc', '1.0.0'), null)
  assert.equal(compareVersions('1.0.0', ''), null)
  assert.equal(compareVersions(null, '1.0.0'), null)
  assert.equal(compareVersions('1.2.3.4', '1.2.3'), null)
})

test('classifyUpdate：available / current / installed-newer / unknown 四态', () => {
  assert.equal(classifyUpdate('0.1.0', '0.2.0'), 'available')
  assert.equal(classifyUpdate('0.2.0', '0.2.0'), 'current')
  assert.equal(classifyUpdate('0.3.0', '0.2.0'), 'installed-newer')
  assert.equal(classifyUpdate('abc', '0.2.0'), 'unknown')
  assert.equal(classifyUpdate('0.1.0', ''), 'unknown')
  assert.equal(classifyUpdate('0.1.0', '1.0.0-beta.10'), 'available')
  assert.equal(classifyUpdate('1.0.0-beta.10', '1.0.0-beta.2'), 'installed-newer')
})

test('isInstallableVersion：严格三段（拒绝 v 前缀 / 两段 / 四段）', () => {
  assert.equal(isInstallableVersion('1.2.3'), true)
  assert.equal(isInstallableVersion('1.2.3-beta.1'), true)
  assert.equal(isInstallableVersion('1.2.3+build.9'), true)
  assert.equal(isInstallableVersion(' v1.2.3 '), false)
  assert.equal(isInstallableVersion('1.2'), false)
  assert.equal(isInstallableVersion('1.2.3.4'), false)
  assert.equal(isInstallableVersion(''), false)
  assert.equal(isInstallableVersion(null), false)
})