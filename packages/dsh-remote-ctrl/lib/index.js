import http from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
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
* Request gate of the plugin's LAN gateway. The host's `/api` trust fence
* does not cover plugin routes, and this server exposes the full DSH web UI
* to the LAN on purpose — so every request carries its own admission checks:
*
* - Host header must resolve to this machine (anti DNS-rebinding);
* - every request needs the pairing token: `Authorization: Bearer`, `?token=`
*   (how the QR link opens), or the pairing cookie minted on the first
*   authenticated response (so the web UI's own fetches/WebSockets pass
*   without re-sending the token);
* - state-changing requests additionally need a same-origin Origin, and a
*   browser-attested `sec-fetch-site: cross-site` is rejected outright
*   (mirrors the dsh-agent-extension `isAdmitted` fence).
*
* @module dsh-remote-ctrl/auth
*/
const STATE_VERSION = 1;
/** Name of the pairing cookie minted on the first authenticated response. */
const PAIRING_COOKIE = "dsh-remote-ctrl";
function writeState(file, state) {
	const enabledField = state.enabled === void 0 ? {} : { enabled: state.enabled };
	const persisted = {
		version: STATE_VERSION,
		token: state.token,
		...enabledField
	};
	writeFileSync(file, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");
}
/** Read the persisted state, or null when it is missing/unreadable. */
function readState(home) {
	try {
		return JSON.parse(readFileSync(join(home, "remote-ctrl.json"), "utf8"));
	} catch {
		return null;
	}
}
/**
* Whether the user left the LAN gateway enabled. Absent state (first run,
* legacy token-only file) means enabled.
*/
function loadEnabled(home) {
	return readState(home)?.enabled !== false;
}
/** Persist the user's enabled intent next to the token. */
function saveEnabled(home, token, enabled) {
	mkdirSync(home, { recursive: true });
	writeState(join(home, "remote-ctrl.json"), {
		version: STATE_VERSION,
		token,
		enabled
	});
}
/** Persist a replacement pairing token, keeping the enabled intent. */
function saveToken(home, token, enabled) {
	mkdirSync(home, { recursive: true });
	writeState(join(home, "remote-ctrl.json"), {
		version: STATE_VERSION,
		token,
		enabled
	});
}
/** Mint a fresh pairing token (manual rotation). */
function mintToken() {
	return randomBytes(24).toString("base64url");
}
/**
* Resolve the pairing token: an explicitly configured one wins; otherwise
* the persisted one is reused so QR codes stay valid across restarts; a
* fresh random token is minted and persisted on first run. Legacy state
* without a version marker is migrated in place (same token, adds version,
* keeps the enabled intent).
*/
function loadOrCreateToken(home, configured) {
	const trimmed = configured.trim();
	if (trimmed !== "") return trimmed;
	const file = join(home, "remote-ctrl.json");
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		const token = typeof parsed.token === "string" ? parsed.token : "";
		if (token !== "") {
			if (parsed.version !== STATE_VERSION) {
				const enabledField = typeof parsed.enabled === "boolean" ? { enabled: parsed.enabled } : {};
				writeState(file, {
					version: STATE_VERSION,
					token,
					...enabledField
				});
			}
			return token;
		}
	} catch {}
	mkdirSync(home, { recursive: true });
	const token = randomBytes(24).toString("base64url");
	writeState(file, {
		version: STATE_VERSION,
		token
	});
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
function headerRaw(request, name) {
	const value = request.headers?.[name];
	if (Array.isArray(value)) return String(value[0] ?? "");
	return String(value ?? "");
}
function safeEqual(left, right) {
	const leftBytes = Buffer.from(left, "utf8");
	const rightBytes = Buffer.from(right, "utf8");
	return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
/** One cookie value out of a raw Cookie header (exact name match). */
function cookieValue(rawCookie, name) {
	for (const segment of rawCookie.split(";")) {
		const at = segment.indexOf("=");
		if (at === -1 || segment.slice(0, at).trim() !== name) continue;
		return segment.slice(at + 1).trim();
	}
}
/**
* Pairing token of one request: Bearer header first, then `?token=` (how the
* QR link opens), then the pairing cookie minted after the first visit.
*/
function tokenOf(request) {
	const authorization = headerRaw(request, "authorization");
	const match = /^bearer\s+(.+)$/iu.exec(authorization);
	if (match !== null) {
		const token = (match[1] ?? "").trim();
		if (token !== "") return token;
	}
	try {
		const token = new URL(String(request.url ?? "/"), "http://localhost").searchParams.get("token");
		if (token !== null && token !== "") return token;
	} catch {}
	const rawCookie = headerRaw(request, "cookie");
	if (rawCookie !== "") {
		const token = cookieValue(rawCookie, PAIRING_COOKIE);
		if (token !== void 0 && token !== "") return token;
	}
	return null;
}
/** The pairing session cookie minted on every authenticated response (idempotent). */
function pairingCookieHeader(token) {
	return `${PAIRING_COOKIE}=${token}; Path=/; Max-Age=15552000; HttpOnly; SameSite=Lax`;
}
/** Whether this request may pass the gateway. */
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
	return { ok: true };
}
// src/server.ts
/**
* The plugin's LAN gateway: a token-gated reverse proxy in front of the host
* web UI. The host webServer binds loopback only and refuses wildcard
* addresses, so the plugin owns one listener on `config.host` (default
* 0.0.0.0) + `config.port` and forwards everything to it — the phone opens
* the complete, responsive DSH web UI (sessions, streaming, approvals,
* questions — all native), the plugin only adds LAN reachability plus the
* pairing token.
*
* Upstream authentication mirrors the host's browser-auth exactly
* (`browser-auth.ts`): the launch token is exchanged once server-side
* (`ctx.connection.authenticatedUrl`) for the signed `dsh-auth-*` cookie,
* which is cached for upstream requests and handed to the phone on first
* responses. The upstream `Host` header is rewritten to the loopback origin
* so both the cookie authority and the `/api` trust fence stay valid; the
* browser's own cookies simply round-trip through the proxy.
*
* SSE and streaming responses pipe through unbuffered; WebSocket upgrades
* are gated and relayed socket-to-socket.
*
* @module dsh-remote-ctrl/server
*/
/** Hop-by-hop headers that must not travel across the proxy. */
const HOP_BY_HOP = /* @__PURE__ */ new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade"
]);
function withoutHopByHop(headers) {
	const result = {};
	for (const [name, value] of Object.entries(headers)) {
		if (HOP_BY_HOP.has(name.toLowerCase())) continue;
		result[name] = value;
	}
	return result;
}
/** Merge one `name=value` pair into a raw Cookie header (replacing an existing same-name entry). */
function mergeCookie(rawCookie, cookie) {
	const name = cookie.slice(0, Math.max(cookie.indexOf("="), 0));
	const parts = [];
	for (const segment of (rawCookie ?? "").split(";")) {
		const trimmed = segment.trim();
		if (trimmed === "") continue;
		if (trimmed.startsWith(`${name}=`)) continue;
		parts.push(trimmed);
	}
	parts.push(cookie);
	return parts.join("; ");
}
/**
* Rewrite browser-surface headers to the upstream authority: Origin and
* Referer must agree with the rewritten Host for the host's `/api` trust
* fence (same-authority Origin check) to admit proxied requests.
*/
function rewriteBrowserHeaders(headers, authority) {
	const origin = headers.origin;
	if (typeof origin === "string" && origin !== "") headers.origin = `http://${authority}`;
	const referer = headers.referer;
	if (typeof referer === "string" && referer !== "") try {
		const refererUrl = new URL(referer);
		headers.referer = `http://${authority}${refererUrl.pathname}${refererUrl.search}`;
	} catch {
		delete headers.referer;
	}
}
function toArray(value) {
	if (value === void 0) return [];
	return Array.isArray(value) ? value : [value];
}
/** Bodies at or below this size are buffered so a stale-cookie 401 can replay them. */
const MAX_BUFFERED_BODY_BYTES = 8388608;
/**
* Buffer small request bodies for replay; `null` means stream the original
* request through (large or chunked bodies). Body-less methods buffer an
* empty buffer so retries always work for them.
*/
function readBufferedBody(request) {
	const method = (request.method ?? "GET").toUpperCase();
	if (method === "GET" || method === "HEAD") return Promise.resolve(Buffer.alloc(0));
	const declared = Number(request.headers["content-length"] ?? "0");
	if (Number.isFinite(declared) && declared > MAX_BUFFERED_BODY_BYTES) return Promise.resolve(null);
	return new Promise((resolve) => {
		const chunks = [];
		let size = 0;
		let overflow = false;
		request.on("data", (chunk) => {
			if (overflow) return;
			size += chunk.length;
			if (size > MAX_BUFFERED_BODY_BYTES) {
				overflow = true;
				chunks.length = 0;
				request.destroy(/* @__PURE__ */ new Error("请求体超过网关缓冲上限，无法代理重试"));
				resolve(null);
				return;
			}
			chunks.push(chunk);
		});
		request.on("end", () => {
			if (!overflow) resolve(Buffer.concat(chunks));
		});
		request.on("error", () => {
			if (!overflow) resolve(null);
		});
		request.on("close", () => {
			if (!overflow && !request.readableEnded) resolve(null);
		});
	});
}
var RcServer = class {
	options;
	http = null;
	address;
	connections = 0;
	listening = false;
	listenError = "";
	constructor(options) {
		this.options = options;
		this.address = {
			host: options.host,
			port: options.port
		};
	}
	/** Listener port after listen (port 0 resolves to the OS-assigned value). */
	get port() {
		return this.address.port;
	}
	/** Currently proxied upstream exchanges (requests + relays). */
	get connectionCount() {
		return this.connections;
	}
	/** Bind and start serving. Resolves once the listener is up. */
	async listen() {
		const server = http.createServer((request, response) => {
			this.handle(request, response);
		});
		server.requestTimeout = 0;
		server.on("upgrade", (request, socket, head) => {
			this.handleUpgrade(request, socket, head);
		});
		server.on("connection", (socket) => {
			socket.setTimeout(0);
		});
		await new Promise((resolve, reject) => {
			server.once("error", reject);
			server.listen(this.options.port, this.options.host, () => resolve());
		});
		this.http = server;
		this.listening = true;
		this.listenError = "";
		const addr = server.address();
		if (addr !== null && typeof addr === "object") this.address.port = addr.port;
		this.options.log("info", `局域网网关已监听 http://${this.options.host}:${this.address.port}/（上游 ${this.options.upstream.origin() ?? "未就绪"}）`);
	}
	/** Stop serving and close the listener. */
	dispose() {
		if (this.http !== null) {
			const server = this.http;
			this.http = null;
			try {
				server.close();
			} catch {}
		}
		this.listening = false;
	}
	upstreamAuthority(origin) {
		try {
			return new URL(origin).host;
		} catch {
			return;
		}
	}
	async handle(request, response) {
		const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
		try {
			const gate = checkApiAccess(request, this.options.token);
			if (!gate.ok) {
				this.deny(response, gate.status, gate.code, gate.message);
				return;
			}
			const origin = this.options.upstream.origin();
			if (origin === null) {
				this.deny(response, 503, "upstream_unavailable", "宿主 web 服务尚未就绪：请稍后刷新（需 web/desktop profile 且宿主已启动）");
				return;
			}
			await this.proxyOnce(request, response, origin);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.options.log("warn", `请求 ${url.pathname} 代理失败：${message}`);
			if (!response.headersSent) this.deny(response, 502, "bad_gateway", `上游请求失败：${message}`);
			else response.destroy();
		}
	}
	/** Forward one request; on upstream 401 re-exchange the host cookie and replay once. */
	async proxyOnce(request, response, origin) {
		const authority = this.upstreamAuthority(origin);
		if (authority === void 0) throw new Error(`上游地址不合法：${origin}`);
		let cookie = this.options.upstream.authCookieSync();
		let minted = null;
		if (cookie === null) {
			minted = await this.options.upstream.authCookie(true);
			cookie = minted;
		}
		const buffered = await readBufferedBody(request);
		if (await this.send(request, response, origin, authority, cookie, buffered, true, minted !== null ? [minted] : []) !== 401) return;
		const fresh = await this.options.upstream.authCookie(true);
		if (fresh === null) {
			this.deny(response, 502, "bad_gateway", "上游会话代换失败：宿主 connection 服务不可用");
			return;
		}
		if (!(buffered !== null || request.method === "GET" || request.method === "HEAD")) {
			this.deny(response, 401, "unauthorized", "宿主会话已更新，请刷新页面后重试");
			return;
		}
		await this.send(request, response, origin, authority, fresh, buffered, false, []);
	}
	/**
	* Run one upstream exchange and pipe the response. Resolves with the
	* upstream status; when `swallowUnauthorized` is set the 401 body is
	* consumed but not written (the caller decides the retry), otherwise the
	* response streams straight through — SSE and chunked bodies included.
	* `extraSetCookies` rides the response for the phone's cookie jar (the
	* server-side launch-token exchange result).
	*/
	send(request, response, origin, authority, cookie, buffered, swallowUnauthorized, extraSetCookies) {
		return new Promise((resolve, reject) => {
			const headers = {
				...withoutHopByHop(request.headers),
				host: authority
			};
			rewriteBrowserHeaders(headers, authority);
			if (cookie !== null) headers.cookie = mergeCookie(request.headers.cookie, cookie);
			if (buffered !== null) headers["content-length"] = String(buffered.length);
			const upstream = http.request(`${origin}${request.url ?? "/"}`, {
				method: request.method,
				headers
			});
			this.connections += 1;
			if (buffered !== null) upstream.end(buffered);
			else {
				request.pipe(upstream);
				request.on("error", () => upstream.destroy());
			}
			upstream.on("response", (upstreamResponse) => {
				const status = upstreamResponse.statusCode ?? 502;
				if (status === 401 && swallowUnauthorized) {
					upstreamResponse.resume();
					upstreamResponse.on("end", () => resolve(status));
					upstreamResponse.on("error", () => resolve(status));
					return;
				}
				const setCookie = [
					...extraSetCookies,
					...toArray(upstreamResponse.headers["set-cookie"]),
					pairingCookieHeader(this.options.token)
				];
				response.writeHead(status, {
					...withoutHopByHop(upstreamResponse.headers),
					"set-cookie": setCookie
				});
				upstreamResponse.pipe(response);
				upstreamResponse.on("end", () => resolve(status));
				upstreamResponse.on("error", () => {
					response.destroy();
					resolve(status);
				});
			});
			upstream.on("error", (error) => reject(error));
			upstream.on("close", () => {
				this.connections = Math.max(0, this.connections - 1);
			});
		});
	}
	handleUpgrade(request, socket, head) {
		(async () => {
			const gate = checkApiAccess(request, this.options.token);
			if (!gate.ok) {
				socket.end(`HTTP/1.1 ${gate.status} ${gate.code}\r\nconnection: close\r\n\r\n`);
				return;
			}
			const origin = this.options.upstream.origin();
			const authority = origin === null ? void 0 : this.upstreamAuthority(origin);
			if (origin === null || authority === void 0) {
				socket.end("HTTP/1.1 503 upstream unavailable\r\nconnection: close\r\n\r\n");
				return;
			}
			const cookie = this.options.upstream.authCookieSync();
			const headers = {
				...request.headers,
				host: authority
			};
			rewriteBrowserHeaders(headers, authority);
			if (cookie !== null) headers.cookie = mergeCookie(request.headers.cookie, cookie);
			const upstream = http.request(`${origin}${request.url ?? "/"}`, {
				method: request.method,
				headers
			});
			this.connections += 1;
			upstream.end(head.length > 0 ? head : void 0);
			await new Promise((resolve) => {
				upstream.on("upgrade", (upstreamResponse, upstreamSocket, upstreamHead) => {
					const headLines = [`HTTP/${upstreamResponse.httpVersion} ${upstreamResponse.statusCode ?? 101} ${upstreamResponse.statusMessage ?? ""}`];
					for (const [name, value] of Object.entries(upstreamResponse.headers)) for (const item of toArray(value)) headLines.push(`${name}: ${item}`);
					socket.write(`${headLines.join("\r\n")}\r\n\r\n`);
					if (upstreamHead.length > 0) socket.write(upstreamHead);
					upstreamSocket.pipe(socket);
					socket.pipe(upstreamSocket);
					const close = () => {
						socket.destroy();
						upstreamSocket.destroy();
						resolve();
					};
					socket.on("error", close);
					upstreamSocket.on("error", close);
					socket.on("close", close);
				});
				upstream.on("response", (upstreamResponse) => {
					const headLines = [`HTTP/${upstreamResponse.httpVersion} ${upstreamResponse.statusCode ?? 502} ${upstreamResponse.statusMessage ?? ""}`];
					for (const [name, value] of Object.entries(withoutHopByHop(upstreamResponse.headers))) for (const item of toArray(value)) headLines.push(`${name}: ${item}`);
					socket.end(`${headLines.join("\r\n")}\r\n\r\n`);
					resolve();
				});
				upstream.on("error", () => {
					socket.destroy();
					resolve();
				});
				socket.on("error", () => {
					upstream.destroy();
					resolve();
				});
			});
			this.connections = Math.max(0, this.connections - 1);
		})();
	}
	deny(response, status, code, message) {
		const body = JSON.stringify({
			ok: false,
			error: message,
			code
		});
		response.writeHead(status, {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
			"content-length": Buffer.byteLength(body)
		});
		response.end(body);
	}
};
// src/remote-ctrl.ts
/**
* The RemoteCtrl controller: owns config resolution (home/host/port/token),
* the LAN gateway lifecycle, and the upstream handle (host webServer origin
* + launch-token cookie exchange) the proxy needs. The desktop panel reads
* {@link panelStatus} through the host webServer route (loopback only).
*
* @module dsh-remote-ctrl/remote-ctrl
*/
/** Package version surfaced in logs. */
const REMOTE_CTRL_VERSION = "0.0.1-preview.4";
/**
* Default listener port. High and uncommon on purpose: it sits below the
* OS ephemeral range (49152+), so the gateway rarely collides with another
* service or with an outgoing connection's temporary port.
*/
const DEFAULT_PORT = 47291;
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
	warnings = [];
	configHost;
	configPort;
	configToken;
	server = null;
	listenPending = null;
	token = "";
	tokenPinned;
	enabled = true;
	disposed = false;
	webServer = null;
	connection = null;
	cachedAuthCookie = null;
	exchange = null;
	constructor(ctx, config = {}) {
		this.ctx = ctx;
		this.home = resolveHome(config.home);
		const host = config.host?.trim() ?? "";
		this.configHost = host !== "" ? host : "0.0.0.0";
		const port = Number(config.port);
		this.configPort = Number.isFinite(port) && port >= 0 && port <= 65535 ? Math.trunc(port) : DEFAULT_PORT;
		this.configToken = typeof config.token === "string" ? config.token : "";
		this.tokenPinned = this.configToken.trim() !== "";
	}
	/**
	* Load the persisted state and start listening when the user left the
	* gateway enabled; failures degrade to status, never throw.
	*/
	start() {
		try {
			mkdirSync(this.home, { recursive: true });
		} catch {}
		try {
			this.token = loadOrCreateToken(this.home, this.configToken);
			this.enabled = loadEnabled(this.home);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.token = randomUUID().replace(/-/gu, "");
			this.enabled = true;
			this.warnings.push(`配对码无法持久化（${message}），本次运行使用临时配对码`);
			this.log("warn", `配对码无法持久化到 ${this.home}：${message}；本次运行使用临时配对码`);
		}
		if (this.enabled) {
			this.startServer();
			return;
		}
		this.log("info", "远程控制处于停止状态（remote-ctrl.json 的 enabled=false），在面板里点「启动」即可恢复");
	}
	/** User intent: run the gateway. Persists the intent and starts listening. */
	async enable() {
		this.enabled = true;
		this.persistEnabled();
		this.startServer();
		await this.listenPending;
	}
	/** User intent: keep the gateway down. Persists the intent and closes the listener. */
	disable() {
		this.enabled = false;
		this.persistEnabled();
		this.stopServer();
	}
	/** Create the listener unless one is already up; a previous failure retries. */
	startServer() {
		if (this.disposed) return;
		if (this.server !== null) {
			if (this.server.listening) return;
			this.stopServer();
		}
		const server = new RcServer({
			host: this.configHost,
			port: this.configPort,
			token: this.token,
			upstream: this.upstreamHandle(),
			log: (level, message) => this.log(level, message)
		});
		this.server = server;
		this.listenPending = server.listen().catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			server.listenError = message;
			this.log("error", `启动局域网网关失败（host=${this.configHost} port=${this.configPort}，端口被占用？）：${message}`);
		});
	}
	/** Close the listener without changing the persisted intent. */
	stopServer() {
		this.server?.dispose();
		this.server = null;
		this.listenPending = null;
	}
	/**
	* Rotate the pairing token: mint a fresh one, persist it (keeping the
	* enabled intent) and rebind the listener so old pairings stop working.
	* A token pinned in config cannot rotate. Resolves once the listener is
	* back up (or its failure is reported), so the caller can answer with a
	* settled status.
	*
	* @returns whether the token actually changed.
	*/
	async refreshToken() {
		if (this.tokenPinned) return false;
		const token = mintToken();
		try {
			saveToken(this.home, token, this.enabled);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log("warn", `刷新配对码失败：无法写入 ${this.home}（${message}）`);
			return false;
		}
		this.token = token;
		if (this.server !== null) {
			this.stopServer();
			this.startServer();
			await this.listenPending;
		}
		this.log("info", "配对码已刷新：旧配对码立即失效，手机需重新扫码");
		return true;
	}
	/** Persist the enabled intent beside the token; failure stays local. */
	persistEnabled() {
		try {
			saveEnabled(this.home, this.token, this.enabled);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.warnings.push(`启用状态无法持久化（${message}）`);
			this.log("warn", `启用状态无法持久化到 ${this.home}：${message}`);
		}
	}
	log(level, message) {
		const line = `${LOG_PREFIX}${message}`;
		try {
			this.ctx.logger?.[level]?.(line);
		} catch {}
	}
	/** Attach the upstream services once they appear (cordis availability). */
	attachUpstream(scope, name) {
		const source = scope;
		const service = source?.get?.(name) ?? source?.[name];
		if (!service) return false;
		if (name === "webServer" && typeof service.getOrigin === "function") {
			this.webServer = service;
			return true;
		}
		if (name === "connection" && typeof service.authenticatedUrl === "function") {
			this.connection = service;
			return true;
		}
		return false;
	}
	/** The proxy's upstream face: origin lookup + launch-token cookie exchange. */
	upstreamHandle() {
		return {
			origin: () => this.hostOrigin(),
			authCookieSync: () => this.cachedAuthCookie,
			authCookie: (force) => this.exchangeAuthCookie(force === true)
		};
	}
	/** Host web origin, or null while the webServer service is pending. */
	hostOrigin() {
		if (this.webServer === null) return null;
		try {
			const origin = this.webServer.getOrigin();
			return typeof origin === "string" && origin !== "" ? origin : null;
		} catch {
			return null;
		}
	}
	/**
	* Exchange the process launch token for the signed upstream cookie and
	* cache it. The request itself must carry the upstream authority as its
	* Host header so the minted cookie's authority matches the rewritten
	* proxied requests.
	*/
	exchangeAuthCookie(force) {
		if (!force && this.cachedAuthCookie !== null) return Promise.resolve(this.cachedAuthCookie);
		if (this.exchange !== null) return this.exchange;
		const origin = this.hostOrigin();
		if (origin === null || this.connection === null) return Promise.resolve(null);
		let authedUrl;
		try {
			authedUrl = this.connection.authenticatedUrl(`${origin}/`);
		} catch (error) {
			this.log("warn", `换取宿主会话失败：${error instanceof Error ? error.message : String(error)}`);
			return Promise.resolve(null);
		}
		this.exchange = new Promise((resolve) => {
			const request = http.request(authedUrl, { method: "GET" }, (response) => {
				const setCookie = response.headers["set-cookie"]?.[0];
				response.resume();
				response.on("end", () => {
					this.exchange = null;
					const value = typeof setCookie === "string" ? setCookie.split(";")[0] ?? null : null;
					if (value !== null) {
						this.cachedAuthCookie = value;
						this.log("debug", "已通过 launch token 代换宿主会话 cookie");
					}
					resolve(value);
				});
				response.on("error", () => {
					this.exchange = null;
					resolve(null);
				});
			});
			request.on("error", () => {
				this.exchange = null;
				this.log("debug", "换取宿主会话 cookie 失败（宿主未就绪？）");
				resolve(null);
			});
			request.end();
		});
		return this.exchange;
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
		const upstreamOrigin = this.hostOrigin() ?? "";
		return {
			enabled: this.enabled,
			active: server !== null,
			listening: server?.listening ?? false,
			error: server?.listenError ?? "",
			host: this.configHost,
			port,
			addresses,
			recommendedUrl: `${origin}/`,
			qrUrl: `${origin}/?token=${encodeURIComponent(this.token)}`,
			tokenPinned: this.tokenPinned,
			token: this.token,
			clientCount: server?.connectionCount ?? 0,
			upstream: {
				origin: upstreamOrigin,
				ready: upstreamOrigin !== "" && this.connection !== null
			}
		};
	}
	/** Tear down server. */
	dispose() {
		this.disposed = true;
		this.stopServer();
	}
};
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
		routeRequest(request, response).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			ctrl.log("warn", `面板 API 处理失败：${message}`);
			if (!response.headersSent) sendJson(response, 500, {
				ok: false,
				error: `面板 API 处理失败：${message}`,
				code: "internal_error"
			});
			else response.destroy();
		});
	};
	/** Route one admitted request; start/token-refresh wait for the listener. */
	async function routeRequest(request, response) {
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
		if (route === "/start" || route === "/stop") {
			if (method !== "POST") {
				sendJson(response, 405, {
					ok: false,
					error: `不支持的请求方法：${method}`,
					code: "method_not_allowed"
				});
				return;
			}
			if (route === "/start") await ctrl.enable();
			else ctrl.disable();
			sendJson(response, 200, {
				ok: true,
				data: ctrl.panelStatus()
			});
			return;
		}
		if (route === "/token/refresh") {
			if (method !== "POST") {
				sendJson(response, 405, {
					ok: false,
					error: `不支持的请求方法：${method}`,
					code: "method_not_allowed"
				});
				return;
			}
			if (!await ctrl.refreshToken()) {
				sendJson(response, 409, {
					ok: false,
					error: "配对码来自 cordis.patch.yml 的 config.token，无法在面板里刷新",
					code: "token_pinned"
				});
				return;
			}
			sendJson(response, 200, {
				ok: true,
				data: ctrl.panelStatus()
			});
			return;
		}
		sendJson(response, 404, {
			ok: false,
			error: `未知接口：${route}`,
			code: "not_found"
		});
	}
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
* dsh-remote-ctrl — DSH 的局域网远程访问网关。
*
* 定位：本包是一个 DSH 插件（cordis bundle）。宿主 web UI 只绑回环且拒绝
* 通配地址，本插件自起一个 node:http 网关（默认 0.0.0.0:31080）把它反代
* 出去：手机扫码（配对码）即得完整、自适应的 DSH Web UI —— 会话、流式
* 输出、发送消息、工具审批、智能体提问全部是宿主原生能力，本插件不做
* 任何业务 UI。桌面端面板（slots）负责展示地址、二维码与配对码。
*
* 只依赖 Node 内置模块与宿主 ctx 接口：不得 import 任何 @deepseek-ai/*。
*
* @module dsh-remote-ctrl
*/
/** Cordis 插件名，用于日志与加载器识别。 */
const name = "remote-ctrl";
/** 本插件不硬依赖任何宿主服务：网关立即启动，上游服务晚到再挂载。 */
const inject = [];
/** 延迟等待可选服务就绪后执行 callback（失败只记日志，不抛宿主）。 */
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
	deferService(ctx, ["webServer"], (scope) => {
		if (ctrl.attachUpstream(scope, "webServer")) ctrl.log("info", `宿主 web 服务已就绪：${ctrl.panelStatus().upstream.origin}`);
	}, (message) => ctrl.log("warn", message));
	deferService(ctx, ["connection"], (scope) => {
		ctrl.attachUpstream(scope, "connection");
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
	ctrl.log("info", `v${REMOTE_CTRL_VERSION} 已加载；网关 http://${ctrl.panelStatus().host}:${ctrl.panelStatus().port}/；面板 API：${uiRoutes.active ? "已挂载" : uiRoutes.reason}`);
	return ctrl;
}
export { apply, inject, name };
