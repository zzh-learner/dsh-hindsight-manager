// Client-bundle smoke: execute dist/client.js in a stubbed module-table
// environment, then run apply() against a fake ctx and assert the
// registrations target the right slots.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = readFileSync(join(root, 'dist', 'client.js'), 'utf8')

function loadBundle() {
  let captured = null
  const window = { __ModuleLoader__: { load: (entry) => { captured = entry } } }
  const require = (spec) => {
    if (spec === 'react/jsx-runtime' || spec === 'react') {
      return { jsx: (...args) => ({ args }), jsxs: (...args) => ({ args }), Fragment: 'Fragment' }
    }
    if (spec === '@deepseek-ai/dsh-client-runtime/client') {
      return { defineStore: (spec) => spec }
    }
    throw new Error('unexpected require: ' + spec)
  }
  const run = new Function('window', 'require', source + '\n;window.__captured = window.__ModuleLoader__;')
  run(window, require)
  assert.notEqual(captured, null)
  return { entry: captured }
}

test('bundle registers under the plugin id and exports a function plugin', () => {
  const { entry } = loadBundle()
  assert.equal(entry.id, 'dsh-hindsight-manager')
  assert.equal(typeof entry.factory, 'function')
  const exports = entry.factory((spec) => {
    if (spec === 'react/jsx-runtime' || spec === 'react') return { jsx: (...a) => ({ a }), jsxs: (...a) => ({ a }), Fragment: 'F' }
    if (spec === '@deepseek-ai/dsh-client-runtime/client') return { defineStore: (s) => s }
    throw new Error('unexpected require: ' + spec)
  })
  assert.deepEqual(exports.inject, ['slots', 'locale'])
  assert.equal(typeof exports.apply, 'function')
})

test('apply registers dictionaries plus footer action and overlay panel', () => {
  const { entry } = loadBundle()
  const exports = entry.factory((spec) => {
    if (spec === 'react/jsx-runtime' || spec === 'react') return { jsx: (...a) => ({ a }), jsxs: (...a) => ({ a }), Fragment: 'F' }
    if (spec === '@deepseek-ai/dsh-client-runtime/client') return { defineStore: (s) => s }
    throw new Error('unexpected require: ' + spec)
  })

  const injected = []
  const registrations = []
  const localeCalls = []
  const ctx = {
    effect: (fn) => { fn(); return () => {} },
    locale: { register: (ns, dicts) => { localeCalls.push([ns, dicts]); return () => {} } },
    slots: {
      inject: (key, callback) => { injected.push(key); callback(); return () => {} },
      register: (options, component) => { registrations.push([options, component]); return () => {} },
    },
  }
  exports.apply(ctx)

  assert.deepEqual(injected.sort(), ['shell.overlay', 'sidebar.footer.action'])
  assert.equal(localeCalls.length, 1)
  assert.equal(localeCalls[0][0], 'dsh-hindsight-manager')
  assert.ok(localeCalls[0][1].zh && localeCalls[0][1].en)

  const footer = registrations.find(([o]) => o.id === 'hindsight-manager')
  const panel = registrations.find(([o]) => o.id === 'hindsight-manager-panel')
  assert.ok(footer, 'footer registration present')
  assert.ok(panel, 'panel registration present')
  assert.equal(footer[0].name, 'sidebar.footer.action')
  assert.equal(panel[0].name, 'shell.overlay')
  assert.equal(typeof footer[1], 'function')
  assert.equal(typeof panel[1], 'function')
})
