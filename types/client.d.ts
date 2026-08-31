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
  /** A store instance returned by StoreHandle.create(). */
  export interface StoreInstance<T, A> {
    /** Draft-stripped bound mutators (the runtime binds each draft). */
    actions: { [K in keyof A]: A[K] extends (draft: T, ...args: infer P) => void ? (...args: P) => void : never }
    getSnapshot(): T
    subscribe(listener: () => void): () => void
  }
  /** defineStore's return: the registration handle; create() instantiates. */
  export interface StoreHandle<T, A> {
    spec: StoreSpec<T> & { actions: A & ActionsDecl<T> }
    create(scopeKey?: string): StoreInstance<T, A>
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
