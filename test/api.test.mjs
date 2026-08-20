// Node-half route tests: drive the real apply() handler against a scratch
// HTTP server through a stub webServer service. Read-only routes only — the
// daemon stop/start round-trip lives in daemon.test.mjs behind an opt-in env.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { API_PREFIX, apply, inject, name } from '../lib/index.js'

test('plugin metadata and injection list', () => {
  assert.equal(name, 'dsh-hindsight-manager')
  assert.deepEqual(inject, ['webServer'])
})

test('routes answer JSON for status, config, banks, logs and 404 otherwise', async () => {
  const routes = new Map()
  const ctx = {
    effect: (fn) => { fn(); return () => {} },
    webServer: { register: (route) => { routes.set(route.path, route.handler); return () => {} } },
  }
  apply(ctx)
  const handler = routes.get(API_PREFIX)
  assert.ok(handler, 'api prefix registered')

  const server = createServer((req, res) => handler(req, res))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}${API_PREFIX}`

  const get = async (path) => {
    const res = await fetch(base + path)
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8')
    return { status: res.status, body: await res.json() }
  }

  try {
    const status = await get('/status')
    assert.equal(status.status, 200)
    assert.equal(typeof status.body.health.running, 'boolean')
    assert.equal(typeof status.body.uv, 'boolean')
    assert.ok(status.body.runtime.apiUrl)
    assert.ok(status.body.paths.pluginLog)

    const config = await get('/config')
    assert.equal(config.status, 200)
    assert.ok(Array.isArray(config.body.items))
    assert.ok(config.body.items.length >= 30, 'full config surface present')
    assert.ok(config.body.items.every((i) => !String(JSON.stringify(i.value) ?? '').includes('secret-token')))

    const banks = await get('/banks')
    assert.equal(banks.status, 200)
    // shape only: banks list may legitimately carry an error when daemon is down
    assert.ok('banks' in banks.body || 'error' in banks.body)
    if (banks.body.banks?.length) {
      const first = banks.body.banks[0]
      assert.ok(first.bank_id)
      // pages route answers for a real bank id
      const pages = await get(`/banks/${encodeURIComponent(first.bank_id)}/pages`)
      assert.equal(pages.status, 200)
    }

    const logs = await get('/logs?lines=5')
    assert.equal(logs.status, 200)
    assert.ok(logs.body.plugin && logs.body.daemon)
    assert.ok(logs.body.plugin.lines.length <= 5)

    const missing = await get('/nope')
    assert.equal(missing.status, 404)

    // POST-only guard
    const getOnPost = await fetch(base + '/daemon/stop')
    assert.equal(getOnPost.status, 405)
  } finally {
    server.close()
    server.closeAllConnections?.()
  }
})
