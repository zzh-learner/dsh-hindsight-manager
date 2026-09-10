// src/hindsight.ts
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var CONFIG_KEYS = [
  { key: "serverMode", group: "server", envVar: "HINDSIGHT_SERVER_MODE" },
  { key: "apiUrl", group: "server", envVar: "HINDSIGHT_API_URL" },
  { key: "apiToken", group: "server", envVar: "HINDSIGHT_API_TOKEN" },
  { key: "apiPort", group: "server", envVar: "HINDSIGHT_API_PORT" },
  { key: "daemonProfile", group: "daemon", envVar: "HINDSIGHT_DAEMON_PROFILE" },
  { key: "daemonIdleTimeout", group: "daemon", envVar: "HINDSIGHT_DAEMON_IDLE_TIMEOUT" },
  { key: "embedVersion", group: "daemon", envVar: "HINDSIGHT_EMBED_VERSION" },
  { key: "embedPackagePath", group: "daemon", envVar: "HINDSIGHT_EMBED_PACKAGE_PATH" },
  { key: "bankId", group: "bank", envVar: "HINDSIGHT_BANK_ID" },
  { key: "dynamicBankId", group: "bank", envVar: "HINDSIGHT_DYNAMIC_BANK_ID" },
  { key: "bankIdTemplate", group: "bank", envVar: "HINDSIGHT_BANK_ID_TEMPLATE" },
  { key: "mapPathToBank", group: "bank" },
  { key: "resolveWorktrees", group: "bank", envVar: "HINDSIGHT_RESOLVE_WORKTREES" },
  { key: "optInOnly", group: "bank", envVar: "HINDSIGHT_OPT_IN_ONLY" },
  { key: "optInPaths", group: "bank", envVar: "HINDSIGHT_OPT_IN_PATHS" },
  { key: "banks", group: "bank" },
  { key: "harness", group: "server", envVar: "HINDSIGHT_HARNESS" },
  { key: "disabled", group: "server", envVar: "HINDSIGHT_DISABLED" },
  { key: "retainSessions", group: "memory", envVar: "HINDSIGHT_RETAIN_SESSIONS" },
  { key: "maxParallelRetains", group: "memory", envVar: "HINDSIGHT_MAX_PARALLEL_RETAINS" },
  { key: "retainTags", group: "memory", envVar: "HINDSIGHT_RETAIN_TAGS" },
  { key: "retainMetadata", group: "memory" },
  { key: "observationScopes", group: "memory", envVar: "HINDSIGHT_OBSERVATION_SCOPES" },
  { key: "autoReflect", group: "memory", envVar: "HINDSIGHT_AUTO_REFLECT" },
  { key: "reflectTimeoutMs", group: "memory", envVar: "HINDSIGHT_REFLECT_TIMEOUT_MS" },
  { key: "reflectToolTimeoutMs", group: "memory", envVar: "HINDSIGHT_REFLECT_TOOL_TIMEOUT_MS" },
  { key: "reflectBudget", group: "memory", envVar: "HINDSIGHT_REFLECT_BUDGET" },
  { key: "pageRefreshEveryTurns", group: "memory", envVar: "HINDSIGHT_PAGE_REFRESH_EVERY_TURNS" },
  { key: "pageTriggerType", group: "memory", envVar: "HINDSIGHT_PAGE_TRIGGER_TYPE" },
  { key: "pageTriggerCron", group: "memory", envVar: "HINDSIGHT_PAGE_TRIGGER_CRON" },
  { key: "autoSeed", group: "memory", envVar: "HINDSIGHT_AUTO_SEED" },
  { key: "seedLimit", group: "memory", envVar: "HINDSIGHT_SEED_LIMIT" },
  { key: "gitIngest", group: "memory", envVar: "HINDSIGHT_GIT_INGEST" },
  { key: "codebaseSurvey", group: "survey", envVar: "HINDSIGHT_CODEBASE_SURVEY" },
  { key: "surveyModel", group: "survey", envVar: "HINDSIGHT_SURVEY_MODEL" },
  { key: "surveyBudgetUsd", group: "survey", envVar: "HINDSIGHT_SURVEY_BUDGET_USD" },
  { key: "surveyRefreshCommits", group: "survey", envVar: "HINDSIGHT_SURVEY_REFRESH_COMMITS" },
  { key: "logLevel", group: "logging", envVar: "HINDSIGHT_LOG_LEVEL" }
];
var CONFIG_DEFAULTS = {
  serverMode: "cloud",
  apiUrl: "https://api.hindsight.vectorize.io",
  apiPort: 9077,
  daemonProfile: "coding-agent",
  harness: "opencode",
  disabled: false,
  retainSessions: true,
  maxParallelRetains: 10,
  reflectTimeoutMs: 12e4,
  reflectToolTimeoutMs: 33e4,
  reflectBudget: "high",
  autoReflect: true,
  pageRefreshEveryTurns: 10,
  pageTriggerType: "auto-refresh",
  autoSeed: true,
  seedLimit: 300,
  codebaseSurvey: true,
  surveyModel: "haiku",
  surveyBudgetUsd: 2,
  surveyRefreshCommits: 20,
  gitIngest: "message",
  logLevel: "info",
  optInOnly: false,
  dynamicBankId: true,
  resolveWorktrees: true
};
function maskToken(value) {
  if (typeof value !== "string" || value === "") return value === "" ? "" : value;
  return `configured (\u2022\u2022\u2022\u2022${value.slice(-4)})`;
}
function maskDeep(node) {
  if (Array.isArray(node)) return node.map(maskDeep);
  if (node !== null && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = /token|key|secret|password/i.test(k) && typeof v === "string" && v !== "" ? maskToken(v) : maskDeep(v);
    }
    return out;
  }
  return node;
}
function readRawConfig(path) {
  try {
    return { raw: JSON.parse(readFileSync(path, "utf8")) };
  } catch (e) {
    const err = e;
    if (err.code === "ENOENT") return { raw: {} };
    return { raw: {}, error: `invalid JSON: ${err.message}` };
  }
}
function buildConfigReport(harness, env = process.env) {
  const path = env.HINDSIGHT_CONFIG || join(homedir(), ".hindsight", "coding-agent.json");
  const { raw, error } = readRawConfig(path);
  const fileHarness = raw.harnesses ?? {};
  const layerHarness = fileHarness[harness] ?? {};
  const items = CONFIG_KEYS.map(({ key, group, envVar }) => {
    const inHarness = key in layerHarness;
    const inFile = key in raw;
    const envVal = envVar !== void 0 ? env[envVar] : void 0;
    const inEnv = envVal !== void 0 && envVal !== "";
    let source = "default";
    let value = CONFIG_DEFAULTS[key];
    if (inEnv && envVal !== void 0) {
      source = "env";
      value = coerceEnv(key, envVal);
    }
    if (inFile) {
      source = "file";
      value = raw[key];
    }
    if (inHarness) {
      source = "file:harness";
      value = layerHarness[key];
    }
    return { key, group, value: key === "apiToken" ? maskToken(value) : maskDeep(value), source, envVar };
  });
  const envActive = CONFIG_KEYS.filter((k) => {
    const v = k.envVar !== void 0 ? env[k.envVar] : void 0;
    return v !== void 0 && v !== "";
  }).map((k) => ({ key: k.key, envVar: k.envVar }));
  const bankSections = Object.entries(raw.banks ?? {}).map(([id, section]) => ({ id, keys: Object.keys(section) }));
  return {
    path,
    exists: existsSync(path),
    raw: Object.keys(raw).length ? maskDeep(raw) : null,
    items,
    envActive,
    error,
    bankSections,
    harnessSections: Object.keys(fileHarness)
  };
}
function coerceEnv(key, raw) {
  const BOOLS = /* @__PURE__ */ new Set(["dynamicBankId", "resolveWorktrees", "optInOnly", "disabled", "retainSessions", "autoReflect", "autoSeed", "codebaseSurvey"]);
  const LISTS = /* @__PURE__ */ new Set(["retainTags", "optInPaths"]);
  const NUMBERS = /* @__PURE__ */ new Set(["apiPort", "daemonIdleTimeout", "maxParallelRetains", "reflectTimeoutMs", "reflectToolTimeoutMs", "pageRefreshEveryTurns", "seedLimit", "surveyBudgetUsd", "surveyRefreshCommits"]);
  const v = raw.trim();
  if (BOOLS.has(key)) return ["1", "true", "yes", "on"].includes(v.toLowerCase());
  if (LISTS.has(key)) return v.split(",").map((s) => s.trim()).filter(Boolean);
  if (NUMBERS.has(key)) {
    const n = Number(v);
    return Number.isNaN(n) ? v : n;
  }
  return v;
}
function runtimeView(report) {
  const get = (key) => report.items.find((i) => i.key === key)?.value;
  const serverMode = typeof get("serverMode") === "string" ? get("serverMode") : "cloud";
  const apiPort = typeof get("apiPort") === "number" ? get("apiPort") : 9077;
  const apiUrl = serverMode === "daemon" ? `http://127.0.0.1:${apiPort}` : typeof get("apiUrl") === "string" ? get("apiUrl") : "https://api.hindsight.vectorize.io";
  return {
    serverMode,
    apiUrl,
    apiPort,
    daemonProfile: typeof get("daemonProfile") === "string" ? get("daemonProfile") : "coding-agent",
    embedVersion: typeof get("embedVersion") === "string" ? get("embedVersion") : void 0,
    embedPackagePath: typeof get("embedPackagePath") === "string" ? get("embedPackagePath") : void 0
  };
}
async function checkHealth(baseUrl) {
  const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2e3) });
    if (!res.ok) return { running: false, checkedAt, error: `health -> HTTP ${res.status}` };
    const health = await res.json().catch(() => void 0);
    let version;
    try {
      const vres = await fetch(`${baseUrl}/version`, { signal: AbortSignal.timeout(2e3) });
      if (vres.ok) version = await vres.json();
    } catch {
    }
    return { running: true, health, version, checkedAt };
  } catch (e) {
    return { running: false, checkedAt, error: e.message };
  }
}
function daemonPaths(view) {
  return {
    daemonLog: join(homedir(), ".hindsight", "profiles", `${view.daemonProfile}.log`),
    pluginLog: process.env.HINDSIGHT_LOG_FILE || join(tmpdir(), "hindsight-coding-agent", "plugin.log"),
    database: join(homedir(), ".pg0", "instances", `hindsight-embed-${view.daemonProfile}`)
  };
}
function run(cmd, args, timeoutMs, env = process.env) {
  return new Promise((resolveRun) => {
    let output = "";
    let settled = false;
    const child = spawn(cmd, args, { stdio: "pipe", env, windowsHide: true });
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({ code, output: output.trim() });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(-1);
    }, timeoutMs);
    child.stdout?.on("data", (d) => {
      output += d.toString();
    });
    child.stderr?.on("data", (d) => {
      output += d.toString();
    });
    child.on("exit", (code) => finish(code));
    child.on("error", (err) => {
      output += String(err);
      finish(-2);
    });
  });
}
function runDetached(cmd, args) {
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
function findDaemonStarter(startDir = dirname(fileURLToPath(import.meta.url))) {
  const rel = ["@vectorize-io", "hindsight-coding-agents", "dist", "daemon-start.js"];
  let dir = resolve(startDir);
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "node_modules", ...rel);
    if (existsSync(candidate)) return candidate;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  const profilesRoot = join(homedir(), ".dsh", "profiles");
  let profileNames = [];
  try {
    profileNames = readdirSync(profilesRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).filter((n) => n !== "node_modules");
  } catch {
  }
  const shared = join(profilesRoot, "node_modules", ...rel);
  if (existsSync(shared)) return shared;
  for (const name of profileNames) {
    const candidate = join(profilesRoot, name, "node_modules", ...rel);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
function embedCommand(view) {
  if (view.embedPackagePath) return { cmd: "uv", base: ["run", "--directory", view.embedPackagePath, "hindsight-embed"] };
  const version = view.embedVersion && view.embedVersion.length > 0 ? view.embedVersion : "latest";
  return { cmd: "uvx", base: [`hindsight-embed@${version}`] };
}
async function killPortProcess(port) {
  const collect = (child) => new Promise((resolve2) => {
    const chunks = [];
    child.stdout?.on("data", (d) => {
      chunks.push(d);
    });
    child.stderr?.on("data", (d) => {
      chunks.push(d);
    });
    child.on("error", () => resolve2(Buffer.concat(chunks)));
    child.on("exit", () => resolve2(Buffer.concat(chunks)));
  });
  if (process.platform === "win32") {
    const netstat = spawn("netstat", ["-ano", "-p", "tcp"], { stdio: "pipe", windowsHide: true });
    const text2 = (await collect(netstat)).toString("latin1");
    const pids2 = /* @__PURE__ */ new Set();
    const portRe = new RegExp("[:.]" + port + String.raw`\s+\S+\s+LISTENING\s+(\d+)`, "g");
    for (const m of text2.matchAll(portRe)) pids2.add(m[1]);
    const output2 = [];
    for (const pid of pids2) {
      const kill = spawn("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "pipe", windowsHide: true });
      const res = (await collect(kill)).toString("latin1");
      output2.push("taskkill /PID " + pid + ": " + (res.trim().split(/\r?\n/)[0] ?? ""));
    }
    return { killed: [...pids2].join(","), output: output2.join(" | ") };
  }
  const lsof = spawn("lsof", ["-ti", "tcp:" + port], { stdio: "pipe" });
  const text = (await collect(lsof)).toString("utf8");
  const pids = text.split(/\s+/).filter((p) => /^\d+$/.test(p));
  const output = [];
  for (const pid of pids) {
    const kill = spawn("kill", [pid], { stdio: "pipe" });
    await collect(kill);
    output.push("kill " + pid);
  }
  return { killed: pids.join(","), output: output.join(" | ") };
}
async function stopDaemon(view) {
  const steps = [];
  let output = "";
  let after = await checkHealth(view.apiUrl);
  if (process.platform === "win32" && after.running) {
    const kill = await killPortProcess(view.apiPort);
    steps.push("port-kill :" + view.apiPort + " (pid " + (kill.killed || "none") + ")");
    output += kill.output;
    for (let i = 0; i < 10; i++) {
      await new Promise((r2) => setTimeout(r2, 500));
      after = await checkHealth(view.apiUrl);
      if (!after.running) break;
    }
  }
  if (after.running) {
    const { cmd, base } = embedCommand(view);
    const args = [...base, "daemon", "--profile", view.daemonProfile, "stop"];
    const res = await run(cmd, args, 2e4);
    steps.push(cmd + " " + args.join(" ") + " -> exit " + String(res.code));
    output += (output === "" ? "" : " | ") + res.output.slice(-2e3);
    after = await checkHealth(view.apiUrl);
  }
  return {
    action: "stop",
    ok: !after.running,
    method: steps.join(" -> ") || "nothing to do (already stopped)",
    output: output.slice(-2e3),
    detail: after.running ? "daemon still responding after both stop paths" : void 0
  };
}
function startDaemon(view, harness, starter) {
  if (starter) {
    const ok2 = runDetached("node", [starter, "--harness", harness]);
    return { action: "start", ok: ok2, method: `node ${starter} --harness ${harness}`, detail: ok2 ? "starter spawned; daemon becomes healthy asynchronously" : "spawn failed" };
  }
  const { cmd, base } = embedCommand(view);
  const args = [...base, "daemon", "--profile", view.daemonProfile, "start"];
  const ok = runDetached(cmd, args);
  return { action: "start", ok, method: `${cmd} ${args.join(" ")}`, detail: ok ? "cli spawned; daemon becomes healthy asynchronously" : "spawn failed" };
}
async function hasUv(cmd = "uvx") {
  const probe = process.platform === "win32" ? "where" : "which";
  const { code } = await run(probe, [cmd], 5e3);
  return code === 0;
}
async function listBanks(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/v1/default/banks`, { signal: AbortSignal.timeout(5e3) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const j = await res.json();
    return { banks: j.banks ?? [] };
  } catch (e) {
    return { error: e.message };
  }
}
async function bankPages(baseUrl, bankId) {
  try {
    const url = `${baseUrl}/v1/default/banks/${encodeURIComponent(bankId)}/knowledge-base/tree`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5e3) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const j = await res.json();
    return { pages: j.roots ?? [] };
  } catch (e) {
    return { error: e.message };
  }
}
function tailFile(path, maxLines = 200) {
  try {
    const text = readFileSync(path, "utf8");
    const lines = text.split(/\r?\n/).filter((l) => l !== "");
    return { path, exists: true, lines: lines.slice(-maxLines) };
  } catch (e) {
    const err = e;
    if (err.code === "ENOENT") return { path, exists: false, lines: [], error: "file not found" };
    return { path, exists: true, lines: [], error: err.message };
  }
}
export {
  CONFIG_DEFAULTS,
  CONFIG_KEYS,
  bankPages,
  buildConfigReport,
  checkHealth,
  daemonPaths,
  embedCommand,
  findDaemonStarter,
  hasUv,
  killPortProcess,
  listBanks,
  maskToken,
  readRawConfig,
  runtimeView,
  startDaemon,
  stopDaemon,
  tailFile
};
