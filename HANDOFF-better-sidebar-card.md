# 交接文档：把其他工作区的项目转为 dsh-better-sidebar 侧边卡片

> **交接目的**：在另一个工作区中，把该工作区的项目（工具页 / 仪表盘 / 预览器 / Web 应用）封装成 DSH Web GUI 的侧边栏卡片（tab 或 file viewer）。
> **适用读者**：在新工作区接手的 agent 或开发者。本文自包含，不依赖原会话上下文。
> **信息来源**：本机实机检查（2025-08-31，dsh-better-sidebar v0.17.1 stable）+ 官方《外部插件接入指南》（docs/external-plugin-guide.md，仓库 main 分支）。
> **权威优先级**：磁盘上的插件源码/类型 > 官方指南 > 本文档。引用的本地路径均在本机已验证存在。

---

## 1. 机制总览（30 秒版）

- 「侧边卡片」不是独立扩展点。dsh-better-sidebar 在浏览器侧把自己发布为 **cordis 服务 `ctx.betterSidebar`**，任何插件都能调用：
  - `registerTab(descriptor)` —— 注册一种侧边栏页面，出现在侧栏 **+ 菜单**；
  - `registerFileViewer(descriptor)` —— 注册一种文件预览器，按扩展名/魔数接管文件打开。
- 内置 7 tab + 6 viewer 走**同一套 API**，第三方能力完全对等。
- 每个注册项**自动**出现在 DSH 设置页「侧边卡片」分区，成为一张带独立开关的小卡片（含你声明的二级设置），无需自己写设置 UI 和持久化。
- 因此「把项目转为侧边卡片」= **写一个配套 DSH web 插件**：client half 调 `registerTab`/`registerFileViewer`，需要后端时加 host half（HTTP/WS 路由）。

## 2. 本机环境事实（已验证）

| 项 | 值 |
|---|---|
| DSH Web profile | `C:\Users\johnl\.dsh\profiles\web`（package.json + cordis.patch.yml + node_modules，pnpm 管理） |
| 已装 better-sidebar | `dsh-better-sidebar@0.17.1`（stable 线；上游 alpha 已到 v0.18.0-alpha.0） |
| 本地权威类型声明 | `C:\Users\johnl\.dsh\profiles\web\node_modules\dsh-better-sidebar\lib\types\client\service.d.ts` |
| 本地真实样例（viewer 插件） | `C:\Users\johnl\.dsh\profiles\web\node_modules\@huanlin\dsh-plugin-better-sidebar-plugin-office`（client-only，注册 docx/xlsx/pptx viewer） |
| 全局设置 | `C:\Users\johnl\.dsh\settings.yaml` 中 `dsh-better-sidebar:` 段（openByDefault / agentOpenTools / titleBarScheme / defaultWidthPercent 等） |
| 本地 link: 开发先例 | profile package.json 中 `dsh-config-sync`、`dsh-hindsight-manager` 均为 `"link:C:/Users/johnl/Documents/<目录>"` |
| 插件挂载方式 | ① `dsh plugin --profile web add <pkg>`（读插件自带 `dsh.bundle.patch` 的 cordis.patch.yml 自动入 bundles）；② 手动：profile package.json `dependencies` 加 link: + 把包名加进 `dsh.profile.bundles` 数组，或直接在 profile 的 cordis.patch.yml 加 insert 行 |
| 重载行为 | **client half 改动浏览器硬刷新（Ctrl+Shift+R）即生效，无需重启 dsh web；host half 改动需重启** |

注意：`ctx.betterSidebar` **只存在于 client（浏览器）half**。host half 没有这个服务；host 侧需要 better-sidebar 数据时走它的 HTTP/WS 路由（`/sidebar/api/*`、`/sidebar/file`、`/sidebar/ws/*`）。

## 3. 决策：项目 → 哪种卡片形态

对接手的项目先回答三个问题：

1. **它是"页面"还是"打开某种文件"？**
   - 页面/工具/仪表盘 → **Tab**（`registerTab`）。
   - 按文件扩展名渲染内容（如 .csv、.ipynb、视频） → **FileViewer**（`registerFileViewer`）。
   - 两者可同时注册（一个插件可注册多个 tab/viewer）。
2. **前端怎么迁移？** 三种策略按优先级：
   - **A. React 组件移植**（最优体验）：项目组件是 React 18 的，直接搬进插件 client bundle，消费 `scope.sessionId/cwd` 与 `/sidebar/api` 数据。
   - **B. iframe 嵌入**（改造成本最低）：注册一个 tab，`component` 渲染自己的 `<iframe>` 指向项目已有服务（dev server 或 host half 静态路由）。自己的 iframe 自己控制 sandbox 属性；若项目需要真实 origin（模块/HMR），给非沙箱 iframe 即可（内置浏览器 tab 的 `browserAllowedLoopback` 允许清单与你的自定义 iframe 无关）。静态产物可学 dsh-video-preview：host half 自带路由（它带 /video 路由支持 HTTP Range）。
   - **C. 数据重写**：项目只是数据/逻辑（非 UI），把 UI 用 React 重写，逻辑模块作为依赖引入。
3. **需要后端吗？** 纯前端（读会话数据/公共 API）→ host half 可为空。需要本机进程、文件、自定义路由 → 写 host half（`src/index.ts` 的 apply 里挂路由；office 插件的 host half 就是空的）。

## 4. 插件工程骨架（最小可用）

```
my-card-plugin/
├─ package.json
├─ cordis.patch.yml        # 插件自带的 bundle patch（发布安装用；link: 开发可走 profile 手动挂载）
├─ src/index.ts            # host half：export const inject=[]; export function apply(){} —— 纯前端可空
└─ src/client/index.tsx    # client half：注册代码（核心）
```

### package.json（要点）

```jsonc
{
  "name": "my-card-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "dsh-better-sidebar": "^0.6.0",
    "react": "^18.2.0"
  },
  "peerDependenciesMeta": {
    "dsh-better-sidebar": { "optional": true }   // 未装 better-sidebar 时插件照常加载，注册代码安全跳过
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "inject": ["@deepseek-ai/dsh-client-runtime"], "platform": "web" }
  }
}
```

- `dsh-better-sidebar` 必须 **peerDependency**（避免两份服务实例）。
- 要上架 DSH 插件市场：deps/peerDeps/optionalDeps 不得出现 `cordis`，scripts 不得含 install 钩子。

### cordis.patch.yml

```yaml
- insert:
    - id: my-card-plugin
      name: 'my-card-plugin'
```

（better-sidebar 自己的 patch 带聚合 bundle 双挂载守卫的 `disabled: !!js` 表达式；若你的插件也可能被聚合 bundle 收录，可仿照它防"duplicate prefix route"。）

### src/client/index.tsx（完整注册示例）

```tsx
import { createElement } from 'react'
import type {} from 'dsh-better-sidebar'            // 触发 ctx.betterSidebar 类型合并（type-only，构建纯度门放行）
import type { Context } from '@deepseek-ai/cordis'

export const inject = ['betterSidebar']             // 服务就绪后才激活本插件

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: 'my-plugin:db',                             // 唯一 id，必须带包前缀防撞（重复 id 抛错）
    title: () => 'Database',
    order: 50,                                      // + 菜单排序（升序，默认 100）
    single: true,                                   // 单实例（= dedupeKey: () => id）
    settings: {                                     // 声明式设置（可选）：自动出现在设置页卡片齿轮弹窗
      pluginToggles: [{ key: 'pageSize', title: 'Page size', type: 'number', min: 1, max: 100, unit: 'rows' }],
    },
    badge: (_c, _s, state) => 3,                    // 可选角标（v0.12+，先 features.includes('badge') gate）
    onOpen: (tab, scope) => { startWatcher(scope.sessionId) },
    onClose: (tab, scope) => { stopWatcher(scope.sessionId) },  // 释放资源用 onClose（组件卸载≠tab关闭）
    component: ({ scope, tab, visible }) =>
      createElement(DbView, { sessionId: scope.sessionId, cwd: scope.cwd, visible }),
  }))

  ctx.effect(() => ctx.betterSidebar.registerFileViewer({
    id: 'my-plugin:csv',
    exts: ['csv'],                                  // [] = 兜底（内置 code 兜底是 priority -100）
    priority: 10,                                   // 高于内置（内置为 0）
    fetchStrategy: 'custom',
    load: async (path, scope, signal) => {
      const res = await fetch('/sidebar/api/fs.read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: scope.sessionId, path }),
        signal,
      })
      const { value } = await res.json()            // envelope：成功 { value }，失败 { ok:false, error:{code,message} }
      return parseCsv(value.content)
    },
    component: ({ customData, path }) => createElement(CsvGrid, { rows: customData, path }),
  }))
}
```

### 构建

- 工具链 **tsdown**（rolldown）。client 产物须是 `window.__ModuleLoader__.load({ id, factory })` 包装的 IIFE（office 插件 lib/client.js 即如此）。
- **最省事的起步方式**：clone 一个生态插件照抄构建配置（推荐 [dong-victor/dsh-better-sidebar-starter](https://github.com/dong-victor/dsh-better-sidebar-starter) 或任一 tab 插件），替换注册代码。
- **构建纯度门**：client bundle 禁止 value-import `dsh-better-sidebar`（含 ./client/service 子路径）与非白名单 `@deepseek-ai/*`/`@dsh-external/*`；`import type {}` 会被擦除、不受限。运行时一律走 `ctx.betterSidebar` 方法调用，不要 import 它的运行时符号。

## 5. 核心 API 速查

### TabDescriptor 关键字段

| 字段 | 说明 |
|---|---|
| `id` | 唯一，也是 SidebarTab.type；建议 `<pkg>:<feature>` |
| `title` / `icon` | 字符串或函数 / ReactNode 或 `(size)=>ReactNode` |
| `order` / `hidden` / `available` | + 菜单排序、隐藏、禁用谓词（available 只灰菜单，不拦 openTab） |
| `single` / `dedupeKey` | 去重策略；显式 dedupeKey 胜出 |
| `createTab` | 自铸 tab id（terminal 的 terminal:&lt;n&gt; 模式）；返回 null 拒绝创建 |
| `urlTarget` | v0.13+ 认领聊天外链点击（返回 true 的第一个注册者以 openTab({type,url}) 接管） |
| `badge` | v0.12+ tab 角标（每次 tab 栏渲染调用，保持廉价） |
| `onOpen/onActivate/onClose` | v0.12+ 生命周期（仅服务路径触发；dedupe 命中算 onActivate 不算 onOpen） |
| `settings` | 声明式设置（见下） |
| `component({ctx,scope,tab,visible,...})` | React 组件；`visible=false`（面板折叠/非激活）时应暂停轮询 |

### FileViewerDescriptor 关键字段

`id / title / icon / exts / priority / detect(path, head) / fetchStrategy('none'|'fsRead'|'mediaUrl'|'custom'|'binary-download') / load(path, scope, signal) / settings / component`。
fetchStrategy 决定组件拿什么：`content`（fsRead 文本）、`mediaUrl`（可直接 `<img src>`）、`customData`（custom load 返回值）。

### 服务方法（`ctx.betterSidebar.*`）

`registerTab / registerFileViewer / getTabs / getFileViewers / getTab / isTabEnabled / isViewerEnabled / matchFileViewer / openTab(seed, scope?) / closeTab / subscribe`；
v0.12+：`version`（本机 '0.17.1'）、`features`（'badge'|'tabLifecycle'|'updateTab'|'openFile'|'targetedOpen'|'stateSubscription'|'tabMeta'|'pluginSettings'|'urlTarget'|'settingSelect'|'floatWindows'，只增不删）、`getSnapshot / subscribeState / updateTab(tabId,{title,path,meta}) / activateTab / openFile(scope,path,title)`。**新 API 先 `features.includes(...)` gate 再用**。

`OpenTabSeed = { type, title?, path?, diff?, id?, url?, meta? }`；`meta` 随 tab 持久化（刷新恢复）。

### 页面内取数据（与内置视图同源同权）

`POST /sidebar/api/<method>`，body `{ sessionId, cwd?, ...参数 }`；成功 `{ value }`，失败 `{ ok:false, error }`。常用：`session.cwd`、`fs.tree`、`fs.read`（文本 `{kind:'text',content,truncated}` / 二进制 `{kind:'binary',size,head:base64前4KB}`）、`fs.write`、`git.*`、`settings.get/update`。媒体/下载字节走 `/sidebar/file?sessionId=&path=[&download=1]`。
⚠️ **工作区围栏**：文件类路由默认要求路径落在该会话 cwd 内（realpath 校验，越界 403）；`workspaceFence` 偏好可关。

### 声明式设置

- `settings.toggles`：行 key **必须是宿主 PrefsSchema 字段**（内置键：autoOpenSubagent / agentTerminalTools / agentOpenTools / terminalFontFamily / terminalFontSize / editorExplorer / workspaceFence / htmlViewerNoSandbox / htmlViewerDefaultUnsafe / browserNoSandbox / browserInterceptLinks / browserInterceptHttp / browserInterceptHttps）。
- `settings.pluginToggles`（推荐，v0.12+）：key 插件局部，值持久化在 `pluginSettings[<descriptor id>]`，行控件 switch/text/number/select。
- `settings.render`：完全自定义设置面板（props 含 pluginSettings、updatePluginSetting(key,value)、close()）。

### 皮肤兼容（必守）

所有颜色消费 DSH 令牌（`var(--dsw-alias-bg-layer-1)`、`--dsw-alias-*`、`--ds-*`、`--dsw-font-*`），**零硬编码颜色**即自动兼容全部 10 款皮肤。**绝不消费 `--dsw-specific-sidebar-fill`**（宿主左导航专属）。面板宽度变量 `--dsh-sidebar-width/height`。

## 6. 注册与联调（本机实测路径）

**本地开发（link 模式，推荐迭代用）：**
1. 在 profile 的 `C:\Users\johnl\.dsh\profiles\web\package.json`：`dependencies` 加 `"my-card-plugin": "link:C:/<你的插件绝对路径>"`，并把 `"my-card-plugin"` 追加到 `dsh.profile.bundles` 数组（或改在 profile 的 cordis.patch.yml 加 insert 行，二选一，勿双挂载）。
2. profile 目录执行 `pnpm install`。
3. 插件目录 `pnpm build` 产出 lib/。
4. 浏览器**硬刷新** GUI（Ctrl+Shift+R）。此后只改 client half：重新 build + 硬刷新即可，无需重启 dsh web；改 host half 需重启 dsh web。

**正式安装**：`dsh plugin --profile web add my-card-plugin`（发布 npm 后；git 仓库也可以 git+https 形式装，profile 里已有先例）。

**验证清单**：+ 菜单出现新 tab；设置页「侧边卡片」出现新卡片（含图标/标题/开关/二级设置）；打开文件走 viewer；硬刷新后 tab 状态恢复（meta 持久化）；禁用卡片后 + 菜单项消失且 openTab no-op。

## 7. 陷阱清单（官方指南提炼，全部实锤规则）

1. **注册必须包 `ctx.effect(...)`**——否则 HMR/禁用后注册残留，下次激活抛 "already registered"。
2. **不要 value-import `dsh-better-sidebar`**（任何子路径）——构建纯度门拦截；只 `import type {}`。
3. **Context 从 `@deepseek-ai/cordis` 导入**（v0.15.2+ 统一类型基底；公开版 cordis 不再被依赖）。
4. **服务只在 client half**；host half 走 /sidebar/api 路由。
5. **host prefs 字段限制**：settings.toggles 的 key 不在宿主 schema 会被设置 seam 丢弃——自己的设置一律用 pluginToggles/render。
6. **id 冲突抛错**；用包前缀。
7. **组件卸载 ≠ tab 关闭**（会话切换也卸载组件）：资源释放放 `onClose`；轮询按 `visible` 暂停。
8. **浮窗（v0.16+）对组件基本透明**，但 tab 头区域渲染 portal 弹层时需同源守卫防拖拽误判（`event.currentTarget.contains(event.target)`）。
9. **重复挂载**：同一包被聚合 bundle 收录又单独安装 → "duplicate prefix route" 启动失败；patch 里可加 disabled 守卫表达式（见 §4）。
10. **i18n**：标题传字符串或 `() => string`，不要依赖宿主内部 t()。
11. **client 声明图零 Node 依赖**（v0.12+）：纯浏览器插件走 `dsh-better-sidebar/client/service` 类型路径，无需 @types/node。
12. **设置页关闭语义**：禁用只拦新开（已开 tab 保留）；禁用 viewer 被匹配跳过、文件落到下一匹配。

## 8. 参考实现与资料

**本地（最快）：**
- 类型真相：`…\node_modules\dsh-better-sidebar\lib\types\client\service.d.ts`
- 内置实现源码（随包发布）：`…\dsh-better-sidebar\src\client\builtins\`（tabs.tsx / viewers.tsx）、`src\client\service.ts`、`src\client\api.ts`（fetch 模式照抄）
- 真实三方样例：office 插件（viewer，client-only 空宿主）

**线上：**
- 官方接入指南（最权威，本文大量出处）：<https://github.com/omdsh-dev/DSH-better-sidebar/blob/main/docs/external-plugin-guide.md>
- 主仓库/发版说明：<https://github.com/omdsh-dev/DSH-better-sidebar>
- 生态插件目录（28+，按需找同类实现）：<https://github.com/topics/dsh-better-sidebar>
- 起步模板：dong-victor/dsh-better-sidebar-starter；宿主路由先例：zemul/dsh-video-preview

## 9. 动手前对目标项目的检查清单

- [ ] 项目形态：页面（→ tab）还是文件渲染（→ viewer）？两者都要？
- [ ] 前端栈：React 18 可直接移植；Vue/其他 → iframe 嵌入或重写；静态产物 → host half 路由伺服。
- [ ] 数据源：会话文件（/sidebar/api，注意 cwd 围栏）、项目自带后端（host half 反代/自路由）、公共 HTTP？
- [ ] 实例策略：单实例（single）还是多开（dedupeKey 按路径/id）？
- [ ] 生命周期：tab 关闭时要停什么（onClose）？轮询是否随 visible 暂停？
- [ ] 设置项：列出要暴露的开关/数字/下拉 → pluginToggles；特殊 UI → settings.render。
- [ ] agent 联动：要不要让模型主动打开/更新卡片（openTab/updateTab；宿主已有 sidebar_open 工具走 agent-opens，自有工具在 host half 注册）？
- [ ] id 前缀与图标（react-icons 已在宿主生态可用）。
- [ ] 皮肤：颜色是否全走 `--dsw-alias-*` 令牌？

---
*交接来源会话：DSH Web GUI（deepseek-harness 工作区），2025-08-31。*
