"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");

// src/client-store.ts
function defineStore(decl) {
  return {
    spec: decl,
    create(scopeKey) {
      const persistKey = decl.persist === void 0 ? void 0 : scopeKey === void 0 ? decl.persist : `${decl.persist}.${scopeKey}`;
      let state = decl.init();
      if (persistKey !== void 0 && typeof localStorage !== "undefined") {
        try {
          const raw = localStorage.getItem(persistKey);
          if (raw !== null) state = JSON.parse(raw);
        } catch (error) {
          console.error(`snapshot store '${persistKey}' rehydration failed:`, error);
        }
      }
      const listeners = /* @__PURE__ */ new Set();
      const update = (mutate) => {
        const draft = structuredClone(state);
        mutate(draft);
        state = draft;
        for (const fn of [...listeners]) fn();
      };
      const actions = {};
      for (const key of Object.keys(decl.actions)) {
        const mutate = decl.actions[key];
        actions[key] = (...params) => {
          update((draft) => {
            mutate(draft, ...params);
          });
        };
      }
      return {
        actions,
        getSnapshot: () => state,
        subscribe: (fn) => {
          listeners.add(fn);
          return () => {
            listeners.delete(fn);
          };
        },
        clearPersisted: () => {
          if (persistKey === void 0 || typeof localStorage === "undefined") return;
          try {
            localStorage.removeItem(persistKey);
          } catch {
          }
        }
      };
    }
  };
}

// src/client.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var API = "/dsh-hindsight-manager/api";
var zh = {
  "panel.title": "Hindsight \u8BB0\u5FC6\u7BA1\u7406",
  "tab.status": "\u72B6\u6001",
  "tab.config": "\u914D\u7F6E",
  "tab.banks": "\u8BB0\u5FC6\u5E93",
  "tab.logs": "\u65E5\u5FD7",
  "daemon.running": "\u8FD0\u884C\u4E2D",
  "daemon.stopped": "\u5DF2\u505C\u6B62",
  "daemon.starting": "\u542F\u52A8\u4E2D\u2026",
  "daemon.stopping": "\u505C\u6B62\u4E2D\u2026",
  "daemon.start": "\u542F\u52A8 daemon",
  "daemon.stop": "\u505C\u6B62 daemon",
  "daemon.refresh": "\u5237\u65B0",
  "daemon.url": "\u5730\u5740",
  "daemon.profile": "Profile",
  "daemon.port": "\u7AEF\u53E3",
  "daemon.version": "API \u7248\u672C",
  "daemon.mode": "\u670D\u52A1\u6A21\u5F0F",
  "daemon.unreachable": "\u65E0\u6CD5\u8FDE\u63A5",
  "daemon.noUv": "\u672A\u68C0\u6D4B\u5230 uvx\uFF08daemon \u6A21\u5F0F\u9700\u8981 uv\uFF09",
  "daemon.noStarter": "\u672A\u627E\u5230 hindsight \u63D2\u4EF6\u7684 daemon-start.js\uFF0C\u542F\u52A8\u5C06\u56DE\u9000\u5230 uvx \u76F4\u8FDE",
  "runtime.paths": "\u8DEF\u5F84",
  "runtime.starter": "\u542F\u52A8\u5668",
  "runtime.db": "\u6570\u636E\u5E93",
  "config.file": "\u914D\u7F6E\u6587\u4EF6",
  "config.missing": "\u6587\u4EF6\u4E0D\u5B58\u5728\uFF08\u5168\u90E8\u4F7F\u7528\u9ED8\u8BA4\u503C\uFF09",
  "config.env": "\u751F\u6548\u7684\u73AF\u5883\u53D8\u91CF\u8986\u76D6",
  "config.banks": "\u6BCF\u8BB0\u5FC6\u5E93\u8986\u76D6\uFF08banks.*\uFF09",
  "config.harnesses": "\u6BCF harness \u8986\u76D6\uFF08harnesses.*\uFF09",
  "config.raw": "\u539F\u59CB JSON\uFF08\u4EE4\u724C\u5DF2\u8131\u654F\uFF09",
  "config.empty": "\uFF08\u7A7A\uFF09",
  "config.error": "\u914D\u7F6E\u89E3\u6790\u5931\u8D25",
  "src.default": "\u9ED8\u8BA4",
  "src.env": "\u73AF\u5883\u53D8\u91CF",
  "src.file": "\u6587\u4EF6",
  "src.file:harness": "\u6587\u4EF6\xB7harness",
  "banks.error": "\u8BFB\u53D6\u5931\u8D25\uFF08daemon \u672A\u8FD0\u884C\uFF1F\uFF09",
  "banks.empty": "\u6CA1\u6709\u8BB0\u5FC6\u5E93",
  "banks.facts": "\u4E8B\u5B9E\u6570",
  "banks.lastWrite": "\u6700\u540E\u5199\u5165",
  "banks.pages": "\u77E5\u8BC6\u9875",
  "banks.pages.none": "\u65E0\u77E5\u8BC6\u9875",
  "banks.pages.load": "\u5C55\u5F00\u67E5\u770B\u77E5\u8BC6\u9875",
  "logs.plugin": "\u63D2\u4EF6\u65E5\u5FD7\uFF08plugin.log\uFF09",
  "logs.daemon": "daemon \u65E5\u5FD7\uFF08profiles/<profile>.log\uFF09",
  "logs.missing": "\u6587\u4EF6\u4E0D\u5B58\u5728",
  "logs.refresh": "\u5237\u65B0\u65E5\u5FD7",
  "common.retry": "\u91CD\u8BD5",
  "common.loading": "\u52A0\u8F7D\u4E2D\u2026",
  "common.never": "\u4ECE\u672A"
};
var en = {
  "panel.title": "Hindsight memory manager",
  "tab.status": "Status",
  "tab.config": "Config",
  "tab.banks": "Banks",
  "tab.logs": "Logs",
  "daemon.running": "Running",
  "daemon.stopped": "Stopped",
  "daemon.starting": "Starting\u2026",
  "daemon.stopping": "Stopping\u2026",
  "daemon.start": "Start daemon",
  "daemon.stop": "Stop daemon",
  "daemon.refresh": "Refresh",
  "daemon.url": "URL",
  "daemon.profile": "Profile",
  "daemon.port": "Port",
  "daemon.version": "API version",
  "daemon.mode": "Server mode",
  "daemon.unreachable": "Unreachable",
  "daemon.noUv": "uvx not found (daemon mode requires uv)",
  "daemon.noStarter": "hindsight daemon-start.js not found; start falls back to raw uvx",
  "runtime.paths": "Paths",
  "runtime.starter": "Starter",
  "runtime.db": "Database",
  "config.file": "Config file",
  "config.missing": "File missing (all defaults)",
  "config.env": "Active env overrides",
  "config.banks": "Per-bank overrides (banks.*)",
  "config.harnesses": "Per-harness overrides (harnesses.*)",
  "config.raw": "Raw JSON (tokens masked)",
  "config.empty": "(empty)",
  "config.error": "Config parse failed",
  "src.default": "default",
  "src.env": "env",
  "src.file": "file",
  "src.file:harness": "file\xB7harness",
  "banks.error": "Failed to read (daemon down?)",
  "banks.empty": "No memory banks",
  "banks.facts": "Facts",
  "banks.lastWrite": "Last write",
  "banks.pages": "Knowledge pages",
  "banks.pages.none": "No pages",
  "banks.pages.load": "Expand for knowledge pages",
  "logs.plugin": "Plugin log (plugin.log)",
  "logs.daemon": "Daemon log (profiles/<profile>.log)",
  "logs.missing": "File not found",
  "logs.refresh": "Refresh logs",
  "common.retry": "Retry",
  "common.loading": "Loading\u2026",
  "common.never": "never"
};
function isZh() {
  if (typeof document !== "undefined" && document.documentElement.lang === "zh") return true;
  const nav = typeof navigator !== "undefined" ? navigator.language : "en";
  return nav.toLowerCase().startsWith("zh");
}
function tr(key) {
  return (isZh() ? zh : en)[key];
}
async function api(sub, init) {
  const res = await fetch(API + sub, { ...init, headers: { "content-type": "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${sub}`);
  return await res.json();
}
function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtValue(v) {
  if (v === void 0) return "\u2014";
  if (v === null) return "null";
  if (typeof v === "string") return v === "" ? '""' : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
var GROUP_LABELS_ZH = {
  server: "\u670D\u52A1\u5668",
  daemon: "Daemon",
  bank: "\u8BB0\u5FC6\u5E93\u89E3\u6790",
  memory: "\u8BB0\u5FC6\u884C\u4E3A",
  survey: "\u4EE3\u7801\u5E93\u8C03\u7814",
  logging: "\u65E5\u5FD7"
};
var GROUP_LABELS_EN = {
  server: "Server",
  daemon: "Daemon",
  bank: "Bank resolution",
  memory: "Memory behavior",
  survey: "Codebase survey",
  logging: "Logging"
};
var CSS = [
  ".dshm-tabs{display:flex;gap:2px;padding:6px 8px 0;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none}",
  ".dshm-tab{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:6px 10px;border-radius:8px 8px 0 0;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}",
  ".dshm-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  ".dshm-tab[data-active=true]{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary)}",
  ".dshm-body{flex:1;overflow-y:auto;padding:10px 12px 20px;font-size:12px;color:var(--dsw-alias-label-primary)}",
  ".dshm-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px;margin-bottom:10px;background:var(--dsw-alias-bg-layer-3)}",
  ".dshm-cardTitle{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);margin-bottom:8px;display:flex;align-items:center;gap:8px}",
  ".dshm-row{display:flex;gap:8px;padding:3px 0;align-items:baseline}",
  ".dsvm-row{display:flex;gap:8px;padding:3px 0;align-items:baseline}",
  ".dshm-k{flex:none;width:110px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".dshm-v{flex:1;min-width:0;word-break:break-all;color:var(--dsw-alias-label-primary)}",
  ".dshm-badge{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 8px;border-radius:10px;font-size:11px;font-weight:600}",
  ".dshm-badge[data-s=running]{background:rgba(46,160,67,.16);color:#3fb950}",
  ".dshm-badge[data-s=stopped]{background:rgba(248,81,73,.14);color:#f85149}",
  ".dshm-badge[data-s=busy]{background:rgba(210,153,34,.16);color:#d29924}",
  ".dshm-badge[data-s=muted]{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-tertiary)}",
  ".dshm-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}",
  ".dshm-btn{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:13px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}",
  ".dshm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
  ".dshm-btn:disabled{opacity:.45;cursor:default}",
  ".dshm-btn[data-primary=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}",
  ".dshm-secTitle{font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary);text-transform:uppercase;letter-spacing:.04em;margin:12px 0 4px}",
  ".dshm-kv{display:grid;grid-template-columns:190px 1fr;gap:2px 10px}",
  ".dshm-kv .dshm-k{width:auto}",
  ".dshm-src{display:inline-block;min-width:44px;text-align:center;font-size:10px;line-height:16px;padding:0 5px;border-radius:4px;background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-tertiary);flex:none}",
  ".dshm-src[data-s=env]{background:rgba(63,185,80,.15);color:#3fb950}",
  ".dshm-src[data-s=file]{background:rgba(88,166,255,.15);color:#58a6ff}",
  ".dshm-src[data-s=file:harness]{background:rgba(210,153,34,.18);color:#d29924}",
  ".dshm-table{width:100%;border-collapse:collapse;font-size:12px}",
  ".dshm-table th{text-align:left;color:var(--dsw-alias-label-tertiary);font-weight:500;padding:4px 6px;border-bottom:1px solid var(--dsw-alias-border-l2)}",
  ".dshm-table td{padding:4px 6px;border-bottom:1px solid var(--dsw-alias-border-l2);vertical-align:top}",
  ".dshm-bankRow{cursor:pointer}",
  ".dshm-bankRow:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  ".dshm-pages{padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}",
  ".dshm-page{display:flex;gap:6px;padding:2px 0;align-items:baseline}",
  ".dshm-pageName{color:var(--dsw-alias-brand-primary);flex:none}",
  ".dshm-pageDesc{color:var(--dsw-alias-label-tertiary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".dshm-log{font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:280px;overflow-y:auto;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px;color:var(--dsw-alias-label-secondary)}",
  ".dshm-muted{color:var(--dsw-alias-label-tertiary)}",
  ".dshm-path{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}",
  ".dshm-err{color:#f85149}",
  ".dshm-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}",
  ".dshm-warn{border:1px solid rgba(210,153,34,.4);background:rgba(210,153,34,.08);color:#d29924;border-radius:8px;padding:6px 10px;font-size:11px;margin-top:8px}",
  ".dshm-pre{font-family:ui-monospace,Consolas,monospace;font-size:11px;white-space:pre-wrap;word-break:break-all;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px;max-height:260px;overflow-y:auto;color:var(--dsw-alias-label-secondary)}"
].join("");
if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="dsh-hindsight-manager"]') === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-hindsight-manager";
  tag.dataset.pluginCss = "dsh-hindsight-manager";
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
var BrainIcon = (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: props.size ?? 16, height: props.size ?? 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", "aria-hidden": "true", children: [
  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9.5 3a3 3 0 0 0-3 3 3 3 0 0 0-2.4 4.8A3 3 0 0 0 5 16.5 3 3 0 0 0 9.5 21c1 0 2-.6 2.5-1.5V4.5C11.5 3.7 10.6 3 9.5 3z" }),
  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M14.5 3a3 3 0 0 1 3 3 3 3 0 0 1 2.4 4.8A3 3 0 0 1 19 16.5 3 3 0 0 1 14.5 21c-1 0-2-.6-2.5-1.5" })
] });
function DaemonCard(props) {
  const { t, status, busy } = props;
  const running = status?.health.running ?? false;
  const state = busy !== null ? busy : running ? "running" : "stopped";
  const label = busy === "start" ? t("daemon.starting") : busy === "stop" ? t("daemon.stopping") : running ? t("daemon.running") : t("daemon.stopped");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-cardTitle", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dshm-badge", "data-s": state === "running" || state === "start" ? "busy" : state === "stop" ? "busy" : state, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-dot" }),
        label
      ] }),
      status?.health.version && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-muted", children: status.health.version.api_version })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-kv", children: [
      status && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-k dshm-muted", children: t("daemon.mode") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-v", children: status.runtime.serverMode }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-k dshm-muted", children: t("daemon.url") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-v dshm-path", children: status.runtime.apiUrl }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-k dshm-muted", children: t("daemon.profile") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-v", children: status.runtime.daemonProfile }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-k dshm-muted", children: t("daemon.port") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-v", children: status.runtime.apiPort })
      ] }),
      !status && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-v dshm-muted", children: t("common.loading") })
    ] }),
    status && !status.uv && status.runtime.serverMode === "daemon" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-warn", children: t("daemon.noUv") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshm-btn", "data-primary": "true", disabled: busy !== null || running, onClick: props.onStart, children: t("daemon.start") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshm-btn", disabled: busy !== null || !running, onClick: props.onStop, children: t("daemon.stop") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshm-btn", disabled: busy !== null, onClick: props.onRefresh, children: t("daemon.refresh") })
    ] })
  ] });
}
function RuntimeCard(props) {
  const { t, status } = props;
  if (!status) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-cardTitle", children: t("runtime.paths") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-kv", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-k dshm-muted", children: t("runtime.db") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-v dshm-path", children: status.paths.database }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-k dshm-muted", children: t("runtime.starter") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-v dshm-path", children: status.starter ?? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-muted", children: t("daemon.noStarter") }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-k dshm-muted", children: "plugin.log" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-v dshm-path", children: status.paths.pluginLog }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-k dshm-muted", children: "daemon.log" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-v dshm-path", children: status.paths.daemonLog })
    ] })
  ] });
}
var CONFIG_GROUP_ORDER = ["server", "daemon", "bank", "memory", "survey", "logging"];
function ConfigView(props) {
  const { t, cfg } = props;
  if (props.err !== null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-err", children: props.err });
  if (cfg === null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-muted", children: t("common.loading") });
  const groups = CONFIG_GROUP_ORDER.map((g) => ({ g, items: cfg.items.filter((i) => i.group === g) })).filter((x) => x.items.length > 0);
  const zhUi = isZh();
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-cardTitle", children: t("config.file") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-path", children: cfg.path }),
      cfg.error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-err", style: { marginTop: 4 }, children: [
        t("config.error"),
        ": ",
        cfg.error
      ] }),
      !cfg.exists && !cfg.error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-muted", style: { marginTop: 4 }, children: t("config.missing") }),
      cfg.envActive.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-secTitle", children: t("config.env") }),
        cfg.envActive.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-src", "data-s": "env", children: t("src.env") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dshm-v", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: e.key }),
            " \u2190 ",
            e.envVar
          ] })
        ] }, e.key))
      ] }),
      cfg.harnessSections.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-secTitle", children: t("config.harnesses") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-v", children: cfg.harnessSections.join(", ") })
      ] }),
      cfg.bankSections.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-secTitle", children: t("config.banks") }),
        cfg.bankSections.map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-row", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dshm-v", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: b.id }),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-muted", children: b.keys.join(", ") })
        ] }) }, b.id))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { style: { marginTop: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { className: "dshm-muted", style: { cursor: "pointer" }, children: t("config.raw") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: "dshm-pre", style: { marginTop: 6 }, children: cfg.raw === null ? t("config.empty") : JSON.stringify(cfg.raw, null, 2) })
      ] })
    ] }),
    groups.map(({ g, items }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-cardTitle", children: (zhUi ? GROUP_LABELS_ZH : GROUP_LABELS_EN)[g] ?? g }),
      items.map((i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-k", title: i.key, children: i.key }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-src", "data-s": i.source, title: i.envVar ?? "", children: t("src." + i.source) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-v", children: fmtValue(i.value) })
      ] }, i.key))
    ] }, g))
  ] });
}
function BanksView(props) {
  const { t } = props;
  const [expanded, setExpanded] = (0, import_react.useState)({});
  if (props.err !== null) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-err", children: [
    t("banks.error"),
    ": ",
    props.err
  ] });
  if (props.banks === null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-muted", children: t("common.loading") });
  if (props.banks.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-muted", children: t("banks.empty") });
  const rows = [...props.banks].sort((a, b) => (b.last_write_at ?? b.updated_at ?? "").localeCompare(a.last_write_at ?? a.updated_at ?? ""));
  const toggle = async (id) => {
    if (expanded[id] !== void 0) {
      setExpanded((m) => ({ ...m, [id]: void 0 }));
      return;
    }
    setExpanded((m) => ({ ...m, [id]: "loading" }));
    try {
      const r = await api(`/banks/${encodeURIComponent(id)}/pages`);
      setExpanded((m) => ({ ...m, [id]: r.error ? "error" : r.pages ?? [] }));
    } catch {
      setExpanded((m) => ({ ...m, [id]: "error" }));
    }
  };
  const renderNodes = (nodes, depth) => nodes.flatMap((n) => [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-page", style: { paddingLeft: depth * 12 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dshm-pageName", children: [
        n.kind === "folder" ? "\u{1F4C1}" : "\u{1F4C4}",
        " ",
        n.name ?? n.id
      ] }),
      n.description && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-pageDesc", title: n.description, children: n.description })
    ] }, n.id),
    ...n.children ? renderNodes(n.children, depth + 1) : []
  ]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-card", style: { padding: 0, overflow: "hidden" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "dshm-table", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Bank" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("banks.facts") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("banks.lastWrite") })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: rows.map((b) => [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: "dshm-bankRow", onClick: () => {
        void toggle(b.bank_id);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
          expanded[b.bank_id] !== void 0 ? "\u25BE" : "\u25B8",
          " ",
          b.bank_id
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: b.fact_count ?? "\u2014" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: fmtTime(b.last_write_at ?? b.updated_at) || t("common.never") })
      ] }, b.bank_id),
      expanded[b.bank_id] !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { colSpan: 3, style: { padding: 0 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-pages", children: [
        expanded[b.bank_id] === "loading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-muted", children: t("common.loading") }),
        expanded[b.bank_id] === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-err", children: t("banks.error") }),
        Array.isArray(expanded[b.bank_id]) && (expanded[b.bank_id].length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-muted", children: t("banks.pages.none") }) : renderNodes(expanded[b.bank_id], 0))
      ] }) }) }, b.bank_id + ":pages")
    ]) })
  ] }) });
}
function LogsView(props) {
  const { t } = props;
  const block = (title, tail) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-cardTitle", children: [
      title,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshm-muted", style: { fontWeight: 400 }, children: tail?.path })
    ] }),
    tail === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-muted", children: t("common.loading") }) : tail.error === "file not found" || !tail.exists ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-muted", children: t("logs.missing") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: "dshm-log", children: tail.lines.join("\n") })
  ] }, title);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    props.err !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-err", children: props.err }),
    props.logs !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      block(t("logs.plugin"), props.logs.plugin),
      block(t("logs.daemon"), props.logs.daemon)
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-actions", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshm-btn", onClick: props.onRefresh, children: t("logs.refresh") }) })
  ] });
}
var store = defineStore({
  persist: "dsh-hindsight-manager",
  init: () => ({ tab: "status" }),
  actions: {
    setTab(d, tab) {
      d.tab = tab;
    }
  }
});
var panelStore = store.create();
var BADGE_POLL_MS = 1e4;
var statusCache = { running: null };
var badgeRefs = 0;
var badgeTimer = null;
async function pollStatusCache() {
  try {
    const payload = await api("/status");
    statusCache.running = payload.health.running;
  } catch {
  }
}
function badgeOpen() {
  badgeRefs += 1;
  if (badgeRefs === 1) {
    void pollStatusCache();
    badgeTimer = setInterval(() => {
      void pollStatusCache();
    }, BADGE_POLL_MS);
  }
}
function badgeClose() {
  badgeRefs = Math.max(0, badgeRefs - 1);
  if (badgeRefs === 0) badgeStop();
}
function badgeStop() {
  badgeRefs = 0;
  if (badgeTimer !== null) {
    clearInterval(badgeTimer);
    badgeTimer = null;
  }
}
function ManagerTab(props) {
  const s = (0, import_react.useSyncExternalStore)(panelStore.subscribe, panelStore.getSnapshot);
  const [status, setStatus] = (0, import_react.useState)(null);
  const [statusErr, setStatusErr] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(null);
  const [cfg, setCfg] = (0, import_react.useState)(null);
  const [cfgErr, setCfgErr] = (0, import_react.useState)(null);
  const [banks, setBanks] = (0, import_react.useState)(null);
  const [banksErr, setBanksErr] = (0, import_react.useState)(null);
  const [logs, setLogs] = (0, import_react.useState)(null);
  const [logsErr, setLogsErr] = (0, import_react.useState)(null);
  const startDeadline = (0, import_react.useRef)(0);
  const refreshStatus = (0, import_react.useCallback)(async () => {
    try {
      const payload = await api("/status");
      setStatus(payload);
      setStatusErr(null);
      statusCache.running = payload.health.running;
      return payload;
    } catch (e) {
      setStatusErr(e.message);
      return null;
    }
  }, []);
  const refreshTab = (0, import_react.useCallback)(async (tab) => {
    if (tab === "config") {
      try {
        setCfg(await api("/config"));
        setCfgErr(null);
      } catch (e) {
        setCfgErr(e.message);
      }
    } else if (tab === "banks") {
      try {
        const r = await api("/banks");
        setBanks(r.banks ?? []);
        setBanksErr(r.error ?? null);
      } catch (e) {
        setBanksErr(e.message);
      }
    } else if (tab === "logs") {
      try {
        setLogs(await api("/logs"));
        setLogsErr(null);
      } catch (e) {
        setLogsErr(e.message);
      }
    }
  }, []);
  (0, import_react.useEffect)(() => {
    if (!props.visible) return;
    void refreshStatus();
    void refreshTab(s.tab);
    const timer = setInterval(() => {
      if (Date.now() > startDeadline.current) void refreshStatus();
    }, 5e3);
    return () => {
      clearInterval(timer);
    };
  }, [props.visible, s.tab, refreshStatus, refreshTab]);
  (0, import_react.useEffect)(() => {
    if (busy !== "start") return;
    startDeadline.current = Date.now() + 12e4;
    const timer = setInterval(async () => {
      const payload = await refreshStatus();
      if (payload?.health.running) {
        setBusy(null);
        startDeadline.current = 0;
      } else if (Date.now() > startDeadline.current) setBusy(null);
    }, 2e3);
    return () => {
      clearInterval(timer);
      startDeadline.current = 0;
    };
  }, [busy, refreshStatus]);
  const onStart = async () => {
    setBusy("start");
    try {
      await api("/daemon/start", { method: "POST" });
    } catch {
    }
  };
  const onStop = async () => {
    setBusy("stop");
    try {
      await api("/daemon/stop", { method: "POST" });
    } catch {
    }
    await refreshStatus();
    setBusy(null);
    if (s.tab === "banks") void refreshTab("banks");
  };
  const tabs = [
    { id: "status", label: "tab.status" },
    { id: "config", label: "tab.config" },
    { id: "banks", label: "tab.banks" },
    { id: "logs", label: "tab.logs" }
  ];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { height: "100%", display: "flex", flexDirection: "column" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshm-tabs", children: tabs.map((tab) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: "dshm-tab",
        "data-active": s.tab === tab.id || void 0,
        onClick: () => {
          panelStore.actions.setTab(tab.id);
        },
        children: tr(tab.label)
      },
      tab.id
    )) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-body", children: [
      statusErr !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshm-err", style: { marginBottom: 8 }, children: [
        statusErr,
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshm-btn", style: { height: 20 }, onClick: () => {
          void refreshStatus();
        }, children: tr("common.retry") })
      ] }),
      s.tab === "status" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DaemonCard, { t: tr, status, busy, onStart: () => {
          void onStart();
        }, onStop: () => {
          void onStop();
        }, onRefresh: () => {
          void refreshStatus();
        } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RuntimeCard, { t: tr, status })
      ] }),
      s.tab === "config" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConfigView, { t: tr, cfg, err: cfgErr }),
      s.tab === "banks" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BanksView, { t: tr, banks, err: banksErr }),
      s.tab === "logs" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogsView, { t: tr, logs, err: logsErr, onRefresh: () => {
        void refreshTab("logs");
      } })
    ] })
  ] });
}
var inject = ["betterSidebar"];
function apply(ctx) {
  const svc = ctx.betterSidebar;
  const gated = svc.features.includes("badge") && svc.features.includes("tabLifecycle");
  ctx.effect(() => {
    const dispose = svc.registerTab({
      id: "hindsight-manager:main",
      title: () => tr("panel.title"),
      icon: (size) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrainIcon, { size }),
      order: 50,
      single: true,
      ...gated ? {
        badge: () => statusCache.running === null ? void 0 : statusCache.running ? "\u25CF" : "\u25CB",
        onOpen: () => {
          badgeOpen();
        },
        onClose: () => {
          badgeClose();
        }
      } : {},
      component: ManagerTab
    });
    return () => {
      dispose();
      badgeStop();
    };
  }, "dsh-hindsight-manager: side card tab");
}
