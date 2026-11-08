/**
 * Canonical market location key shared by both halves: the server uses it for
 * add-time duplicate detection (same source under different spellings — bare
 * repo URL, `.git` suffix, raw manifest link — must not register twice), the
 * client for "already added" matching. Deliberately independent from
 * `marketIdFor`: ids stay stable for existing installs, this key only powers
 * equivalence checks.
 *
 * @module dsh-agent-plugin-hub/location-key
 */

/** Canonical key of one market location ('' for empty input). */
export function marketLocationKey(location: unknown): string {
  const raw = String(location ?? '').trim()
  if (raw === '') return ''
  const scp = /^git@([^:/]+):(.+)$/i.exec(raw)
  if (scp) return gitKey(String(scp[1] ?? ''), String(scp[2] ?? ''))
  const ssh = /^ssh:\/\/(?:[^@/]+@)?([^:/]+)(?::\d+)?\/(.+)$/i.exec(raw)
  if (ssh) return gitKey(String(ssh[1] ?? ''), String(ssh[2] ?? ''))
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw)
      const host = url.hostname.toLowerCase()
      const segments = url.pathname.split('/').filter(segment => segment !== '')
      // github.com/<o>/<r>[/<anything>] and raw.githubusercontent.com/<o>/<r>/<ref>/<path>
      // are the same repository content — collapse to one key.
      if ((host === 'github.com' || host === 'raw.githubusercontent.com') && segments.length >= 2) {
        return gitKey('github.com', `${String(segments[0])}/${String(segments[1])}`)
      }
      return `url:${host}/${segments.join('/')}`
    } catch {
      return `url:${raw.toLowerCase()}`
    }
  }
  const normalized = raw.replace(/\\/g, '/').replace(/\/+$/, '')
  const looksWindows = /^[a-z]:\//i.test(normalized) || raw.includes('\\')
  return `local:${looksWindows ? normalized.toLowerCase() : normalized}`
}

/** Key of a git-ish host/path pair: lowercase host and path, `.git` suffix stripped. */
function gitKey(host: string, repoPath: string): string {
  const segments = repoPath.replace(/\/+$/, '').toLowerCase().split('/').filter(segment => segment !== '')
  const last = segments[segments.length - 1]
  if (last !== undefined) segments[segments.length - 1] = last.replace(/\.git$/i, '')
  return `git:${host.toLowerCase()}/${segments.join('/')}`
}
