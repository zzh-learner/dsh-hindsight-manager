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
      return {
        jsx: (...a) => ({ a }), jsxs: (...a) => ({ a }), Fragment: 'Fragment',
        useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
        useEffect: () => {}, useRef: (v) => ({ current: v }), useCallback: (fn) => fn,
        useSyncExternalStore: (_s, g) => g(),
      }
    }
    if (spec === '@deepseek-ai/dsh-client-runtime/client') {
      return {
        defineStore: (decl) => ({
          spec: decl,
          create: () => ({
            actions: Object.fromEntries(Object.entries(decl.actions || {}).map(([k, m]) => [k, (...p) => m({}, ...p)])),
            getSnapshot: () => decl.init(),
            subscribe: () => () => {},
          }),
        }),
      }
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

test('ManagerTab renders through the real component path (store handle/instance regression gate)', () => {
  const ex = exportsOf()
  const { ctx, registered } = makeCtx(['badge', 'tabLifecycle'])
  ex.apply(ctx)
  const d = registered[0]
  const element = d.component({ ctx: {}, scope: { sessionId: 't' }, tab: { id: 'x', type: 'hindsight-manager:main' }, visible: true })
  assert.ok(element !== null && typeof element === 'object')
})
