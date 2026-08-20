// Unit tests for the pure logic module (lib/hindsight.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import {
  buildConfigReport, checkHealth, embedCommand, maskToken,
  readRawConfig, runtimeView, tailFile,
} from '../lib/hindsight.js'

test('maskToken keeps shape but drops the secret', () => {
  const masked = maskToken('sk-abcdef123456')
  assert.equal(typeof masked, 'string')
  assert.ok(masked.includes('3456'), 'keeps the last 4 chars')
  assert.ok(!masked.includes('abcdef'), 'drops the secret body')
  assert.equal(maskToken(''), '')
})

test('readRawConfig: ENOENT -> empty raw, no error', () => {
  const r = readRawConfig(join(tmpdir(), 'definitely-missing-' + Date.now() + '.json'))
  assert.deepEqual(r.raw, {})
  assert.equal(r.error, undefined)
})

test('readRawConfig: invalid JSON reports an error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dshm-'))
  const f = join(dir, 'bad.json')
  writeFileSync(f, '{ not json')
  const r = readRawConfig(f)
  assert.deepEqual(r.raw, {})
  assert.match(r.error ?? '', /invalid JSON/)
  rmSync(dir, { recursive: true, force: true })
})

test('buildConfigReport layers: file beats env, harness beats file, defaults otherwise', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dshm-'))
  const f = join(dir, 'cfg.json')
  writeFileSync(f, JSON.stringify({
    serverMode: 'daemon',
    apiPort: 9100,
    logLevel: 'debug',
    apiToken: 'secret-token-9999',
    harnesses: { dsh: { gitIngest: 'full' } },
    banks: { 'coding-agent::x': { gitIngest: 'none' } },
  }))
  const env = { HINDSIGHT_CONFIG: f, HINDSIGHT_API_PORT: '9200', HINDSIGHT_GIT_INGEST: 'none' }
  const report = buildConfigReport('dsh', env)

  const by = (key) => report.items.find((i) => i.key === key)
  // file beats env
  assert.equal(by('apiPort').source, 'file')
  assert.equal(by('apiPort').value, 9100)
  // env wins when file silent
  assert.equal(by('gitIngest').source, 'file:harness')
  assert.equal(by('gitIngest').value, 'full')
  // env-only keys
  assert.deepEqual(report.envActive.map((e) => e.key).sort(), ['apiPort', 'gitIngest'])
  // defaults surface with source default
  assert.equal(by('surveyModel').source, 'default')
  assert.equal(by('surveyModel').value, 'haiku')
  // token masked in items and raw
  assert.ok(String(by('apiToken').value).includes('9999'))
  assert.ok(!JSON.stringify(report.raw).includes('secret-token'))
  // section summaries
  assert.deepEqual(report.harnessSections, ['dsh'])
  assert.deepEqual(report.bankSections, [{ id: 'coding-agent::x', keys: ['gitIngest'] }])
  rmSync(dir, { recursive: true, force: true })
})

test('runtimeView pins daemon URL to the configured port', () => {
  const report = buildConfigReport('dsh', { HINDSIGHT_CONFIG: join(tmpdir(), 'missing-' + Date.now() + '.json') })
  const v = runtimeView(report)
  assert.equal(v.serverMode, 'cloud')
  assert.equal(v.apiUrl, 'https://api.hindsight.vectorize.io')
  assert.equal(v.daemonProfile, 'coding-agent')
})

test('runtimeView daemon mode overrides apiUrl', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dshm-'))
  const f = join(dir, 'cfg.json')
  writeFileSync(f, JSON.stringify({ serverMode: 'daemon', apiPort: 9077 }))
  const v = runtimeView(buildConfigReport('dsh', { HINDSIGHT_CONFIG: f }))
  assert.equal(v.apiUrl, 'http://127.0.0.1:9077')
  rmSync(dir, { recursive: true, force: true })
})

test('embedCommand: default uvx latest, pinned version honored', () => {
  assert.deepEqual(embedCommand({ serverMode: 'daemon', apiUrl: '', apiPort: 0, daemonProfile: '' }), { cmd: 'uvx', base: ['hindsight-embed@latest'] })
  assert.deepEqual(
    embedCommand({ serverMode: 'daemon', apiUrl: '', apiPort: 0, daemonProfile: '', embedVersion: '0.9.1' }).base,
    ['hindsight-embed@0.9.1'],
  )
  const local = embedCommand({ serverMode: 'daemon', apiUrl: '', apiPort: 0, daemonProfile: '', embedPackagePath: '/x/y' })
  assert.equal(local.cmd, 'uv')
  assert.deepEqual(local.base, ['run', '--directory', '/x/y', 'hindsight-embed'])
})

test('tailFile returns the last N lines and tolerates missing files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dshm-'))
  const f = join(dir, 'log.txt')
  writeFileSync(f, Array.from({ length: 10 }, (_, i) => 'line-' + i).join('\n') + '\n')
  const t = tailFile(f, 3)
  assert.deepEqual(t.lines, ['line-7', 'line-8', 'line-9'])
  const missing = tailFile(join(dir, 'nope.txt'))
  assert.equal(missing.exists, false)
  rmSync(dir, { recursive: true, force: true })
})

test('checkHealth reports running with version on a healthy server', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: 'healthy' })) }
    else if (req.url === '/version') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ api_version: '9.9.9' })) }
    else { res.writeHead(404); res.end() }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const ok = await checkHealth(`http://127.0.0.1:${port}`)
  assert.equal(ok.running, true)
  assert.equal(ok.version.api_version, '9.9.9')
  const down = await checkHealth('http://127.0.0.1:1')
  assert.equal(down.running, false)
  server.close()
})
