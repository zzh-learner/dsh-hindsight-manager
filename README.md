# dsh-hindsight-manager

DSH Web 插件：为 @vectorize-io/hindsight-coding-agents（即 🧠 Hindsight 记忆插件）提供一个侧栏管理面板——查看它的全部配置项与运行状态，并能启动 / 停止本地 daemon。

## 功能

**状态**（侧栏底部「Hindsight」按钮 → 右侧停靠面板）

- daemon 运行状态徽章（运行中 / 已停止 / 启动中），5 秒自动轮询
- API 地址、profile、端口、API 版本（/health + /version 实时探测）
- 数据库路径（~/.pg0/instances/…）、插件日志 / daemon 日志路径、启动器位置
- **启动 / 停止 daemon** 按钮

**配置**（~/.hindsight/coding-agent.json）

- 全部 38 个配置项的生效值，按 服务器 / Daemon / 记忆库解析 / 记忆行为 / 代码库调研 / 日志 分组
- 每项标注来源：默认值 / 环境变量 / 文件 / 文件·harness 覆盖（分层与 hindsight 自身 loadConfig 一致：env ← file ← file.harnesses.*，后写者胜）
- 生效中的 HINDSIGHT_* 环境变量覆盖、banks.* / harnesses.* 小节摘要
- 原始 JSON 查看（apiToken 等敏感字段自动脱敏）

**记忆库**

- 全部 bank 列表（事实数、最后写入时间，按活跃度排序）
- 展开任一 bank 查看其知识页树（knowledge-base/pages）

**日志**

- 插件日志（%TEMP%/hindsight-coding-agent/plugin.log）与 daemon 日志（~/.hindsight/profiles/[profile].log）各取末尾 200 行

## Daemon 控制实现

- **启动**：优先复用已安装 hindsight 插件自带的 dist/daemon-start.js --harness dsh（它负责 profile create --merge、LLM 环境检测、健康轮询——与 hindsight 插件自身启动 daemon 的路径完全一致）；找不到时回退 uvx hindsight-embed@latest daemon --profile <p> start。启动是异步的：面板进入「启动中…」状态，每 2 秒轮询 /health 直到健康（上限 120 秒）。
- **停止**：Windows 上先用端口杀（netstat -ano 找 :port LISTENING 的 PID → taskkill /T /F）。原因：hindsight-embed CLI 的 daemon stop 在中文 Windows 上会崩溃——它以严格 UTF-8 读取 netstat 输出，GBK 本地化文本让 reader 线程抛 UnicodeDecodeError，stdout 变成 None。这里用 latin1 宽松解码只解析 ASCII 的端口/PID 列。CLI stop 仍作为非 Windows 首选与兜底路径。

## 安装 / 卸载

```powershell
# 安装（link 方式，源码改动 rebuild 后重启 GUI 生效）
npx @deepseek-ai/dsh plugin --profile web add C:/Users/johnl/Documents/dsh-hindsight-manager

# 卸载
npx @deepseek-ai/dsh plugin --profile web remove dsh-hindsight-manager
```

安装后重启 dsh web GUI，侧栏底部会出现 🧠「Hindsight」按钮。

## 开发

```powershell
pnpm install
pnpm build        # lib/index.js + lib/hindsight.js + dist/client.js（esbuild 双端构建）
pnpm typecheck    # tsc（类型来自本仓库 types/ 下的精准 ambient stubs）
pnpm test         # 单元 + 路由测试（不触碰真实 daemon）

# daemon 停止/启动完整回路实测（会真实停掉再拉起 daemon）
$env:DSHM_E2E_DAEMON = "1"; node --test test/daemon.test.mjs
```

### 结构

| 文件 | 职责 |
| --- | --- |
| src/hindsight.ts | 纯逻辑：配置读取/分层/脱敏、daemon 健康探测、启动/停止、bank API、日志尾部 |
| src/index.ts | node 半：在 ctx.webServer 注册 /dsh-hindsight-manager/api/* JSON 路由 |
| src/client.tsx | client 半：侧栏 footer 按钮（sidebar.footer.action 槽）+ 右侧停靠面板（shell.overlay 槽） |
| types/ | cordis / dsh-client-runtime / slots 的最小 ambient 类型声明（本机无 harness 源码树） |

### API 一览（node 半）

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | /dsh-hindsight-manager/api/status | daemon 健康 + 版本 + 运行视图 + 路径 + uvx 可用性 |
| GET | /dsh-hindsight-manager/api/config | 配置报告（生效值 + 来源 + 脱敏原始 JSON） |
| GET | /dsh-hindsight-manager/api/banks | 记忆库列表（事实数 / 最后写入） |
| GET | /dsh-hindsight-manager/api/banks/:id/pages | 该 bank 的知识页树 |
| GET | /dsh-hindsight-manager/api/logs?lines=200 | 插件日志 + daemon 日志尾部 |
| POST | /dsh-hindsight-manager/api/daemon/start | 启动 daemon（异步，靠 /status 轮询确认） |
| POST | /dsh-hindsight-manager/api/daemon/stop | 停止 daemon（Windows 端口杀优先，CLI 兜底） |
