/**
 * Local stand-in for the helpers dsh deleted from
 * `@deepseek-ai/dsh-client-runtime/client` (dsh 0.1.2-alpha.1 removed the
 * package from the client module table entirely, which made this plugin's
 * client entry a boot-time SyntaxError). The old semantics are kept:
 * draft-mutating actions over an immutable snapshot store, whole-state JSON
 * persistence to localStorage, and a create(scopeKey) handle so callers keep
 * module-level stores. Only the surface this plugin uses is implemented;
 * everything here is bundled into dist/client.js (no host imports).
 */

/** Client root context face used by client plugin apply(). */
export interface ClientContext {
  effect(fn: () => () => void, label?: string): () => void
  betterSidebar: import('dsh-better-sidebar').BetterSidebarService
}

/** Action declarations: first parameter is the draft, typed per store. */
export interface ActionsDecl<T> {
  [key: string]: (draft: T, ...args: never[]) => void
}

/** Draft-stripped bound mutators (the store binds each draft). */
export type BoundActions<T, A extends ActionsDecl<T>> = {
  [K in keyof A]: A[K] extends (draft: T, ...args: infer P) => void ? (...args: P) => void : never
}

/** A store instance returned by StoreHandle.create(). */
export interface StoreInstance<T, A extends ActionsDecl<T>> {
  actions: BoundActions<T, A>
  getSnapshot(): T
  subscribe(listener: () => void): () => void
  clearPersisted(): void
}

/** defineStore's return: the registration handle; create() instantiates. */
export interface StoreHandle<T, A extends ActionsDecl<T>> {
  spec: { init: () => T; persist?: string; actions: A }
  create(scopeKey?: string): StoreInstance<T, A>
}

export function defineStore<T extends object, A extends ActionsDecl<T>>(
  decl: { init: () => T; persist?: string; actions: A },
): StoreHandle<T, A> {
  return {
    spec: decl,
    create(scopeKey?: string): StoreInstance<T, A> {
      const persistKey = decl.persist === undefined ? undefined
        : scopeKey === undefined ? decl.persist : `${decl.persist}.${scopeKey}`
      let state = decl.init()
      if (persistKey !== undefined && typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem(persistKey)
          if (raw !== null) state = JSON.parse(raw) as T
        } catch (error) {
          console.error(`snapshot store '${persistKey}' rehydration failed:`, error)
        }
      }
      const listeners = new Set<() => void>()
      const update = (mutate: (draft: T) => void): void => {
        // structuredClone keeps the mutate-a-draft ergonomics immer provided;
        // the state is tiny (UI flags), so copy cost is negligible.
        const draft = structuredClone(state)
        mutate(draft)
        state = draft
        for (const fn of [...listeners]) fn()
      }
      const actions = {} as BoundActions<T, A>
      for (const key of Object.keys(decl.actions) as (keyof A & string)[]) {
        const mutate = decl.actions[key]
        actions[key] = ((...params: unknown[]) => {
          update((draft) => { (mutate as unknown as (draft: T, ...p: unknown[]) => void)(draft, ...params) })
        }) as BoundActions<T, A>[typeof key]
      }
      return {
        actions,
        getSnapshot: () => state,
        subscribe: (fn) => {
          listeners.add(fn)
          return () => { listeners.delete(fn) }
        },
        clearPersisted: () => {
          if (persistKey === undefined || typeof localStorage === 'undefined') return
          try { localStorage.removeItem(persistKey) } catch { /* storage unavailable */ }
        },
      }
    },
  }
}
