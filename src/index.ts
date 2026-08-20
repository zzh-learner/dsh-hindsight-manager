/**
 * dsh-hindsight-manager node half: registers the JSON API the panel's client
 * half calls, on the shared web server. Read routes reflect pure helpers in
 * ./hindsight.ts; the two POST routes drive the local Hindsight daemon
 * (start prefers the installed hindsight plugin's own daemon-start.js; stop
 * rides the hindsight-embed CLI). Every handler answers JSON, never throws
 * to the socket.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  bankPages,
  buildConfigReport,
  checkHealth,
  daemonPaths,
  findDaemonStarter,
  hasUv,
  listBanks,
  runtimeView,
  startDaemon,
  stopDaemon,
  tailFile,
} from './hindsight.ts'

export const name = 'dsh-hindsight-manager'

/** Services required before apply runs. */
export const inject = ['webServer']

/** Route prefix every panel request lives under. */
export const API_PREFIX = '/dsh-hindsight-manager/api'

/** The harness name hindsight config layers under for dsh sessions. */
const HARNESS = 'dsh'

/** JSON helper: always content-type json, no-store (status pages go stale fast). */
function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(payload)
}

/** POST-only guard returns true when the request may proceed. */
function requirePost(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'POST') return true
  json(res, 405, { error: 'POST required' })
  return false
}

/** Resolve the effective runtime view once per request (config may have changed on disk). */
function view(): ReturnType<typeof runtimeView> {
  return runtimeView(buildConfigReport(HARNESS))
}

/** Dispatch one API request; matched against the stripped sub-path. */
async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const sub = url.pathname.slice(API_PREFIX.length).replace(/\/+$/, '')

  if (sub === '/status') {
    const v = view()
    const [health, uv] = await Promise.all([checkHealth(v.apiUrl), hasUv()])
    json(res, 200, {
      harness: HARNESS,
      runtime: v,
      health,
      uv,
      starter: findDaemonStarter(),
      paths: daemonPaths(v),
      time: new Date().toISOString(),
    })
    return
  }

  if (sub === '/config') {
    json(res, 200, buildConfigReport(HARNESS))
    return
  }

  if (sub === '/banks') {
    const v = view()
    json(res, 200, await listBanks(v.apiUrl))
    return
  }

  const pagesMatch = /^\/banks\/(.+)\/pages$/.exec(sub)
  if (pagesMatch) {
    const v = view()
    json(res, 200, await bankPages(v.apiUrl, decodeURIComponent(pagesMatch[1])))
    return
  }

  if (sub === '/daemon/start') {
    if (!requirePost(req, res)) return
    const v = view()
    json(res, 200, startDaemon(v, HARNESS, findDaemonStarter()))
    return
  }

  if (sub === '/daemon/stop') {
    if (!requirePost(req, res)) return
    const v = view()
    json(res, 200, await stopDaemon(v))
    return
  }

  if (sub === '/logs') {
    const v = view()
    const paths = daemonPaths(v)
    const lines = Number(url.searchParams.get('lines') ?? '200')
    json(res, 200, {
      plugin: tailFile(paths.pluginLog, Number.isFinite(lines) ? lines : 200),
      daemon: tailFile(paths.daemonLog, Number.isFinite(lines) ? lines : 200),
    })
    return
  }

  json(res, 404, { error: `unknown route: ${req.method} ${sub}` })
}

/** Register the API route on the shared web server.
 * @param ctx - cordis context with the webServer service.
 */
export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler: serve }),
    'dsh-hindsight-manager: hindsight status/config API route',
  )
}
