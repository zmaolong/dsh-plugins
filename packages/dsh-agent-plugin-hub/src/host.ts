/**
 * Structural types of the host contract the hub touches.
 *
 * The hub must not import `@deepseek-ai/*` (host capabilities cross through
 * ctx), so the host services it reads — commands, skills, subprocess,
 * webServer, logger — are declared here structurally, limited to the members
 * actually used. A host upgrade that reshapes a service breaks `npm run check`
 * here first.
 *
 * @module dsh-agent-plugin-hub/host
 */

/** Logger face of `ctx.logger` (cordis). */
export interface HostLogger {
  debug(message: string): void
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

/** Host command registration descriptor. */
export interface CommandDescriptor {
  name: string
  description: string
  input?: { hint?: string }
  handler: (input: { rawInput?: unknown }) => Promise<CommandOutcome> | CommandOutcome
}

/** Host command handler outcome. */
export interface CommandOutcome {
  kind: 'success' | 'error'
  text: string
}

/** Host commands service (`ctx.commands`). */
export interface CommandsService {
  register(descriptor: CommandDescriptor): () => void
}

/** Skill candidate the provider reports to the host. */
export interface SkillCandidate {
  name: string
  description: string
  whenToUse?: string | undefined
  invocation: { modelInvocable: boolean, userInvocable: boolean }
  source: string
  provider: string
  rank: number
  path?: string
  resourceBase: { kind: string, path: string }
  locator: Record<string, unknown>
  metadata?: Record<string, unknown> | undefined
}

/** Loaded skill definition returned for one candidate. */
export interface SkillLoaded {
  name?: string | undefined
  description?: string | undefined
  whenToUse?: string | undefined
  invocation?: { modelInvocable: boolean, userInvocable: boolean } | undefined
  source?: string | undefined
  provider?: string | undefined
  path: string
  resourceBase: { kind: string, path: string }
  content: string
  metadata?: Record<string, unknown> | undefined
}

/** Lifecycle control handed to a provider factory. */
export interface SkillProviderControl {
  invalidate?: () => void
}

/** Host skills service (`ctx.skills`). */
export interface SkillsService {
  registerProvider(create: (control: SkillProviderControl) => {
    name: string
    list: (options?: unknown) => Promise<SkillCandidate[]>
    get: (candidate: Record<string, unknown>, options?: unknown) => Promise<SkillLoaded | undefined>
  }): () => void
}

/** Subprocess outcome collected by the host. */
export interface SubprocessOutcome {
  exitCode: number | null
  signal: unknown
}

/** Host subprocess handle. */
export interface SubprocessHandle {
  terminate: () => void
  done: Promise<SubprocessOutcome>
  collected?: {
    stdout?: { readFrom?: (offset: number) => { text: string } }
    stderr?: { readFrom?: (offset: number) => { text: string } }
  }
}

/** Host subprocess service (`ctx.get('subprocess')`). */
export interface SubprocessService {
  spawn(options: {
    argv: string[]
    cwd: string
    stdio: {
      stdin: { data: string }
      stdout: { maxBytes: number }
      stderr: { maxBytes: number }
    }
    graceMs: number
    env: NodeJS.ProcessEnv
  }): SubprocessHandle
  terminalEnvironment?: () => Promise<{ platform?: string, defaultShell?: string } | undefined>
  resolveExecutable?: (shell: string) => Promise<string>
}

/** HTTP request the host webServer hands to a handler. */
export interface WebRequest {
  method?: string | undefined
  url?: string | undefined
  headers?: Record<string, string | string[] | undefined> | undefined
  body?: unknown
}

/** HTTP response the handler returns. */
export interface WebResponse {
  status?: number
  headers?: Record<string, string>
  body?: unknown
}

/** Host webServer route registration kinds (`ctx.webServer`). */
export type WebRoute =
  | { kind: 'prefix', path: string, handler: (request: WebRequest) => Promise<WebResponse> | WebResponse }
  | { kind: 'exact', path: string, handler: (request: WebRequest) => Promise<WebResponse> | WebResponse }

/** Host webServer service (`ctx.webServer`). */
export interface WebServerService {
  register(route: WebRoute): () => void
}

/** Hub plugin configuration (cordis.patch.yml row `config`). */
export interface HubConfig {
  home?: string | undefined
  hooks?: boolean | undefined
}

/** The host Context face the hub uses; unknown members stay reachable as `unknown`. */
export interface HostContext {
  /** Service lookup; may return undefined while services are pending. */
  get<T>(name: string): T | undefined
  /** Register a resource with its disposer; the label aids diagnostics. */
  effect(fn: () => (() => void) | void, label?: string): unknown
  /** Subscribe a host event; returns a disposer when supported. */
  on(event: string, listener: (...args: unknown[]) => unknown): unknown
  /** Wait for services and run the callback when they appear. */
  inject(deps: readonly string[], callback: (scope: unknown) => void): unknown
  logger?: HostLogger
  commands?: CommandsService
  skills?: SkillsService
  webServer?: WebServerService
}
