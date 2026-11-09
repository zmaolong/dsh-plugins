/**
 * Shared logger face for hub runtimes.
 *
 * `log` double-writes: the caller (AgentPluginHub) forwards to `ctx.logger`
 * with a `dsh-agent-extension: ` prefix and to the on-disk hub.log for
 * diagnostics.
 *
 * @module dsh-agent-extension/log
 */

/** Levels used by hub diagnostics. */
export type LogLevel = 'info' | 'warn' | 'error'

/** A single hub log sink. */
export type LogFn = (level: LogLevel, message: string) => void
