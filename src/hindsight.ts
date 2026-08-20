/**
 * Pure Hindsight inspection/control logic, shared by the node half's HTTP
 * routes and the unit tests. No cordis imports: everything here is plain
 * node — config reading/layering, daemon health + start/stop, bank API
 * reads, log tails. Mirrors the conventions of
 * @vectorize-io/hindsight-coding-agents v0.4.x (config layering order,
 * daemon-start.js contract, uvx fallback command) without importing it.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Config metadata
// ---------------------------------------------------------------------------

/** Where the harness key came from, strongest first. */
export type ConfigSource = 'default' | 'env' | 'file' | 'file:harness'

export interface ConfigItem {
  key: string
  /** UI grouping. */
  group: 'server' | 'daemon' | 'bank' | 'memory' | 'survey' | 'logging'
  value: unknown
  source: ConfigSource
  /** Overriding environment variable, when one exists for this key. */
  envVar?: string
}

export interface ConfigReport {
  path: string
  exists: boolean
  /** Raw file JSON (apiToken masked); null when missing or unparsable. */
  raw: unknown
  /** Resolved effective values, one row per known key. */
  items: ConfigItem[]
  /** Non-secret environment overrides currently in effect. */
  envActive: { key: string; envVar: string }[]
  /** Parse error when the file exists but is not valid JSON. */
  error?: string
  /** bank-id -> per-bank override keys present in the file. */
  bankSections: { id: string; keys: string[] }[]
  harnessSections: string[]
}

/** Every behavioral key hindsight v0.4 resolves, with its env var and group. */
export const CONFIG_KEYS: ReadonlyArray<{ key: string; group: ConfigItem['group']; envVar?: string }> = [
  { key: 'serverMode', group: 'server', envVar: 'HINDSIGHT_SERVER_MODE' },
  { key: 'apiUrl', group: 'server', envVar: 'HINDSIGHT_API_URL' },
  { key: 'apiToken', group: 'server', envVar: 'HINDSIGHT_API_TOKEN' },
  { key: 'apiPort', group: 'server', envVar: 'HINDSIGHT_API_PORT' },
  { key: 'daemonProfile', group: 'daemon', envVar: 'HINDSIGHT_DAEMON_PROFILE' },
  { key: 'daemonIdleTimeout', group: 'daemon', envVar: 'HINDSIGHT_DAEMON_IDLE_TIMEOUT' },
  { key: 'embedVersion', group: 'daemon', envVar: 'HINDSIGHT_EMBED_VERSION' },
  { key: 'embedPackagePath', group: 'daemon', envVar: 'HINDSIGHT_EMBED_PACKAGE_PATH' },
  { key: 'bankId', group: 'bank', envVar: 'HINDSIGHT_BANK_ID' },
  { key: 'dynamicBankId', group: 'bank', envVar: 'HINDSIGHT_DYNAMIC_BANK_ID' },
  { key: 'bankIdTemplate', group: 'bank', envVar: 'HINDSIGHT_BANK_ID_TEMPLATE' },
  { key: 'mapPathToBank', group: 'bank' },
  { key: 'resolveWorktrees', group: 'bank', envVar: 'HINDSIGHT_RESOLVE_WORKTREES' },
  { key: 'optInOnly', group: 'bank', envVar: 'HINDSIGHT_OPT_IN_ONLY' },
  { key: 'optInPaths', group: 'bank', envVar: 'HINDSIGHT_OPT_IN_PATHS' },
  { key: 'banks', group: 'bank' },
  { key: 'harness', group: 'server', envVar: 'HINDSIGHT_HARNESS' },
  { key: 'disabled', group: 'server', envVar: 'HINDSIGHT_DISABLED' },
  { key: 'retainSessions', group: 'memory', envVar: 'HINDSIGHT_RETAIN_SESSIONS' },
  { key: 'maxParallelRetains', group: 'memory', envVar: 'HINDSIGHT_MAX_PARALLEL_RETAINS' },
  { key: 'retainTags', group: 'memory', envVar: 'HINDSIGHT_RETAIN_TAGS' },
  { key: 'retainMetadata', group: 'memory' },
  { key: 'observationScopes', group: 'memory', envVar: 'HINDSIGHT_OBSERVATION_SCOPES' },
  { key: 'autoReflect', group: 'memory', envVar: 'HINDSIGHT_AUTO_REFLECT' },
  { key: 'reflectTimeoutMs', group: 'memory', envVar: 'HINDSIGHT_REFLECT_TIMEOUT_MS' },
  { key: 'reflectToolTimeoutMs', group: 'memory', envVar: 'HINDSIGHT_REFLECT_TOOL_TIMEOUT_MS' },
  { key: 'reflectBudget', group: 'memory', envVar: 'HINDSIGHT_REFLECT_BUDGET' },
  { key: 'pageRefreshEveryTurns', group: 'memory', envVar: 'HINDSIGHT_PAGE_REFRESH_EVERY_TURNS' },
  { key: 'pageTriggerType', group: 'memory', envVar: 'HINDSIGHT_PAGE_TRIGGER_TYPE' },
  { key: 'pageTriggerCron', group: 'memory', envVar: 'HINDSIGHT_PAGE_TRIGGER_CRON' },
  { key: 'autoSeed', group: 'memory', envVar: 'HINDSIGHT_AUTO_SEED' },
  { key: 'seedLimit', group: 'memory', envVar: 'HINDSIGHT_SEED_LIMIT' },
  { key: 'gitIngest', group: 'memory', envVar: 'HINDSIGHT_GIT_INGEST' },
  { key: 'codebaseSurvey', group: 'survey', envVar: 'HINDSIGHT_CODEBASE_SURVEY' },
  { key: 'surveyModel', group: 'survey', envVar: 'HINDSIGHT_SURVEY_MODEL' },
  { key: 'surveyBudgetUsd', group: 'survey', envVar: 'HINDSIGHT_SURVEY_BUDGET_USD' },
  { key: 'surveyRefreshCommits', group: 'survey', envVar: 'HINDSIGHT_SURVEY_REFRESH_COMMITS' },
  { key: 'logLevel', group: 'logging', envVar: 'HINDSIGHT_LOG_LEVEL' },
]

export const CONFIG_DEFAULTS: Record<string, unknown> = {
  serverMode: 'cloud',
  apiUrl: 'https://api.hindsight.vectorize.io',
  apiPort: 9077,
  daemonProfile: 'coding-agent',
  harness: 'opencode',
  disabled: false,
  retainSessions: true,
  maxParallelRetains: 10,
  reflectTimeoutMs: 120000,
  reflectToolTimeoutMs: 330000,
  reflectBudget: 'high',
  autoReflect: true,
  pageRefreshEveryTurns: 10,
  pageTriggerType: 'auto-refresh',
  autoSeed: true,
  seedLimit: 300,
  codebaseSurvey: true,
  surveyModel: 'haiku',
  surveyBudgetUsd: 2,
  surveyRefreshCommits: 20,
  gitIngest: 'message',
  logLevel: 'info',
  optInOnly: false,
  dynamicBankId: true,
  resolveWorktrees: true,
}

/** Mask a credential value for display: keep shape, drop the secret. */
export function maskToken(value: unknown): unknown {
  if (typeof value !== 'string' || value === '') return value === '' ? '' : value
  return `configured (••••${value.slice(-4)})`
}

/** Deep-copy with the apiToken masked wherever it appears. */
function maskDeep(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(maskDeep)
  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = /token|key|secret|password/i.test(k) && typeof v === 'string' && v !== '' ? maskToken(v) : maskDeep(v)
    }
    return out
  }
  return node
}

/** Read the raw config file (hindsight's own parser: ENOENT -> {}, invalid -> {}). */
export function readRawConfig(path: string): { raw: Record<string, unknown>; error?: string } {
  try {
    return { raw: JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> }
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return { raw: {} }
    return { raw: {}, error: `invalid JSON: ${err.message}` }
  }
}

/**
 * Effective-value report for the whole config surface. Layering mirrors
 * hindsight's loadConfig: base env, then file, then file.harnesses.<harness>
 * (later wins) — a value set in a weaker layer still shows its origin.
 */
export function buildConfigReport(harness: string, env: NodeJS.ProcessEnv = process.env): ConfigReport {
  const path = env.HINDSIGHT_CONFIG || join(homedir(), '.hindsight', 'coding-agent.json')
  const { raw, error } = readRawConfig(path)
  const fileHarness = (raw.harnesses ?? {}) as Record<string, Record<string, unknown>>
  const layerHarness = fileHarness[harness] ?? {}

  const items: ConfigItem[] = CONFIG_KEYS.map(({ key, group, envVar }) => {
    const inHarness = key in layerHarness
    const inFile = key in raw
    const envVal = envVar !== undefined ? env[envVar] : undefined
    const inEnv = envVal !== undefined && envVal !== ''
    let source: ConfigSource = 'default'
    let value: unknown = CONFIG_DEFAULTS[key]
    if (inEnv && envVal !== undefined) { source = 'env'; value = coerceEnv(key, envVal) }
    if (inFile) { source = 'file'; value = raw[key] }
    if (inHarness) { source = 'file:harness'; value = layerHarness[key] }
    return { key, group, value: key === 'apiToken' ? maskToken(value) : maskDeep(value), source, envVar }
  })

  const envActive = CONFIG_KEYS
    .filter((k) => { const v = k.envVar !== undefined ? env[k.envVar] : undefined; return v !== undefined && v !== '' })
    .map((k) => ({ key: k.key, envVar: k.envVar as string }))

  const bankSections = Object.entries((raw.banks ?? {}) as Record<string, Record<string, unknown>>)
    .map(([id, section]) => ({ id, keys: Object.keys(section) }))

  return {
    path,
    exists: existsSync(path),
    raw: Object.keys(raw).length ? maskDeep(raw) : null,
    items,
    envActive,
    error,
    bankSections,
    harnessSections: Object.keys(fileHarness),
  }
}

/** Env strings are coerced the way hindsight's readEnvConfig does (bool/list/number keys). */
function coerceEnv(key: string, raw: string): unknown {
  const BOOLS = new Set(['dynamicBankId', 'resolveWorktrees', 'optInOnly', 'disabled', 'retainSessions', 'autoReflect', 'autoSeed', 'codebaseSurvey'])
  const LISTS = new Set(['retainTags', 'optInPaths'])
  const NUMBERS = new Set(['apiPort', 'daemonIdleTimeout', 'maxParallelRetains', 'reflectTimeoutMs', 'reflectToolTimeoutMs', 'pageRefreshEveryTurns', 'seedLimit', 'surveyBudgetUsd', 'surveyRefreshCommits'])
  const v = raw.trim()
  if (BOOLS.has(key)) return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
  if (LISTS.has(key)) return v.split(',').map((s) => s.trim()).filter(Boolean)
  if (NUMBERS.has(key)) { const n = Number(v); return Number.isNaN(n) ? v : n }
  return v
}

// ---------------------------------------------------------------------------
// Resolved runtime view (daemon URL, paths)
// ---------------------------------------------------------------------------

export interface RuntimeView {
  serverMode: string
  apiUrl: string
  apiPort: number
  daemonProfile: string
  embedVersion?: string
  embedPackagePath?: string
}

/** The daemon-relevant slice of the effective config (daemon mode pins the URL to 127.0.0.1:port). */
export function runtimeView(report: ConfigReport): RuntimeView {
  const get = (key: string): unknown => report.items.find((i) => i.key === key)?.value
  const serverMode = typeof get('serverMode') === 'string' ? get('serverMode') as string : 'cloud'
  const apiPort = typeof get('apiPort') === 'number' ? get('apiPort') as number : 9077
  const apiUrl = serverMode === 'daemon'
    ? `http://127.0.0.1:${apiPort}`
    : typeof get('apiUrl') === 'string' ? get('apiUrl') as string : 'https://api.hindsight.vectorize.io'
  return {
    serverMode,
    apiUrl,
    apiPort,
    daemonProfile: typeof get('daemonProfile') === 'string' ? get('daemonProfile') as string : 'coding-agent',
    embedVersion: typeof get('embedVersion') === 'string' ? get('embedVersion') as string : undefined,
    embedPackagePath: typeof get('embedPackagePath') === 'string' ? get('embedPackagePath') as string : undefined,
  }
}

// ---------------------------------------------------------------------------
// Daemon status
// ---------------------------------------------------------------------------

export interface HealthSnapshot {
  running: boolean
  health?: Record<string, unknown>
  version?: { api_version: string; features?: Record<string, boolean> }
  checkedAt: string
  error?: string
}

/** Probe /health and /version with short timeouts; never throws. */
export async function checkHealth(baseUrl: string): Promise<HealthSnapshot> {
  const checkedAt = new Date().toISOString()
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return { running: false, checkedAt, error: `health -> HTTP ${res.status}` }
    const health = await res.json().catch(() => undefined) as Record<string, unknown> | undefined
    let version: HealthSnapshot['version']
    try {
      const vres = await fetch(`${baseUrl}/version`, { signal: AbortSignal.timeout(2000) })
      if (vres.ok) version = await vres.json() as HealthSnapshot['version']
    } catch { /* version is best-effort */ }
    return { running: true, health, version, checkedAt }
  } catch (e) {
    return { running: false, checkedAt, error: (e as Error).message }
  }
}

/** Paths the daemon ecosystem uses, for display and log tails. */
export function daemonPaths(view: RuntimeView): {
  daemonLog: string
  pluginLog: string
  database: string
} {
  return {
    daemonLog: join(homedir(), '.hindsight', 'profiles', `${view.daemonProfile}.log`),
    pluginLog: process.env.HINDSIGHT_LOG_FILE || join(tmpdir(), 'hindsight-coding-agent', 'plugin.log'),
    database: join(homedir(), '.pg0', 'instances', `hindsight-embed-${view.daemonProfile}`),
  }
}

// ---------------------------------------------------------------------------
// Daemon start / stop
// ---------------------------------------------------------------------------

/** Run a command, capture output, resolve on exit. */
function run(cmd: string, args: string[], timeoutMs: number, env: NodeJS.ProcessEnv = process.env): Promise<{ code: number | null; output: string }> {
  return new Promise((resolveRun) => {
    let output = ''
    let settled = false
    const child = spawn(cmd, args, { stdio: 'pipe', env, windowsHide: true })
    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveRun({ code, output: output.trim() })
    }
    const timer = setTimeout(() => { child.kill(); finish(-1) }, timeoutMs)
    child.stdout?.on('data', (d: Buffer) => { output += d.toString() })
    child.stderr?.on('data', (d: Buffer) => { output += d.toString() })
    child.on('exit', (code) => finish(code))
    child.on('error', (err) => { output += String(err); finish(-2) })
  })
}

/** Spawn detached and forget — the starter manages its own lifecycle. */
function runDetached(cmd: string, args: string[]): boolean {
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true })
    child.on('error', () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}

/**
 * Locate the installed hindsight plugin's daemon-start.js — the exact
 * starter the plugin itself uses (handles profile create --merge, LLM env
 * detection, health polling). Searched where profile dependencies live:
 * first walking up from this module (real installs sit inside a
 * node_modules), then every dsh profile under ~/.dsh/profiles (a link:
 * install resolves to the source repo, so the sibling walk misses and the
 * profile scan is the one that hits).
 */
export function findDaemonStarter(startDir: string = dirname(fileURLToPath(import.meta.url))): string | null {
  const rel = ['@vectorize-io', 'hindsight-coding-agents', 'dist', 'daemon-start.js']
  let dir = resolve(startDir)
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'node_modules', ...rel)
    if (existsSync(candidate)) return candidate
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  const profilesRoot = join(homedir(), '.dsh', 'profiles')
  let profileNames: string[] = []
  try {
    profileNames = readdirSync(profilesRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((n) => n !== 'node_modules')
  } catch { /* profiles root missing -> skip */ }
  const shared = join(profilesRoot, 'node_modules', ...rel)
  if (existsSync(shared)) return shared
  for (const name of profileNames) {
    const candidate = join(profilesRoot, name, 'node_modules', ...rel)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** uvx command hindsight would use for the configured embed source. */
export function embedCommand(view: RuntimeView): { cmd: string; base: string[] } {
  if (view.embedPackagePath) return { cmd: 'uv', base: ['run', '--directory', view.embedPackagePath, 'hindsight-embed'] }
  const version = view.embedVersion && view.embedVersion.length > 0 ? view.embedVersion : 'latest'
  return { cmd: 'uvx', base: [`hindsight-embed@${version}`] }
}

export interface DaemonActionResult {
  action: 'start' | 'stop'
  ok: boolean
  method: string
  output?: string
  detail?: string
}

/**
 * Kill whatever process listens on a port. The hindsight-embed CLI's own
 * stop does exactly this (find PID on port, terminate) but crashes on CJK
 * Windows: it reads netstat output as strict UTF-8, the localized bytes
 * throw in the reader thread, and its stdout arrives as None. Here the
 * netstat bytes are decoded leniently (port and pid columns are ASCII), so
 * the lookup survives any code page.
 */
export async function killPortProcess(port: number): Promise<{ killed: string; output: string }> {
  const collect = (child: import('node:child_process').ChildProcess): Promise<Buffer> =>
    new Promise((resolve) => {
      const chunks: Buffer[] = []
      child.stdout?.on('data', (d: Buffer) => { chunks.push(d) })
      child.stderr?.on('data', (d: Buffer) => { chunks.push(d) })
      child.on('error', () => resolve(Buffer.concat(chunks)))
      child.on('exit', () => resolve(Buffer.concat(chunks)))
    })

  if (process.platform === 'win32') {
    const netstat = spawn('netstat', ['-ano', '-p', 'tcp'], { stdio: 'pipe', windowsHide: true })
    const text = (await collect(netstat)).toString('latin1')
    const pids = new Set<string>()
    const portRe = new RegExp('[:.]' + port + String.raw`\s+\S+\s+LISTENING\s+(\d+)`, 'g')
    for (const m of text.matchAll(portRe)) pids.add(m[1])
    const output: string[] = []
    for (const pid of pids) {
      const kill = spawn('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'pipe', windowsHide: true })
      const res = (await collect(kill)).toString('latin1')
      output.push('taskkill /PID ' + pid + ': ' + (res.trim().split(/\r?\n/)[0] ?? ''))
    }
    return { killed: [...pids].join(','), output: output.join(' | ') }
  }
  const lsof = spawn('lsof', ['-ti', 'tcp:' + port], { stdio: 'pipe' })
  const text = (await collect(lsof)).toString('utf8')
  const pids = text.split(/\s+/).filter((p) => /^\d+$/.test(p))
  const output: string[] = []
  for (const pid of pids) {
    const kill = spawn('kill', [pid], { stdio: 'pipe' })
    await collect(kill)
    output.push('kill ' + pid)
  }
  return { killed: pids.join(','), output: output.join(' | ') }
}

/**
 * Stop the daemon. Windows: the port-kill path first (the hindsight-embed
 * CLI is broken on CJK Windows — see killPortProcess); the CLI stop remains
 * the preferred path elsewhere and the fallback here.
 */
export async function stopDaemon(view: RuntimeView): Promise<DaemonActionResult> {
  const steps: string[] = []
  let output = ''
  let after = await checkHealth(view.apiUrl)

  if (process.platform === 'win32' && after.running) {
    const kill = await killPortProcess(view.apiPort)
    steps.push('port-kill :' + view.apiPort + ' (pid ' + (kill.killed || 'none') + ')')
    output += kill.output
    // Give the socket a moment to release, then re-probe.
    for (let i = 0; i < 10; i++) {
      await new Promise((r2) => setTimeout(r2, 500))
      after = await checkHealth(view.apiUrl)
      if (!after.running) break
    }
  }

  if (after.running) {
    const { cmd, base } = embedCommand(view)
    const args = [...base, 'daemon', '--profile', view.daemonProfile, 'stop']
    const res = await run(cmd, args, 20_000)
    steps.push(cmd + ' ' + args.join(' ') + ' -> exit ' + String(res.code))
    output += (output === '' ? '' : ' | ') + res.output.slice(-2000)
    after = await checkHealth(view.apiUrl)
  }

  return {
    action: 'stop',
    ok: !after.running,
    method: steps.join(' -> ') || 'nothing to do (already stopped)',
    output: output.slice(-2000),
    detail: after.running ? 'daemon still responding after both stop paths' : undefined,
  }
}

/**
 * Start the daemon. Prefers the installed plugin's daemon-start.js (correct
 * env handling); falls back to the raw CLI when the package is not found.
 * Fire-and-forget: readiness arrives via /health polling, not this call.
 */
export function startDaemon(view: RuntimeView, harness: string, starter: string | null): DaemonActionResult {
  if (starter) {
    const ok = runDetached('node', [starter, '--harness', harness])
    return { action: 'start', ok, method: `node ${starter} --harness ${harness}`, detail: ok ? 'starter spawned; daemon becomes healthy asynchronously' : 'spawn failed' }
  }
  const { cmd, base } = embedCommand(view)
  const args = [...base, 'daemon', '--profile', view.daemonProfile, 'start']
  const ok = runDetached(cmd, args)
  return { action: 'start', ok, method: `${cmd} ${args.join(' ')}`, detail: ok ? 'cli spawned; daemon becomes healthy asynchronously' : 'spawn failed' }
}

/** Whether uv/uvx is on PATH (daemon mode prerequisite). */
export async function hasUv(cmd = 'uvx'): Promise<boolean> {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const { code } = await run(probe, [cmd], 5000)
  return code === 0
}

// ---------------------------------------------------------------------------
// Bank API
// ---------------------------------------------------------------------------

export interface BankRow {
  bank_id: string
  name?: string
  fact_count?: number
  created_at?: string
  updated_at?: string
  last_document_at?: string
  last_write_at?: string
}

/** GET /v1/default/banks — never throws (returns error field). */
export async function listBanks(baseUrl: string): Promise<{ banks?: BankRow[]; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/v1/default/banks`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const j = await res.json() as { banks?: BankRow[] }
    return { banks: j.banks ?? [] }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export interface PageNode {
  id: string
  kind?: string
  name?: string
  description?: string
  children?: PageNode[]
}

/** GET the knowledge-base tree roots of one bank (pages + folders). */
export async function bankPages(baseUrl: string, bankId: string): Promise<{ pages?: PageNode[]; error?: string }> {
  try {
    const url = `${baseUrl}/v1/default/banks/${encodeURIComponent(bankId)}/knowledge-base/tree`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const j = await res.json() as { roots?: PageNode[] }
    return { pages: j.roots ?? [] }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// Log tail
// ---------------------------------------------------------------------------

/** Last `maxLines` lines of a text file, or an error message; never throws. */
export function tailFile(path: string, maxLines = 200): { path: string; exists: boolean; lines: string[]; error?: string } {
  try {
    const text = readFileSync(path, 'utf8')
    const lines = text.split(/\r?\n/).filter((l) => l !== '')
    return { path, exists: true, lines: lines.slice(-maxLines) }
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return { path, exists: false, lines: [], error: 'file not found' }
    return { path, exists: true, lines: [], error: err.message }
  }
}
