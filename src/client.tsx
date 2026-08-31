/**
 * dsh-hindsight-manager browser half: a dsh-better-sidebar side-card tab.
 * Registers one sidebar tab (id hindsight-manager:main) through
 * ctx.betterSidebar.registerTab; the tab talks to this plugin's node half
 * over same-origin JSON (/dsh-hindsight-manager/api/*): daemon status
 * polling, layered config view, per-bank memory overview with knowledge
 * pages, log tails, and daemon start/stop actions. The tab badge mirrors
 * daemon health from a module-level cache fed by a lifecycle-scoped
 * background poller.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: dsh-better-sidebar service faces (ctx.betterSidebar). Never
// value-import this package — the client build purity gate rejects it.
import type { TabComponentProps } from 'dsh-better-sidebar'

/** Same-origin API prefix served by this plugin's node half. */
const API = '/dsh-hindsight-manager/api'

// ---------------------------------------------------------------------------
// Node API contract (mirror of src/hindsight.ts shapes)
// ---------------------------------------------------------------------------

interface HealthSnapshot {
  running: boolean
  health?: Record<string, unknown>
  version?: { api_version: string; features?: Record<string, boolean> }
  checkedAt: string
  error?: string
}

interface StatusPayload {
  runtime: { serverMode: string; apiUrl: string; apiPort: number; daemonProfile: string; embedVersion?: string; embedPackagePath?: string }
  health: HealthSnapshot
  uv: boolean
  starter: string | null
  paths: { daemonLog: string; pluginLog: string; database: string }
  time: string
}

interface ConfigItem { key: string; group: string; value: unknown; source: string; envVar?: string }
interface ConfigPayload {
  path: string
  exists: boolean
  raw: unknown
  items: ConfigItem[]
  envActive: { key: string; envVar: string }[]
  error?: string
  bankSections: { id: string; keys: string[] }[]
  harnessSections: string[]
}

interface BankRow { bank_id: string; fact_count?: number; created_at?: string; updated_at?: string; last_document_at?: string; last_write_at?: string }
interface PageNode { id: string; kind?: string; name?: string; description?: string; children?: PageNode[] }

interface ActionResult { action: string; ok: boolean; method: string; output?: string; detail?: string }
interface LogTail { path: string; exists: boolean; lines: string[]; error?: string }
interface LogsPayload { plugin: LogTail; daemon: LogTail }

// ---------------------------------------------------------------------------
// Locale
// ---------------------------------------------------------------------------

const zh = {
  'panel.title': 'Hindsight 记忆管理',
  'tab.status': '状态',
  'tab.config': '配置',
  'tab.banks': '记忆库',
  'tab.logs': '日志',
  'daemon.running': '运行中',
  'daemon.stopped': '已停止',
  'daemon.starting': '启动中…',
  'daemon.stopping': '停止中…',
  'daemon.start': '启动 daemon',
  'daemon.stop': '停止 daemon',
  'daemon.refresh': '刷新',
  'daemon.url': '地址',
  'daemon.profile': 'Profile',
  'daemon.port': '端口',
  'daemon.version': 'API 版本',
  'daemon.mode': '服务模式',
  'daemon.unreachable': '无法连接',
  'daemon.noUv': '未检测到 uvx（daemon 模式需要 uv）',
  'daemon.noStarter': '未找到 hindsight 插件的 daemon-start.js，启动将回退到 uvx 直连',
  'runtime.paths': '路径',
  'runtime.starter': '启动器',
  'runtime.db': '数据库',
  'config.file': '配置文件',
  'config.missing': '文件不存在（全部使用默认值）',
  'config.env': '生效的环境变量覆盖',
  'config.banks': '每记忆库覆盖（banks.*）',
  'config.harnesses': '每 harness 覆盖（harnesses.*）',
  'config.raw': '原始 JSON（令牌已脱敏）',
  'config.empty': '（空）',
  'config.error': '配置解析失败',
  'src.default': '默认',
  'src.env': '环境变量',
  'src.file': '文件',
  'src.file:harness': '文件·harness',
  'banks.error': '读取失败（daemon 未运行？）',
  'banks.empty': '没有记忆库',
  'banks.facts': '事实数',
  'banks.lastWrite': '最后写入',
  'banks.pages': '知识页',
  'banks.pages.none': '无知识页',
  'banks.pages.load': '展开查看知识页',
  'logs.plugin': '插件日志（plugin.log）',
  'logs.daemon': 'daemon 日志（profiles/<profile>.log）',
  'logs.missing': '文件不存在',
  'logs.refresh': '刷新日志',
  'common.retry': '重试',
  'common.loading': '加载中…',
  'common.never': '从未',
} as const

const en: Record<keyof typeof zh, string> = {
  'panel.title': 'Hindsight memory manager',
  'tab.status': 'Status',
  'tab.config': 'Config',
  'tab.banks': 'Banks',
  'tab.logs': 'Logs',
  'daemon.running': 'Running',
  'daemon.stopped': 'Stopped',
  'daemon.starting': 'Starting…',
  'daemon.stopping': 'Stopping…',
  'daemon.start': 'Start daemon',
  'daemon.stop': 'Stop daemon',
  'daemon.refresh': 'Refresh',
  'daemon.url': 'URL',
  'daemon.profile': 'Profile',
  'daemon.port': 'Port',
  'daemon.version': 'API version',
  'daemon.mode': 'Server mode',
  'daemon.unreachable': 'Unreachable',
  'daemon.noUv': 'uvx not found (daemon mode requires uv)',
  'daemon.noStarter': 'hindsight daemon-start.js not found; start falls back to raw uvx',
  'runtime.paths': 'Paths',
  'runtime.starter': 'Starter',
  'runtime.db': 'Database',
  'config.file': 'Config file',
  'config.missing': 'File missing (all defaults)',
  'config.env': 'Active env overrides',
  'config.banks': 'Per-bank overrides (banks.*)',
  'config.harnesses': 'Per-harness overrides (harnesses.*)',
  'config.raw': 'Raw JSON (tokens masked)',
  'config.empty': '(empty)',
  'config.error': 'Config parse failed',
  'src.default': 'default',
  'src.env': 'env',
  'src.file': 'file',
  'src.file:harness': 'file·harness',
  'banks.error': 'Failed to read (daemon down?)',
  'banks.empty': 'No memory banks',
  'banks.facts': 'Facts',
  'banks.lastWrite': 'Last write',
  'banks.pages': 'Knowledge pages',
  'banks.pages.none': 'No pages',
  'banks.pages.load': 'Expand for knowledge pages',
  'logs.plugin': 'Plugin log (plugin.log)',
  'logs.daemon': 'Daemon log (profiles/<profile>.log)',
  'logs.missing': 'File not found',
  'logs.refresh': 'Refresh logs',
  'common.retry': 'Retry',
  'common.loading': 'Loading…',
  'common.never': 'never',
}

type Key = keyof typeof zh

/** Resolve UI language without the host locale service (node/test safe). */
function isZh(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.lang === 'zh') return true
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en'
  return nav.toLowerCase().startsWith('zh')
}

/** Translate a key with the self-resolved dictionary. */
function tr(key: Key): string {
  return (isZh() ? zh : en)[key]
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function api<T>(sub: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + sub, { ...init, headers: { 'content-type': 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${sub}`)
  return await res.json() as T
}

function fmtTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtValue(v: unknown): string {
  if (v === undefined) return '—'
  if (v === null) return 'null'
  if (typeof v === 'string') return v === '' ? '""' : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { return JSON.stringify(v) } catch { return String(v) }
}

const GROUP_LABELS_ZH: Record<string, string> = {
  server: '服务器', daemon: 'Daemon', bank: '记忆库解析', memory: '记忆行为', survey: '代码库调研', logging: '日志',
}
const GROUP_LABELS_EN: Record<string, string> = {
  server: 'Server', daemon: 'Daemon', bank: 'Bank resolution', memory: 'Memory behavior', survey: 'Codebase survey', logging: 'Logging',
}

// ---------------------------------------------------------------------------
// Styles (injected once)
// ---------------------------------------------------------------------------

const CSS = [
  '.dshm-tabs{display:flex;gap:2px;padding:6px 8px 0;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none}',
  '.dshm-tab{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:6px 10px;border-radius:8px 8px 0 0;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}',
  '.dshm-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dshm-tab[data-active=true]{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary)}',
  '.dshm-body{flex:1;overflow-y:auto;padding:10px 12px 20px;font-size:12px;color:var(--dsw-alias-label-primary)}',
  '.dshm-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px;margin-bottom:10px;background:var(--dsw-alias-bg-layer-3)}',
  '.dshm-cardTitle{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);margin-bottom:8px;display:flex;align-items:center;gap:8px}',
  '.dshm-row{display:flex;gap:8px;padding:3px 0;align-items:baseline}',
  '.dsvm-row{display:flex;gap:8px;padding:3px 0;align-items:baseline}',
  '.dshm-k{flex:none;width:110px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dshm-v{flex:1;min-width:0;word-break:break-all;color:var(--dsw-alias-label-primary)}',
  '.dshm-badge{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 8px;border-radius:10px;font-size:11px;font-weight:600}',
  '.dshm-badge[data-s=running]{background:rgba(46,160,67,.16);color:#3fb950}',
  '.dshm-badge[data-s=stopped]{background:rgba(248,81,73,.14);color:#f85149}',
  '.dshm-badge[data-s=busy]{background:rgba(210,153,34,.16);color:#d29924}',
  '.dshm-badge[data-s=muted]{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-tertiary)}',
  '.dshm-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}',
  '.dshm-btn{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:13px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}',
  '.dshm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.dshm-btn:disabled{opacity:.45;cursor:default}',
  '.dshm-btn[data-primary=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
  '.dshm-secTitle{font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary);text-transform:uppercase;letter-spacing:.04em;margin:12px 0 4px}',
  '.dshm-kv{display:grid;grid-template-columns:190px 1fr;gap:2px 10px}',
  '.dshm-kv .dshm-k{width:auto}',
  '.dshm-src{display:inline-block;min-width:44px;text-align:center;font-size:10px;line-height:16px;padding:0 5px;border-radius:4px;background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-tertiary);flex:none}',
  '.dshm-src[data-s=env]{background:rgba(63,185,80,.15);color:#3fb950}',
  '.dshm-src[data-s=file]{background:rgba(88,166,255,.15);color:#58a6ff}',
  '.dshm-src[data-s=file\:harness]{background:rgba(210,153,34,.18);color:#d29924}',
  '.dshm-table{width:100%;border-collapse:collapse;font-size:12px}',
  '.dshm-table th{text-align:left;color:var(--dsw-alias-label-tertiary);font-weight:500;padding:4px 6px;border-bottom:1px solid var(--dsw-alias-border-l2)}',
  '.dshm-table td{padding:4px 6px;border-bottom:1px solid var(--dsw-alias-border-l2);vertical-align:top}',
  '.dshm-bankRow{cursor:pointer}',
  '.dshm-bankRow:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dshm-pages{padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}',
  '.dshm-page{display:flex;gap:6px;padding:2px 0;align-items:baseline}',
  '.dshm-pageName{color:var(--dsw-alias-brand-primary);flex:none}',
  '.dshm-pageDesc{color:var(--dsw-alias-label-tertiary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dshm-log{font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:280px;overflow-y:auto;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px;color:var(--dsw-alias-label-secondary)}',
  '.dshm-muted{color:var(--dsw-alias-label-tertiary)}',
  '.dshm-path{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}',
  '.dshm-err{color:#f85149}',
  '.dshm-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}',
  '.dshm-warn{border:1px solid rgba(210,153,34,.4);background:rgba(210,153,34,.08);color:#d29924;border-radius:8px;padding:6px 10px;font-size:11px;margin-top:8px}',
  '.dshm-pre{font-family:ui-monospace,Consolas,monospace;font-size:11px;white-space:pre-wrap;word-break:break-all;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px;max-height:260px;overflow-y:auto;color:var(--dsw-alias-label-secondary)}',
].join('')
if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="dsh-hindsight-manager"]') === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-hindsight-manager'
  tag.dataset.pluginCss = 'dsh-hindsight-manager'
  tag.textContent = CSS
  document.head.appendChild(tag)
}

/** Brain icon for the tab. */
const BrainIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 16} height={props.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M9.5 3a3 3 0 0 0-3 3 3 3 0 0 0-2.4 4.8A3 3 0 0 0 5 16.5 3 3 0 0 0 9.5 21c1 0 2-.6 2.5-1.5V4.5C11.5 3.7 10.6 3 9.5 3z" />
    <path d="M14.5 3a3 3 0 0 1 3 3 3 3 0 0 1 2.4 4.8A3 3 0 0 1 19 16.5 3 3 0 0 1 14.5 21c-1 0-2-.6-2.5-1.5" />
  </svg>
)

// ---------------------------------------------------------------------------
// Panel sections
// ---------------------------------------------------------------------------

/** Daemon card: status badge, key facts, start/stop actions. */
function DaemonCard(props: { t: (key: Key) => string; status: StatusPayload | null; busy: 'start' | 'stop' | null; onStart(): void; onStop(): void; onRefresh(): void }) {
  const { t, status, busy } = props
  const running = status?.health.running ?? false
  const state = busy !== null ? busy : running ? 'running' : 'stopped'
  const label = busy === 'start' ? t('daemon.starting') : busy === 'stop' ? t('daemon.stopping') : running ? t('daemon.running') : t('daemon.stopped')
  return (
    <div className="dshm-card">
      <div className="dshm-cardTitle">
        <span className="dshm-badge" data-s={state === 'running' || state === 'start' ? 'busy' : state === 'stop' ? 'busy' : state}>
          <span className="dshm-dot" />{label}
        </span>
        {status?.health.version && <span className="dshm-muted">{status.health.version.api_version}</span>}
      </div>
      <div className="dshm-kv">
        {status && <>
          <span className="dshm-k dshm-muted">{t('daemon.mode')}</span><span className="dshm-v">{status.runtime.serverMode}</span>
          <span className="dshm-k dshm-muted">{t('daemon.url')}</span><span className="dshm-v dshm-path">{status.runtime.apiUrl}</span>
          <span className="dshm-k dshm-muted">{t('daemon.profile')}</span><span className="dshm-v">{status.runtime.daemonProfile}</span>
          <span className="dshm-k dshm-muted">{t('daemon.port')}</span><span className="dshm-v">{status.runtime.apiPort}</span>
        </>}
        {!status && <span className="dshm-v dshm-muted">{t('common.loading')}</span>}
      </div>
      {status && !status.uv && status.runtime.serverMode === 'daemon' && <div className="dshm-warn">{t('daemon.noUv')}</div>}
      <div className="dshm-actions">
        <button type="button" className="dshm-btn" data-primary="true" disabled={busy !== null || running} onClick={props.onStart}>{t('daemon.start')}</button>
        <button type="button" className="dshm-btn" disabled={busy !== null || !running} onClick={props.onStop}>{t('daemon.stop')}</button>
        <button type="button" className="dshm-btn" disabled={busy !== null} onClick={props.onRefresh}>{t('daemon.refresh')}</button>
      </div>
    </div>
  )
}

/** Paths + starter info card. */
function RuntimeCard(props: { t: (key: Key) => string; status: StatusPayload | null }) {
  const { t, status } = props
  if (!status) return null
  return (
    <div className="dshm-card">
      <div className="dshm-cardTitle">{t('runtime.paths')}</div>
      <div className="dshm-kv">
        <span className="dshm-k dshm-muted">{t('runtime.db')}</span><span className="dshm-v dshm-path">{status.paths.database}</span>
        <span className="dshm-k dshm-muted">{t('runtime.starter')}</span>
        <span className="dshm-v dshm-path">{status.starter ?? <span className="dshm-muted">{t('daemon.noStarter')}</span>}</span>
        <span className="dshm-k dshm-muted">plugin.log</span><span className="dshm-v dshm-path">{status.paths.pluginLog}</span>
        <span className="dshm-k dshm-muted">daemon.log</span><span className="dshm-v dshm-path">{status.paths.daemonLog}</span>
      </div>
    </div>
  )
}

const CONFIG_GROUP_ORDER = ['server', 'daemon', 'bank', 'memory', 'survey', 'logging'] as const

/** Config tab body: grouped effective values + file/env/harness summaries. */
function ConfigView(props: { t: (key: Key) => string; cfg: ConfigPayload | null; err: string | null }) {
  const { t, cfg } = props
  if (props.err !== null) return <div className="dshm-err">{props.err}</div>
  if (cfg === null) return <div className="dshm-muted">{t('common.loading')}</div>
  const groups = CONFIG_GROUP_ORDER
    .map((g) => ({ g, items: cfg.items.filter((i) => i.group === g) }))
    .filter((x) => x.items.length > 0)
  const zhUi = isZh()
  return (
    <div>
      <div className="dshm-card">
        <div className="dshm-cardTitle">{t('config.file')}</div>
        <div className="dshm-path">{cfg.path}</div>
        {cfg.error && <div className="dshm-err" style={{ marginTop: 4 }}>{t('config.error')}: {cfg.error}</div>}
        {!cfg.exists && !cfg.error && <div className="dshm-muted" style={{ marginTop: 4 }}>{t('config.missing')}</div>}
        {cfg.envActive.length > 0 && <>
          <div className="dshm-secTitle">{t('config.env')}</div>
          {cfg.envActive.map((e) => (
            <div className="dshm-row" key={e.key}>
              <span className="dshm-src" data-s="env">{t('src.env')}</span>
              <span className="dshm-v"><b>{e.key}</b> ← {e.envVar}</span>
            </div>
          ))}
        </>}
        {cfg.harnessSections.length > 0 && <>
          <div className="dshm-secTitle">{t('config.harnesses')}</div>
          <div className="dshm-v">{cfg.harnessSections.join(', ')}</div>
        </>}
        {cfg.bankSections.length > 0 && <>
          <div className="dshm-secTitle">{t('config.banks')}</div>
          {cfg.bankSections.map((b) => (
            <div className="dshm-row" key={b.id}>
              <span className="dshm-v"><b>{b.id}</b> <span className="dshm-muted">{b.keys.join(', ')}</span></span>
            </div>
          ))}
        </>}
        <details style={{ marginTop: 8 }}>
          <summary className="dshm-muted" style={{ cursor: 'pointer' }}>{t('config.raw')}</summary>
          <pre className="dshm-pre" style={{ marginTop: 6 }}>{cfg.raw === null ? t('config.empty') : JSON.stringify(cfg.raw, null, 2)}</pre>
        </details>
      </div>
      {groups.map(({ g, items }) => (
        <div className="dshm-card" key={g}>
          <div className="dshm-cardTitle">{(zhUi ? GROUP_LABELS_ZH : GROUP_LABELS_EN)[g] ?? g}</div>
          {items.map((i) => (
            <div className="dshm-row" key={i.key}>
              <span className="dshm-k" title={i.key}>{i.key}</span>
              <span className="dshm-src" data-s={i.source} title={i.envVar ?? ''}>{t(('src.' + i.source) as Key)}</span>
              <span className="dshm-v">{fmtValue(i.value)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Banks tab body: table sorted by last write, expandable page list. */
function BanksView(props: { t: (key: Key) => string; banks: BankRow[] | null; err: string | null }) {
  const { t } = props
  const [expanded, setExpanded] = useState<Record<string, PageNode[] | 'loading' | 'error' | null | undefined>>({})
  if (props.err !== null) return <div className="dshm-err">{t('banks.error')}: {props.err}</div>
  if (props.banks === null) return <div className="dshm-muted">{t('common.loading')}</div>
  if (props.banks.length === 0) return <div className="dshm-muted">{t('banks.empty')}</div>
  const rows = [...props.banks].sort((a, b) => (b.last_write_at ?? b.updated_at ?? '').localeCompare(a.last_write_at ?? a.updated_at ?? ''))
  const toggle = async (id: string): Promise<void> => {
    if (expanded[id] !== undefined) { setExpanded((m) => ({ ...m, [id]: undefined })); return }
    setExpanded((m) => ({ ...m, [id]: 'loading' }))
    try {
      const r = await api<{ pages?: PageNode[]; error?: string }>(`/banks/${encodeURIComponent(id)}/pages`)
      setExpanded((m) => ({ ...m, [id]: r.error ? 'error' : (r.pages ?? []) }))
    } catch {
      setExpanded((m) => ({ ...m, [id]: 'error' }))
    }
  }
  const renderNodes = (nodes: PageNode[], depth: number): JSX.Element[] =>
    nodes.flatMap((n) => [
      <div className="dshm-page" key={n.id} style={{ paddingLeft: depth * 12 }}>
        <span className="dshm-pageName">{n.kind === 'folder' ? '📁' : '📄'} {n.name ?? n.id}</span>
        {n.description && <span className="dshm-pageDesc" title={n.description}>{n.description}</span>}
      </div>,
      ...(n.children ? renderNodes(n.children, depth + 1) : []),
    ])
  return (
    <div className="dshm-card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="dshm-table">
        <thead><tr><th>Bank</th><th>{t('banks.facts')}</th><th>{t('banks.lastWrite')}</th></tr></thead>
        <tbody>
          {rows.map((b) => [
            <tr className="dshm-bankRow" key={b.bank_id} onClick={() => { void toggle(b.bank_id) }}>
              <td>{expanded[b.bank_id] !== undefined ? '▾' : '▸'} {b.bank_id}</td>
              <td>{b.fact_count ?? '—'}</td>
              <td>{fmtTime(b.last_write_at ?? b.updated_at) || t('common.never')}</td>
            </tr>,
            expanded[b.bank_id] !== undefined && (
              <tr key={b.bank_id + ':pages'}>
                <td colSpan={3} style={{ padding: 0 }}>
                  <div className="dshm-pages">
                    {expanded[b.bank_id] === 'loading' && <span className="dshm-muted">{t('common.loading')}</span>}
                    {expanded[b.bank_id] === 'error' && <span className="dshm-err">{t('banks.error')}</span>}
                    {Array.isArray(expanded[b.bank_id]) && ((expanded[b.bank_id] as PageNode[]).length === 0
                      ? <span className="dshm-muted">{t('banks.pages.none')}</span>
                      : renderNodes(expanded[b.bank_id] as PageNode[], 0))}
                  </div>
                </td>
              </tr>
            ),
          ])}
        </tbody>
      </table>
    </div>
  )
}

/** Logs tab body: two tail blocks. */
function LogsView(props: { t: (key: Key) => string; logs: LogsPayload | null; err: string | null; onRefresh(): void }) {
  const { t } = props
  const block = (title: string, tail: LogTail | undefined): JSX.Element => (
    <div className="dshm-card" key={title}>
      <div className="dshm-cardTitle">
        {title}
        <span style={{ flex: 1 }} />
        <span className="dshm-muted" style={{ fontWeight: 400 }}>{tail?.path}</span>
      </div>
      {tail === undefined
        ? <div className="dshm-muted">{t('common.loading')}</div>
        : tail.error === 'file not found' || !tail.exists
          ? <div className="dshm-muted">{t('logs.missing')}</div>
          : <pre className="dshm-log">{tail.lines.join('\n')}</pre>}
    </div>
  )
  return (
    <div>
      {props.err !== null && <div className="dshm-err">{props.err}</div>}
      {props.logs !== null && <>
        {block(t('logs.plugin'), props.logs.plugin)}
        {block(t('logs.daemon'), props.logs.daemon)}
      </>}
      <div className="dshm-actions"><button type="button" className="dshm-btn" onClick={props.onRefresh}>{t('logs.refresh')}</button></div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Store: active sub-page (persists across remounts; the tab's open/close
// state itself is owned by better-sidebar, not by this store)
// ---------------------------------------------------------------------------

type Tab = 'status' | 'config' | 'banks' | 'logs'

interface PanelState {
  tab: Tab
}

const store = defineStore({
  persist: 'dsh-hindsight-manager',
  init: (): PanelState => ({ tab: 'status' }),
  actions: {
    setTab(d, tab: Tab) { d.tab = tab },
  },
})

/** Module-level instance (root scope: persist key stays 'dsh-hindsight-manager').
 * The slot engine used to instantiate store handles for slot-registered
 * components; a better-sidebar tab component must create its own instance. */
const panelStore = store.create()

// ---------------------------------------------------------------------------
// Badge status cache: fed by a lifecycle-scoped background poller so the
// synchronous badge() never goes stale while the tab is open but hidden.
// Reference-counted: multi-session instances share one timer.
// ---------------------------------------------------------------------------

const BADGE_POLL_MS = 10_000

const statusCache = { running: null as boolean | null }
let badgeRefs = 0
let badgeTimer: ReturnType<typeof setInterval> | null = null

async function pollStatusCache(): Promise<void> {
  try {
    const payload = await api<StatusPayload>('/status')
    statusCache.running = payload.health.running
  } catch { /* unreachable: keep last known state */ }
}

function badgeOpen(): void {
  badgeRefs += 1
  if (badgeRefs === 1) {
    void pollStatusCache()
    badgeTimer = setInterval(() => { void pollStatusCache() }, BADGE_POLL_MS)
  }
}

function badgeClose(): void {
  badgeRefs = Math.max(0, badgeRefs - 1)
  if (badgeRefs === 0) badgeStop()
}

function badgeStop(): void {
  badgeRefs = 0
  if (badgeTimer !== null) { clearInterval(badgeTimer); badgeTimer = null }
}

// ---------------------------------------------------------------------------
// Tab component
// ---------------------------------------------------------------------------

/** The side-card tab body: sub-page tabs + visible-gated polling + actions. */
function ManagerTab(props: TabComponentProps) {
  const s = useSyncExternalStore(panelStore.subscribe, panelStore.getSnapshot)
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [statusErr, setStatusErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<'start' | 'stop' | null>(null)
  const [cfg, setCfg] = useState<ConfigPayload | null>(null)
  const [cfgErr, setCfgErr] = useState<string | null>(null)
  const [banks, setBanks] = useState<BankRow[] | null>(null)
  const [banksErr, setBanksErr] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogsPayload | null>(null)
  const [logsErr, setLogsErr] = useState<string | null>(null)
  const startDeadline = useRef(0)

  const refreshStatus = useCallback(async (): Promise<StatusPayload | null> => {
    try {
      const payload = await api<StatusPayload>('/status')
      setStatus(payload)
      setStatusErr(null)
      statusCache.running = payload.health.running
      return payload
    } catch (e) {
      setStatusErr((e as Error).message)
      return null
    }
  }, [])

  const refreshTab = useCallback(async (tab: Tab): Promise<void> => {
    if (tab === 'config') {
      try { setCfg(await api<ConfigPayload>('/config')); setCfgErr(null) } catch (e) { setCfgErr((e as Error).message) }
    } else if (tab === 'banks') {
      try { const r = await api<{ banks?: BankRow[]; error?: string }>('/banks'); setBanks(r.banks ?? []); setBanksErr(r.error ?? null) } catch (e) { setBanksErr((e as Error).message) }
    } else if (tab === 'logs') {
      try { setLogs(await api<LogsPayload>('/logs')); setLogsErr(null) } catch (e) { setLogsErr((e as Error).message) }
    }
  }, [])

  // While visible: poll status every 5s; refresh the active sub-page on switch.
  useEffect(() => {
    if (!props.visible) return
    void refreshStatus()
    void refreshTab(s.tab)
    const timer = setInterval(() => {
      if (Date.now() > startDeadline.current) void refreshStatus()
    }, 5000)
    return () => { clearInterval(timer) }
  }, [props.visible, s.tab, refreshStatus, refreshTab])

  // After a start action: poll every 2s until healthy or 120s cap.
  useEffect(() => {
    if (busy !== 'start') return
    startDeadline.current = Date.now() + 120_000
    const timer = setInterval(async () => {
      const payload = await refreshStatus()
      if (payload?.health.running) { setBusy(null); startDeadline.current = 0 }
      else if (Date.now() > startDeadline.current) setBusy(null)
    }, 2000)
    return () => { clearInterval(timer); startDeadline.current = 0 }
  }, [busy, refreshStatus])

  const onStart = async (): Promise<void> => {
    setBusy('start')
    try { await api<ActionResult>('/daemon/start', { method: 'POST' }) } catch { /* status poll reports */ }
  }

  const onStop = async (): Promise<void> => {
    setBusy('stop')
    try { await api<ActionResult>('/daemon/stop', { method: 'POST' }) } catch { /* refresh reports */ }
    await refreshStatus()
    setBusy(null)
    if (s.tab === 'banks') void refreshTab('banks')
  }

  const tabs: { id: Tab; label: Key }[] = [
    { id: 'status', label: 'tab.status' },
    { id: 'config', label: 'tab.config' },
    { id: 'banks', label: 'tab.banks' },
    { id: 'logs', label: 'tab.logs' },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="dshm-tabs">
        {tabs.map((tab) => (
          <button
            type="button" key={tab.id} className="dshm-tab" data-active={s.tab === tab.id || undefined}
            onClick={() => { panelStore.actions.setTab(tab.id) }}
          >{tr(tab.label)}</button>
        ))}
      </div>
      <div className="dshm-body">
        {statusErr !== null && <div className="dshm-err" style={{ marginBottom: 8 }}>{statusErr} <button type="button" className="dshm-btn" style={{ height: 20 }} onClick={() => { void refreshStatus() }}>{tr('common.retry')}</button></div>}
        {s.tab === 'status' && <>
          <DaemonCard t={tr} status={status} busy={busy} onStart={() => { void onStart() }} onStop={() => { void onStop() }} onRefresh={() => { void refreshStatus() }} />
          <RuntimeCard t={tr} status={status} />
        </>}
        {s.tab === 'config' && <ConfigView t={tr} cfg={cfg} err={cfgErr} />}
        {s.tab === 'banks' && <BanksView t={tr} banks={banks} err={banksErr} />}
        {s.tab === 'logs' && <LogsView t={tr} logs={logs} err={logsErr} onRefresh={() => { void refreshTab('logs') }} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

/** Services required before apply runs (absent betterSidebar -> no client UI). */
export const inject = ['betterSidebar']

/** Register the side-card tab.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const svc = ctx.betterSidebar
  const gated = svc.features.includes('badge') && svc.features.includes('tabLifecycle')
  ctx.effect(() => {
    const dispose = svc.registerTab({
      id: 'hindsight-manager:main',
      title: () => tr('panel.title'),
      icon: (size: number) => <BrainIcon size={size} />,
      order: 50,
      single: true,
      ...(gated ? {
        badge: () => (statusCache.running === null ? undefined : statusCache.running ? '●' : '○'),
        onOpen: () => { badgeOpen() },
        onClose: () => { badgeClose() },
      } : {}),
      component: ManagerTab,
    })
    return () => {
      dispose()
      // The registry disposer does NOT fire onClose for open tabs — stop the
      // shared badge poller unconditionally so HMR/unload cannot leak it.
      badgeStop()
    }
  }, 'dsh-hindsight-manager: side card tab')
}
