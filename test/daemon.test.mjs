// Opt-in daemon round-trip (set DSHM_E2E_DAEMON=1): stop the real daemon
// through the route handler, verify /status flips to stopped, start it again
// through the route handler (via the installed plugin's daemon-start.js or
// the uvx fallback), and wait for /health to recover. Skipped by default so
// `pnpm test` never bounces the user's daemon.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { API_PREFIX, apply } from '../lib/index.js'

const optIn = process.env.DSHM_E2E_DAEMON === '1'

test('daemon stop -> stopped -> start -> running', { skip: !optIn }, async () => {
  const routes = new Map()
  apply({ effect: (fn) => { fn(); return () => {} }, webServer: { register: (r) => { routes.set(r.path, r.handler); return () => {} } } })
  const handler = routes.get(API_PREFIX)
  const server = createServer((req, res) => handler(req, res))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}${API_PREFIX}`
  const call = async (path, init) => (await fetch(base + path, init)).json()

  try {
    const before = await call('/status')
    if (!before.health.running) {
      await fetch(base + '/daemon/start', { method: 'POST' })
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        if ((await call('/status')).health.running) break
      }
    }
    assert.equal((await call('/status')).health.running, true, 'daemon running before stop')

    const stop = await call('/daemon/stop', { method: 'POST' })
    assert.equal(stop.ok, true, 'stop reports ok: ' + JSON.stringify(stop))
    assert.equal((await call('/status')).health.running, false, 'status shows stopped')

    const start = await call('/daemon/start', { method: 'POST' })
    assert.equal(start.ok, true, 'start reports ok: ' + JSON.stringify(start))
    let running = false
    for (let i = 0; i < 120 && !running; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      running = (await call('/status')).health.running
    }
    assert.equal(running, true, 'daemon healthy again after start')
  } finally {
    server.close()
    server.closeAllConnections?.()
  }
})
