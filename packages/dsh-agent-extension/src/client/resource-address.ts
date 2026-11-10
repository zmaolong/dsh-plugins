/**
 * Addresses of the plugin's derived preview files in the host resource model.
 *
 * The host's `.md` preview claims `dsh-resource://file/session/<sessionId>/<path>`
 * addresses; this module mirrors its segment encoding exactly
 * (encodeURIComponent with literal `:` for drive letters), so a memory preview
 * file placed in the system temp directory opens as a normal host preview.
 * A third-party plugin cannot import `@deepseek-ai/dsh-util-workspace-path`,
 * so the rule is restated here and covered by its own unit test.
 *
 * @module dsh-agent-extension/client/resource-address
 */

/**
 * Encode one path segment, keeping `:` literal so a Windows drive letter reads
 * as written.
 * @param segment - one `/`-separated path segment.
 */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/gi, ':')
}

/**
 * Build the address of a file read through one Session.
 * @param sessionId - the Session whose workspace resolves the path.
 * @param path - absolute or workspace-relative path; backslashes normalize to `/` and leading `./` prefixes are dropped.
 * @returns the `dsh-resource://file/session/<sessionId>/<path>` address.
 */
export function sessionFileAddress(sessionId: string, path: string): string {
  const normalized = path.replace(/\\/gu, '/').replace(/^(?:\.\/)+/u, '')
  return `dsh-resource://file/session/${encodeSegment(sessionId)}/${normalized.split('/').map(encodeSegment).join('/')}`
}
