/**
 * Client-side ambient declarations, mirrored from dsh-client-runtime /
 * dsh-client-ui-slots / dsh-client-locale shipped .d.ts files. Only the
 * members this plugin uses are declared; the real runtime owns the shapes.
 */
declare module '@deepseek-ai/dsh-client-runtime/client' {
  import type { ReactElement } from 'react'
  /** Client root context face used by client plugin apply(). */
  export interface ClientContext {
    effect(fn: () => () => void, label?: string): () => void
    slots: import('./client-shapes').SlotRegistryFace
    locale: import('./client-shapes').LocaleFace
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

declare module './client-shapes' {
  import type { ComponentType } from 'react'
  export interface SlotRegistration {
    name: string
    id: string
    order?: number
    registrant?: string
    locale?: string
    store?: unknown
  }
  export interface SlotRegistryFace {
    register(options: SlotRegistration, component: ComponentType<never>): () => void
    inject(key: string, callback: () => () => void): () => void
  }
  export interface LocaleFace {
    register(ns: string, dicts: Record<string, Record<string, string>>): () => void
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  // Slot-name merges live here at runtime; the registry face used by this
  // plugin is typed through dsh-client-runtime/client.
  export interface SlotMap {
    'sidebar.footer.action': { kind: 'list'; scope: 'root'; owner: { collapsed: boolean } }
    'shell.overlay': { kind: 'list'; scope: 'root'; owner: Record<string, never> }
  }
  export interface LocaleNamespaceMap {
    [ns: string]: string
  }
}

declare module '@deepseek-ai/dsh-client-locale/client' {
  // Type-only seat (see cordis.patch pattern from sibling plugins).
}

declare module '@deepseek-ai/dsh-client-ui-layout/client' {
  // Type-only seat: declares the shell.overlay slot name used at runtime.
}

declare module '@deepseek-ai/dsh-client-ui-sidebar/client' {
  // Type-only seat: declares the sidebar.footer.action slot name used at runtime.
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
