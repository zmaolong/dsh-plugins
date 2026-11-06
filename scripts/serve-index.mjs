#!/usr/bin/env node
/**
 * 本机静态服务：把仓库根目录暴露成 http://127.0.0.1:8231/，用来在 DSH 里试自己的索引源。
 *
 * 用法：
 *   node scripts/serve-index.mjs
 *   PORT=9000 node scripts/serve-index.mjs
 *
 * 注意：这只是调试用的只读静态服务。索引里的 npm / git 来源仍需真实可达。
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOST = process.env.HOST ?? '127.0.0.1'
const PORT = Number(process.env.PORT ?? 8231)

const TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
  const relative = pathname === '/' ? 'index.json' : pathname.replace(/^\/+/u, '')
  const target = normalize(join(ROOT, relative))
  const inside = target === ROOT || target.startsWith(ROOT + sep)

  if (!inside) {
    response.writeHead(403).end('forbidden\n')
    return
  }

  try {
    const body = await readFile(target)
    response.writeHead(200, {
      'Content-Type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    response.end(body)
    console.log(`200 ${request.method} ${pathname}`)
  } catch {
    response.writeHead(404).end('not found\n')
    console.log(`404 ${request.method} ${pathname}`)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`索引服务已启动：http://${HOST}:${PORT}/index.json`)
  console.log(`在 DSH 插件页 → 发现 → 添加索引源，填上面这个地址。`)
  console.log(`（Ctrl+C 停止）`)
})