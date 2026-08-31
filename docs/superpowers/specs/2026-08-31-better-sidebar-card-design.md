# 设计：dsh-hindsight-manager 转换为 better-sidebar 侧边卡片

- **日期**：2026-08-31
- **状态**：设计已获用户批准（本文为其落盘版）
- **权威来源**：本文件 + 磁盘代码。better-sidebar API 事实取自本机权威类型
  `C:\Users\johnl\.dsh\profiles\web\node_modules\dsh-better-sidebar\lib\types\client\service.d.ts`（v0.17.1）；
  迁移规则出处：仓库根 `HANDOFF-better-sidebar-card.md`。

## 1. 背景与动机

dsh-hindsight-manager 当前是一个 DSH Web 插件，client 半用自定义槽位挂载 UI
（`sidebar.footer.action` 侧栏底部按钮 + `shell.overlay` 右侧停靠面板）。
dsh-better-sidebar 提供了对等的声明式卡片体系（+ 菜单 tab、设置页卡片、badge、
生命周期），迁移后本插件获得与内置视图完全一致的一等公民体验，且删除自维护的
窗口外壳代码。

## 2. 已确认决策

| 决策点 | 结论 |
|---|---|
| 旧 UI 去留 | 彻底移除 footer 按钮 + 停靠面板，只留 better-sidebar tab |
| Tab 粒度 | 单 tab + 内部 4 子页（状态/配置/记忆库/日志），保持现有结构 |
| 卡片增强 | 仅 badge 状态角标；不加 pluginToggles、不做 agent 联动 |
| 实现方案 | A：原地改造 `src/client.tsx`（不拆文件） |

## 3. 目标 / 非目标

**目标**
1. client 半挂载方式从 slots 换为 `ctx.betterSidebar.registerTab`（包 `ctx.effect`）。
2. tab 出现在 + 菜单；设置页「侧边卡片」分区自动出现本插件卡片（开关由宿主渲染）。
3. badge 反映 daemon 运行状态（features gate）。
4. 轮询遵循 `visible` 门控；后台资源由 `onOpen`/`onClose` 生命周期管理。

**非目标**
- 不改 host 半（`src/index.ts` 路由）与 `src/hindsight.ts` 纯逻辑。
- 不注册 file viewer；不暴露声明式设置；不做 agent openTab 联动。
- 不保留未装 better-sidebar 时的回退 UI（inject 语义保证 client 半整体不激活）。

## 4. 架构

### 4.1 TabDescriptor

```ts
ctx.effect(() => ctx.betterSidebar.registerTab({
  id: 'hindsight-manager:main',   // 包前缀防撞（重复 id 抛错）
  title: () => tr('panel.title'), // zh/en 自解析（见 4.4）
  icon: (size) => <BrainIcon size={size} />,
  order: 50,                      // + 菜单排前
  single: true,                   // 单实例 = dedupeKey: () => id
  // 以下三项在 features gate 通过后展开挂载（见 4.3）
  badge, onOpen, onClose,
  component: (props) => <ManagerTab {...props} />,
}))
```

`export const inject = ['betterSidebar']` —— 服务就绪才激活；未装 better-sidebar
时 client 半不加载（host 半路由仍在，无害，README 注明）。

### 4.2 组件改造（ManagerPanel → ManagerTab）

- 删除：停靠窗外壳与 footer 按钮及对应 CSS
  （`.dshm-win`、`.dshm-head`、`.dshm-title`、`.dshm-iconBtn`、`.dshm-footBtn`）。
- 根节点：撑满 tab 面板的 flex 列（`height:100%;display:flex;flex-direction:column`），
  内部 `.dshm-tabs` 子页条 + `.dshm-body` 滚动区保留。
- `props.visible === false`（面板折叠/非激活）时暂停 5s 状态轮询与子页数据刷新
  （替代原 `s.open` 门控）；daemon 启动期 2s 轮询逻辑原样保留。
- 5 个视图组件（DaemonCard/RuntimeCard/ConfigView/BanksView/LogsView）、zh/en 文案
  原样保留。
- store 缩为 `{ tab: Tab }`（保留 defineStore persist：子页选择跨重挂载持久）；
  删除 `open/close/toggle` actions。

### 4.3 badge 与模块级状态缓存

`badge: (ctx, scope, state) => string | null | undefined` 每次 tab 栏渲染都同步
调用，而 daemon 状态来自异步轮询 → 模块级缓存解耦：

```ts
const statusCache = { running: null as boolean | null }  // null = 未知
```

- `onOpen`：引用计数 +1，归一后启动 10s 后台轻量轮询（fetch /status → 更新缓存）。
  唯一使命：tab 开着但不可见时 badge 不失真。
- `onClose`：计数 -1，归零停止轮询（timer 清理）。
- 组件可见时的 5s 轮询同步更新同一缓存（单一事实源）。
- `badge()` 读缓存：`true → '●'`，`false → '○'`，`null → undefined`（无角标）。
- `badge`/`onOpen`/`onClose` 三项仅在 `ctx.betterSidebar.features.includes('badge')
  && includes('tabLifecycle')` 时加入 descriptor（v0.12+ 能力，本机 0.17.1 具备）。

多会话说明：`single: true` 去重作用于单会话 sidebar state；多会话各开一实例时
`onOpen` 可能多次触发，引用计数保证后台轮询只跑一份、全关才停。

### 4.4 i18n 自解析

去掉 `ctx.locale` 依赖（tab 组件只收 `TabComponentProps`，slot 系统不再注入 t）：

- 提升现有 `ConfigView` 内语言探测为 `isZh()`（`document.documentElement.lang === 'zh'
  || navigator.language.toLowerCase().startsWith('zh')`）。
- `tr(key)` 按 `isZh()` 选 zh/en 字典；tab `title()`、组件内 `t` 同源。
- 删除 `declare module '@deepseek-ai/dsh-client-ui-slots'` 的 LocaleNamespaceMap 合并。

## 5. 依赖与类型改动

### 5.1 package.json（版本 0.1.0 → 0.2.0）

- 新增 `peerDependencies`：`react ^18.2.0`（普通）、`dsh-better-sidebar ^0.12.0`
  （`peerDependenciesMeta.optional: true` —— 防双实例；未装时可正常加载，inject
  保证注册代码不跑）。
- 构建（scripts/build.mjs）零改动：client 半仅 `import type {} from
  'dsh-better-sidebar'`（type-only，构建纯度门放行，bundle 无运行时 require）。

### 5.2 types/client.d.ts（本仓库自带 ambient stubs）

- 新增 `declare module 'dsh-better-sidebar'` 最小面：
  `BetterSidebarService`（registerTab/features）、`TabDescriptor`、
  `TabComponentProps`、`SessionScope`、`SidebarTab`、`SidebarState`。
  形状以上文 service.d.ts 为准，只声明用到成员。
- `ClientContext` 增加 `betterSidebar` 成员（指向上述 stub 的 BetterSidebarService）。
- 删除 slots/locale 相关 stub：`./client-shapes`（SlotRegistryFace/LocaleFace）、
  `@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-locale/client`、
  `@deepseek-ai/dsh-client-ui-layout/client`、`@deepseek-ai/dsh-client-ui-sidebar/client`。

## 6. 测试计划（TDD，先写失败测试）

重写 `test/client.test.mjs`（现有两个用例测的是 slot 注册，随实现淘汰）：

1. bundle 可加载（stub module table），`exports.inject` deepEqual `['betterSidebar']`，
   `exports.apply` 为函数。
2. 假 ctx（`effect` 即执行 + `betterSidebar.registerTab` 捕获 descriptor +
   `features: ['badge','tabLifecycle']`）：断言 id/single===true/title() 返回字符串/
   icon 为函数/badge/onOpen/onClose 为函数/component 为函数。
3. features 不含 `'badge'`：descriptor 无 badge 键（gate 生效）。
4. 生命周期计数：onOpen×2 → 后台轮询启动一次；onClose×2 → 停止（假 setInterval/
   clearInterval 或可控 fetch 计数断言启停）。

`hindsight/api/daemon` 三个既有测试文件零改动。

## 7. 验证清单

- `pnpm build && pnpm typecheck && pnpm test` 全绿。
- profile 已 link 挂载（`C:\Users\johnl\.dsh\profiles\web\package.json` L16 依赖 +
  L40 bundles，已验证）→ rebuild + GUI 硬刷新（Ctrl+Shift+R）即生效。
- 手动：+ 菜单出现 Hindsight tab；设置页「侧边卡片」出现卡片（图标/标题/开关）；
  badge 随 daemon 状态变化（●/○）；4 子页数据正常；启动/停止 daemon 可用；
  硬刷新后 tab 恢复；禁用卡片后 + 菜单项消失且 openTab no-op。

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 注册不包 effect → HMR 残留 "already registered" | 注册一律包 `ctx.effect`（见 4.1） |
| value-import better-sidebar → 构建纯度门拦截 | 仅 `import type {}`；测试断言 bundle 无该 require |
| 组件卸载 ≠ tab 关闭（会话切换卸载组件） | 可见轮询随组件 effect 清理；后台轮询挂 onOpen/onClose 生命周期 |
| 多会话多实例 → 后台轮询泄漏 | 引用计数（见 4.3） |
| id 冲突 | `hindsight-manager:main` 带包前缀 |
| 皮肤不兼容 | 沿用现有 `--dsw-alias-*` 令牌，不新增硬编码颜色；不消费 `--dsw-specific-sidebar-fill` |
| 未装 better-sidebar | optional peer + inject 语义：client 半不激活；README 注明前置依赖 |
