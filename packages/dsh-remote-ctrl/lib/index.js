import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import http from "node:http";
// src/bridge.ts
var HostBridge = class {
	controller = null;
	query = null;
	/** Attach one service if the scope actually carries it with the expected face. */
	attach(scope, name) {
		const source = scope;
		const service = source?.get?.(name) ?? source?.[name];
		if (!service) return false;
		if (name === "sessionController" && typeof service.prompt === "function") {
			this.controller = service;
			return true;
		}
		if (name === "sessionQuery" && typeof service.readSession === "function") {
			this.query = service;
			return true;
		}
		return false;
	}
	/** Readiness snapshot for status surfaces. */
	readiness() {
		return {
			controller: this.controller !== null,
			query: this.query !== null
		};
	}
	/**
	* List sessions: `sessionController.list()` when available (rich summaries
	* with projection values — title, running flag —; never activates cold
	* sessions), falling back to `sessionQuery`. The controller answers
	* `{items:[...]}`, the query a bare array; both unwrap here.
	*/
	async listSessions() {
		if (this.controller !== null && typeof this.controller.list === "function") try {
			const rows = rowsOf(await this.controller.list({}, neverSignal()));
			if (rows !== null) return rows;
		} catch {}
		if (this.query !== null && typeof this.query.listSessions === "function") {
			const rows = await this.query.listSessions();
			if (Array.isArray(rows)) return rows;
		}
		throw new Error("宿主未提供会话查询服务（sessionController / sessionQuery）");
	}
	/** Cold-read one session's event log (does not activate the session). */
	async readEvents(sessionId) {
		if (this.query === null) throw new Error("宿主未提供 sessionQuery 服务，无法读取会话历史");
		return await this.query.readSession(sessionId);
	}
	/** Send a user message: a queued followup turn on the session's agent. */
	async prompt(sessionId, text, mode) {
		if (this.controller === null) throw new Error("宿主未提供 sessionController 服务，无法发送消息");
		const request = {
			requestId: crypto.randomUUID(),
			sessionId,
			mode,
			content: [{
				type: "text",
				text
			}],
			clientTimeZone: clientTimeZone()
		};
		await this.controller.prompt(request, neverSignal());
	}
};
function clientTimeZone() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || void 0;
	} catch {
		return;
	}
}
/** Bare array or `{items:[...]}` wrapper → array; anything else → null. */
function rowsOf(value) {
	if (Array.isArray(value)) return value;
	if (value !== null && typeof value === "object" && Array.isArray(value.items)) return value.items;
	return null;
}
/** A never-aborting signal for host calls that require one. */
function neverSignal() {
	return new AbortController().signal;
}
/** Register one late service through ctx.inject with a try/catch wrapper. */
function deferService(ctx, deps, callback, onError) {
	try {
		if (typeof ctx.inject !== "function") {
			onError(`宿主 ctx 不支持 inject，无法等待服务 ${deps.join("+")}`);
			return;
		}
		ctx.inject(deps, (scope) => {
			try {
				callback(scope);
			} catch (error) {
				onError(`服务 ${deps.join("+")} 就绪后执行失败：${error instanceof Error ? error.message : String(error)}`);
			}
		});
	} catch (error) {
		onError(`等待服务 ${deps.join("+")} 失败：${error instanceof Error ? error.message : String(error)}`);
	}
}
// src/ip.ts
/**
* LAN address enumeration. The plugin's own HTTP server binds once
* (default `0.0.0.0`), so every interface address is reachable; these
* helpers turn `os.networkInterfaces()` into the candidate URL list for
* the panel and the Host-header allowlist for the request gate.
*
* @module dsh-remote-ctrl/ip
*/
function isPrivateIPv4(address) {
	const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(address);
	if (match === null) return false;
	const first = Number(match[1]);
	const second = Number(match[2]);
	if (first === 10) return true;
	if (first === 172 && second >= 16 && second <= 31) return true;
	if (first === 192 && second === 168) return true;
	return false;
}
function scopeOf(address, family) {
	if (family === 4) {
		if (address.startsWith("169.254.")) return "link-local";
		return isPrivateIPv4(address) ? "private" : "public";
	}
	const lowered = address.toLowerCase();
	if (lowered.startsWith("fe80:")) return "link-local";
	return lowered.startsWith("f") && (lowered.startsWith("fc") || lowered.startsWith("fd")) ? "private" : "public";
}
/**
* Every non-internal interface address, IPv4 before IPv6, private before
* public before link-local. Recomputed per call so DHCP changes are picked
* up without a plugin reload.
*/
function lanAddresses() {
	const result = [];
	for (const list of Object.values(os.networkInterfaces())) for (const info of list ?? []) {
		if (!info || info.internal) continue;
		const familyRaw = String(info.family);
		const family = familyRaw === "IPv4" ? 4 : familyRaw === "IPv6" ? 6 : Number(familyRaw);
		if (family !== 4 && family !== 6) continue;
		const address = String(info.address);
		if (address === "") continue;
		result.push({
			address,
			family,
			scope: scopeOf(address, family)
		});
	}
	const scopeOrder = {
		private: 0,
		public: 1,
		"link-local": 2
	};
	return result.sort((left, right) => left.family - right.family || scopeOrder[left.scope] - scopeOrder[right.scope]);
}
/** Host header values this machine answers on: loopback spellings plus every interface address. */
function localHostNames() {
	const names = /* @__PURE__ */ new Set([
		"127.0.0.1",
		"localhost",
		"[::1]",
		"::1"
	]);
	for (const entry of lanAddresses()) {
		const lowered = entry.address.toLowerCase();
		names.add(lowered);
		if (entry.family === 6) names.add(`[${lowered}]`);
	}
	return names;
}
// src/auth.ts
/**
* Request gate of the plugin's own HTTP server. The host's `/api` trust
* fence does not cover plugin routes, and this server binds the LAN on
* purpose — so every request carries its own admission checks:
*
* - Host header must resolve to this machine (anti DNS-rebinding);
* - every /api request needs the pairing token (Bearer header or `?token=`,
*   both reachable from EventSource, which cannot set headers);
* - mutating requests additionally need a same-origin Origin and a JSON
*   content type, and a browser-attested `sec-fetch-site: cross-site` is
*   rejected outright (mirrors the dsh-agent-plugin-hub `isAdmitted` fence).
*
* @module dsh-remote-ctrl/auth
*/
const STATE_VERSION = 1;
function writeState(file, token) {
	writeFileSync(file, `${JSON.stringify({
		version: STATE_VERSION,
		token
	}, null, 2)}\n`, "utf8");
}
/**
* Resolve the pairing token: an explicitly configured one wins; otherwise
* the persisted one is reused so QR codes stay valid across restarts; a
* fresh random token is minted and persisted on first run. Legacy state
* without a version marker is migrated in place (same token, adds version).
*/
function loadOrCreateToken(home, configured) {
	const trimmed = configured.trim();
	if (trimmed !== "") return trimmed;
	const file = join(home, "remote-ctrl.json");
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		const token = typeof parsed.token === "string" ? parsed.token : "";
		if (token !== "") {
			if (parsed.version !== STATE_VERSION) writeState(file, token);
			return token;
		}
	} catch {}
	mkdirSync(home, { recursive: true });
	const token = randomBytes(24).toString("base64url");
	writeState(file, token);
	return token;
}
/** Hostname of the Host header (port stripped; IPv6 keeps its brackets). */
function hostnameOf$1(hostHeader) {
	const value = hostHeader.trim().toLowerCase();
	if (value.startsWith("[")) {
		const end = value.indexOf("]");
		return end === -1 ? value : value.slice(0, end + 1);
	}
	const colon = value.lastIndexOf(":");
	return colon === -1 ? value : value.slice(0, colon);
}
function headerValue$1(request, name) {
	const value = request.headers?.[name];
	if (Array.isArray(value)) return String(value[0] ?? "").toLowerCase();
	return String(value ?? "").toLowerCase();
}
function safeEqual(left, right) {
	const leftBytes = Buffer.from(left, "utf8");
	const rightBytes = Buffer.from(right, "utf8");
	return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
/** Pairing token of one request: Bearer header first, then `?token=`. */
function tokenOf(request) {
	const authorization = Array.isArray(request.headers?.authorization) ? String(request.headers.authorization[0] ?? "") : String(request.headers?.authorization ?? "");
	const match = /^bearer\s+(.+)$/iu.exec(authorization);
	if (match !== null) {
		const token = (match[1] ?? "").trim();
		if (token !== "") return token;
	}
	try {
		const token = new URL(String(request.url ?? "/"), "http://localhost").searchParams.get("token");
		if (token !== null && token !== "") return token;
	} catch {}
	return null;
}
/** Whether this request may reach the plugin API. */
function checkApiAccess(request, token) {
	const hostHeader = String(request.headers?.host ?? "");
	if (hostHeader === "" || !localHostNames().has(hostnameOf$1(hostHeader))) return {
		ok: false,
		status: 403,
		code: "forbidden_host",
		message: "拒绝访问：Host 不是本机地址"
	};
	const provided = tokenOf(request);
	if (provided === null || !safeEqual(provided, token)) return {
		ok: false,
		status: 401,
		code: "unauthorized",
		message: "未授权：缺少或错误的配对码"
	};
	const method = String(request.method ?? "GET").toUpperCase();
	if (method === "GET" || method === "HEAD") return { ok: true };
	if (headerValue$1(request, "sec-fetch-site") === "cross-site") return {
		ok: false,
		status: 403,
		code: "forbidden",
		message: "拒绝访问：跨站请求"
	};
	const origin = request.headers?.origin;
	if (origin !== void 0 && String(origin) !== `http://${hostHeader}` && String(origin) !== `https://${hostHeader}`) return {
		ok: false,
		status: 403,
		code: "forbidden_origin",
		message: "拒绝访问：跨站请求来源"
	};
	if (!headerValue$1(request, "content-type").includes("application/json")) return {
		ok: false,
		status: 415,
		code: "unsupported_media_type",
		message: "请求体必须是 application/json"
	};
	return { ok: true };
}
// src/html.ts
/**
* The mobile page shell: one self-contained HTML string with inline CSS.
* The page is served by the plugin's own server, so it carries its own
* styling (the host's `--dsw-alias-*` tokens do not exist here) and loads
* the built IIFE bundle from `/static/mobile.js`.
*
* @module dsh-remote-ctrl/html
*/
/**
* Render the mobile page. Language follows the browser (`<html lang>` left
* generic); copy lives in the JS bundle, not here.
*/
function renderPage() {
	return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>DSH 远程控制</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f5f5f4;
    --card: #ffffff;
    --fg: #1c1917;
    --muted: #78716c;
    --border: #e7e5e4;
    --accent: #2563eb;
    --accent-weak: #dbeafe;
    --danger: #dc2626;
    --danger-weak: #fee2e2;
    --ok: #16a34a;
    --ok-weak: #dcfce7;
    --warn: #d97706;
    --warn-weak: #fef3c7;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #141210;
      --card: #211f1c;
      --fg: #e7e5e4;
      --muted: #a8a29e;
      --border: #35322e;
      --accent: #60a5fa;
      --accent-weak: #1e3a5f;
      --danger: #f87171;
      --danger-weak: #451a1a;
      --ok: #4ade80;
      --ok-weak: #14351c;
      --warn: #fbbf24;
      --warn-weak: #3a2c0e;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--fg);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  #app { min-height: 100dvh; display: flex; flex-direction: column; }
  .topbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: 10px;
    padding: calc(env(safe-area-inset-top) + 10px) 14px 10px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }
  .topbar h1 { flex: 1; margin: 0; font-size: 17px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .iconbtn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; flex: none;
    border: 0; border-radius: 10px; background: transparent; color: var(--fg);
    cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  .iconbtn:active { background: var(--accent-weak); }
  .main { flex: 1; padding: 12px 14px calc(env(safe-area-inset-bottom) + 24px); }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 14px;
    padding: 12px 14px; margin-bottom: 10px; cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  .card:active { border-color: var(--accent); }
  .card .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card .sub { margin-top: 2px; color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge {
    display: inline-block; padding: 1px 8px; border-radius: 999px;
    font-size: 11.5px; background: var(--bg); color: var(--muted); border: 1px solid var(--border);
  }
  .badge.running { background: var(--ok-weak); color: var(--ok); border-color: transparent; }
  .badge.waiting { background: var(--warn-weak); color: var(--warn); border-color: transparent; }
  .badge.error { background: var(--danger-weak); color: var(--danger); border-color: transparent; }
  .section { margin: 16px 0 8px; color: var(--muted); font-size: 12.5px; font-weight: 600; letter-spacing: .02em; }
  .pending { border-color: var(--warn); }
  .pending .q { margin-top: 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .pending .meta { color: var(--muted); font-size: 12.5px; margin-top: 2px; overflow-wrap: anywhere; }
  .row { display: flex; gap: 8px; margin-top: 10px; }
  button.act {
    flex: 1; padding: 9px 10px; border: 1px solid var(--border); border-radius: 10px;
    background: var(--bg); color: var(--fg); font-size: 14px; font-weight: 600; cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  button.act.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button.act.allow { background: var(--ok); border-color: var(--ok); color: #fff; }
  button.act.deny { background: var(--danger); border-color: var(--danger); color: #fff; }
  button.act:disabled { opacity: .55; }
  .opt {
    display: block; width: 100%; margin-top: 8px; padding: 9px 12px; text-align: left;
    border: 1px solid var(--border); border-radius: 10px; background: var(--bg);
    color: var(--fg); font-size: 14px; cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  .opt:active { border-color: var(--accent); }
  .composer {
    position: sticky; bottom: 0; display: flex; gap: 8px; align-items: flex-end;
    padding: 10px 14px calc(env(safe-area-inset-bottom) + 10px);
    background: var(--bg); border-top: 1px solid var(--border);
  }
  .composer textarea {
    flex: 1; resize: none; min-height: 40px; max-height: 120px;
    padding: 9px 12px; border: 1px solid var(--border); border-radius: 12px;
    background: var(--card); color: var(--fg); font: inherit;
  }
  .composer textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  .composer .send {
    flex: none; width: 46px; height: 40px; border: 0; border-radius: 12px;
    background: var(--accent); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .composer .send:disabled { opacity: .55; }
  .msg { margin: 10px 0; display: flex; flex-direction: column; }
  .msg .bubble {
    max-width: 86%; padding: 8px 12px; border-radius: 14px;
    background: var(--card); border: 1px solid var(--border);
    white-space: pre-wrap; overflow-wrap: anywhere;
  }
  .msg.user { align-items: flex-end; }
  .msg.user .bubble { background: var(--accent); border-color: var(--accent); color: #fff; border-bottom-right-radius: 4px; }
  .msg.assistant .bubble { border-bottom-left-radius: 4px; }
  .msg.tool .bubble { background: var(--bg); font-size: 13px; color: var(--muted); }
  .msg.tool .toolname { font-weight: 600; color: var(--fg); }
  .msg .detail { display: block; margin-top: 4px; font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; opacity: .8; overflow-wrap: anywhere; }
  .msg.system .bubble { background: transparent; border-style: dashed; color: var(--muted); font-size: 12.5px; }
  .streaming { opacity: .75; }
  .streaming::after { content: "▍"; animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .empty { color: var(--muted); text-align: center; padding: 40px 0; }
  .error { color: var(--danger); font-size: 13px; padding: 8px 2px; overflow-wrap: anywhere; }
  .gate { max-width: 420px; margin: 18dvh auto 0; padding: 0 20px; text-align: center; }
  .gate .card { cursor: default; text-align: left; }
  .gate input {
    width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px;
    background: var(--bg); color: var(--fg); font: inherit; letter-spacing: .04em;
  }
  .hint { color: var(--muted); font-size: 12.5px; margin-top: 8px; }
  .conn { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; }
  .conn.on { background: var(--ok); }
</style>
</head>
<body>
<div id="app"></div>
<script src="/static/mobile.js"><\/script>
</body>
</html>`;
}
// src/view.ts
const MAX_DETAIL_CHARS = 2e3;
const MAX_SYSTEM_CHARS = 600;
const MAX_RESULT_CHARS = 1200;
/** Cap display text; injected context and tool output can be enormous. */
function capText(text, limit) {
	return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
function asRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
/** Epoch milliseconds from whatever timestamp shape a row carries. */
function timestampOf(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value !== "") {
		const parsed = Date.parse(value);
		if (!Number.isNaN(parsed)) return parsed;
	}
	return 0;
}
/** Join the text parts of one message-content shape into plain text. */
function textFromContent(content) {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const parts = [];
		for (const raw of content) {
			const part = asRecord(raw);
			if (part === null) {
				if (typeof raw === "string" && raw !== "") parts.push(raw);
				continue;
			}
			if ((typeof part.type === "string" ? part.type : "text") !== "text" || typeof part.text !== "string" || part.text === "") continue;
			parts.push(part.text);
		}
		return parts.join("\n");
	}
	const record = asRecord(content);
	return record !== null && typeof record.text === "string" ? record.text : "";
}
function firstString(...values) {
	for (const value of values) if (typeof value === "string" && value.trim() !== "") return value.trim();
	return "";
}
/** Normalize one row of `sessionController.list()` / `sessionQuery.listSessions()`. */
function normalizeSessionSummary(raw) {
	const record = asRecord(raw);
	if (record === null) return null;
	const header = asRecord(record.header);
	const id = firstString(record.sessionId, record.id, record.key, header?.id, header?.sessionId);
	if (id === "") return null;
	const values = asRecord(asRecord(record.projections)?.values);
	const explicitStatus = firstString(record.status, record.state, record.formatStatus, header?.status).toLowerCase();
	const normalizedExplicit = explicitStatus === "current" ? "" : explicitStatus;
	const status = record.running === true ? "running" : record.agentAvailable === true ? "attached" : normalizedExplicit;
	return {
		id,
		title: firstString(values?.title, record.title, record.name, record.displayName, header?.title) || id,
		status,
		updatedAt: timestampOf(record.updatedAt ?? record.updated ?? record.lastActivity ?? record.timestamp ?? header?.updatedAt),
		cwd: firstString(record.cwd, record.workingDirectory, header?.cwd, header?.workingDirectory)
	};
}
/**
* Stable identity of one history item: the log's sequence number when the
* event carries one, else the tool callId, else kind+text-head+timestamp.
* Baseline (replayed log) and live (session/event) copies of the same event
* must land on the same key so the phone can dedupe them.
*/
function itemKey(kind, callId, text, seq, ts) {
	if (seq >= 0) return `s${seq}`;
	if (callId !== "") return `${kind}:${callId}`;
	return `${kind}:${text.slice(0, 120)}@${ts}`;
}
/** Sequence number of one log event, or -1 when the log carries none. */
function seqOf(record) {
	for (const key of [
		"seq",
		"index",
		"eventIndex",
		"sequence"
	]) {
		const value = record[key];
		if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
	}
	return -1;
}
/** Normalize one entry of the session event log into a renderable item (null = skip). */
function normalizeEventItem(raw) {
	const record = asRecord(raw);
	if (record === null) return null;
	const type = firstString(record.type, record.kind);
	const inner = asRecord(record.message) ?? asRecord(record.data) ?? asRecord(record.event) ?? record;
	const seq = seqOf(record);
	const ts = timestampOf(record.timestamp ?? inner.timestamp);
	switch (type) {
		case "user/message": {
			const text = textFromContent(inner.content) || firstString(inner.text);
			if (text === "") return null;
			const sourceKind = firstString(asRecord(inner.source)?.kind);
			if (sourceKind !== "" && sourceKind !== "user") return {
				id: itemKey("system", "", text, seq, ts),
				kind: "system",
				text: capText(text, MAX_SYSTEM_CHARS),
				ts
			};
			return {
				id: itemKey("user", "", text, seq, ts),
				kind: "user",
				text,
				ts
			};
		}
		case "assistant/message": {
			const text = textFromContent((asRecord(inner.message) ?? inner).content) || textFromContent(inner.content) || firstString(inner.text);
			if (text === "") return null;
			return {
				id: itemKey("assistant", "", text, seq, ts),
				kind: "assistant",
				text,
				ts
			};
		}
		case "tool/call": {
			const toolName = firstString(inner.name, inner.toolName, record.name, record.toolName);
			const callId = firstString(inner.callId, inner.id, record.callId);
			const args = inner.arguments ?? inner.input ?? inner.args ?? record.arguments;
			let detail = "";
			if (typeof args === "string" && args !== "") try {
				detail = JSON.stringify(JSON.parse(args));
			} catch {
				detail = args;
			}
			else if (args !== void 0 && args !== null) try {
				detail = JSON.stringify(args);
			} catch {
				detail = String(args);
			}
			if (detail.length > MAX_DETAIL_CHARS) detail = `${detail.slice(0, MAX_DETAIL_CHARS)}…`;
			return {
				id: itemKey("tool-call", callId, toolName, seq, ts),
				kind: "tool-call",
				text: toolName || "tool",
				...toolName !== "" ? { toolName } : {},
				...callId !== "" ? { callId } : {},
				...detail !== "" ? { detail } : {},
				ts
			};
		}
		case "tool/result": {
			const callId = firstString(inner.callId, record.callId);
			const error = inner.error ?? record.error;
			const errorRecord = asRecord(error);
			const errorText = typeof error === "string" ? error : errorRecord !== null ? firstString(errorRecord.reason, errorRecord.message) : "";
			const text = errorText !== "" ? errorText : textFromContent(inner.content) || textFromContent(asRecord(inner.message)?.content) || firstString(inner.summary, inner.text, inner.result);
			if (text === "") return null;
			return {
				id: itemKey("tool-result", callId, text, seq, ts),
				kind: "tool-result",
				text: capText(text, MAX_RESULT_CHARS),
				...callId !== "" ? { callId } : {},
				...errorText !== "" ? { detail: "error" } : {},
				ts
			};
		}
		case "system/message":
		case "developer/message": {
			const text = textFromContent(inner.content) || firstString(inner.text);
			if (text === "") return null;
			return {
				id: itemKey("system", "", text, seq, ts),
				kind: "system",
				text: capText(text, MAX_SYSTEM_CHARS),
				ts
			};
		}
		default: return null;
	}
}
/**
* Extract the event array from a `sessionQuery.readSession` result. The
* result may be the array itself or a wrapper ({events|log|entries|items}).
*/
function historyEventsOf(payload) {
	if (Array.isArray(payload)) return payload;
	const record = asRecord(payload);
	if (record === null) return [];
	for (const key of [
		"events",
		"log",
		"entries",
		"items"
	]) {
		const candidate = record[key];
		if (Array.isArray(candidate)) return candidate;
	}
	return [];
}
/**
* Normalize one `agent/assistant-stream` frame. Official shape:
* `{agent, frame: {type:'start'|'chunk'|'end', …, chunk?: StreamChunk}}` —
* text deltas carry the string in `frame.chunk.text`. Frames without visible
* text (block-start/usage/finish) normalize to null and are not broadcast.
*/
function normalizeStreamFrame(raw) {
	const outer = asRecord(raw);
	if (outer === null) return null;
	const frame = asRecord(outer.frame) ?? outer;
	const rawType = firstString(frame.type, frame.phase).toLowerCase();
	if (rawType === "start") return {
		phase: "start",
		text: ""
	};
	if (rawType === "end") return {
		phase: "end",
		text: ""
	};
	if (rawType !== "chunk" && rawType !== "delta" && rawType !== "text") return null;
	const chunk = asRecord(frame.chunk);
	const text = firstString(frame.text, frame.delta, chunk?.text);
	if (text === "") return null;
	return {
		phase: "chunk",
		text
	};
}
// src/server.ts
/**
* The plugin's own HTTP server (node:http) — the LAN data plane the phone
* browser talks to. It deliberately does not ride the host webServer: the
* host rejects wildcard binds, while remote control wants every interface
* address reachable, so the plugin owns one listener on `config.host`
* (default 0.0.0.0) + `config.port`.
*
* Surface:
* - `GET /` — the mobile page (self-contained HTML + `/static/mobile.js`);
* - `GET /api/status` — bootstrap snapshot (sessions + pending cards);
* - `GET /api/sessions`, `GET /api/sessions/:id/events` — lists and history;
* - `POST /api/sessions/:id/prompt` — send a user message (queue);
* - `POST /api/pending/approvals/:id` — resolve a claimed tool approval;
* - `POST /api/pending/questions/:id` — answer an ask-user question;
* - `GET /api/stream?sid=` — SSE: hello, sessions, item, stream, pending.
*
* Every /api request passes `checkApiAccess` (token + machine-local Host +
* same-origin mutations). Approval answers ride the `approval/request`
* waterfall: claimed only while at least one phone is connected, raced
* against the rest of the answerer chain so the desktop UI stays a
* first-responder.
*
* @module dsh-remote-ctrl/server
*/
const APPROVAL_OUTCOMES = /* @__PURE__ */ new Set([
	"allowed-once",
	"rejected",
	"cancelled"
]);
const MAX_BODY_BYTES = 262144;
const HEARTBEAT_MS = 15e3;
function sendJson$1(response, status, payload) {
	const body = JSON.stringify(payload);
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"content-length": Buffer.byteLength(body)
	});
	response.end(body);
}
function readJsonBody(request) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		request.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				reject(/* @__PURE__ */ new Error("请求体过大"));
				request.destroy();
				return;
			}
			chunks.push(chunk);
		});
		request.on("end", () => {
			if (chunks.length === 0) {
				resolve({});
				return;
			}
			try {
				const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
				if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
					reject(/* @__PURE__ */ new Error("请求体必须是 JSON 对象"));
					return;
				}
				resolve(parsed);
			} catch {
				reject(/* @__PURE__ */ new Error("请求体不是合法 JSON"));
			}
		});
		request.on("error", (error) => reject(error));
	});
}
function isThenable(value) {
	return typeof value === "object" && value !== null && typeof value.then === "function";
}
/** Extract the fields the approval answerer needs from an ApprovalRequest. */
function extractApprovalRequest(request) {
	if (request === null || typeof request !== "object") return null;
	const record = request;
	const agent = record.agent;
	const session = agent?.session;
	const sessionId = typeof session?.id === "string" ? session.id : typeof agent?.sessionId === "string" ? agent.sessionId : "";
	const callId = typeof record.callId === "string" && record.callId !== "" ? record.callId : "";
	return {
		key: callId !== "" ? callId : `ap-${randomUUID()}`,
		sessionId,
		toolName: typeof record.toolName === "string" ? record.toolName : "",
		reason: typeof record.reason === "string" ? record.reason : "",
		signal: record.signal
	};
}
/**
* Extract the fields the phone question cards need from an
* `AskUserQuestionRequestEvent` (`{questions:[{id,question,options…}], agent,
* wait?:{callId}}`); one card per question item.
*/
function extractQuestionRequest(request) {
	if (request === null || typeof request !== "object") return null;
	const record = request;
	const agent = record.agent;
	if (agent === void 0 || agent === null) return null;
	const agentRecord = agent;
	const session = agentRecord.session;
	const sessionId = typeof session?.id === "string" ? session.id : typeof agentRecord.sessionId === "string" ? agentRecord.sessionId : "";
	const wait = asWait(record.wait);
	const rawQuestions = Array.isArray(record.questions) ? record.questions : [];
	const items = [];
	for (const raw of rawQuestions.slice(0, 6)) {
		if (raw === null || typeof raw !== "object") continue;
		const item = raw;
		const id = typeof item.id === "string" && item.id !== "" ? item.id : "";
		const question = typeof item.question === "string" ? item.question : "";
		if (id === "" || question === "") continue;
		const options = [];
		if (Array.isArray(item.options)) {
			for (const option of item.options.slice(0, 8)) if (typeof option === "string" && option.trim() !== "") options.push(option.trim());
			else if (option !== null && typeof option === "object") {
				const entry = option;
				const label = [
					entry.label,
					entry.title,
					entry.value,
					entry.text
				].find((value) => typeof value === "string" && value !== "");
				if (typeof label === "string") options.push(label);
			}
		}
		items.push({
			id,
			question,
			detail: typeof item.detail === "string" ? item.detail : "",
			options,
			multiSelect: item.multiSelect === true,
			answered: false
		});
	}
	if (items.length === 0) return null;
	return {
		key: `q-${wait?.callId !== void 0 && wait.callId !== "" ? wait.callId : items[0]?.id ?? randomUUID()}`,
		agent,
		sessionId,
		items
	};
}
function asWait(value) {
	if (value === null || typeof value !== "object") return null;
	const record = value;
	return typeof record.callId === "string" ? { callId: record.callId } : null;
}
/** One SSE frame as `data: <json>\n\n`. */
function frameLine(frame) {
	return `data: ${JSON.stringify(frame)}\n\n`;
}
var RcServer = class {
	options;
	http = null;
	clients = /* @__PURE__ */ new Map();
	approvals = /* @__PURE__ */ new Map();
	questions = /* @__PURE__ */ new Map();
	heartbeat = null;
	mobileScript = null;
	address;
	listening = false;
	listenError = "";
	constructor(options) {
		this.options = options;
		this.address = {
			host: options.host,
			port: options.port
		};
	}
	/** Connected phone clients. */
	get clientCount() {
		return this.clients.size;
	}
	/** Actual port after listen (port 0 resolves to the OS-assigned value). */
	get port() {
		return this.address.port;
	}
	/** Bind and start serving. Resolves once the listener is up. */
	async listen() {
		const server = http.createServer((request, response) => {
			this.handle(request, response);
		});
		server.requestTimeout = 0;
		await new Promise((resolve, reject) => {
			server.once("error", reject);
			server.listen(this.options.port, this.options.host, () => resolve());
		});
		this.http = server;
		this.listening = true;
		this.listenError = "";
		const addr = server.address();
		if (addr !== null && typeof addr === "object") this.address.port = addr.port;
		this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS);
		this.heartbeat.unref?.();
		this.options.log("info", `远程控制服务已监听 http://${this.options.host}:${this.address.port}/`);
	}
	/** Stop serving, drop every client, and fail-closed the claimed approvals. */
	dispose() {
		if (this.heartbeat !== null) {
			clearInterval(this.heartbeat);
			this.heartbeat = null;
		}
		for (const client of this.clients.values()) try {
			client.res.end();
		} catch {}
		this.clients.clear();
		for (const entry of this.approvals.values()) if (!entry.done) {
			entry.done = true;
			try {
				entry.resolve("cancelled");
			} catch {}
		}
		this.approvals.clear();
		this.questions.clear();
		if (this.http !== null) {
			const server = this.http;
			this.http = null;
			try {
				server.close();
			} catch {}
		}
		this.listening = false;
	}
	/**
	* The `approval/request` waterfall answerer. Claims the request only while
	* a phone is connected; the rest of the answerer chain is engaged too, so
	* desktop and phone race and the first decision wins at the service.
	*/
	claimApproval(request, next) {
		if (this.clientCount === 0) return next();
		const info = extractApprovalRequest(request);
		if (info === null) return next();
		const downstream = next();
		return new Promise((resolve) => {
			const entry = {
				key: info.key,
				sessionId: info.sessionId,
				toolName: info.toolName,
				reason: info.reason,
				done: false,
				resolve: (outcome) => {
					if (entry.done) return;
					entry.done = true;
					this.approvals.delete(entry.key);
					this.broadcastPending();
					resolve(outcome);
				}
			};
			this.approvals.set(entry.key, entry);
			this.broadcastPending();
			if (isThenable(downstream)) Promise.resolve(downstream).then((value) => {
				if (typeof value === "string" && APPROVAL_OUTCOMES.has(value)) entry.resolve(value);
			}, () => {});
			const signal = info.signal;
			if (signal !== void 0 && signal !== null && typeof signal.addEventListener === "function") {
				if (signal.aborted === true) entry.resolve("cancelled");
				else signal.addEventListener("abort", () => entry.resolve("cancelled"), { once: true });
			}
		});
	}
	/** `approval/decided` observed on the session log: drop a matching card if any. */
	dropApproval(callId) {
		if (callId === "") return;
		if (this.approvals.delete(callId)) this.broadcastPending();
	}
	/**
	* The `user-questions/request` waterfall answerer. Same policy as
	* approvals: claim only while a phone is connected, race the rest of the
	* chain (desktop UI stays a first-responder), resolve with the official
	* `AskUserQuestionAnswer` shape once every question item has an answer.
	*/
	claimQuestion(request, next) {
		if (this.clientCount === 0) return next();
		const info = extractQuestionRequest(request);
		if (info === null) return next();
		const downstream = next();
		return new Promise((resolve) => {
			const entry = {
				key: info.key,
				agent: info.agent,
				sessionId: info.sessionId,
				items: info.items,
				answers: [],
				done: false,
				resolve: (answer) => {
					if (entry.done) return;
					entry.done = true;
					this.questions.delete(entry.key);
					this.broadcastPending();
					resolve(answer);
				}
			};
			this.questions.set(entry.key, entry);
			this.broadcastPending();
			if (isThenable(downstream)) Promise.resolve(downstream).then((value) => {
				if (value !== null && typeof value === "object" && Array.isArray(value.answers)) entry.resolve(value);
			}, () => {});
			const signal = request.signal;
			if (signal !== void 0 && signal !== null && typeof signal.addEventListener === "function") {
				if (signal.aborted === true) entry.resolve(void 0);
				else signal.addEventListener("abort", () => entry.resolve(void 0), { once: true });
			}
		});
	}
	/** Record one answered question item; resolve the claim when all items are in. */
	answerQuestionItem(cardId, payload) {
		const separator = cardId.indexOf("::");
		const key = separator === -1 ? cardId : cardId.slice(0, separator);
		const itemId = separator === -1 ? "" : cardId.slice(separator + 2);
		const entry = this.questions.get(key);
		if (entry === void 0) throw new Error("该提问不存在或已被回答");
		const item = entry.items.find((candidate) => candidate.id === itemId && !candidate.answered);
		if (item === void 0) throw new Error("该问题不存在或已被回答");
		const selected = Array.isArray(payload.selected) ? payload.selected.map((value) => String(value)) : [];
		const custom = typeof payload.custom === "string" && payload.custom.trim() !== "" ? payload.custom.trim() : void 0;
		if (selected.length === 0 && custom === void 0) throw new Error("回答需要 selected 选项或 custom 文本");
		item.answered = true;
		entry.answers.push(custom !== void 0 ? {
			id: item.id,
			selected,
			...custom !== void 0 ? { custom } : {}
		} : {
			id: item.id,
			selected
		});
		if (entry.answers.length >= entry.items.length) {
			entry.resolve({ answers: entry.answers });
			return { id: cardId };
		}
		this.broadcastPending();
		return { id: cardId };
	}
	/** Drop a question card when the host reports it answered elsewhere. */
	dropQuestion(callId) {
		if (callId === "") return;
		if (this.questions.delete(`q-${callId}`)) this.broadcastPending();
	}
	/** New history item for one session; pushed to clients watching it. */
	broadcastItem(sessionId, item) {
		for (const client of this.clients.values()) if (client.watched === sessionId) this.send(client, {
			type: "item",
			sessionId,
			item
		});
	}
	/** Assistant stream frame; pushed to clients watching the session. */
	broadcastStream(sessionId, phase, text) {
		for (const client of this.clients.values()) if (client.watched === sessionId) this.send(client, {
			type: "stream",
			sessionId,
			phase,
			text
		});
	}
	/** Fresh session list to every client (used on api-session/* churn). */
	async broadcastSessions() {
		const sessions = await this.listSessions();
		for (const client of this.clients.values()) this.send(client, {
			type: "sessions",
			sessions
		});
	}
	/** Pending-card snapshot to every client. */
	broadcastPending() {
		const cards = this.pendingCards();
		for (const client of this.clients.values()) this.send(client, {
			type: "pending",
			cards
		});
	}
	/** Pending cards snapshot (approvals claimed by this server + questions). */
	pendingCards() {
		const cards = [];
		for (const entry of this.approvals.values()) cards.push({
			id: entry.key,
			kind: "approval",
			sessionId: entry.sessionId,
			...entry.toolName !== "" ? { toolName: entry.toolName } : {},
			...entry.reason !== "" ? { reason: entry.reason } : {}
		});
		for (const entry of this.questions.values()) for (const item of entry.items) {
			if (item.answered) continue;
			cards.push({
				id: `${entry.key}::${item.id}`,
				kind: "question",
				sessionId: entry.sessionId,
				question: item.question,
				...item.detail !== "" ? { detail: item.detail } : {},
				...item.options.length > 0 ? { options: item.options } : {},
				...item.multiSelect ? { multiSelect: true } : {}
			});
		}
		return cards;
	}
	/** Bootstrap payload of GET /api/status. */
	async statusData() {
		let sessions = [];
		let sessionsError = null;
		try {
			sessions = await this.listSessions();
		} catch (error) {
			sessionsError = error instanceof Error ? error.message : String(error);
		}
		return {
			server: {
				host: this.address.host,
				port: this.address.port
			},
			clientCount: this.clientCount,
			bridge: this.options.bridge.readiness(),
			sessions,
			pending: this.pendingCards(),
			...sessionsError !== null ? { sessionsError } : {}
		};
	}
	/** Normalized session list from the bridge. */
	async listSessions() {
		const rows = await this.options.bridge.listSessions();
		const sessions = [];
		for (const row of rows) {
			const summary = normalizeSessionSummary(row);
			if (summary !== null) sessions.push(summary);
		}
		return sessions;
	}
	async handle(request, response) {
		const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
		const pathname = url.pathname;
		try {
			if (pathname === "/" || pathname === "/index.html") {
				this.sendPage(response);
				return;
			}
			if (pathname === "/static/mobile.js") {
				this.sendMobileScript(response);
				return;
			}
			if (pathname === "/favicon.ico") {
				const icon = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><rect width=\"64\" height=\"64\" rx=\"14\" fill=\"#2563eb\"/><rect x=\"21\" y=\"10\" width=\"22\" height=\"40\" rx=\"5\" fill=\"none\" stroke=\"#fff\" stroke-width=\"4\"/><line x1=\"30\" y1=\"45\" x2=\"34\" y2=\"45\" stroke=\"#fff\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>";
				response.writeHead(200, {
					"content-type": "image/svg+xml",
					"cache-control": "public, max-age=86400",
					"content-length": Buffer.byteLength(icon)
				});
				response.end(icon);
				return;
			}
			if (!pathname.startsWith("/api/")) {
				sendJson$1(response, 404, {
					ok: false,
					error: "未知路径",
					code: "not_found"
				});
				return;
			}
			const gate = checkApiAccess(request, this.options.token);
			if (!gate.ok) {
				sendJson$1(response, gate.status, {
					ok: false,
					error: gate.message,
					code: gate.code
				});
				return;
			}
			await this.handleApi(pathname, url, request, response);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.options.log("warn", `请求 ${pathname} 失败：${message}`);
			if (!response.headersSent) sendJson$1(response, 500, {
				ok: false,
				error: message,
				code: "internal"
			});
			else response.end();
		}
	}
	async handleApi(pathname, url, request, response) {
		const method = (request.method ?? "GET").toUpperCase();
		if (pathname === "/api/stream" && method === "GET") {
			this.openStream(url, request, response);
			return;
		}
		if (pathname === "/api/status" && method === "GET") {
			sendJson$1(response, 200, {
				ok: true,
				data: await this.statusData()
			});
			return;
		}
		if (pathname === "/api/sessions" && method === "GET") {
			sendJson$1(response, 200, {
				ok: true,
				data: { sessions: await this.listSessions() }
			});
			return;
		}
		const events = /^\/api\/sessions\/([^/]+)\/events$/.exec(pathname);
		if (events !== null && method === "GET") {
			const sessionId = decodeURIComponent(events[1] ?? "");
			const payload = await this.options.bridge.readEvents(sessionId);
			const items = [];
			for (const raw of historyEventsOf(payload)) {
				const item = normalizeEventItem(raw);
				if (item !== null) items.push(item);
			}
			sendJson$1(response, 200, {
				ok: true,
				data: {
					sessionId,
					items
				}
			});
			return;
		}
		const prompt = /^\/api\/sessions\/([^/]+)\/prompt$/.exec(pathname);
		if (prompt !== null && method === "POST") {
			const body = await readJsonBody(request);
			const text = typeof body.text === "string" ? body.text.trim() : "";
			if (text === "") {
				sendJson$1(response, 400, {
					ok: false,
					error: "消息不能为空",
					code: "bad_request"
				});
				return;
			}
			const mode = body.mode === "steer" ? "steer" : "queue";
			await this.options.bridge.prompt(decodeURIComponent(prompt[1] ?? ""), text, mode);
			sendJson$1(response, 200, {
				ok: true,
				data: {
					queued: true,
					mode
				}
			});
			return;
		}
		const approval = /^\/api\/pending\/approvals\/([^/]+)$/.exec(pathname);
		if (approval !== null && method === "POST") {
			const body = await readJsonBody(request);
			const outcome = typeof body.outcome === "string" && APPROVAL_OUTCOMES.has(body.outcome) ? body.outcome : "";
			if (outcome === "") {
				sendJson$1(response, 400, {
					ok: false,
					error: "outcome 必须是 allowed-once / rejected / cancelled",
					code: "bad_request"
				});
				return;
			}
			const key = decodeURIComponent(approval[1] ?? "");
			const entry = this.approvals.get(key);
			if (entry === void 0) {
				sendJson$1(response, 404, {
					ok: false,
					error: "该审批不存在或已被处理",
					code: "not_found"
				});
				return;
			}
			entry.resolve(outcome);
			sendJson$1(response, 200, {
				ok: true,
				data: {
					id: key,
					outcome
				}
			});
			return;
		}
		const question = /^\/api\/pending\/questions\/([^/]+)$/.exec(pathname);
		if (question !== null && method === "POST") {
			const body = await readJsonBody(request);
			const cardId = decodeURIComponent(question[1] ?? "");
			sendJson$1(response, 200, {
				ok: true,
				data: this.answerQuestionItem(cardId, body)
			});
			return;
		}
		sendJson$1(response, 404, {
			ok: false,
			error: `未知接口：${pathname}`,
			code: "not_found"
		});
	}
	openStream(url, request, response) {
		response.writeHead(200, {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-store",
			connection: "keep-alive",
			"x-accel-buffering": "no"
		});
		const client = {
			id: randomUUID(),
			res: response,
			watched: url.searchParams.get("sid") || null
		};
		this.clients.set(client.id, client);
		this.send(client, {
			type: "hello",
			watched: client.watched
		});
		this.send(client, {
			type: "pending",
			cards: this.pendingCards()
		});
		request.on("close", () => {
			this.clients.delete(client.id);
		});
	}
	ping() {
		for (const client of this.clients.values()) try {
			client.res.write(": ping\n\n");
		} catch {
			this.clients.delete(client.id);
		}
	}
	send(client, frame) {
		try {
			client.res.write(frameLine(frame));
		} catch {
			this.clients.delete(client.id);
		}
	}
	sendPage(response) {
		const body = renderPage();
		response.writeHead(200, {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
			"content-length": Buffer.byteLength(body),
			"x-content-type-options": "nosniff"
		});
		response.end(body);
	}
	sendMobileScript(response) {
		if (this.mobileScript === null) {
			const file = this.options.mobileScriptFile ?? new URL("./mobile.js", import.meta.url);
			try {
				this.mobileScript = readFileSync(file);
			} catch {
				this.mobileScript = Buffer.from("/* mobile bundle missing: run `npm run build` */", "utf8");
				this.options.log("warn", `lib/mobile.js 缺失（${String(file)}），请先构建`);
			}
		}
		const body = this.mobileScript;
		response.writeHead(200, {
			"content-type": "text/javascript; charset=utf-8",
			"cache-control": "no-store",
			"content-length": body.length,
			"x-content-type-options": "nosniff"
		});
		response.end(body);
	}
};
// src/remote-ctrl.ts
/**
* The RemoteCtrl controller: owns config resolution (home/host/port/token),
* the LAN server lifecycle, and the host-event handlers `apply` subscribes.
* The desktop panel reads {@link panelStatus} through the host webServer
* route (loopback only); the phone talks to the RcServer directly.
*
* @module dsh-remote-ctrl/remote-ctrl
*/
/** Package version surfaced in logs. */
const REMOTE_CTRL_VERSION = "0.0.1-preview.0";
const LOG_PREFIX = "dsh-remote-ctrl: ";
/** Resolve the persistence home: config → env → ~/.dsh/remote-ctrl. */
function resolveHome(configured) {
	const explicit = configured?.trim() ?? "";
	if (explicit !== "") return explicit;
	const fromEnv = process.env.DSH_REMOTE_CTRL_HOME?.trim() ?? "";
	if (fromEnv !== "") return fromEnv;
	return join(os.homedir(), ".dsh", "remote-ctrl");
}
var RemoteCtrl = class {
	ctx;
	home;
	bridge = new HostBridge();
	warnings = [];
	configHost;
	configPort;
	configToken;
	server = null;
	token = "";
	sessionsRefresh = null;
	constructor(ctx, config = {}) {
		this.ctx = ctx;
		this.home = resolveHome(config.home);
		const host = config.host?.trim() ?? "";
		this.configHost = host !== "" ? host : "0.0.0.0";
		const port = Number(config.port);
		this.configPort = Number.isFinite(port) && port >= 0 && port <= 65535 ? Math.trunc(port) : 31080;
		this.configToken = typeof config.token === "string" ? config.token : "";
	}
	/** Create the token and start listening; failures degrade to status, never throw. */
	start() {
		try {
			mkdirSync(this.home, { recursive: true });
		} catch {}
		try {
			this.token = loadOrCreateToken(this.home, this.configToken);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.token = randomUUID().replace(/-/gu, "");
			this.warnings.push(`配对码无法持久化（${message}），本次运行使用临时配对码`);
			this.log("warn", `配对码无法持久化到 ${this.home}：${message}；本次运行使用临时配对码`);
		}
		const server = new RcServer({
			host: this.configHost,
			port: this.configPort,
			token: this.token,
			bridge: this.bridge,
			log: (level, message) => this.log(level, message)
		});
		this.server = server;
		server.listen().catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			server.listenError = message;
			this.log("error", `启动远程控制服务失败（host=${this.configHost} port=${this.configPort}，端口被占用？）：${message}`);
		});
	}
	log(level, message) {
		const line = `${LOG_PREFIX}${message}`;
		try {
			this.ctx.logger?.[level]?.(line);
		} catch {}
	}
	/** Panel data plane status. */
	panelStatus() {
		const server = this.server;
		const port = server?.port ?? this.configPort;
		const addresses = lanAddresses().map((entry) => ({
			address: entry.address,
			scope: entry.scope,
			url: `http://${entry.family === 6 ? `[${entry.address}]` : entry.address}:${port}/`
		}));
		const origin = ((addresses.find((entry) => entry.scope === "private") ?? addresses[0] ?? null)?.url ?? `http://127.0.0.1:${port}/`).replace(/\/+$/u, "");
		return {
			active: server !== null,
			listening: server?.listening ?? false,
			error: server?.listenError ?? "",
			host: this.configHost,
			port,
			addresses,
			recommendedUrl: `${origin}/`,
			qrUrl: `${origin}/?token=${encodeURIComponent(this.token)}`,
			token: this.token,
			clientCount: server?.clientCount ?? 0,
			bridge: this.bridge.readiness()
		};
	}
	/** `session/event`: append renderable items to watchers, track decisions. */
	onSessionEvent(session, event) {
		const server = this.server;
		if (server === null || event === null || typeof event !== "object") return;
		const record = event;
		const sessionId = sessionIdOf(session);
		const type = typeof record.type === "string" ? record.type : typeof record.kind === "string" ? record.kind : "";
		if (type === "approval/decided") {
			server.dropApproval(firstStringLike(record.callId) ?? firstStringLike(record.id) ?? "");
			return;
		}
		if (type === "user/message") {
			const source = record.source ?? record.message?.source;
			if (source !== void 0 && source.kind === "user-question-reply") server.dropQuestion(firstStringLike(source.callId) ?? "");
		}
		const item = normalizeEventItem(record);
		if (item !== null) server.broadcastItem(sessionId, item);
	}
	/** `agent/assistant-stream`: token-level frames for the watched session. */
	onAssistantStream(payload) {
		const server = this.server;
		if (server === null || payload === null || typeof payload !== "object") return;
		const record = payload;
		const agent = record.agent;
		if (agent === void 0) return;
		const sessionId = sessionIdOf(agent);
		const frame = normalizeStreamFrame(record.frame ?? record);
		if (frame === null) return;
		server.broadcastStream(sessionId, frame.phase, frame.text);
	}
	/** `approval/request` waterfall answerer (delegates to the server). */
	onApprovalRequest(request, next) {
		return this.server?.claimApproval(request, next) ?? next();
	}
	/** `user-questions/request` waterfall answerer (delegates to the server). */
	onQuestionRequest(request, next) {
		return this.server?.claimQuestion(request, next) ?? next();
	}
	/** Debounced session-list refresh broadcast (api-session/* churn). */
	scheduleSessionsRefresh() {
		if (this.server === null) return;
		if (this.sessionsRefresh !== null) return;
		this.sessionsRefresh = setTimeout(() => {
			this.sessionsRefresh = null;
			this.server?.broadcastSessions().catch((error) => {
				this.log("debug", `会话列表刷新失败：${error instanceof Error ? error.message : String(error)}`);
			});
		}, 300);
		this.sessionsRefresh.unref?.();
	}
	/** Tear down server, timers. */
	dispose() {
		if (this.sessionsRefresh !== null) {
			clearTimeout(this.sessionsRefresh);
			this.sessionsRefresh = null;
		}
		this.server?.dispose();
	}
};
function sessionIdOf(scope) {
	if (scope === null || typeof scope !== "object") return "";
	const record = scope;
	if (typeof record.id === "string" && record.id !== "") return record.id;
	if (typeof record.sessionId === "string") return record.sessionId;
	const session = record.session;
	return typeof session?.id === "string" ? session.id : "";
}
function firstStringLike(value) {
	return typeof value === "string" && value !== "" ? value : null;
}
// src/ui-routes.ts
const API_PREFIX = "/remote-ctrl/api";
const LOOPBACK_HOSTS = /* @__PURE__ */ new Set([
	"127.0.0.1",
	"localhost",
	"[::1]"
]);
/** Hostname of the Host header (port stripped; IPv6 keeps its brackets). */
function hostnameOf(hostHeader) {
	const value = String(hostHeader ?? "").trim().toLowerCase();
	if (value.startsWith("[")) {
		const end = value.indexOf("]");
		return end === -1 ? value : value.slice(0, end + 1);
	}
	const colon = value.lastIndexOf(":");
	return colon === -1 ? value : value.slice(0, colon);
}
/** Header value as a lowercase string (array headers join on their first value). */
function headerValue(request, name) {
	const value = request.headers[name];
	if (Array.isArray(value)) return String(value[0] ?? "").toLowerCase();
	return String(value ?? "").toLowerCase();
}
/** Loopback-only + same-origin-mutation admission (hub `isAdmitted` shape). */
function isAdmitted(request) {
	const hostHeader = String(request.headers.host ?? "");
	if (!LOOPBACK_HOSTS.has(hostnameOf(hostHeader))) return false;
	const method = String(request.method ?? "GET").toUpperCase();
	if (method === "GET" || method === "HEAD") return true;
	if (headerValue(request, "sec-fetch-site") === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin !== void 0 && String(origin) !== `http://${hostHeader}` && String(origin) !== `https://${hostHeader}`) return false;
	return headerValue(request, "content-type").includes("application/json");
}
/**
* Mount the panel API on the host webServer. Synchronous first; the caller
* falls back to `ctx.inject(['webServer'], …)` when the service is pending.
*/
function mountUiRoutes(ctx, ctrl) {
	const source = ctx;
	const webServer = source?.get?.("webServer") ?? source?.webServer;
	const inactive = (reason) => ({
		active: false,
		reason,
		path: API_PREFIX,
		dispose: () => {}
	});
	if (!webServer || typeof webServer.register !== "function") return inactive("宿主未提供 webServer 服务，桌面面板数据面不可用");
	const handle = (request, response) => {
		if (!isAdmitted(request)) {
			sendJson(response, 403, {
				ok: false,
				error: "拒绝访问：面板 API 只允许本机回环页面的同源请求",
				code: "forbidden"
			});
			return;
		}
		const pathname = String(request.url ?? "/").split("?")[0] ?? "";
		const route = pathname.startsWith(API_PREFIX) ? pathname.slice(16) || "/" : pathname;
		const method = String(request.method ?? "GET").toUpperCase();
		if (route === "/status" && (method === "GET" || method === "HEAD")) {
			const body = JSON.stringify({
				ok: true,
				data: ctrl.panelStatus()
			});
			response.writeHead(200, {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-store",
				"content-length": Buffer.byteLength(body)
			});
			response.end(body);
			return;
		}
		if (route === "/status") {
			sendJson(response, 405, {
				ok: false,
				error: `不支持的请求方法：${method}`,
				code: "method_not_allowed"
			});
			return;
		}
		sendJson(response, 404, {
			ok: false,
			error: `未知接口：${route}`,
			code: "not_found"
		});
	};
	const dispose = webServer.register({
		kind: "prefix",
		path: API_PREFIX,
		handler: handle
	});
	ctrl.log("info", `桌面面板 API 已挂载：${API_PREFIX}`);
	return {
		active: true,
		reason: "",
		path: API_PREFIX,
		dispose
	};
}
function sendJson(response, status, payload) {
	const body = JSON.stringify(payload);
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"content-length": Buffer.byteLength(body)
	});
	response.end(body);
}
// src/index.ts
/**
* dsh-remote-ctrl — DSH 的局域网远程控制。
*
* 定位：本包是一个 DSH 插件（cordis bundle）。它自起一个 node:http 服务
* （默认绑定 0.0.0.0，所有局域网地址皆可访问），手机浏览器通过配对码
* 连接后可以：浏览会话与实时输出、发送消息、批准工具调用、回答提问；
* 桌面端面板（slots）负责展示地址、二维码与配对码。
*
* 只依赖 Node 内置模块与宿主 ctx 接口：不得 import 任何 @deepseek-ai/*。
*
* @module dsh-remote-ctrl
*/
/** Cordis 插件名，用于日志与加载器识别。 */
const name = "remote-ctrl";
/** 本插件不硬依赖任何宿主服务：自起 HTTP 服务立即可用，会话服务晚到再桥接。 */
const inject = [];
/**
* 插件入口。启动失败不会让宿主加载失败：错误写入日志并在面板 status 里展示。
*
* @param ctx - 宿主注入的上下文。
* @param config - 来自 cordis.patch.yml 的配置。
* @returns RemoteCtrl
*/
function apply(ctx, config = {}) {
	const ctrl = new RemoteCtrl(ctx, config);
	ctrl.start();
	try {
		ctx.effect?.(() => () => ctrl.dispose(), "dsh-remote-ctrl: lifecycle");
	} catch {}
	const listen = (event, listener, label) => {
		try {
			const dispose = ctx.on(event, listener);
			if (typeof dispose === "function") ctx.effect?.(() => dispose, label);
		} catch (error) {
			ctrl.log("warn", `订阅 ${event} 失败：${error instanceof Error ? error.message : String(error)}`);
		}
	};
	listen("session/event", (session, event) => ctrl.onSessionEvent(session, event), "dsh-remote-ctrl: session/event");
	listen("agent/assistant-stream", (payload) => ctrl.onAssistantStream(payload), "dsh-remote-ctrl: agent/assistant-stream");
	listen("approval/request", (request, next) => ctrl.onApprovalRequest(request, next), "dsh-remote-ctrl: approval answerer");
	listen("user-questions/request", (request, next) => ctrl.onQuestionRequest(request, next), "dsh-remote-ctrl: questions answerer");
	for (const event of [
		"api-session/added",
		"api-session/removed",
		"api-session/status",
		"api-session/activity"
	]) listen(event, () => ctrl.scheduleSessionsRefresh(), `dsh-remote-ctrl: ${event}`);
	for (const service of ["sessionQuery", "sessionController"]) deferService(ctx, [service], (scope) => {
		ctrl.bridge.attach(scope, service);
	}, (message) => ctrl.log("warn", message));
	let uiRoutes = {
		active: false,
		reason: "未挂载",
		path: "/remote-ctrl/api",
		dispose: () => {}
	};
	try {
		uiRoutes = mountUiRoutes(ctx, ctrl);
		if (uiRoutes.active && typeof ctx.effect === "function") ctx.effect(() => () => uiRoutes.dispose(), "dsh-remote-ctrl: panel API");
	} catch (error) {
		uiRoutes = {
			active: false,
			reason: `挂载面板 API 失败：${error instanceof Error ? error.message : String(error)}`,
			path: "/remote-ctrl/api",
			dispose: () => {}
		};
	}
	if (!uiRoutes.active) deferService(ctx, ["webServer"], (scope) => {
		const status = mountUiRoutes(scope, ctrl);
		if (status.active && typeof scope?.effect === "function") scope.effect(() => () => status.dispose(), "dsh-remote-ctrl: panel API");
	}, (message) => ctrl.log("warn", message));
	ctrl.log("info", `v${REMOTE_CTRL_VERSION} 已加载；远程服务 http://${ctrl.panelStatus().host}:${ctrl.panelStatus().port}/；面板 API：${uiRoutes.active ? "已挂载" : uiRoutes.reason}`);
	return ctrl;
}
export { apply, inject, name };
