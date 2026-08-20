/**
 * Minimal ambient declarations for the dsh plugin API surface this plugin
 * touches, mirrored from the shipped packages' .d.ts (the harness source tree
 * is not present on this machine, so the repo carries its own accurate
 * stubs). Runtime shapes are owned by the real packages; only the members
 * used here are declared.
 */
declare module '@deepseek-ai/cordis' {
  /** Cordis context face used by the node half. */
  export interface Context {
    /** Install a scoped effect; the returned disposer also removes it. */
    effect(fn: () => () => void, label?: string): () => void
    /** The shared web server service (declared by dsh-host-webserver). */
    webServer: import('./webserver-shape').WebServer
  }
}

declare module './webserver-shape' {
  import type { IncomingMessage, ServerResponse } from 'node:http'
  export interface WebRoute {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }
  export interface WebServer {
    register(route: WebRoute): () => void
    readonly port: number
    readonly host: '127.0.0.1' | '0.0.0.0'
  }
}

declare module '@deepseek-ai/dsh-host-webserver' {
  // Type-only seat: importing this module merges nothing at runtime; the
  // service shape lives on Context.webServer (see cordis declaration).
}
