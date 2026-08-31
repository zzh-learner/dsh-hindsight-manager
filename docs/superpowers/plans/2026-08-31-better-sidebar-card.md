# better-sidebar 侧边卡片改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 dsh-hindsight-manager 的 client 半从 slot 挂载（footer 按钮 + 停靠面板）迁移为单个 dsh-better-sidebar 侧边卡片 tab，带 daemon 状态 badge。

**Architecture:** 原地改造 src/client.tsx：删除 slot 挂载层，改为 ctx.effect 内的 ctx.betterSidebar.registerTab；组件按 TabComponentProps.visible 门控轮询；badge 读模块级 statusCache，由 onOpen/onClose 引用计数管理的 10s 后台轮询喂新鲜度。host 半与纯逻辑层零改动。

**Tech Stack:** TypeScript + React 18（宿主提供）、esbuild 双端构建、node --test、dsh-better-sidebar v0.12+ API（本机 0.17.1）。

**Spec:** docs/superpowers/specs/2026-08-31-better-sidebar-card-design.md（本计划从 spec 出发；执行者需同时读 spec）

## Global Constraints

- 零改动文件：src/index.ts、src/hindsight.ts、scripts/build.mjs、cordis.patch.yml、test/hindsight.test.mjs、test/api.test.mjs、test/daemon.test.mjs。
- client bundle 禁止 value-import dsh-better-sidebar：只允许 import type；测试断言 dist/client.js 不含该字符串。
- 注册必须包在 ctx.effect(...) 里（HMR 安全）。
- tab id 必须是 hindsight-manager:main；single: true；order: 50。
- 颜色只用 var(--dsw-alias-*) 令牌；禁止 --dsw-specific-sidebar-fill 与新增硬编码颜色。
- package.json version 0.2.0；peerDependencies：react ^18.2.0（普通）、dsh-better-sidebar ^0.12.0（peerDependenciesMeta optional）。
- 所有命令在仓库根执行，PowerShell 语法（pnpm build / pnpm typecheck / pnpm test / node --test test/client.test.mjs）。
- 每个 Task 结束必须全绿后 commit。

---

### Task 1: 依赖与类型基座（纯增量，不动行为）

**Files:**
- Modify: package.json
- Modify: types/client.d.ts

**Interfaces:**
- Consumes: 现有 types/client.d.ts 的 ClientContext（含 slots/locale 成员，暂不删）。
- Produces: ambient 模块 dsh-better-sidebar（SessionScope / SidebarTab / SidebarState / TabComponentProps / TabDescriptor / BetterSidebarService）；ClientContext 新成员 betterSidebar；package.json peerDependencies。Task 2 依赖这些名字。

- [ ] **Step 1: package.json —— 版本与 peer 依赖**

用 edit 工具改两处。第一处：

old_string:
```json
  "version": "0.1.0",
```
new_string:
```json
  "version": "0.2.0",
```

第二处（在 devDependencies 前插入）：

old_string:
```json
  "devDependencies": {
```
new_string:
```json
  "peerDependencies": {
    "react": "^18.2.0",
    "dsh-better-sidebar": "^0.12.0"
  },
  "peerDependenciesMeta": {
    "dsh-better-sidebar": {
      "optional": true
    }
  },
  "devDependencies": {
```

不需要 pnpm install：peer 依赖不参与本地构建解析（类型来自本仓库 stubs 与 devDependencies 的 @types/react）。

- [ ] **Step 2: types/client.d.ts —— ClientContext 增成员 + 追加 stub 模块**

edit 一：ClientContext 加 betterSidebar 成员。

old_string:
```ts
    effect(fn: () => () => void, label?: string): () => void
    slots: import('./client-shapes').SlotRegistryFace
    locale: import('./client-shapes').LocaleFace
  }
```
new_string:
```ts
    effect(fn: () => () => void, label?: string): () => void
    slots: import('./client-shapes').SlotRegistryFace
    locale: import('./client-shapes').LocaleFace
    betterSidebar: import('dsh-better-sidebar').BetterSidebarService
  }
```

edit 二：文件末尾（ui-sidebar 的 declare module 之后）追加以下整块：

```ts
declare module 'dsh-better-sidebar' {
  import type { ReactNode } from 'react'
  /** Session the tab targets (minimal face of the shipped type). */
  export interface SessionScope { sessionId: string; cwd?: string }
  /** One open sidebar tab (minimal face). */
  export interface SidebarTab { id: string; type: string; title?: string }
  /** Live sidebar state (minimal face; badge receives it). */
  export interface SidebarState { tabs: unknown[] }
  /** Props every tab component receives (fields this plugin uses). */
  export interface TabComponentProps {
    ctx: Record<string, unknown>
    scope: SessionScope
    tab: SidebarTab
    visible: boolean
  }
  /** One registered tab kind (fields this plugin declares). */
  export interface TabDescriptor {
    id: string
    title: string | (() => string)
    icon?: ReactNode | ((size: number) => ReactNode)
    order?: number
    single?: boolean
    badge?: (ctx: unknown, scope: SessionScope, state: SidebarState) => string | number | null | undefined
    onOpen?: (tab: SidebarTab, scope: SessionScope) => void
    onClose?: (tab: SidebarTab, scope: SessionScope) => void
    component: (props: TabComponentProps) => ReactNode
  }
  /** The registry service published as ctx.betterSidebar (minimal face). */
  export interface BetterSidebarService {
    registerTab(descriptor: TabDescriptor): () => void
    readonly features: readonly string[]
  }
}
```

- [ ] **Step 3: 验证不破坏现状**

Run: pnpm typecheck
Expected: 0 错误（旧 client.tsx 未动，slots/locale stub 仍在）。

Run: pnpm test
Expected: 全部通过（dist/client.js 仍是旧构建）。

- [ ] **Step 4: Commit**

```bash
git add package.json types/client.d.ts
git commit -m "feat: peer deps and dsh-better-sidebar type stub (additive)"
```

---

### Task 2: client 半迁移（测试先行，整体替换 src/client.tsx）

**Files:**
- Rewrite: test/client.test.mjs（旧 slot 断言全部淘汰）
- Rewrite: src/client.tsx（唯一实现文件，完整内容见 Step 3）

**Interfaces:**
- Consumes: Task 1 的 TabComponentProps / ClientContext.betterSidebar。
- Produces: bundle 导出 { inject: ['betterSidebar'], apply(ctx) }；descriptor 字段 id/title/icon/order/single/badge/onOpen/onClose/component；模块内 statusCache（badge 数据源）、badgeOpen/badgeClose（onOpen/onClose 调用）。Task 3 只做清理，不再依赖新名字。

- [ ] **Step 1: 写新测试（失败态）**

用 write 工具整体替换 test/client.test.mjs：

```js
// Client-bundle smoke for the better-sidebar side-card tab: execute
// dist/client.js in a stubbed module-table environment, run apply() against
// a fake ctx.betterSidebar, and assert the registered TabDescriptor shape,
// feature gating, badge-poller lifecycle, and bundle purity.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = readFileSync(join(root, 'dist', 'client.js'), 'utf8')

function makeRequire() {
  return (spec) => {
    if (spec === 'react/jsx-runtime' || spec === 'react') {
      return { jsx: (...a) => ({ a }), jsxs: (...a) => ({ a }), Fragment: 'Fragment' }
    }
    if (spec === '@deepseek-ai/dsh-client-runtime/client') {
      return { defineStore: (s) => s }
    }
    throw new Error('unexpected require: ' + spec)
  }
}

function loadBundle() {
  let captured = null
  const window = { __ModuleLoader__: { load: (entry) => { captured = entry } } }
  const run = new Function('window', 'require', source)
  run(window, makeRequire())
  assert.notEqual(captured, null)
  return { entry: captured }
}

function exportsOf() {
  const { entry } = loadBundle()
  return entry.factory(makeRequire())
}

function makeCtx(features) {
  const registered = []
  return {
    ctx: {
      effect: (fn) => { fn(); return () => {} },
      betterSidebar: { features, registerTab: (d) => { registered.push(d); return () => {} } },
    },
    registered,
  }
}

test('bundle never references dsh-better-sidebar at runtime (purity)', () => {
  assert.ok(!source.includes('dsh-better-sidebar'), 'type-only import leaked into the bundle')
})

test('bundle registers under the plugin id and injects only betterSidebar', () => {
  const ex = exportsOf()
  assert.deepEqual(ex.inject, ['betterSidebar'])
  assert.equal(typeof ex.apply, 'function')
})

test('apply registers a single-instance tab descriptor with gated badge/lifecycle', () => {
  const ex = exportsOf()
  const { ctx, registered } = makeCtx(['badge', 'tabLifecycle'])
  ex.apply(ctx)
  assert.equal(registered.length, 1)
  const d = registered[0]
  assert.equal(d.id, 'hindsight-manager:main')
  assert.equal(d.single, true)
  assert.equal(d.order, 50)
  assert.equal(typeof d.title(), 'string')
  assert.equal(typeof d.icon, 'function')
  assert.equal(typeof d.component, 'function')
  assert.equal(typeof d.badge, 'function')
  assert.equal(typeof d.onOpen, 'function')
  assert.equal(typeof d.onClose, 'function')
  assert.equal(d.badge(), undefined) // cache unknown before any poll
})

test('descriptor omits badge/lifecycle when features are absent', () => {
  const ex = exportsOf()
  const { ctx, registered } = makeCtx([])
  ex.apply(ctx)
  assert.equal(registered.length, 1)
  assert.equal('badge' in registered[0], false)
  assert.equal('onOpen' in registered[0], false)
  assert.equal('onClose' in registered[0], false)
})

test('badge poller: one shared timer across opens, cleared when all close', async () => {
  const ex = exportsOf()
  const realFetch = globalThis.fetch
  const realSet = globalThis.setInterval
  const realClear = globalThis.clearInterval
  const fetchCalls = []
  const started = []
  const cleared = []
  let handle = null
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url))
    return { ok: true, json: async () => ({ health: { running: true } }) }
  }
  globalThis.setInterval = (fn, ms) => { started.push(ms); handle = realSet(fn, ms); return handle }
  globalThis.clearInterval = (id) => { cleared.push(id); realClear(id) }
  try {
    const { ctx, registered } = makeCtx(['badge', 'tabLifecycle'])
    ex.apply(ctx)
    const d = registered[0]
    d.onOpen({}, { sessionId: 'a' })
    d.onOpen({}, { sessionId: 'b' })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(fetchCalls.length, 1) // one immediate poll; 10s intervals never fire here
    assert.ok(fetchCalls[0].endsWith('/status'))
    assert.deepEqual(started, [10000]) // exactly one interval despite two opens
    assert.equal(d.badge(), '●')
    d.onClose({}, { sessionId: 'a' })
    assert.deepEqual(cleared, []) // one instance still open
    d.onClose({}, { sessionId: 'b' })
    assert.deepEqual(cleared, [handle]) // interval cleared when refcount hits zero
  } finally {
    if (handle !== null) realClear(handle)
    globalThis.fetch = realFetch
    globalThis.setInterval = realSet
    globalThis.clearInterval = realClear
  }
})

```

- [ ] **Step 2: 先构建旧源，确认新测试失败**

Run: pnpm build
Expected: 构建成功（dist/client.js 仍是旧 slot 版）。

Run: node --test test/client.test.mjs
Expected: FAIL —— inject 断言得到 ['slots', 'locale']；descriptor/gate/生命周期用例全部失败（旧 bundle 没有 ctx.betterSidebar 路径）。purity 用例此时已通过（旧 bundle 同样不含该字符串），这正常。

- [ ] **Step 3: 整体替换 src/client.tsx**

用 write 工具，完整内容如下（先 read 原文件再覆盖；此文件即最终实现）：

```tsx
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
import { useCallback, useEffect, useRef, useState } from 'react'
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
  if (badgeRefs === 0 && badgeTimer !== null) {
    clearInterval(badgeTimer)
    badgeTimer = null
  }
}

// ---------------------------------------------------------------------------
// Tab component
// ---------------------------------------------------------------------------

/** The side-card tab body: sub-page tabs + visible-gated polling + actions. */
function ManagerTab(props: TabComponentProps) {
  const s = store.useStore((x) => x)
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
            onClick={() => { store.actions.setTab(tab.id) }}
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
  ctx.effect(() => svc.registerTab({
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
  }), 'dsh-hindsight-manager: side card tab')
}
```

- [ ] **Step 4: 重建并跑 client 测试**

Run: pnpm build
Expected: 构建成功，输出 lib/index.js、lib/hindsight.js、dist/client.js。

Run: node --test test/client.test.mjs
Expected: 5 个用例全部 PASS。

- [ ] **Step 5: 类型检查**

Run: pnpm typecheck
Expected: 0 错误（slots/locale stub 还在但已无人引用，不报错）。

- [ ] **Step 6: 全量测试**

Run: pnpm test
Expected: hindsight / client / api / daemon 四个文件全绿（后三个与本次改动无关）。

- [ ] **Step 7: Commit**

```bash
git add src/client.tsx test/client.test.mjs
git commit -m "feat: convert client half to better-sidebar side-card tab"
```

---

### Task 3: 类型清理 + README + 全量验证

**Files:**
- Rewrite: types/client.d.ts（删 slots/locale 相关 stub）
- Modify: README.md（四处文案）

**Interfaces:**
- Consumes: 无新依赖。
- Produces: 干净的最小类型面；文档与实现一致。

- [ ] **Step 1: 整体替换 types/client.d.ts**

用 write 工具（先 read），完整内容：

```ts
/**
 * Client-side ambient declarations, mirrored from dsh-client-runtime /
 * dsh-better-sidebar shipped .d.ts files. Only the members this plugin
 * uses are declared; the real runtime owns the shapes.
 */
declare module '@deepseek-ai/dsh-client-runtime/client' {
  /** Client root context face used by client plugin apply(). */
  export interface ClientContext {
    effect(fn: () => () => void, label?: string): () => void
    betterSidebar: import('dsh-better-sidebar').BetterSidebarService
  }
  export interface StoreHandle<T, A> {
    useStore<S>(selector: (state: T) => S): S
    /** The runtime binds each mutator's draft (client.js: actions[key] = (...params) => store.update(d => mutate(d, ...params))); exposed actions drop it. */
    actions: { [K in keyof A]: A[K] extends (draft: T, ...args: infer P) => void ? (...args: P) => void : never }
  }
  export interface ActionsDecl<T> {
    [key: string]: (draft: T, ...args: never[]) => void
  }
  export interface StoreSpec<T> {
    init: () => T
    persist?: string
  }
  export function defineStore<T, A extends ActionsDecl<T>>(
    decl: StoreSpec<T> & { actions: A & ActionsDecl<T> },
  ): StoreHandle<T, A>
}

declare module 'dsh-better-sidebar' {
  import type { ReactNode } from 'react'
  /** Session the tab targets (minimal face of the shipped type). */
  export interface SessionScope { sessionId: string; cwd?: string }
  /** One open sidebar tab (minimal face). */
  export interface SidebarTab { id: string; type: string; title?: string }
  /** Live sidebar state (minimal face; badge receives it). */
  export interface SidebarState { tabs: unknown[] }
  /** Props every tab component receives (fields this plugin uses). */
  export interface TabComponentProps {
    ctx: Record<string, unknown>
    scope: SessionScope
    tab: SidebarTab
    visible: boolean
  }
  /** One registered tab kind (fields this plugin declares). */
  export interface TabDescriptor {
    id: string
    title: string | (() => string)
    icon?: ReactNode | ((size: number) => ReactNode)
    order?: number
    single?: boolean
    badge?: (ctx: unknown, scope: SessionScope, state: SidebarState) => string | number | null | undefined
    onOpen?: (tab: SidebarTab, scope: SessionScope) => void
    onClose?: (tab: SidebarTab, scope: SessionScope) => void
    component: (props: TabComponentProps) => ReactNode
  }
  /** The registry service published as ctx.betterSidebar (minimal face). */
  export interface BetterSidebarService {
    registerTab(descriptor: TabDescriptor): () => void
    readonly features: readonly string[]
  }
}

```

- [ ] **Step 2: 类型检查**

Run: pnpm typecheck
Expected: 0 错误（client.tsx 已不再引用 slots/locale）。

- [ ] **Step 3-6: README 四处 edit**

edit 1（简介行）：

old_string:
DSH Web 插件：为 @vectorize-io/hindsight-coding-agents（即 🧠 Hindsight 记忆插件）提供一个侧栏管理面板——查看它的全部配置项与运行状态，并能启动 / 停止本地 daemon。
new_string:
DSH Web 插件：为 @vectorize-io/hindsight-coding-agents（即 🧠 Hindsight 记忆插件）提供一个 better-sidebar 侧边卡片 tab——查看它的全部配置项与运行状态，并能启动 / 停止本地 daemon。前置依赖：dsh-better-sidebar v0.12+（未安装时本插件 client 半不激活，host 半路由不受影响）。

edit 2（状态小节标题行）：

old_string:
**状态**（侧栏底部「Hindsight」按钮 → 右侧停靠面板）
new_string:
**状态**（侧栏 + 菜单「Hindsight」tab；tab 角标 ●/○ 同步 daemon 运行状态）

edit 3（角标条目，插在 daemon 状态徽章条目之后）：

old_string:
- daemon 运行状态徽章（运行中 / 已停止 / 启动中），5 秒自动轮询
new_string:
- daemon 运行状态徽章（运行中 / 已停止 / 启动中），5 秒自动轮询（tab 不可见时暂停）
- tab 标题角标：● 运行中 / ○ 已停止（缓存自 onOpen/onClose 生命周期管理的 10s 后台轮询）

edit 4（安装后提示行）：

old_string:
安装后重启 dsh web GUI，侧栏底部会出现 🧠「Hindsight」按钮。
new_string:
安装后重启 dsh web GUI，侧栏 + 菜单会出现 🧠「Hindsight」tab，设置页「侧边卡片」分区出现本插件卡片（含独立开关）。

edit 5（结构表 client 行）：

old_string:
| src/client.tsx | client half：侧栏 footer 按钮（sidebar.footer.action 槽）+ 右侧停靠面板（shell.overlay 槽） |
new_string:
| src/client.tsx | client half：注册 better-sidebar tab（ctx.betterSidebar.registerTab）+ tab 组件（4 子页）与 badge 状态缓存 |

edit 6（结构表 types 行）：

old_string:
| types/ | cordis / dsh-client-runtime / slots 的最小 ambient 类型声明（本机无 harness 源码树） |
new_string:
| types/ | cordis / dsh-client-runtime / dsh-better-sidebar 的最小 ambient 类型声明（本机无 harness 源码树） |

- [ ] **Step 7: 全量验证**

Run: pnpm build; pnpm typecheck; pnpm test
Expected: 三条全绿。

- [ ] **Step 8: Commit**

```bash
git add types/client.d.ts README.md
git commit -m "chore: drop slot/locale stubs; README for side-card tab"
```

- [ ] **Step 9: GUI 手动验证（信息性，需人工硬刷新）**

profile 已 link 挂载（C:/Users/johnl/.dsh/profiles/web/package.json L16 依赖 + L40 bundles）。执行 pnpm build 后浏览器 Ctrl+Shift+R 硬刷新，核对：+ 菜单出现 Hindsight tab；设置页「侧边卡片」出现卡片；badge ●/○ 随 daemon 变化；4 子页正常；启动/停止 daemon 可用；硬刷新后 tab 恢复；禁用卡片后 + 菜单项消失。
