/**
 * Client-side ambient declarations, mirrored from the dsh-better-sidebar
 * shipped .d.ts. Only the members this plugin uses are declared; the real
 * runtime owns the shapes. The former '@deepseek-ai/dsh-client-runtime/client'
 * ambient block became a real module (src/client-store.ts): dsh 0.1.2 removed
 * that package from the client module table.
 */
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
