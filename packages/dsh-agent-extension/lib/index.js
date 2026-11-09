import { appendFileSync, chmodSync, closeSync, copyFileSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
// src/frontmatter.ts
/** Strip quotes from both sides of a value. */
function unquote(value) {
	const text = value.trim();
	if (text.length >= 2) {
		const first = text[0];
		const last = text[text.length - 1];
		if (first === "\"" && last === "\"" || first === "'" && last === "'") return text.slice(1, -1).replace(/\\(["'\\])/gu, "$1");
	}
	return text;
}
/** Parse one scalar value: boolean, number, inline array, or string. */
function parseScalar(raw) {
	const text = raw.trim();
	if (text === "") return "";
	if (text === "true") return true;
	if (text === "false") return false;
	if (text === "null" || text === "~") return null;
	if (/^-?\d+(?:\.\d+)?$/u.test(text)) return Number(text);
	if (text.startsWith("[") && text.endsWith("]")) {
		const inner = text.slice(1, -1).trim();
		if (inner === "") return [];
		return inner.split(",").map((item) => parseScalar(item));
	}
	return unquote(text);
}
/**
* Parse the YAML frontmatter of a Markdown document.
*
* @param text - raw Markdown.
* @returns the parsed data, the body after the frontmatter, and tolerance warnings.
*/
function parseFrontmatter(text) {
	const source = typeof text === "string" ? text : "";
	const warnings = [];
	const normalized = source.replace(/\r\n/gu, "\n");
	if (!normalized.startsWith("---\n")) return {
		data: {},
		body: normalized,
		hasFrontmatter: false,
		warnings
	};
	const end = normalized.indexOf("\n---", 4);
	if (end === -1) {
		warnings.push("frontmatter 未闭合，按正文处理");
		return {
			data: {},
			body: normalized,
			hasFrontmatter: false,
			warnings
		};
	}
	const header = normalized.slice(4, end);
	let body = normalized.slice(end + 4);
	if (body.startsWith("\n")) body = body.slice(1);
	const data = {};
	let currentKey = null;
	let currentList = null;
	for (const line of header.split("\n")) {
		if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
		const listItem = /^\s*-\s+(.*)$/u.exec(line);
		if (listItem && currentKey !== null) {
			if (currentList === null) {
				currentList = [];
				data[currentKey] = currentList;
			}
			currentList.push(parseScalar(listItem[1]));
			continue;
		}
		if (/^\s/u.test(line) && currentKey !== null) {
			warnings.push(`跳过嵌套 frontmatter 行：${line.trim()}`);
			continue;
		}
		const pair = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/u.exec(line);
		if (!pair) {
			warnings.push(`无法解析的 frontmatter 行：${line.trim()}`);
			continue;
		}
		currentKey = pair[1];
		currentList = null;
		const value = pair[2];
		if (value.trim() === "") data[currentKey] = null;
		else data[currentKey] = parseScalar(value);
	}
	return {
		data,
		body,
		hasFrontmatter: true,
		warnings
	};
}
/**
* Split arguments following shell habits (single/double quotes and backslash escapes).
*
* @param input - raw argument text.
*/
function splitArguments(input) {
	const text = typeof input === "string" ? input : "";
	const args = [];
	let current = "";
	let quote = null;
	let hasContent = false;
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (quote !== null) {
			if (char === "\\" && quote === "\"" && index + 1 < text.length) {
				current += text[index + 1];
				index += 1;
				continue;
			}
			if (char === quote) {
				quote = null;
				hasContent = true;
				continue;
			}
			current += char;
			continue;
		}
		if (char === "\"" || char === "'") {
			quote = char;
			hasContent = true;
			continue;
		}
		if (char === "\\" && index + 1 < text.length) {
			current += text[index + 1];
			index += 1;
			hasContent = true;
			continue;
		}
		if (/\s/u.test(char)) {
			if (hasContent || current !== "") {
				args.push(current);
				current = "";
				hasContent = false;
			}
			continue;
		}
		current += char;
		hasContent = true;
	}
	if (hasContent || current !== "") args.push(current);
	return args;
}
/**
* Render a command template: replace `$ARGUMENTS` and `$1`..`$9`. Without any
* placeholder, the arguments are appended as a "user input" block.
*
* @param template - command body (frontmatter already stripped).
* @param rawInput - user-provided arguments.
*/
function renderCommandTemplate(template, rawInput) {
	const body = typeof template === "string" ? template : "";
	const raw = typeof rawInput === "string" ? rawInput.trim() : "";
	const args = splitArguments(raw);
	let rendered = body;
	let used = false;
	if (rendered.includes("$ARGUMENTS")) {
		rendered = rendered.split("$ARGUMENTS").join(raw);
		used = true;
	}
	rendered = rendered.replace(/\$(\d)/gu, (match, digit) => {
		const index = Number(digit) - 1;
		if (index < 0) return match;
		used = true;
		return args[index] ?? "";
	});
	if (!used && raw !== "") rendered = `${rendered.trimEnd()}\n\n用户输入：${raw}\n`;
	return rendered;
}
// src/formats.ts
/** Per-format capability directory layout (the Claude convention; the other two are minimal-compatibility estimates). */
const FORMATS = Object.freeze([
	Object.freeze({
		id: "claude",
		label: "Claude Code",
		pluginManifests: Object.freeze([".claude-plugin/plugin.json"]),
		rootManifests: Object.freeze(["plugin.json"]),
		marketplaceFiles: Object.freeze([".claude-plugin/marketplace.json", "marketplace.json"]),
		skillsDirs: Object.freeze(["skills"]),
		commandsDirs: Object.freeze(["commands"]),
		hooksFiles: Object.freeze(["hooks/hooks.json"]),
		mcpFiles: Object.freeze([".mcp.json"])
	}),
	Object.freeze({
		id: "codebuddy",
		label: "CodeBuddy",
		pluginManifests: Object.freeze([".codebuddy-plugin/plugin.json"]),
		rootManifests: Object.freeze(["plugin.json"]),
		marketplaceFiles: Object.freeze([".codebuddy-plugin/marketplace.json", "marketplace.json"]),
		skillsDirs: Object.freeze(["skills"]),
		commandsDirs: Object.freeze(["commands"]),
		hooksFiles: Object.freeze(["hooks/hooks.json"]),
		mcpFiles: Object.freeze([".mcp.json"])
	}),
	Object.freeze({
		id: "zcode",
		label: "ZCode",
		pluginManifests: Object.freeze([".zcode-plugin/plugin.json"]),
		rootManifests: Object.freeze(["plugin.json"]),
		marketplaceFiles: Object.freeze([".zcode-plugin/marketplace.json", "marketplace.json"]),
		skillsDirs: Object.freeze(["skills"]),
		commandsDirs: Object.freeze(["commands"]),
		hooksFiles: Object.freeze(["hooks/hooks.json"]),
		mcpFiles: Object.freeze([".mcp.json"])
	})
]);
/** Format priority (id array, in probe order). */
const FORMAT_PRIORITY = Object.freeze([
	"claude",
	"codebuddy",
	"zcode"
]);
const BY_ID = new Map(FORMATS.map((format) => [format.id, format]));
/** Look up one format definition by id. */
function findFormat(id) {
	return BY_ID.get(id);
}
/** Whether an id names a registered format. */
function isFormatId(id) {
	return BY_ID.has(id);
}
/** Plugin name allowlist: starts alphanumeric, allows `._-`, at most 64 chars. */
const PLUGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
/**
* Whether a plugin name is safe (also rejects path separators and `..`).
* @param name - candidate plugin name.
*/
function isSafePluginName(name) {
	if (typeof name !== "string" || !PLUGIN_NAME.test(name)) return false;
	if (name.includes("..")) return false;
	return true;
}
/**
* Normalize arbitrary text into a host command name (DSH command names only
* allow `[a-z][a-z0-9_-]*` with no colon, so parent-child relations join on `-`).
*
* @param input - raw command text.
*/
function toCommandName(input) {
	const trimmed = String(input ?? "").toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/-+/gu, "-").replace(/^-+|-+$/gu, "");
	if (trimmed === "") return "unnamed";
	return (/^[a-z]/u.test(trimmed) ? trimmed : `cmd-${trimmed}`).slice(0, 64);
}
// src/manifest.ts
/**
* Agent plugin manifest handling: probing, validation, metadata
* normalization, and source resolution for plugin.json / marketplace.json.
*
* Schema v2 conventions:
* - marketplace.json listing metadata (displayName/category/author/homepage/
*   icon/keywords…) normalizes into the entry `meta`, market-level data into
*   `display`; unknown fields are ignored, only non-empty legal values kept;
* - Optional text fields accept either a plain string or an
*   `{en, zh-cn, zh, ...}` localized object;
* - `plugin.json` display fields are returned by `validatePluginManifest`
*   for UI fallback.
*
* Required fields are strict (name only); optional fields are tolerant —
* `version` follows the Claude/ZCode ecosystem convention and defaults to
* `0.0.0` when absent; whether to keep the raw manifest is the caller's
* decision.
*
* @module dsh-agent-extension/manifest
*/
/** Read and parse a JSON file; errors carry actionable Chinese text. */
function readJsonFile(filePath) {
	let text;
	try {
		text = readFileSync(filePath, "utf8");
	} catch (error) {
		throw new Error(`无法读取 ${filePath}：${error instanceof Error ? error.message : String(error)}`);
	}
	try {
		return JSON.parse(text.replace(/^\uFEFF/u, ""));
	} catch (error) {
		throw new Error(`${filePath} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
	}
}
/** The path names an existing regular file. */
function isFile(filePath) {
	try {
		return statSync(filePath).isFile();
	} catch {
		return false;
	}
}
/** The path names an existing directory. */
function isDirectory(dirPath) {
	try {
		return statSync(dirPath).isDirectory();
	} catch {
		return false;
	}
}
function isObject$3(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Trimmed non-empty string, or the empty string. */
function textOf(value) {
	return typeof value === "string" ? value.trim() : "";
}
/**
* Normalize a text field: accepts a string or an `{en, zh-cn, zh}` object.
*
* @param value - raw field value.
*/
function normalizeLocalizedText(value) {
	if (typeof value === "string") return {
		text: value.trim(),
		i18n: null
	};
	if (!isObject$3(value)) return {
		text: "",
		i18n: null
	};
	const i18n = {};
	for (const [rawKey, rawValue] of Object.entries(value)) {
		const key = typeof rawKey === "string" ? rawKey.trim().toLowerCase() : "";
		const text = textOf(rawValue);
		if (key !== "" && text !== "") i18n[key] = text;
	}
	const keys = Object.keys(i18n);
	if (keys.length === 0) return {
		text: "",
		i18n: null
	};
	const first = keys[0];
	return {
		text: i18n.default ?? i18n.en ?? i18n["zh-cn"] ?? i18n.zh ?? (first !== void 0 ? i18n[first] ?? "" : ""),
		i18n
	};
}
/**
* Normalize an author: accepts a string or `{name, email?, url?}`.
*
* @param value - raw author value.
*/
function normalizeAuthor$1(value) {
	if (typeof value === "string") {
		const name = value.trim();
		return name === "" ? null : { name };
	}
	if (!isObject$3(value)) return null;
	const name = textOf(value.name);
	if (name === "") return null;
	const author = { name };
	const email = textOf(value.email);
	const url = textOf(value.url) || textOf(value.homepage);
	if (email !== "") author.email = email;
	if (url !== "") author.url = url;
	return author;
}
/**
* Normalize a string array: drop empties and duplicates; one non-empty string counts as one item.
*
* @param value - raw list value.
*/
function normalizeStringArray(value) {
	const items = [];
	const push = (item) => {
		const text = textOf(item);
		if (text !== "") items.push(text);
	};
	if (Array.isArray(value)) for (const item of value) push(item);
	else if (typeof value === "string") push(value);
	return [...new Set(items)];
}
/** Normalize an icon field: only string (or `{url}`-shaped) addresses/paths count. */
function normalizeIconValue(value) {
	if (typeof value === "string") return value.trim();
	if (isObject$3(value)) return textOf(value.url) || textOf(value.src) || textOf(value.path);
	return "";
}
/**
* Normalize a marketplace.json entry (or persisted meta) into `meta`.
*
* Only non-empty legal values survive; unknown fields are ignored. Field set
* (schema v2): `displayName, displayNameI18n, descriptionI18n, icon, category,
* author, homepage, repository, license, keywords`; `description` is also
* kept (migrated data derives it from the old field as the UI fallback).
*
* @param value - raw entry value.
*/
function normalizeEntryMeta(value) {
	const source = isObject$3(value) ? value : {};
	const meta = {};
	const displayName = normalizeLocalizedText(source.displayName ?? source.title);
	if (displayName.text !== "") meta.displayName = displayName.text;
	if (displayName.i18n !== null) meta.displayNameI18n = displayName.i18n;
	const description = normalizeLocalizedText(source.description);
	if (description.text !== "") meta.description = description.text;
	if (description.i18n !== null) meta.descriptionI18n = description.i18n;
	const icon = normalizeIconValue(source.icon ?? source.logo);
	if (icon !== "") meta.icon = icon;
	const category = textOf(source.category) || textOf(isObject$3(source.metadata) ? source.metadata.category : void 0);
	if (category !== "") meta.category = category;
	const author = normalizeAuthor$1(source.author);
	if (author !== null) meta.author = author;
	const homepage = textOf(source.homepage);
	if (homepage !== "") meta.homepage = homepage;
	const repository = textOf(source.repository);
	if (repository !== "") meta.repository = repository;
	const license = textOf(source.license);
	if (license !== "") meta.license = license;
	const keywords = normalizeStringArray(source.keywords ?? source.tags);
	if (keywords.length > 0) meta.keywords = keywords;
	return meta;
}
/**
* Normalize the market-level display (fixed three fields: title / description / owner).
*
* @param value - persisted display object (or any object carrying title/description/owner).
* @param fallbackTitle - title used when the value carries none.
*/
function normalizeMarketDisplay(value, fallbackTitle) {
	const source = isObject$3(value) ? value : {};
	const title = normalizeLocalizedText(source.title ?? source.displayName ?? source.name);
	const description = normalizeLocalizedText(source.description);
	const owner = normalizeAuthor$1(source.owner) ?? { name: "" };
	return {
		title: title.text || textOf(fallbackTitle),
		description: description.text,
		owner
	};
}
/**
* Build the market-level display from a marketplace.json top-level manifest.
*
* @param manifest - raw marketplace.json object.
*/
function buildMarketDisplay(manifest) {
	return normalizeMarketDisplay(manifest, textOf(manifest.name));
}
/**
* Probe a plugin directory for its format and manifest.
*
* Format-specific manifests are probed in the order claude > codebuddy >
* zcode; when none hits, the root `plugin.json` is used with `hintFormat`
* (claude by default) and a warning is recorded.
*
* @param root - plugin root directory (absolute path).
* @param options - optional format hint.
* @throws {Error} when the directory does not exist or no plugin.json is found.
*/
function detectPluginManifest(root, options = {}) {
	if (!isDirectory(root)) throw new Error(`插件目录不存在：${root}`);
	const warnings = [];
	for (const formatId of FORMAT_PRIORITY) {
		const format = findFormat(formatId);
		if (!format) continue;
		for (const relative of format.pluginManifests) {
			const candidate = path.join(root, relative);
			if (isFile(candidate)) {
				const manifest = readJsonFile(candidate);
				if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error(`${candidate} 顶层必须是 JSON 对象`);
				return {
					format: format.id,
					manifestPath: candidate,
					manifest,
					warnings
				};
			}
		}
	}
	const hint = textOf(options.hintFormat);
	const fallbackFormat = hint !== "" && findFormat(hint) ? hint : "claude";
	const fallback = findFormat(fallbackFormat);
	for (const relative of fallback?.rootManifests ?? []) {
		const candidate = path.join(root, relative);
		if (isFile(candidate)) {
			const manifest = readJsonFile(candidate);
			if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error(`${candidate} 顶层必须是 JSON 对象`);
			warnings.push(`只有根级 plugin.json，未找到格式专属清单；按 ${fallbackFormat} 处理`);
			return {
				format: fallbackFormat,
				manifestPath: candidate,
				manifest,
				warnings
			};
		}
	}
	throw new Error(`未找到 plugin.json：${root} 下应存在 .claude-plugin/plugin.json（或 .codebuddy-plugin、.zcode-plugin 之一）`);
}
/**
* Validate plugin.json required fields and normalize its display metadata.
*
* @param manifest - raw plugin.json object.
* @param context - format and manifest path for diagnostics.
*/
function validatePluginManifest(manifest, context) {
	const warnings = [];
	const name = textOf(manifest.name);
	const rawVersion = textOf(manifest.version);
	const version = rawVersion !== "" ? rawVersion : "0.0.0";
	if (name === "") throw new Error(`${context.manifestPath} 缺少必填字段 name`);
	if (!isSafePluginName(name)) throw new Error(`${context.manifestPath} 的 name 不合法：${name}（只允许字母数字与 ._-，最长 64，且不得含 ..）`);
	if (rawVersion !== "" && String(manifest.version).trim() !== rawVersion) warnings.push("version 含首尾空白，已规整");
	return {
		name,
		version,
		description: textOf(manifest.description),
		author: normalizeAuthor$1(manifest.author),
		homepage: textOf(manifest.homepage) || null,
		repository: textOf(manifest.repository) || null,
		license: textOf(manifest.license) || null,
		keywords: normalizeStringArray(manifest.keywords),
		icon: normalizeIconValue(manifest.icon) || null,
		category: textOf(manifest.category) || textOf(isObject$3(manifest.metadata) ? manifest.metadata.category : void 0) || null,
		warnings
	};
}
/** Probe a directory for marketplace.json. */
function detectMarketplaceFile(root, options = {}) {
	if (!isDirectory(root)) throw new Error(`市场目录不存在：${root}`);
	for (const formatId of FORMAT_PRIORITY) {
		const format = findFormat(formatId);
		if (!format) continue;
		for (const relative of format.marketplaceFiles) {
			const candidate = path.join(root, relative);
			if (isFile(candidate)) return {
				format: format.id,
				file: candidate,
				manifest: readJsonFile(candidate)
			};
		}
	}
	const hint = textOf(options.hintFormat);
	const hinted = hint !== "" ? findFormat(hint) : void 0;
	if (hinted) for (const relative of hinted.marketplaceFiles) {
		const candidate = path.join(root, relative);
		if (isFile(candidate)) return {
			format: hinted.id,
			file: candidate,
			manifest: readJsonFile(candidate)
		};
	}
	throw new Error(`未找到 marketplace.json：${root} 下应存在 .claude-plugin/marketplace.json 或 marketplace.json`);
}
/** Trimmed non-empty string, or the empty string (local helper). */
function nonEmptyString$3(value) {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : "";
}
/**
* Normalize a marketplace entry `source` (string or object) into a typed reference.
*
* @param source - raw source value.
* @param warnings - tolerance warnings collector.
*/
function normalizeSource(source, warnings = []) {
	if (typeof source === "string") {
		const trimmed = source.trim();
		if (trimmed === "") {
			warnings.push("插件条目缺少 source");
			return { kind: "unknown" };
		}
		if (trimmed.startsWith("./") || trimmed.startsWith("../") || trimmed.startsWith("/") || trimmed.startsWith("\\") || /^[A-Za-z]:[\\/]/u.test(trimmed)) return {
			kind: "local",
			raw: trimmed
		};
		if (/^https?:\/\//u.test(trimmed) || trimmed.startsWith("git@") || trimmed.endsWith(".git")) return {
			kind: "git",
			raw: trimmed,
			url: trimmed
		};
		return {
			kind: "other",
			raw: trimmed
		};
	}
	if (source === null || typeof source !== "object" || Array.isArray(source)) {
		warnings.push("插件条目 source 类型无法识别");
		return { kind: "unknown" };
	}
	const record = source;
	const type = nonEmptyString$3(record.source) || nonEmptyString$3(record.type);
	switch (type) {
		case "github": {
			const repo = nonEmptyString$3(record.repo) || nonEmptyString$3(record.url);
			if (repo === "") {
				warnings.push("github 源缺少 repo");
				return { kind: "unknown" };
			}
			return {
				kind: "github",
				repo,
				commit: nonEmptyString$3(record.commit) || nonEmptyString$3(record.sha) || nonEmptyString$3(record.ref) || void 0,
				path: nonEmptyString$3(record.path) || nonEmptyString$3(record.directory) || void 0
			};
		}
		case "npm": return {
			kind: "npm",
			package: nonEmptyString$3(record.package) || nonEmptyString$3(record.name) || void 0
		};
		case "git":
		case "url": return {
			kind: "git",
			url: nonEmptyString$3(record.url) || nonEmptyString$3(record.repo) || void 0,
			commit: nonEmptyString$3(record.commit) || nonEmptyString$3(record.sha) || void 0,
			path: nonEmptyString$3(record.path) || nonEmptyString$3(record.directory) || void 0
		};
		default:
			warnings.push(`未知 source 类型：${type || String(record.source)}`);
			return {
				kind: "unknown",
				raw: source
			};
	}
}
/**
* Parse a marketplace.json top-level structure into normalized plugin entries
* (each carrying `meta` display metadata).
*
* @param manifest - raw marketplace.json object.
* @param context - format, root, and optional origin for diagnostics.
*/
function parseMarketplace(manifest, _context) {
	const warnings = [];
	if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("marketplace.json 顶层必须是 JSON 对象");
	const record = manifest;
	const name = nonEmptyString$3(record.name);
	if (name === "") throw new Error("marketplace.json 缺少必填字段 name");
	const pluginsRaw = record.plugins;
	if (!Array.isArray(pluginsRaw) || pluginsRaw.length === 0) throw new Error("marketplace.json 的 plugins 必须是非空数组");
	const display = buildMarketDisplay(record);
	const featured = [];
	const markFeatured = (pluginName) => {
		if (!isSafePluginName(pluginName)) return;
		if (!featured.includes(pluginName)) featured.push(pluginName);
	};
	const explicitFeatured = typeof record.featured === "string" ? [record.featured] : Array.isArray(record.featured) ? record.featured : [];
	for (const item of explicitFeatured) markFeatured(textOf(item));
	const plugins = [];
	const seen = /* @__PURE__ */ new Set();
	for (const [index, entry] of pluginsRaw.entries()) {
		if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
			warnings.push(`plugins[${index}] 不是对象，已跳过`);
			continue;
		}
		const entryRecord = entry;
		const pluginName = nonEmptyString$3(entryRecord.name);
		if (pluginName === "") {
			warnings.push(`plugins[${index}] 缺少 name，已跳过`);
			continue;
		}
		if (!isSafePluginName(pluginName)) {
			warnings.push(`plugins[${index}] 名称不合法（${pluginName}），已跳过`);
			continue;
		}
		if (seen.has(pluginName)) {
			warnings.push(`插件 ${pluginName} 重复出现，保留第一条`);
			continue;
		}
		seen.add(pluginName);
		if (entryRecord.featured === true || isObject$3(entryRecord.metadata) && entryRecord.metadata.featured === true) markFeatured(pluginName);
		const entryWarnings = [];
		const source = normalizeSource(entryRecord.source, entryWarnings);
		const description = normalizeLocalizedText(entryRecord.description);
		plugins.push({
			name: pluginName,
			version: nonEmptyString$3(entryRecord.version),
			description: description.text,
			source,
			meta: normalizeEntryMeta(entry),
			warnings: entryWarnings
		});
		warnings.push(...entryWarnings.map((item) => `${pluginName}: ${item}`));
	}
	if (plugins.length === 0) throw new Error("marketplace.json 没有可用插件条目");
	return {
		name,
		owner: display.owner.name,
		display,
		featured,
		plugins,
		warnings
	};
}
/**
* Resolve a relative marketplace entry source into an absolute path;
* out-of-bounds and absolute paths are always rejected.
*
* @param root - market root directory (absolute path).
* @param relative - relative source, e.g. `./plugins/demo`.
*/
function resolveRelativeSource(root, relative) {
	const value = String(relative ?? "");
	if (value === "" || path.isAbsolute(value) || /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("\\")) throw new Error(`插件 source 不能是空值或绝对路径：${value}`);
	const resolved = path.resolve(root, value);
	const rootResolved = path.resolve(root);
	const prefix = rootResolved.endsWith(path.sep) ? rootResolved : `${rootResolved}${path.sep}`;
	if (resolved !== rootResolved && !resolved.startsWith(prefix)) throw new Error(`插件 source 越出市场根目录：${value}`);
	if (path.relative(rootResolved, resolved).split(path.sep).includes("..")) throw new Error(`插件 source 不得包含 ..：${value}`);
	return resolved;
}
/** Whether a directory looks like a plugin (any format-specific manifest or a root plugin.json). */
function looksLikePluginDir(dir) {
	if (!isDirectory(dir)) return false;
	try {
		detectPluginManifest(dir);
		return true;
	} catch {
		return false;
	}
}
// src/capabilities.ts
/**
* Capability scanning: read skills / commands / hooks / mcpServers from an
* agent plugin directory.
*
* Read-only: no plugin code executes. Symbolic links are always skipped so
* nothing escapes the cache directory through a link.
*
* @module dsh-agent-extension/capabilities
*/
/** Maximum files per capability scan, so a pathological plugin cannot stall startup. */
const MAX_FILES = 2e3;
/** Capability kinds that can be toggled individually. */
const CAPABILITY_KINDS = [
	"skills",
	"commands",
	"hooks",
	"mcpServers"
];
/** The per-item disable table. */
function emptyDisabledCapabilities() {
	return {
		skills: [],
		commands: [],
		hooks: [],
		mcpServers: []
	};
}
/**
* Normalize the persisted per-item toggle table: unknown kinds and illegal
* values are dropped.
*
* @param value - raw disable table.
*/
function normalizeDisabledCapabilities(value) {
	const result = emptyDisabledCapabilities();
	if (value === null || typeof value !== "object" || Array.isArray(value)) return result;
	const record = value;
	for (const kind of CAPABILITY_KINDS) {
		const list = record[kind];
		if (!Array.isArray(list)) continue;
		result[kind] = [...new Set(list.filter((item) => typeof item === "string" && item.trim() !== "").map((item) => item.trim()))];
	}
	return result;
}
/** Whether one capability item is individually disabled. */
function isCapabilityDisabled(record, kind, name) {
	const disabled = record?.disabledCapabilities?.[kind];
	return Array.isArray(disabled) && disabled.includes(name);
}
/** Recursively list matching files (skipping symlinks and hidden .git directories). */
function findFiles(root, options) {
	const { match, limit = MAX_FILES, warnings = [] } = options;
	const results = [];
	let visited = 0;
	const walk = (dir, depth) => {
		if (depth > 6 || results.length >= limit) return;
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch (error) {
			warnings.push(`无法读取目录 ${dir}：${error instanceof Error ? error.message : String(error)}`);
			return;
		}
		for (const entry of entries) {
			if (results.length >= limit) return;
			if (entry.name.startsWith(".git")) continue;
			const full = path.join(dir, entry.name);
			if (entry.isSymbolicLink()) {
				warnings.push(`跳过符号链接：${full}`);
				continue;
			}
			if (entry.isDirectory()) {
				walk(full, depth + 1);
				continue;
			}
			if (!entry.isFile()) continue;
			visited += 1;
			if (visited > MAX_FILES * 4) return;
			if (match(full, entry.name)) results.push(full);
		}
	};
	if (isDirectory(root)) walk(root, 0);
	return results;
}
/** Collapse string / array / object-map values into a string array (deduped, empties dropped). */
function normalizeStringList(value) {
	const items = [];
	const push = (item) => {
		if (typeof item === "string" && item.trim() !== "") items.push(item.trim());
	};
	if (typeof value === "string") push(value);
	else if (Array.isArray(value)) for (const item of value) push(item);
	else if (value !== null && typeof value === "object") for (const key of Object.keys(value)) push(key);
	return [...new Set(items)];
}
/** Parse a SKILL.md frontmatter into a skill definition. */
function parseSkillFile(filePath, fallbackName) {
	let text;
	try {
		text = readFileSync(filePath, "utf8");
	} catch (error) {
		throw new Error(`无法读取技能文件 ${filePath}：${error instanceof Error ? error.message : String(error)}`);
	}
	const { data, body, warnings } = parseFrontmatter(text);
	const dir = path.dirname(filePath);
	const rawName = typeof data.name === "string" ? data.name.trim() : "";
	const name = rawName !== "" ? rawName : fallbackName;
	const description = typeof data.description === "string" && data.description.trim() !== "" ? data.description.trim() : "";
	const whenToUse = typeof data.whenToUse === "string" ? data.whenToUse : typeof data.when_to_use === "string" ? data.when_to_use : "";
	const allowedTools = Array.isArray(data["allowed-tools"]) ? data["allowed-tools"] : data.allowedTools;
	const disableModelInvocation = data["disable-model-invocation"] === true;
	return {
		name,
		description,
		whenToUse,
		allowedTools: normalizeStringList(allowedTools),
		content: body,
		dir,
		file: filePath,
		warnings,
		invocation: {
			modelInvocable: !disableModelInvocation,
			userInvocable: true
		}
	};
}
/** Scan the plugin directory for skills. */
function scanSkills(pluginRoot, formatId) {
	const warnings = [];
	const format = findFormat(formatId) ?? findFormat("claude");
	const skills = [];
	for (const relative of format?.skillsDirs ?? []) {
		const files = findFiles(path.join(pluginRoot, relative), {
			warnings,
			match: (_file, base) => base === "SKILL.md" || base === "skill.md"
		});
		for (const file of files) {
			const fallbackName = path.basename(path.dirname(file));
			try {
				const skill = parseSkillFile(file, fallbackName);
				if (!isSafePluginName(skill.name)) {
					warnings.push(`技能名不合法（${skill.name}），跳过 ${file}`);
					continue;
				}
				if (skill.description === "") warnings.push(`技能 ${skill.name} 缺少 description`);
				skills.push(skill);
			} catch (error) {
				warnings.push(error instanceof Error ? error.message : String(error));
			}
		}
	}
	return {
		skills,
		warnings
	};
}
/** Parse a command Markdown file. */
function parseCommandFile(filePath, relativeName) {
	let text;
	try {
		text = readFileSync(filePath, "utf8");
	} catch (error) {
		throw new Error(`无法读取命令文件 ${filePath}：${error instanceof Error ? error.message : String(error)}`);
	}
	const { data, body, warnings } = parseFrontmatter(text);
	const description = typeof data.description === "string" && data.description.trim() !== "" ? data.description.trim() : `来自 ${path.basename(filePath)} 的命令`;
	const argumentHint = typeof data["argument-hint"] === "string" ? data["argument-hint"] : typeof data.argumentHint === "string" ? data.argumentHint : "";
	return {
		name: toCommandName(relativeName),
		rawName: relativeName,
		description,
		argumentHint,
		body,
		file: filePath,
		warnings
	};
}
/** Scan the plugin directory for commands. */
function scanCommands(pluginRoot, formatId) {
	const warnings = [];
	const format = findFormat(formatId) ?? findFormat("claude");
	const commands = [];
	for (const relative of format?.commandsDirs ?? []) {
		const root = path.join(pluginRoot, relative);
		const files = findFiles(root, {
			warnings,
			match: (_file, base) => base.toLowerCase().endsWith(".md")
		});
		for (const file of files) {
			const dotted = path.relative(root, file).replace(/\\/gu, "/").replace(/\.md$/iu, "").replace(/\//gu, "-");
			try {
				commands.push(parseCommandFile(file, dotted));
			} catch (error) {
				warnings.push(error instanceof Error ? error.message : String(error));
			}
		}
	}
	return {
		commands,
		warnings
	};
}
/** Read the hooks config: plugin.json's `hooks` field wins, then hooks/hooks.json. */
function readHooksConfig(pluginRoot, formatId, manifest = {}) {
	const warnings = [];
	if (manifest.hooks !== void 0 && manifest.hooks !== null) {
		if (typeof manifest.hooks === "object" && !Array.isArray(manifest.hooks)) return {
			config: manifest.hooks,
			source: "plugin.json#hooks",
			warnings
		};
		warnings.push("plugin.json 的 hooks 字段不是对象，已忽略");
	}
	const format = findFormat(formatId) ?? findFormat("claude");
	for (const relative of format?.hooksFiles ?? []) {
		const file = path.join(pluginRoot, relative);
		if (!isFile(file)) continue;
		try {
			const parsed = readJsonFile(file);
			const hookRoot = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.hooks ?? parsed : null;
			if (hookRoot === null || typeof hookRoot !== "object" || Array.isArray(hookRoot)) {
				warnings.push(`${file} 的 hooks 结构无法识别`);
				continue;
			}
			return {
				config: hookRoot,
				source: relative,
				warnings
			};
		} catch (error) {
			warnings.push(error instanceof Error ? error.message : String(error));
		}
	}
	return {
		config: null,
		source: "",
		warnings
	};
}
/**
* Normalize a hooks config into `{eventName: [{matcher, entries:[{command, timeout}]}]}`.
*
* Accepts the Claude Code `{matcher, hooks:[{type:'command', command, timeout}]}`
* shape and the loose form of bare command strings in the array; unknown events
* are kept as-is (the upper layer marks them inactive).
*/
function normalizeHooks(config) {
	const events = {};
	const warnings = [];
	if (config === null || typeof config !== "object" || Array.isArray(config)) return {
		events,
		warnings
	};
	for (const [eventName, groups] of Object.entries(config)) {
		if (!Array.isArray(groups)) {
			warnings.push(`hooks.${eventName} 不是数组，已跳过`);
			continue;
		}
		const normalizedGroups = [];
		for (const group of groups) {
			if (typeof group === "string") {
				normalizedGroups.push({
					matcher: "",
					entries: [{
						command: group,
						timeout: 60
					}]
				});
				continue;
			}
			if (group === null || typeof group !== "object") {
				warnings.push(`hooks.${eventName} 的条目无法识别，已跳过`);
				continue;
			}
			const record = group;
			const matcher = typeof record.matcher === "string" ? record.matcher : "";
			const rawEntries = Array.isArray(record.hooks) ? record.hooks : [];
			const entries = [];
			for (const entry of rawEntries) {
				if (typeof entry === "string") {
					entries.push({
						command: entry,
						timeout: 60
					});
					continue;
				}
				if (entry === null || typeof entry !== "object") continue;
				const entryRecord = entry;
				const command = typeof entryRecord.command === "string" ? entryRecord.command : "";
				if (command.trim() === "") {
					warnings.push(`hooks.${eventName} 的条目缺少 command，已跳过`);
					continue;
				}
				const timeout = typeof entryRecord.timeout === "number" && Number.isFinite(entryRecord.timeout) && entryRecord.timeout > 0 ? entryRecord.timeout : 60;
				entries.push({
					command,
					timeout: Math.min(Math.max(timeout, 1), 600),
					type: typeof entryRecord.type === "string" ? entryRecord.type : "command"
				});
			}
			if (entries.length === 0) continue;
			normalizedGroups.push({
				matcher,
				entries
			});
		}
		if (normalizedGroups.length > 0) events[eventName] = normalizedGroups;
	}
	return {
		events,
		warnings
	};
}
/** Read mcpServers: plugin.json's `mcpServers` wins, then .mcp.json. */
function readMcpServers(pluginRoot, formatId, manifest = {}) {
	const warnings = [];
	if (manifest.mcpServers !== void 0 && manifest.mcpServers !== null) {
		if (typeof manifest.mcpServers === "object" && !Array.isArray(manifest.mcpServers)) return {
			servers: normalizeMcpServers(manifest.mcpServers, warnings),
			source: "plugin.json#mcpServers",
			warnings
		};
		warnings.push("plugin.json 的 mcpServers 字段不是对象，已忽略");
	}
	const format = findFormat(formatId) ?? findFormat("claude");
	for (const relative of format?.mcpFiles ?? []) {
		const file = path.join(pluginRoot, relative);
		if (!isFile(file)) continue;
		try {
			const parsed = readJsonFile(file);
			return {
				servers: normalizeMcpServers(parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.mcpServers ?? parsed : null, warnings),
				source: relative,
				warnings
			};
		} catch (error) {
			warnings.push(error instanceof Error ? error.message : String(error));
		}
	}
	return {
		servers: [],
		source: "",
		warnings
	};
}
/** Normalize MCP server definitions. */
function normalizeMcpServers(raw, warnings) {
	const servers = [];
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		warnings.push("mcpServers 结构无法识别");
		return servers;
	}
	for (const [name, config] of Object.entries(raw)) {
		if (typeof name !== "string" || name.trim() === "") continue;
		if (config === null || typeof config !== "object" || Array.isArray(config)) {
			warnings.push(`mcpServers.${name} 不是对象，已跳过`);
			continue;
		}
		const record = config;
		const transport = typeof record.type === "string" ? record.type : typeof record.transport === "string" ? record.transport : record.url ? "streamable-http" : "stdio";
		servers.push({
			name,
			transport,
			command: typeof record.command === "string" ? record.command : "",
			args: Array.isArray(record.args) ? record.args.map(String) : [],
			url: typeof record.url === "string" ? record.url : ""
		});
	}
	return servers;
}
/** Scan the full capability summary of one installed plugin. */
function scanCapabilities(pluginRoot, formatId, manifest = {}) {
	const warnings = [];
	const skills = scanSkills(pluginRoot, formatId);
	const commands = scanCommands(pluginRoot, formatId);
	const hooks = readHooksConfig(pluginRoot, formatId, manifest);
	const mcp = readMcpServers(pluginRoot, formatId, manifest);
	warnings.push(...skills.warnings, ...commands.warnings, ...hooks.warnings, ...mcp.warnings);
	const hookEvents = normalizeHooks(hooks.config);
	warnings.push(...hookEvents.warnings);
	return {
		summary: {
			skills: skills.skills.map((skill) => skill.name),
			commands: commands.commands.map((command) => command.name),
			hooks: Object.keys(hookEvents.events),
			mcpServers: mcp.servers.map((server) => server.name)
		},
		details: {
			skills: skills.skills,
			commands: commands.commands,
			hooks: hookEvents.events,
			hooksSource: hooks.source,
			mcpServers: mcp.servers,
			mcpSource: mcp.source
		},
		warnings
	};
}
// src/hooks.ts
/**
* Hooks injection: map agent plugin hooks onto real host events and run the
* commands through the host subprocess service (no `@deepseek-ai/*` import,
* no homemade event channel).
*
* Probed host events:
* - PreToolUse        → `tools/pre-execute` (waterfall, may deny)
* - PostToolUse       → `tools/result` (emit, observe only)
* - UserPromptSubmit  → `agent/inbox/inserted` (emit, observe only; the input cannot change)
* - Stop              → `agent/turn-stopping` (serial, awaitable)
* - SessionStart      → `session/created`
* - SessionEnd        → `agent/disposed`
*
* Hooks whose event the host lacks (Notification / SubagentStop / PreCompact
* and the like) keep their manifest entry and are marked inactive in
* `/agent-plugin info`.
*
* @module dsh-agent-extension/hooks
*/
/** The event mapping table; `host: null` means the host has no such event. */
const HOOK_EVENT_MAP = Object.freeze({
	PreToolUse: {
		host: "tools/pre-execute",
		mode: "waterfall",
		canBlock: true
	},
	PostToolUse: {
		host: "tools/result",
		mode: "emit",
		canBlock: false
	},
	UserPromptSubmit: {
		host: "agent/inbox/inserted",
		mode: "emit",
		canBlock: false,
		note: "只能观察；DSH 该事件不可改写用户输入"
	},
	Stop: {
		host: "agent/turn-stopping",
		mode: "serial",
		canBlock: false
	},
	SessionStart: {
		host: "session/created",
		mode: "emit",
		canBlock: false
	},
	SessionEnd: {
		host: "agent/disposed",
		mode: "emit",
		canBlock: false
	},
	Notification: {
		host: null,
		reason: "宿主没有对应事件"
	},
	SubagentStop: {
		host: null,
		reason: "宿主没有对应事件"
	},
	PreCompact: {
		host: null,
		reason: "宿主没有对应事件"
	},
	PostCompact: {
		host: null,
		reason: "宿主没有对应事件"
	}
});
/** Extract the session id and working directory from an event payload, best effort. */
function contextOf(payload) {
	const record = payload ?? {};
	const agent = record.agent;
	const session = record.session ?? agent?.session;
	const id = session?.id ?? agent?.id ?? record.sessionId ?? "";
	const cwd = session?.cwd ?? agent?.cwd ?? process.cwd();
	return {
		sessionId: String(id ?? ""),
		cwd: String(cwd ?? process.cwd())
	};
}
function messageText(message) {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.filter((block) => block !== null && typeof block === "object" && block.type === "text").map((block) => block.text).filter((text) => typeof text === "string").join("\n");
}
/** Length cap on matcher regex strings; longer ones compare literally so a hostile regex cannot stall the host. */
const MAX_MATCHER_LENGTH = 256;
/** Whether a matcher (regex string) matches. An empty matcher matches everything. */
function matcherMatches(matcher, value) {
	const text = String(matcher ?? "").trim();
	if (text === "" || text === "*") return true;
	if (text === value) return true;
	const target = String(value ?? "");
	if (text.length > MAX_MATCHER_LENGTH) return text === target;
	try {
		return new RegExp(text, "u").test(target);
	} catch {
		return text === target;
	}
}
/** Build a hook command executor over the host subprocess service. */
function createSubprocessExecutor(ctx) {
	const subprocess = ctx?.get?.("subprocess");
	if (!subprocess || typeof subprocess.spawn !== "function") return {
		available: false,
		reason: "宿主未提供 subprocess 服务，hooks 不执行外部命令",
		run: async () => {
			throw new Error("subprocess 不可用");
		}
	};
	const run = async ({ command, cwd, payload, timeoutMs }) => {
		let shell = "sh";
		let platform = "posix";
		try {
			const environment = await subprocess.terminalEnvironment?.();
			if (environment?.platform === "windows") {
				platform = "windows";
				shell = environment.defaultShell || process.env.ComSpec || "cmd.exe";
			} else if (environment?.defaultShell) shell = environment.defaultShell;
		} catch {
			platform = process.platform === "win32" ? "windows" : "posix";
			if (platform === "windows") shell = process.env.ComSpec || "cmd.exe";
		}
		let executable = shell;
		try {
			executable = await subprocess.resolveExecutable?.(shell) ?? shell;
		} catch {}
		const argv = platform === "windows" ? [
			executable,
			"/d",
			"/s",
			"/c",
			command
		] : [
			executable,
			"-c",
			command
		];
		const handle = subprocess.spawn({
			argv,
			cwd,
			stdio: {
				stdin: { data: JSON.stringify(payload) },
				stdout: { maxBytes: 65536 },
				stderr: { maxBytes: 65536 }
			},
			graceMs: 1e3,
			env: process.env
		});
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			try {
				handle.terminate();
			} catch {}
		}, Math.min(Math.max(timeoutMs, 1e3), 6e5));
		try {
			const outcome = await handle.done;
			const stdout = handle.collected?.stdout?.readFrom?.(0).text ?? "";
			const stderr = handle.collected?.stderr?.readFrom?.(0).text ?? "";
			return {
				exitCode: outcome?.exitCode ?? null,
				signal: outcome?.signal ?? null,
				stdout,
				stderr,
				timedOut
			};
		} finally {
			clearTimeout(timer);
		}
	};
	return {
		available: true,
		reason: "",
		run
	};
}
/** Hooks runtime: maps plugin hooks onto host events and executes commands. */
var HookRuntime = class {
	getEnabledPlugins;
	log;
	config;
	ctx = null;
	fixedExecutor;
	executor;
	disposers = [];
	/** Whether listeners attached. */
	attached = false;
	reason = "";
	recent = [];
	counters = {};
	unmapped = /* @__PURE__ */ new Set();
	constructor(options) {
		this.getEnabledPlugins = options.getEnabledPlugins;
		this.log = options.log;
		this.config = options.config ?? {};
		this.fixedExecutor = options.executor ?? null;
		this.executor = this.fixedExecutor;
	}
	/** Master switch (default on). */
	get enabled() {
		return this.config.hooks !== false;
	}
	/** Attach event listeners; a missing host service lands in stats as the reason. */
	attach(ctx) {
		if (!this.enabled) {
			this.reason = "配置 hooks: false，已停用 hooks";
			return false;
		}
		this.ctx = ctx;
		const host = ctx;
		const on = host?.on?.bind(host);
		if (typeof on !== "function") {
			this.reason = "宿主 ctx 不支持事件监听";
			return false;
		}
		const register = (event, listener) => {
			try {
				const disposer = on(event, listener);
				if (typeof disposer === "function") this.disposers.push(disposer);
				return true;
			} catch (error) {
				this.log("warn", `监听宿主事件 ${event} 失败：${error instanceof Error ? error.message : String(error)}`);
				return false;
			}
		};
		register("tools/pre-execute", async (...args) => this.onPreToolUse(args[0], args[1]));
		register("tools/result", (...args) => this.fire("PostToolUse", args[0], args[1]));
		register("agent/inbox/inserted", (...args) => this.fire("UserPromptSubmit", args[0]));
		register("agent/turn-stopping", async (...args) => {
			await this.runEvent("Stop", args[0], this.payloadFor("Stop", args[0]));
		});
		register("session/created", (...args) => this.fire("SessionStart", { session: args[0] }));
		register("agent/disposed", (...args) => this.fire("SessionEnd", args[0]));
		this.attached = true;
		this.probeExecutor();
		return true;
	}
	/**
	* Resolve a usable subprocess executor (lazy probe).
	*
	* The host activates on service availability: this plugin may start before
	* the subprocess row, so `ctx.get('subprocess')` can be undefined at attach
	* time. Failures are not cached — every run and stats display re-probes, and
	* hooks recover automatically once the service arrives.
	*/
	probeExecutor() {
		if (this.executor?.available === true) return this.executor;
		if (this.fixedExecutor) {
			this.executor = this.fixedExecutor;
			return this.executor;
		}
		const created = createSubprocessExecutor(this.ctx);
		this.executor = created.available ? created : null;
		this.reason = created.available ? "" : created.reason;
		return this.executor;
	}
	/** PreToolUse: runs inside the waterfall; a matching deny blocks the tool call. */
	async onPreToolUse(exec, next) {
		try {
			const decision = await this.runEvent("PreToolUse", exec, this.payloadFor("PreToolUse", exec));
			if (decision?.deny === true) return {
				kind: "deny",
				reason: decision.reason || `被 Agent 插件 hook 拒绝：${String(exec?.name ?? "tool")}`
			};
		} catch (error) {
			this.log("warn", `PreToolUse hook 执行异常（放行）：${error instanceof Error ? error.message : String(error)}`);
		}
		return next();
	}
	/** emit/serial events: run and swallow errors so the host main flow never breaks. */
	async fire(hookEvent, ...args) {
		try {
			const payload = args[0] ?? {};
			await this.runEvent(hookEvent, payload, this.payloadFor(hookEvent, payload));
		} catch (error) {
			this.log("warn", `${hookEvent} hook 执行异常：${error instanceof Error ? error.message : String(error)}`);
		}
	}
	/** Build the stdin JSON for one hook event (mirrors the Claude Code structure). */
	payloadFor(hookEvent, payload) {
		const context = contextOf(payload);
		const record = payload ?? {};
		const base = {
			session_id: context.sessionId,
			transcript_path: "",
			cwd: context.cwd,
			hook_event_name: hookEvent
		};
		if (hookEvent === "PreToolUse" || hookEvent === "PostToolUse") return {
			...base,
			tool_name: String(record.name ?? ""),
			tool_input: record.arguments ?? record.input ?? {}
		};
		if (hookEvent === "UserPromptSubmit") return {
			...base,
			prompt: messageText(record.message)
		};
		if (hookEvent === "SessionStart") return {
			...base,
			source: "startup"
		};
		if (hookEvent === "SessionEnd") return {
			...base,
			reason: "other"
		};
		return base;
	}
	/** Collect the hook definitions participating in one event. */
	groupsFor(hookEvent) {
		const groups = [];
		for (const plugin of this.getEnabledPlugins()) {
			if (isCapabilityDisabled(plugin, "hooks", hookEvent)) continue;
			const normalized = normalizeHooks(readHooksConfig(plugin.installedPath, plugin.format, {}).config);
			for (const warning of normalized.warnings) this.log("warn", `${plugin.name}: hooks 告警：${warning}`);
			const eventGroups = normalized.events[hookEvent];
			if (!eventGroups || !Array.isArray(eventGroups)) continue;
			for (const group of eventGroups) for (const entry of group.entries) groups.push({
				plugin,
				matcher: group.matcher,
				command: entry.command,
				timeout: entry.timeout,
				cwd: plugin.installedPath
			});
		}
		return groups;
	}
	/** Run every matching command of one hook event. */
	async runEvent(hookEvent, payload, hookPayload) {
		const mapping = HOOK_EVENT_MAP[hookEvent];
		if (!mapping || mapping.host === null) {
			this.unmapped.add(hookEvent);
			return {};
		}
		const executor = this.probeExecutor();
		if (executor === null) {
			this.unmapped.add(hookEvent);
			return {};
		}
		const filterValue = hookEvent === "PreToolUse" || hookEvent === "PostToolUse" ? String(payload?.name ?? "") : hookEvent === "SessionStart" ? "startup" : "";
		const groups = this.groupsFor(hookEvent).filter((group) => matcherMatches(group.matcher, filterValue));
		if (groups.length === 0) return {};
		for (const group of groups) {
			let result;
			try {
				result = await executor.run({
					command: group.command,
					cwd: group.cwd,
					payload: hookPayload,
					timeoutMs: group.timeout * 1e3
				});
			} catch (error) {
				this.log("warn", `hook 命令执行失败（${group.plugin.name}）：${error instanceof Error ? error.message : String(error)}`);
				continue;
			}
			this.record(hookEvent, group, result);
			if (hookEvent === "PreToolUse") {
				const decision = parseHookDecision(result);
				if (decision.deny) return decision;
			}
		}
		return {};
	}
	/** Record recent runs for the info display. */
	record(hookEvent, group, result) {
		this.counters[hookEvent] = (this.counters[hookEvent] ?? 0) + 1;
		const entry = {
			at: (/* @__PURE__ */ new Date()).toISOString(),
			event: hookEvent,
			plugin: group.plugin.key,
			exitCode: result.exitCode,
			timedOut: result.timedOut,
			stdout: String(result.stdout ?? "").slice(0, 500),
			stderr: String(result.stderr ?? "").slice(0, 500)
		};
		this.recent.push(entry);
		if (this.recent.length > 20) this.recent.shift();
		const level = result.exitCode === 0 && !result.timedOut ? "info" : "warn";
		this.log(level, `hook ${hookEvent} ${group.plugin.key} 退出码=${String(result.exitCode)} 超时=${String(result.timedOut)}`);
	}
	/** Capability listing: which events mapped, which are inactive. */
	stats() {
		const executor = this.probeExecutor();
		const effective = Object.entries(HOOK_EVENT_MAP).map(([event, mapping]) => ({
			event,
			host: mapping.host,
			mode: mapping.mode ?? "",
			effective: mapping.host !== null && this.attached && executor !== null,
			reason: mapping.host === null ? mapping.reason ?? "" : executor === null ? this.reason || "subprocess 服务不可用" : mapping.note ?? ""
		}));
		return {
			attached: this.attached,
			enabled: this.enabled,
			reason: this.reason,
			events: effective,
			counters: { ...this.counters },
			recent: this.recent.slice(-5)
		};
	}
	/** Plugin state changes do not rebuild listeners (they read state live); only refresh executor availability. */
	refresh() {
		return this.attached;
	}
	/** Unregister every listener on dispose. */
	dispose() {
		for (const disposer of this.disposers) try {
			disposer();
		} catch {}
		this.disposers = [];
		this.attached = false;
	}
};
/** Parse a Claude hook output: exit code 2 or a JSON decision blocks. */
function parseHookDecision(result) {
	const { exitCode, stdout, timedOut } = result;
	if (timedOut) return { deny: false };
	const text = String(stdout ?? "").trim();
	if (text !== "") try {
		const parsed = JSON.parse(text);
		const hookSpecificOutput = parsed.hookSpecificOutput;
		const permission = hookSpecificOutput?.permissionDecision;
		if (permission === "deny" || permission === "block") return {
			deny: true,
			reason: String(hookSpecificOutput?.permissionDecisionReason ?? "")
		};
		if (parsed.decision === "block") return {
			deny: true,
			reason: String(parsed.reason ?? "")
		};
		if (parsed.continue === false) return {
			deny: true,
			reason: String(parsed.stopReason ?? "")
		};
	} catch {}
	if (exitCode === 2) return {
		deny: true,
		reason: String(result.stderr ?? "").trim().slice(0, 500) || "hook 以退出码 2 阻止该操作"
	};
	return { deny: false };
}
// src/mcp.ts
/** Whether MCP can mount (unavailable under the current host API). */
function mcpAvailability(ctx) {
	const hasResources = Boolean(ctx?.get?.("mcpResources"));
	return {
		available: false,
		hasResources,
		reason: hasResources ? "宿主未加载 dsh-mcp-client（只有 mcpResources 资源服务），第三方插件没有运行时挂载接口；MCP server 需在 profile 中以独立插件行配置" : "宿主未提供 MCP 挂载接口（dsh-mcp-client 未加载）；MCP server 需在 profile 中以独立插件行配置"
	};
}
/** Display form: one line per server. */
function formatMcpServers(servers) {
	if (!Array.isArray(servers) || servers.length === 0) return ["（无）"];
	return servers.map((server) => {
		const target = server.transport === "stdio" ? [server.command, ...server.args ?? []].filter(Boolean).join(" ") : server.url || "（未提供 url）";
		return `- ${server.name}（${server.transport}）：${target}`;
	});
}
// src/report.ts
/**
* Text rendering: turn hub state into the readable Chinese text that
* `/agent-plugin` command handlers return.
*
* @module dsh-agent-extension/report
*/
/** Human-readable byte count. */
function formatBytes(bytes) {
	const value = Number(bytes) || 0;
	if (value < 1024) return `${value} B`;
	if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`;
	if (value < 1073741824) return `${(value / 1024 / 1024).toFixed(1)} MB`;
	return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
/** Keep only the most recent warnings. */
function tailWarnings(list, limit = 8) {
	return (Array.isArray(list) ? list : []).slice(-limit).map(String);
}
/** `/agent-plugin status`. */
function renderStatus(snapshot) {
	const lines = [
		`${snapshot.name} v${snapshot.version}`,
		`存储根：${snapshot.home}`,
		`已安装插件：${snapshot.plugins.enabled}/${snapshot.plugins.total} 启用，缓存 ${formatBytes(snapshot.cache.bytes)}`,
		`市场：${snapshot.markets.total} 个（可安装插件 ${snapshot.markets.plugins} 个）`,
		`技能 provider：${snapshot.skills.registered ? `已注册（${snapshot.skills.skills} 个技能）` : `未生效：${snapshot.skills.reason || "未知原因"}`}`,
		`插件命令：${snapshot.commands.available ? `已注册 ${snapshot.commands.registered.length} 个` : `未生效：${snapshot.commands.reason || "宿主未提供 commands 服务"}`}`,
		`hooks：${snapshot.hooks.attached ? "已挂到宿主事件（见 info 查看映射）" : `未生效：${snapshot.hooks.reason || "未知原因"}`}`,
		`MCP：${snapshot.mcp.available ? "可用" : `未生效：${snapshot.mcp.reason}`}`
	];
	for (const market of snapshot.markets.errors) lines.push(`市场刷新错误：${market.id}：${market.error}`);
	const warnings = tailWarnings(snapshot.warnings);
	if (warnings.length > 0) lines.push("", "最近告警：", ...warnings.map((item) => `- ${item}`));
	lines.push("", "用 /agent-plugin help 查看全部子命令。");
	return lines.join("\n");
}
/** `/agent-plugin formats`. */
function renderFormats(formats) {
	return formats.map((format) => [
		`${format.id}（${format.label}）`,
		`  plugin.json: ${format.pluginManifests.join(" | ")}`,
		`  marketplace.json: ${format.marketplaceFiles.join(" | ")}`
	].join("\n")).join("\n\n");
}
/** `/agent-plugin list`. */
function renderList(hub) {
	const plugins = hub.state.plugins ?? [];
	if (plugins.length === 0) return "还没有安装任何 Agent 插件。\n先用 /agent-plugin market add local <目录> 添加市场，再 /agent-plugin install <插件名>。";
	const lines = ["已安装 Agent 插件："];
	for (const plugin of plugins) {
		const capabilities = plugin.capabilities ?? {};
		const list = (key) => Array.isArray(capabilities[key]) ? capabilities[key].length : 0;
		const summary = [
			`技能 ${list("skills")}`,
			`命令 ${list("commands")}`,
			`hooks ${list("hooks")}`,
			`MCP ${list("mcpServers")}`
		].join(" / ");
		lines.push(`- ${plugin.enabled ? "●" : "○"} ${plugin.name}@${plugin.version} [${plugin.format}]  ${summary}`, `  key: ${plugin.key}  市场: ${plugin.market}  ${plugin.enabled ? "已启用" : "已禁用"}`);
	}
	lines.push("", "用 /agent-plugin info <插件名> 查看详情；enable/disable/uninstall 切换状态。");
	return lines.join("\n");
}
/** Hooks mapping notes for one plugin. */
function renderHooks(installedPath, formatId, manifest = {}) {
	const hooks = normalizeHooks(readHooksConfig(installedPath, formatId, manifest).config);
	const lines = [];
	if (Object.keys(hooks.events).length === 0) {
		lines.push("  hooks：无");
		return lines;
	}
	lines.push(`  hooks：${Object.keys(hooks.events).join("、")}`);
	for (const event of Object.keys(hooks.events)) {
		const mapping = HOOK_EVENT_MAP[event];
		if (!mapping) lines.push(`    ${event} → 未生效（未知事件）`);
		else if (mapping.host === null) lines.push(`    ${event} → 未生效（${mapping.reason}）`);
		else {
			const note = mapping.canBlock === true ? "可阻断工具调用" : mapping.note ?? "只观察，不能阻断";
			lines.push(`    ${event} → ${mapping.host}（${note}）`);
		}
	}
	return lines;
}
/** `/agent-plugin info <插件名>`. */
function renderInfo(hub, record) {
	const warnings = [];
	let manifest = {};
	try {
		manifest = detectPluginManifest(record.installedPath, { hintFormat: record.format }).manifest;
	} catch {
		manifest = {};
	}
	const skills = scanSkills(record.installedPath, record.format);
	const commands = scanCommands(record.installedPath, record.format);
	warnings.push(...skills.warnings, ...commands.warnings);
	const registered = (hub.pluginCommands?.stats().registered ?? []).filter((item) => item.plugin === record.key).map((item) => `/${item.name}`);
	const mcp = readMcpServers(record.installedPath, record.format, manifest);
	warnings.push(...mcp.warnings);
	const mcpState = hub.snapshot().mcp;
	const lines = [
		`插件：${record.name}@${record.version}（key：${record.key}）`,
		`格式：${record.format}  状态：${record.enabled ? "已启用" : "已禁用"}`,
		`市场：${record.market}`,
		`安装路径：${record.installedPath}`,
		`安装时间：${record.installedAt}`,
		"",
		"能力：",
		`  技能 ${skills.skills.length}：${skills.skills.map((skill) => skill.name).join("、") || "（无）"}`,
		`  命令 ${commands.commands.length}：${commands.commands.map((command) => command.name).join("、") || "（无）"}`
	];
	if (registered.length > 0) lines.push(`  宿主命令：${registered.join("、")}（渲染后返回文本，需复制发送）`);
	lines.push(...renderHooks(record.installedPath, record.format, manifest));
	lines.push(`  mcpServers ${mcp.servers.length}：${mcp.servers.map((server) => server.name).join("、") || "（无）"}`, ...formatMcpServers(mcp.servers).map((line) => `    ${line}`));
	if (mcp.servers.length > 0) lines.push(`    MCP 状态：${mcpState.available ? "已挂载" : `未生效（${mcpState.reason}）`}`);
	if (record.previousVersions.length > 0) lines.push("", `可回滚版本：${record.previousVersions.map((item) => item.version).join("、")}`);
	const extra = hub.warnings.filter((item) => item.includes(record.name));
	const seen = [.../* @__PURE__ */ new Set([...warnings, ...extra])].slice(0, 8);
	if (seen.length > 0) lines.push("", "告警：", ...seen.map((item) => `- ${item}`));
	return lines.join("\n");
}
/** `/agent-plugin help`. */
function renderHelp() {
	return [
		"用法：/agent-plugin <子命令> [参数]",
		"",
		"状态与排查",
		"  status                      总体状态（存储根、插件、市场、能力挂载）",
		"  list                        列出已安装 Agent 插件",
		"  info <插件名|key>           单个插件详情（含 hooks/MCP 是否生效）",
		"  formats                     支持的格式与清单路径",
		"  path                        存储根路径",
		"  version                     版本号",
		"",
		"市场",
		"  market list                 列出已添加市场",
		"  market add local <目录> [--name 名称]     本地目录（含 marketplace.json 或单插件目录）",
		"  market add git <仓库地址> [--name 名称]    git 仓库（浅克隆到 hub 缓存）",
		"  market add url <marketplace.json 地址>     marketplace.json 直链",
		"  market refresh [市场id]     刷新市场（省略 id 刷新全部）",
		"  market remove <市场id>      移除市场（先卸载其插件）",
		"",
		"插件",
		"  install <插件名> [--force]              在所有市场里查找并安装",
		"  install <市场id> <插件名> [--force]     指定市场安装",
		"  uninstall <插件名|key>                  卸载并删除安装副本",
		"  enable <插件名|key> / disable <...>     启用 / 禁用（禁用只改状态，不删文件）",
		"  update <插件名|key> [--force]           刷新市场后升级到最新版本",
		"  rollback <插件名|key>                   回滚到上一个版本",
		"",
		"说明：已安装插件的命令注册为 <插件名>-<命令名>（宿主命令名不允许冒号）；",
		"命令结果以文本返回，不会自动注入会话消息，需要复制发送。"
	].join("\n");
}
// src/commands.ts
/**
* `/agent-plugin` command: the hub's single operations entry.
*
* Subcommands: status / list / info / formats / path / version / help /
* market list|add|refresh|remove / install / uninstall / enable / disable /
* update / rollback.
*
* Command handlers return text only (a host command cannot inject its result
* into the conversation); errors carry actionable Chinese text.
*
* @module dsh-agent-extension/commands
*/
const USAGE = "用法：/agent-plugin <status|list|info|formats|path|version|market|install|uninstall|enable|disable|update|rollback|help>";
function success(text) {
	return {
		kind: "success",
		text
	};
}
function failure(text) {
	return {
		kind: "error",
		text
	};
}
/** Extract boolean switches and value options from tokens. */
function parseOptions(tokens) {
	const positional = [];
	const options = {};
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === "--force" || token === "-f") {
			options.force = true;
			continue;
		}
		if (token === "--name" || token === "--format" || token === "--type") {
			const value = tokens[index + 1] ?? "";
			options[token.slice(2)] = value;
			index += 1;
			continue;
		}
		positional.push(token);
	}
	return {
		positional,
		options
	};
}
/** Describe one market source. */
function describeMarket(market) {
	return `${market.name}（${market.id}，${market.type}）：${market.location}`;
}
/**
* Register the `/agent-plugin` host command.
*
* @param ctx - host context (commands service required).
* @param hub - the hub instance.
* @throws {Error} when the host provides no commands service.
*/
function registerHubCommand(ctx, hub) {
	const commands = ctx?.get?.("commands") ?? ctx?.commands;
	if (!commands || typeof commands.register !== "function") throw new Error("宿主未提供 commands 服务，无法注册 /agent-plugin");
	return commands.register({
		name: "agent-plugin",
		description: "Agent Extension：添加市场、安装/更新/卸载 Claude Code 等 Agent 插件，并注入技能与命令。",
		input: { hint: "<子命令> [参数]（/agent-plugin help）" },
		async handler({ rawInput }) {
			const tokens = splitArguments(String(rawInput ?? "").trim());
			const subcommand = tokens[0] ?? "status";
			try {
				switch (subcommand) {
					case "status": return success(renderStatus(hub.snapshot()));
					case "help": return success(renderHelp());
					case "formats": return success(renderFormats(hub.listFormats()));
					case "path": return success(hub.paths.home);
					case "version": return success(hub.snapshot().version);
					case "list": return success(renderList(hub));
					case "info": {
						const name = tokens[1];
						if (!name) return failure("用法：/agent-plugin info <插件名|key>");
						return success(renderInfo(hub, hub.findRecord(name)));
					}
					case "market": return await runMarket(hub, tokens.slice(1));
					case "install": return await runInstall(hub, tokens.slice(1));
					case "uninstall": return runUninstall(hub, tokens.slice(1));
					case "enable": return runToggle(hub, tokens.slice(1), true);
					case "disable": return runToggle(hub, tokens.slice(1), false);
					case "update": return await runUpdate(hub, tokens.slice(1));
					case "rollback": return runRollback(hub, tokens.slice(1));
					default: return failure(`${USAGE}\n未知子命令：${subcommand}\n用 /agent-plugin help 查看完整用法。`);
				}
			} catch (error) {
				return failure(`操作失败：${error instanceof Error ? error.message : String(error)}`);
			}
		}
	});
}
/** Plausible record shape for `renderInfo` when findRecord missed (the hub throws before this renders). */
/** market subcommand. */
async function runMarket(hub, tokens) {
	const action = tokens[0] ?? "list";
	const { positional, options } = parseOptions(tokens.slice(1));
	switch (action) {
		case "list": {
			const markets = hub.markets.list();
			if (markets.length === 0) return success("还没有添加市场。\n示例：/agent-plugin market add local <目录>；/agent-plugin market add git <仓库地址>；/agent-plugin market add url <marketplace.json 地址>");
			const lines = ["已添加市场："];
			for (const market of markets) {
				lines.push(`- ${describeMarket(market)}`, `  格式：${market.format}  插件：${market.plugins?.length ?? 0} 个  最近刷新：${market.lastRefreshed || "未刷新"}`);
				if (market.refreshError) lines.push(`  刷新错误：${market.refreshError}`);
			}
			return success(lines.join("\n"));
		}
		case "add": {
			const type = positional[0];
			const location = positional[1];
			if (!type || !location) return failure("用法：/agent-plugin market add <local|git|url> <地址> [--name 名称] [--format claude|codebuddy|zcode]");
			const market = await hub.marketAdd({
				type,
				location,
				...options.name !== void 0 ? { name: options.name } : {},
				...options.format !== void 0 ? { format: options.format } : {}
			});
			const lines = [`市场已添加：${describeMarket(market)}`, `格式：${market.format}  可安装插件：${market.plugins?.length ?? 0} 个`];
			if (market.refreshError) lines.push(`刷新错误：${market.refreshError}（稍后可用 /agent-plugin market refresh ${market.id} 重试）`);
			for (const plugin of (market.plugins ?? []).slice(0, 10)) lines.push(`- ${plugin.name}${plugin.version ? `@${plugin.version}` : ""}${plugin.description ? `：${plugin.description}` : ""}${plugin.warning ? `（${plugin.warning}）` : ""}`);
			if ((market.plugins?.length ?? 0) > 10) lines.push(`……共 ${market.plugins.length} 个，用 /agent-plugin install <插件名> 安装`);
			return success(lines.join("\n"));
		}
		case "refresh": {
			const id = positional[0];
			const result = await hub.marketRefresh(id);
			const lines = [];
			for (const market of result.refreshed) lines.push(`已刷新 ${market.id}：${market.plugins?.length ?? 0} 个插件${market.refreshError ? `（错误：${market.refreshError}）` : ""}`);
			for (const failed of result.failures) lines.push(`刷新失败 ${failed.id}：${failed.error}`);
			if (result.refreshed.length === 0 && result.failures.length === 0) lines.push("没有市场可刷新");
			return success(lines.join("\n"));
		}
		case "remove": {
			const id = positional[0];
			if (!id) return failure("用法：/agent-plugin market remove <市场id>");
			return success(`已移除市场：${hub.marketRemove(id).id}`);
		}
		default: return failure(`未知 market 子命令：${action}\n用法：/agent-plugin market <list|add|refresh|remove>`);
	}
}
/** install subcommand. */
async function runInstall(hub, tokens) {
	const { positional, options } = parseOptions(tokens);
	if (positional.length === 0) return failure("用法：/agent-plugin install <插件名> [--force]\n或：/agent-plugin install <市场id> <插件名> [--force]");
	const marketId = positional.length >= 2 ? positional[0] : void 0;
	const name = positional.length >= 2 ? positional[1] : positional[0];
	const result = await hub.install({
		market: marketId,
		name,
		force: options.force === true
	});
	const plugin = result.record;
	const market = hub.markets.get(plugin.market);
	const lines = [
		`安装完成：${plugin.name}@${plugin.version}（${plugin.format}）`,
		`来源：${market ? describeMarket(market) : plugin.market} → ${result.sourceDir}`,
		`目标：${plugin.installedPath}（${result.replaced ? "替换同版本副本" : "新安装"}）`,
		`状态：${plugin.enabled ? "已启用" : "已禁用"}`,
		`能力：技能 ${plugin.capabilities.skills?.length ?? 0} / 命令 ${plugin.capabilities.commands?.length ?? 0} / hooks ${plugin.capabilities.hooks?.length ?? 0} / MCP ${plugin.capabilities.mcpServers?.length ?? 0}`
	];
	const registered = (hub.pluginCommands?.stats().registered ?? []).filter((item) => item.plugin === plugin.key);
	if (registered.length > 0) lines.push(`已注册宿主命令：${registered.map((item) => `/${item.name}`).join("、")}（结果需复制发送）`);
	const warnings = [...new Set(result.warnings)].slice(0, 10);
	if (warnings.length > 0) lines.push("", "告警：", ...warnings.map((item) => `- ${item}`));
	return success(lines.join("\n"));
}
/** uninstall subcommand. */
function runUninstall(hub, tokens) {
	const name = tokens[0];
	if (!name) return failure("用法：/agent-plugin uninstall <插件名|key>");
	const record = hub.uninstall(name);
	return success(`已卸载 ${record.name}@${record.version}（删除安装副本与状态记录）`);
}
/** enable / disable. */
function runToggle(hub, tokens, enabled) {
	const name = tokens[0];
	if (!name) return failure(`用法：/agent-plugin ${enabled ? "enable" : "disable"} <插件名|key>`);
	const record = hub.setEnabled(name, enabled);
	const detail = enabled ? "已启用，技能/命令/hooks 将在下一次注册同步后生效" : "已禁用（文件保留，能力不再注册）";
	return success(`${record.name}@${record.version} ${detail}`);
}
/** update subcommand. */
async function runUpdate(hub, tokens) {
	const { positional, options } = parseOptions(tokens);
	const name = positional[0];
	if (!name) return failure("用法：/agent-plugin update <插件名|key> [--force]");
	const result = await hub.update(name, options.force === true);
	const lines = [result.message];
	if (result.changed) {
		lines.push(`当前路径：${result.record.installedPath}`);
		lines.push(`能力：技能 ${result.record.capabilities.skills?.length ?? 0} / 命令 ${result.record.capabilities.commands?.length ?? 0}`);
		const warnings = [...new Set(result.warnings ?? [])].slice(0, 8);
		if (warnings.length > 0) lines.push("", "告警：", ...warnings.map((item) => `- ${item}`));
	}
	return success(lines.join("\n"));
}
/** rollback subcommand. */
function runRollback(hub, tokens) {
	const name = tokens[0];
	if (!name) return failure("用法：/agent-plugin rollback <插件名|key>");
	const result = hub.rollback(name);
	const lines = [`已回滚 ${result.record.name}：当前版本 ${result.record.version}（原 ${result.previousVersion}）`, `路径：${result.record.installedPath}`];
	const warnings = [...new Set(result.warnings ?? [])].slice(0, 8);
	if (warnings.length > 0) lines.push("", "告警：", ...warnings.map((item) => `- ${item}`));
	return success(lines.join("\n"));
}
// src/version.ts
/** Loose compare/parse shape: 1–3 numeric segments, optional v/= prefix. */
const PARSE_PATTERN = /^(?:v)?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u;
/** Strict installer target shape (three segments, optional pre/build, no v prefix). */
const INSTALL_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
function normalizeVersionText(value) {
	if (typeof value !== "string") return "";
	let text = value.trim();
	if (text.startsWith("=")) text = text.slice(1).trim();
	if (/^[vV]\d/u.test(text)) text = text.slice(1).trim();
	return text;
}
function toNumber(text) {
	return Number.parseInt(text, 10);
}
/**
* Parse a version; return `null` when unparsable.
* @param value - raw version text of any shape.
*/
function parseVersion(value) {
	const text = normalizeVersionText(value);
	if (text === "") return null;
	const match = PARSE_PATTERN.exec(text);
	if (!match) return null;
	const prereleaseText = match[4];
	const prerelease = prereleaseText === void 0 ? null : prereleaseText.split(".");
	if (prerelease !== null && prerelease.some((part) => part === "")) return null;
	return {
		major: toNumber(match[1]),
		minor: toNumber(match[2] ?? "0"),
		patch: toNumber(match[3] ?? "0"),
		prerelease,
		raw: String(value).trim()
	};
}
/** SemVer 11.4 prerelease comparison: numeric < alphanumeric; numeric by value; ASCII otherwise; fewer segments lower. */
function comparePrerelease(left, right) {
	const a = left ?? [];
	const b = right ?? [];
	if (a.length === 0 && b.length === 0) return 0;
	if (a.length === 0) return 1;
	if (b.length === 0) return -1;
	const length = Math.max(a.length, b.length);
	for (let index = 0; index < length; index += 1) {
		const one = a[index];
		const two = b[index];
		if (one === void 0) return -1;
		if (two === void 0) return 1;
		const oneNumeric = /^\d+$/u.test(one);
		const twoNumeric = /^\d+$/u.test(two);
		if (oneNumeric && twoNumeric) {
			const diff = Number(one) - Number(two);
			if (diff !== 0) return diff < 0 ? -1 : 1;
			continue;
		}
		if (oneNumeric !== twoNumeric) return oneNumeric ? -1 : 1;
		if (one !== two) return one < two ? -1 : 1;
	}
	return 0;
}
function compareParsed(left, right) {
	for (const key of [
		"major",
		"minor",
		"patch"
	]) if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
	return comparePrerelease(left.prerelease, right.prerelease);
}
/**
* Compare two versions; return `null` when either side is unparsable.
* @param left - installed version text.
* @param right - latest version text.
* @returns `<0` / `0` / `>0`, or `null` when incomparable.
*/
function compareVersions(left, right) {
	const a = parseVersion(left);
	const b = parseVersion(right);
	if (a === null || b === null) return null;
	return compareParsed(a, b);
}
/**
* Classify the update state (the caller handles "no installed record"; this
* only compares two versions).
*
* - `available`: latest is higher than installed;
* - `current`: equal;
* - `installed-newer`: market version is lower than installed;
* - `unknown`: either side is missing or incomparable (**never** treated as available).
*
* @param installedVersion - installed version text.
* @param latestVersion - latest version text.
*/
function classifyUpdate(installedVersion, latestVersion) {
	if (installedVersion === null || installedVersion === void 0 || String(installedVersion).trim() === "") return "unknown";
	if (latestVersion === null || latestVersion === void 0 || String(latestVersion).trim() === "") return "unknown";
	const comparison = compareVersions(installedVersion, latestVersion);
	if (comparison === null) return "unknown";
	if (comparison < 0) return "available";
	if (comparison === 0) return "current";
	return "installed-newer";
}
/**
* Whether a version can name an install target directory (strict three
* segments, optional pre/build, no v prefix).
* @param value - candidate version text.
*/
function isInstallableVersion(value) {
	return typeof value === "string" && INSTALL_PATTERN.test(value.trim());
}
// src/installer.ts
/**
* Installer: copy agent plugins into the hub's own cache and maintain enable
* state, versions, and rollback.
*
* Conventions:
* - Copy, never reference the market directory; target path
*   `cache/<format>/<market>/<plugin>/<version>/`;
* - Copy into `tmp/` first, then rename to the target (atomic on one volume);
* - Never silently overwrite: an existing same-version directory requires an
*   explicit force (update --force / install --force);
* - Rollback keeps the most recent version directories and cleans the rest.
*
* @module dsh-agent-extension/installer
*/
/** Directories skipped during copy (large and never wanted in an install copy). */
const SKIP_DIRS = /* @__PURE__ */ new Set([
	".git",
	"node_modules",
	"tmp",
	".cache"
]);
/** Recursively copy a directory; skips symlinks; returns the copied file count. */
function copyDirectory(source, target) {
	let count = 0;
	const walk = (from, to, depth) => {
		if (depth > 12) throw hubError(`目录层级过深，已中止复制：${from}`, "source_unavailable");
		mkdirSync(to, { recursive: true });
		for (const entry of readdirSync(from, { withFileTypes: true })) {
			const src = path.join(from, entry.name);
			const dst = path.join(to, entry.name);
			if (entry.isSymbolicLink()) continue;
			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(entry.name)) continue;
				walk(src, dst, depth + 1);
				continue;
			}
			if (!entry.isFile()) continue;
			copyFileSync(src, dst);
			count += 1;
		}
	};
	walk(source, target, 0);
	return count;
}
/** List version-shaped subdirectory names of one directory. */
function versionDirs(dir) {
	if (!isDirectory(dir)) return [];
	try {
		return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch {
		return [];
	}
}
/** Installs, uninstalls, enables, updates, and rolls back agent plugins. */
var Installer = class Installer {
	store;
	markets;
	log;
	constructor(options) {
		this.store = options.store;
		this.markets = options.markets;
		this.log = options.log;
	}
	/** Plugin key: `<marketId>/<pluginName>`. */
	static keyFor(marketId, pluginName) {
		return `${marketId}/${pluginName}`;
	}
	/** Find a record in state by key or unique plugin name. */
	findRecord(state, keyOrName) {
		const value = String(keyOrName ?? "").trim();
		if (value === "") throw hubError("请提供插件名或 key", "bad_request");
		if (value.includes("/")) {
			const record = state.plugins.find((plugin) => plugin.key === value);
			if (!record) throw hubError(`未安装该插件：${value}（用 /agent-plugin list 查看）`, "not_found");
			return record;
		}
		const matches = state.plugins.filter((plugin) => plugin.name === value);
		if (matches.length === 0) throw hubError(`未安装名为 ${value} 的插件（用 /agent-plugin list 查看）`, "not_found");
		if (matches.length > 1) throw hubError(`插件名 ${value} 出现在多个市场，请改用完整 key：${matches.map((item) => item.key).join("、")}`, "conflict");
		return matches[0];
	}
	/** Validate each target path segment so the joined path cannot escape the cache directory. */
	safeTargetDir(format, marketId, pluginName, version) {
		if (!isFormatId(format)) throw hubError(`未知插件格式：${format}`, "bad_request");
		if (!isSafePluginName(pluginName)) throw hubError(`插件名不合法：${pluginName}`, "bad_request");
		if (!isSafePluginName(marketId)) throw hubError(`市场 id 不合法：${marketId}`, "bad_request");
		if (!isInstallableVersion(version)) throw hubError(`版本号不合法（应为 SemVer）：${version}`, "version_invalid");
		return path.join(this.store.paths.cache, format, marketId, pluginName, version);
	}
	/** Install or reinstall one plugin from a market. */
	install(state, request) {
		const marketId = String(request.marketId ?? "").trim();
		const pluginName = String(request.pluginName ?? "").trim();
		const market = this.markets.get(marketId);
		if (!market) throw hubError(`市场不存在：${marketId}（用 /agent-plugin market list 查看）`, "not_found");
		if (!(market.plugins ?? []).find((plugin) => plugin.name === pluginName)) throw hubError(`市场 ${marketId} 里没有插件 ${pluginName}，请先刷新该市场`, "not_found");
		const sourceDir = this.markets.resolveInstallSource(market, pluginName);
		const detected = detectPluginManifest(sourceDir, { hintFormat: market.format });
		const meta = validatePluginManifest(detected.manifest, detected);
		if (meta.name !== pluginName) throw hubError(`插件清单 name（${meta.name}）与市场条目（${pluginName}）不一致，拒绝安装`, "conflict");
		const warnings = [...detected.warnings, ...meta.warnings];
		const key = Installer.keyFor(market.id, meta.name);
		const existing = state.plugins.find((plugin) => plugin.key === key) ?? null;
		const targetDir = this.safeTargetDir(detected.format, market.id, meta.name, meta.version);
		const sameActive = existing !== null && existing.installedPath === targetDir;
		if (existsSync(targetDir) && request.force !== true) throw hubError(sameActive ? `插件 ${meta.name}@${meta.version} 已安装；如需重装请用 /agent-plugin update ${meta.name} --force` : `目标目录已存在：${targetDir}；如需覆盖请加 --force`, "conflict");
		const tmpDir = path.join(this.store.paths.tmp, `install-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
		mkdirSync(path.dirname(tmpDir), { recursive: true });
		const backupDir = existsSync(targetDir) ? path.join(this.store.paths.tmp, `replace-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) : "";
		try {
			if (copyDirectory(sourceDir, tmpDir) === 0) throw hubError(`插件源目录没有可复制的文件：${sourceDir}`, "source_unavailable");
			mkdirSync(path.dirname(targetDir), { recursive: true });
			if (backupDir !== "") renameSync(targetDir, backupDir);
			renameSync(tmpDir, targetDir);
		} catch (error) {
			if (backupDir !== "" && existsSync(backupDir) && !existsSync(targetDir)) try {
				renameSync(backupDir, targetDir);
			} catch {}
			rmSync(tmpDir, {
				force: true,
				recursive: true
			});
			throw error;
		}
		if (backupDir !== "") try {
			rmSync(backupDir, {
				force: true,
				recursive: true
			});
		} catch {
			this.log("warn", `清理旧版本备份失败（可手动删除）：${backupDir}`);
		}
		const scan = scanCapabilities(targetDir, detected.format, detected.manifest);
		warnings.push(...scan.warnings);
		const previousVersions = existing ? [...existing.previousVersions] : [];
		if (existing && existing.installedPath !== targetDir && existsSync(existing.installedPath)) previousVersions.push({
			version: existing.version,
			installedPath: existing.installedPath,
			installedAt: existing.installedAt
		});
		const record = {
			key,
			format: detected.format,
			name: meta.name,
			version: meta.version,
			market: market.id,
			installedPath: targetDir,
			enabled: existing ? existing.enabled : true,
			installedAt: (/* @__PURE__ */ new Date()).toISOString(),
			capabilities: scan.summary,
			disabledCapabilities: existing ? normalizeDisabledCapabilities(existing.disabledCapabilities) : emptyDisabledCapabilities(),
			previousVersions: previousVersions.slice(-5)
		};
		state.plugins = [...state.plugins.filter((plugin) => plugin.key !== key), record];
		this.pruneVersionDirs(record);
		this.log("info", `安装 ${key}@${meta.version}：${sourceDir} → ${targetDir}`);
		return {
			record,
			sourceDir,
			targetDir,
			warnings,
			replaced: existing !== null
		};
	}
	/** Remove directories that belong neither to the current nor a rollback version. */
	pruneVersionDirs(record) {
		const versionRoot = path.dirname(record.installedPath);
		const keep = /* @__PURE__ */ new Set([record.installedPath, ...record.previousVersions.map((item) => item.installedPath)]);
		for (const entry of versionDirs(versionRoot)) {
			const full = path.join(versionRoot, entry);
			if (keep.has(full)) continue;
			try {
				rmSync(full, {
					recursive: true,
					force: true
				});
			} catch (error) {
				this.log("warn", `清理旧版本目录失败：${full}：${error instanceof Error ? error.message : String(error)}`);
			}
		}
		let dir = versionRoot;
		const cacheRoot = path.resolve(this.store.paths.cache);
		while (path.resolve(dir).startsWith(cacheRoot) && path.resolve(dir) !== cacheRoot) try {
			if (readdirSync(dir).length > 0) break;
			rmSync(dir, {
				recursive: false,
				force: true
			});
			dir = path.dirname(dir);
		} catch {
			break;
		}
	}
	/** Remove one installed plugin (state + directories). */
	uninstall(state, keyOrName) {
		const record = this.findRecord(state, keyOrName);
		const targets = /* @__PURE__ */ new Set([record.installedPath, ...record.previousVersions.map((item) => item.installedPath)]);
		state.plugins = state.plugins.filter((plugin) => plugin.key !== record.key);
		for (const target of targets) {
			if (target === "" || !existsSync(target)) continue;
			const resolved = path.resolve(target);
			if (!resolved.startsWith(path.resolve(this.store.paths.cache))) {
				this.log("warn", `拒绝删除 cache 之外的目录：${resolved}`);
				continue;
			}
			rmSync(resolved, {
				recursive: true,
				force: true
			});
		}
		this.log("info", `卸载 ${record.key}`);
		return record;
	}
	/** Enable / disable. */
	setEnabled(state, keyOrName, enabled) {
		const record = this.findRecord(state, keyOrName);
		record.enabled = enabled === true;
		this.log("info", `${record.enabled ? "启用" : "禁用"} ${record.key}`);
		return record;
	}
	/**
	* Update to the market's latest version.
	*
	* `refresh:false` skips the market refresh (updateAll refreshes per market
	* once and reuses it, avoiding duplicate network). An incomparable version
	* (unknown) counts as "not updated" with a readable message — never a false
	* "updatable".
	*/
	async update(state, keyOrName, options = {}) {
		const record = this.findRecord(state, keyOrName);
		const market = this.markets.get(record.market);
		if (!market) throw hubError(`插件来源市场 ${record.market} 已不存在，请先添加该市场或改用回滚/卸载`, "not_found");
		if (options.refresh !== false) await this.markets.refresh(market.id);
		const refreshed = this.markets.get(market.id);
		if (!refreshed) throw hubError(`市场 ${market.id} 刷新后不存在`, "market_unavailable");
		const detected = detectPluginManifest(this.markets.resolveInstallSource(refreshed, record.name), { hintFormat: refreshed.format });
		const meta = validatePluginManifest(detected.manifest, detected);
		const updateState = classifyUpdate(record.version, meta.version);
		if (updateState !== "available" && options.force !== true) return {
			record,
			changed: false,
			message: updateState === "current" ? `已是最新版本 ${record.version}` : updateState === "installed-newer" ? `市场版本 ${meta.version} 不高于已安装版本 ${record.version}，未更新` : `无法比较版本（已安装 ${record.version}，市场 ${meta.version || "未标注"}），未更新；如需强制覆盖请加 --force`,
			warnings: [],
			updateState
		};
		const result = this.install(state, {
			marketId: refreshed.id,
			pluginName: record.name,
			force: true
		});
		return {
			record: result.record,
			changed: true,
			message: `已更新 ${record.name}：${record.version} → ${result.record.version}`,
			warnings: result.warnings,
			updateState
		};
	}
	/** Roll back to a history version. */
	rollback(state, keyOrName, targetVersion) {
		const record = this.findRecord(state, keyOrName);
		if (record.previousVersions.length === 0) throw hubError(`插件 ${record.name} 没有可回滚的历史版本`, "not_found");
		let target = null;
		const wanted = String(targetVersion ?? "").trim();
		if (wanted !== "") {
			const candidate = record.previousVersions.find((item) => item.version === wanted);
			if (!candidate) {
				const known = record.previousVersions.map((item) => item.version).join("、");
				throw hubError(`插件 ${record.name} 未找到历史版本 ${wanted}（可用：${known || "无"}）`, "not_found");
			}
			target = candidate;
		} else for (let index = record.previousVersions.length - 1; index >= 0; index -= 1) {
			const candidate = record.previousVersions[index];
			if (candidate !== void 0 && existsSync(candidate.installedPath)) {
				target = candidate;
				break;
			}
		}
		if (!target) throw hubError(`插件 ${record.name} 的历史版本目录都已被清理，无法回滚`, "not_found");
		if (!existsSync(target.installedPath)) throw hubError(`插件 ${record.name} 的历史版本 ${target.version} 目录已被清理，无法回滚`, "not_found");
		const detected = detectPluginManifest(target.installedPath, { hintFormat: record.format });
		const scan = scanCapabilities(target.installedPath, record.format, detected.manifest);
		const oldVersion = record.version;
		const oldPath = record.installedPath;
		const history = record.previousVersions.filter((item) => item !== target);
		record.version = target.version;
		record.installedPath = target.installedPath;
		record.installedAt = (/* @__PURE__ */ new Date()).toISOString();
		record.capabilities = scan.summary;
		record.format = detected.format;
		if (existsSync(oldPath)) history.push({
			version: oldVersion,
			installedPath: oldPath,
			installedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
		record.previousVersions = history.slice(-5);
		this.pruneVersionDirs(record);
		this.log("info", `回滚 ${record.key}：${oldVersion} → ${record.version}`);
		return {
			record,
			previousVersion: oldVersion,
			warnings: scan.warnings
		};
	}
	/** Summarize install cache usage (bytes) and plugin count. */
	cacheStats(state) {
		let bytes = 0;
		const countDir = (dir) => {
			if (!existsSync(dir)) return;
			let entries;
			try {
				entries = readdirSync(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const entry of entries) {
				const full = path.join(dir, entry.name);
				try {
					if (entry.isDirectory()) countDir(full);
					else bytes += statSync(full).size;
				} catch {}
			}
		};
		for (const record of state.plugins) countDir(record.installedPath);
		return {
			plugins: state.plugins.length,
			bytes
		};
	}
};
// src/location-key.ts
/**
* Canonical market location key shared by both halves: the server uses it for
* add-time duplicate detection (same source under different spellings — bare
* repo URL, `.git` suffix, raw manifest link — must not register twice), the
* client for "already added" matching. Deliberately independent from
* `marketIdFor`: ids stay stable for existing installs, this key only powers
* equivalence checks.
*
* @module dsh-agent-extension/location-key
*/
/** Canonical key of one market location ('' for empty input). */
function marketLocationKey(location) {
	const raw = String(location ?? "").trim();
	if (raw === "") return "";
	const scp = /^git@([^:/]+):(.+)$/i.exec(raw);
	if (scp) return gitKey(String(scp[1] ?? ""), String(scp[2] ?? ""));
	const ssh = /^ssh:\/\/(?:[^@/]+@)?([^:/]+)(?::\d+)?\/(.+)$/i.exec(raw);
	if (ssh) return gitKey(String(ssh[1] ?? ""), String(ssh[2] ?? ""));
	if (/^https?:\/\//i.test(raw)) try {
		const url = new URL(raw);
		const host = url.hostname.toLowerCase();
		const segments = url.pathname.split("/").filter((segment) => segment !== "");
		if ((host === "github.com" || host === "raw.githubusercontent.com") && segments.length >= 2) return gitKey("github.com", `${String(segments[0])}/${String(segments[1])}`);
		return `url:${host}/${segments.join("/")}`;
	} catch {
		return `url:${raw.toLowerCase()}`;
	}
	const normalized = raw.replace(/\\/g, "/").replace(/\/+$/, "");
	return `local:${/^[a-z]:\//i.test(normalized) || raw.includes("\\") ? normalized.toLowerCase() : normalized}`;
}
/** Key of a git-ish host/path pair: lowercase host and path, `.git` suffix stripped. */
function gitKey(host, repoPath) {
	const segments = repoPath.replace(/\/+$/, "").toLowerCase().split("/").filter((segment) => segment !== "");
	const last = segments[segments.length - 1];
	if (last !== void 0) segments[segments.length - 1] = last.replace(/\.git$/i, "");
	return `git:${host.toLowerCase()}/${segments.join("/")}`;
}
// src/market.ts
/**
* Market source management: local directories, git repositories, and
* marketplace.json direct links.
*
* - local: read the marketplace.json in the directory (without one, the
*   directory itself counts as a single-plugin market);
* - git: shallow-clone with system git into the hub's own cache; refresh runs
*   fetch + reset;
* - url: fetch marketplace.json over HTTP(S); failures only record
*   refreshError and never block the rest.
*
* Schema v2:
* - Market records persist `title/display/owner/featured` and entry `meta`
*   (display metadata);
* - Refresh keeps the user's market alias (`market.name` is not overwritten by
*   the upstream name, which is stored in `title`);
* - A git market's clone root always derives from `marketRoot(market)` (no
*   reliance on unpersisted in-memory fields).
*
* @module dsh-agent-extension/market
*/
/** Safe environment for git subprocesses: no interactive prompts. */
function gitEnv() {
	return {
		...process.env,
		GIT_TERMINAL_PROMPT: "0",
		GCM_INTERACTIVE: "Never",
		GIT_OPTIONAL_LOCKS: "0"
	};
}
/** Run one git command; failures throw an actionable Chinese error (with a stderr tail). */
function runGit(args, options = {}) {
	const result = spawnSync("git", args, {
		encoding: "utf8",
		timeout: options.timeoutMs ?? 12e4,
		cwd: options.cwd,
		env: gitEnv(),
		windowsHide: true
	});
	if (result.error) throw hubError(`执行 git 失败：${result.error.message}`, "git_error");
	if (result.status !== 0) {
		const stderr = String(result.stderr ?? "").trim().split("\n").slice(-4).join(" | ");
		throw hubError(`git ${args[0]} 失败（退出码 ${String(result.status)}）：${stderr || "无输出"}`, "git_error");
	}
	return result.stdout ?? "";
}
/** Derive a stable market id from type and location. */
function marketIdFor(type, location) {
	const hash = createHash("sha1").update(`${type}\u0000${location}`).digest("hex").slice(0, 8);
	return `${type}-${((String(location).replace(/\\/gu, "/").split("/").filter(Boolean).pop() ?? "market").replace(/\.git$/u, "").replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "").toLowerCase() || "market").slice(0, 32)}-${hash}`;
}
/** Expand `~` / `~/` (everything else verbatim). */
function expandTildeValue(value) {
	const raw = String(value ?? "").trim();
	if (raw === "~" || raw.startsWith("~/") || raw.startsWith("~\\")) {
		const home = process.env.USERPROFILE || process.env.HOME || "";
		return raw === "~" ? home : path.join(home, raw.slice(2));
	}
	return raw;
}
/** Resolve a user-supplied location (local supports cwd-relative and `~`). */
function normalizeLocation(type, location) {
	const raw = String(location ?? "").trim();
	if (raw === "") throw hubError("市场地址不能为空", "bad_request");
	if (type === "local") {
		const resolved = path.resolve(expandTildeValue(raw));
		if (!isDirectory(resolved)) throw hubError(`本地市场目录不存在：${resolved}`, "not_found");
		return resolved;
	}
	if (type === "url") {
		if (!/^https?:\/\//u.test(raw)) throw hubError(`URL 市场地址必须以 http:// 或 https:// 开头：${raw}`, "bad_request");
		return raw;
	}
	if (type === "git") {
		if (!/^(?:https?:\/\/|git@|ssh:\/\/|git:\/\/|file:\/\/)/u.test(raw) && !raw.endsWith(".git") && !isDirectory(path.resolve(raw))) throw hubError(`Git 市场地址无法识别：${raw}（支持 https/git@/ssh 或本地仓库目录）`, "bad_request");
		if (isDirectory(path.resolve(raw))) return path.resolve(raw);
		return raw;
	}
	throw hubError(`未知市场类型：${type}`, "bad_request");
}
/** Clone URL of a git source (a github short name joins as https). */
function gitSourceUrl(source) {
	if (source.kind === "github") return /^(?:https?:\/\/|git@)/u.test(source.repo) ? source.repo : `https://github.com/${source.repo}.git`;
	return source.kind === "git" ? source.url : void 0;
}
/** Cache directory name of a git source (hash of url + commit). */
function gitSourceHash(source) {
	const url = gitSourceUrl(source) ?? "";
	const commit = source.kind === "github" || source.kind === "git" ? source.commit ?? "" : "";
	return createHash("sha1").update(`${url}\u0000${commit}`).digest("hex").slice(0, 10);
}
function gitSourceDir(store, marketId, source) {
	return path.join(store.paths.markets, marketId, "sources", gitSourceHash(source));
}
/**
* Root directory of one market in the cache.
*
* - local → market.location
* - git   → `<home>/cache/markets/<id>/repo`
* - url   → null (a url market has no local plugin source directory)
*/
function marketRoot(market, store) {
	if (market === null || typeof market !== "object") return null;
	const record = market;
	if (record.type === "local") return typeof record.location === "string" && record.location !== "" ? record.location : null;
	if (record.type === "git") {
		if (store?.paths?.markets && typeof record.id === "string" && record.id !== "") return path.join(store.paths.markets, record.id, "repo");
		return typeof record.root === "string" && record.root !== "" ? record.root : null;
	}
	return null;
}
/** Whether a directory carries a marketplace/plugin manifest; returns the probe or `null`. */
function detectLocalMarketDir(dir) {
	try {
		const detected = detectMarketplaceFile(dir);
		return {
			kind: "marketplace",
			format: detected.format,
			manifest: detected.manifest
		};
	} catch {
		if (looksLikePluginDir(dir)) try {
			const detected = detectPluginManifest(dir);
			return {
				kind: "plugin",
				format: detected.format,
				manifest: detected.manifest
			};
		} catch {
			return null;
		}
		return null;
	}
}
function looksLikeGitDir(dir) {
	return isDirectory(path.join(dir, ".git"));
}
function isHttpLocation(raw) {
	return /^https?:\/\//u.test(raw);
}
function isGitLocation(raw) {
	return /^(?:git@|ssh:\/\/|git:\/\/|file:\/\/)/u.test(raw) || raw.endsWith(".git");
}
function isPathLike(raw) {
	return /[\\/]/u.test(raw) || /^[A-Za-z]:/u.test(raw) || raw === "~" || raw.startsWith("~") || raw === "." || raw.startsWith("./") || raw.startsWith("../");
}
/** Fetch JSON from a URL (15s timeout). */
async function fetchJsonProbe(url, fetchImpl, timeoutMs) {
	if (typeof fetchImpl !== "function") throw new Error("当前运行环境没有 fetch，无法探测 URL 市场");
	const response = await fetchImpl(url, {
		signal: AbortSignal.timeout?.(timeoutMs),
		headers: { accept: "application/json" }
	});
	if (!response.ok) throw hubError(`HTTP ${String(response.status)}`, "network_error");
	const text = await response.text();
	const parsed = JSON.parse(text);
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("返回的不是 JSON 对象");
	const record = parsed;
	if (!Array.isArray(record.plugins) && typeof record.name !== "string") throw new Error("返回的 JSON 不像 marketplace.json（缺少 name/plugins）");
	return record;
}
/**
* Auto-detect a market source.
*
* Rules:
* 1. Expand `~`; an existing directory with marketplace.json / plugin.json → local;
* 2. An existing directory without manifests but with `.git` → git (local repo);
* 3. `git@` / `ssh://` / `git://` / `file://` / `*.git` → git;
* 4. `http(s)://`: first a 15s JSON fetch tries url; on failure a 120s shallow clone tries git;
* 5. Anything else throws an actionable Chinese error.
*/
/**
* Remove a cloned tree. Fresh git clones on Windows transiently fail with
* EPERM/EBUSY while indexers hold handles, and git marks pack files
* read-only; retry briefly and clear read-only bits before a final attempt.
* The removal is best-effort: a leftover cache directory is harmless residue.
*/
function rmTree(target) {
	try {
		rmSync(target, {
			force: true,
			recursive: true,
			maxRetries: 5,
			retryDelay: 200
		});
		return;
	} catch {}
	const clearReadOnly = (current) => {
		let stats = null;
		try {
			stats = lstatSync(current);
		} catch {
			return;
		}
		if (stats.isDirectory()) {
			try {
				for (const entry of readdirSync(current)) clearReadOnly(path.join(current, entry));
			} catch {}
			try {
				chmodSync(current, 511);
			} catch {}
		} else if (stats.isFile()) try {
			chmodSync(current, 438);
		} catch {}
	};
	try {
		clearReadOnly(target);
		rmSync(target, {
			force: true,
			recursive: true,
			maxRetries: 5,
			retryDelay: 200
		});
	} catch {}
}
/** Market-level head fields shared by the preview branches. */
function previewHead(format, parsed, fallbackName) {
	return {
		format,
		name: parsed.name !== "" ? parsed.name : fallbackName,
		title: parsed.display.title || parsed.name || fallbackName,
		description: parsed.display.description || ""
	};
}
/** Light projection of parsed entries for the preview list (displayOf-compatible). */
function previewPlugins(parsed) {
	return parsed.plugins.map((entry) => {
		const installable = entry.source.kind === "local" || entry.source.kind === "github" || entry.source.kind === "git";
		const metaTitle = entry.meta.displayName ?? String(entry.meta.title ?? "");
		const author = entry.meta.author;
		return {
			name: entry.name,
			version: entry.version,
			display: {
				title: metaTitle !== "" ? metaTitle : entry.name,
				description: entry.meta.description ?? entry.description ?? "",
				...entry.meta.category !== void 0 ? { category: entry.meta.category } : {},
				...author !== void 0 ? { author } : {},
				...entry.meta.homepage !== void 0 ? { homepage: entry.meta.homepage } : {},
				...entry.meta.repository !== void 0 ? { repository: entry.meta.repository } : {},
				...entry.meta.license !== void 0 ? { license: entry.meta.license } : {}
			},
			installable,
			...installable ? {} : { warning: "该插件的 source 暂不支持安装" }
		};
	});
}
/** Raw manifest base of a github repo URL (`null` for anything else). */
function githubRawInfo(raw) {
	const match = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:\/tree\/([^/#?]+))?(?:\/.*)?$/iu.exec(raw);
	const owner = match?.[1] ?? "";
	const repo = match?.[2] ?? "";
	if (owner === "" || repo === "") return null;
	return { base: `https://raw.githubusercontent.com/${owner}/${repo}/${(match?.[3] ?? "") || "HEAD"}` };
}
/** Manifest candidate paths in probe order (FORMAT_PRIORITY × marketplaceFiles, deduped). */
function rawManifestCandidates() {
	const seen = /* @__PURE__ */ new Set();
	const list = [];
	for (const formatId of FORMAT_PRIORITY) {
		const format = findFormat(formatId);
		if (!format) continue;
		for (const relative of format.marketplaceFiles) {
			if (seen.has(relative)) continue;
			seen.add(relative);
			list.push([formatId, relative]);
		}
	}
	return list;
}
async function detectSource(location, options = {}) {
	const raw = String(location ?? "").trim();
	if (raw === "") throw hubError("市场地址不能为空", "bad_request");
	const jsonTimeoutMs = options.jsonTimeoutMs ?? 15e3;
	const cloneTimeoutMs = options.cloneTimeoutMs ?? 12e4;
	const resolvedDir = path.resolve(expandTildeValue(raw));
	if (isDirectory(resolvedDir)) {
		if (detectLocalMarketDir(resolvedDir) !== null) return {
			type: "local",
			location: resolvedDir
		};
		if (looksLikeGitDir(resolvedDir)) return {
			type: "git",
			location: resolvedDir
		};
		throw hubError(`目录不是市场：${resolvedDir}（缺少 marketplace.json/plugin.json，也不是 git 仓库）`, "not_found");
	}
	if (isGitLocation(raw)) return {
		type: "git",
		location: raw
	};
	if (isHttpLocation(raw)) {
		let jsonError = "";
		try {
			await fetchJsonProbe(raw, options.fetchImpl ?? globalThis.fetch, jsonTimeoutMs);
			return {
				type: "url",
				location: raw
			};
		} catch (error) {
			jsonError = error instanceof Error ? error.message : String(error);
		}
		const cloneTarget = path.join(options.store?.paths.tmp ?? os.tmpdir(), `detect-${String(process.pid)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
		try {
			mkdirSync(path.dirname(cloneTarget), { recursive: true });
			if (typeof options.cloneImpl === "function") options.cloneImpl(raw, cloneTarget);
			else runGit([
				"clone",
				"--depth",
				"1",
				"--",
				raw,
				cloneTarget
			], { timeoutMs: cloneTimeoutMs });
			return {
				type: "git",
				location: raw
			};
		} catch (error) {
			const cloneError = error instanceof Error ? error.message : String(error);
			throw hubError(`无法识别的市场地址：${raw}（JSON 拉取失败：${jsonError}；git 克隆失败：${cloneError}）`, "network_error");
		} finally {
			rmTree(cloneTarget);
		}
	}
	if (isPathLike(raw)) throw hubError(`本地市场目录不存在：${resolvedDir}`, "not_found");
	throw hubError(`无法识别的市场地址：${raw}（支持本地目录、git 仓库地址或 marketplace.json 直链）`, "bad_request");
}
/**
* Resolve the local source directory of a market entry (the shared
* describe/update entry of schema v2).
*
* - local: local markets use location, git markets use the cache clone; url
*   markets do not support relative-path sources;
* - github/git: cache-only by default (`allowClone:false` never touches the
*   network); a missing cache reports cloneRequired;
* - npm/unknown/other: an unresolvable reason.
*/
function resolvePluginSourceRoot(market, pluginName, options = {}) {
	const entry = (market?.plugins ?? []).find((plugin) => plugin.name === pluginName);
	if (entry === void 0) return {
		resolved: false,
		path: null,
		cloneRequired: false,
		reason: `市场 ${String(market?.id)} 里没有插件 ${pluginName}，请先 /agent-plugin market refresh`
	};
	const source = entry.source ?? { kind: "unknown" };
	switch (source.kind) {
		case "local": {
			if (market.type === "url") return {
				resolved: false,
				path: null,
				cloneRequired: false,
				reason: "URL 市场里的相对路径插件无法安装：请改用 Git 市场，或让该插件提供 github/git source"
			};
			const root = marketRoot(market, options.store);
			if (root === null) return {
				resolved: false,
				path: null,
				cloneRequired: false,
				reason: `无法定位市场目录：${String(market?.id)}`
			};
			let dir;
			try {
				dir = resolveRelativeSource(root, source.raw);
			} catch (error) {
				return {
					resolved: false,
					path: null,
					cloneRequired: false,
					reason: error instanceof Error ? error.message : String(error)
				};
			}
			if (!isDirectory(dir)) return {
				resolved: false,
				path: null,
				cloneRequired: false,
				reason: `插件目录不存在：${dir}`
			};
			return {
				resolved: true,
				path: dir,
				cloneRequired: false,
				reason: ""
			};
		}
		case "github":
		case "git": {
			const store = options.store;
			if (store?.paths?.markets === void 0) return {
				resolved: false,
				path: null,
				cloneRequired: true,
				reason: "缺少 hub 存储路径，无法解析 git 源；请在 MarketManager 上用 resolvePluginSourceRoot"
			};
			const dir = gitSourceDir(store, market.id, source);
			if (isDirectory(dir)) return {
				resolved: true,
				path: dir,
				cloneRequired: false,
				reason: ""
			};
			if (options.allowClone !== true) return {
				resolved: false,
				path: null,
				cloneRequired: true,
				reason: `插件源尚未克隆（${gitSourceUrl(source) ?? "git source"}）；允许联网后再试`
			};
			if (options.markets === void 0 || typeof options.markets.resolveGitSource !== "function") return {
				resolved: false,
				path: null,
				cloneRequired: true,
				reason: "当前上下文不支持 git 克隆（缺少 markets 实例）"
			};
			try {
				const cloned = options.markets.resolveGitSource(market, source);
				if (!isDirectory(cloned)) return {
					resolved: false,
					path: null,
					cloneRequired: false,
					reason: `插件目录不存在：${cloned}`
				};
				return {
					resolved: true,
					path: cloned,
					cloneRequired: false,
					reason: ""
				};
			} catch (error) {
				return {
					resolved: false,
					path: null,
					cloneRequired: false,
					reason: error instanceof Error ? error.message : String(error)
				};
			}
		}
		case "npm": return {
			resolved: false,
			path: null,
			cloneRequired: false,
			reason: "MVP 暂不支持 npm 源（已记录扩展点）"
		};
		default: return {
			resolved: false,
			path: null,
			cloneRequired: false,
			reason: `插件 ${pluginName} 的 source 无法安装（类型：${String(source.kind)}）`
		};
	}
}
/** Allowed icon extensions (raster only; matches ui-data's /icon MIME allowlist, no SVG). */
const ICON_MIME = Object.freeze({
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif"
});
/** Icon size cap: 256 KiB. */
const ICON_MAX_BYTES = 262144;
/**
* Resolve an entry icon to a raster file inside the market root (absolute path).
*
* Only regular files inside the market root, non-symlink, ≤256 KiB, with an
* allowlisted extension qualify; `data:` / `https:` / out-of-bounds paths /
* missing files return `null` (remote icons are the upper layer's concern).
*/
function entryIconFile$1(market, entry, store) {
	const icon = typeof entry?.meta?.icon === "string" ? entry.meta.icon.trim() : "";
	if (icon === "") return null;
	if (/^(?:data:|https?:)/iu.test(icon)) return null;
	const root = marketRoot(market, store);
	if (root === null) return null;
	let resolved;
	try {
		resolved = resolveRelativeSource(root, icon);
	} catch {
		return null;
	}
	let stats;
	try {
		if (!isFile(resolved)) return null;
		if (lstatSync(resolved).isSymbolicLink()) return null;
		stats = statSync(resolved);
	} catch {
		return null;
	}
	if (!stats.isFile() || stats.size > ICON_MAX_BYTES) return null;
	if (!Object.prototype.hasOwnProperty.call(ICON_MIME, path.extname(resolved).toLowerCase())) return null;
	try {
		const realRoot = realpathSync(path.resolve(root));
		const realFile = realpathSync(resolved);
		const prefix = realRoot.endsWith(path.sep) ? realRoot : `${realRoot}${path.sep}`;
		if (realFile !== realRoot && !realFile.startsWith(prefix)) return null;
		return resolved;
	} catch {
		return null;
	}
}
/** Turn marketplace entries into persistable, displayable records (schema v2: with meta, no full raw). */
function toStoredPlugins(parsed, context) {
	return parsed.plugins.map((entry) => {
		const installable = entry.source.kind === "local" || entry.source.kind === "github" || entry.source.kind === "git";
		const warning = entry.source.kind === "npm" ? "MVP 暂不支持 npm 源" : entry.source.kind === "unknown" || entry.source.kind === "other" ? "插件 source 无法识别，不能安装" : "";
		return {
			name: entry.name,
			version: entry.version,
			description: entry.description,
			source: entry.source,
			installable,
			...warning !== "" ? { warning } : {},
			...context.origin !== void 0 ? { origin: context.origin } : {},
			meta: normalizeEntryMeta(entry.meta)
		};
	});
}
/** Treat a directory as a single-plugin market: read its own plugin.json and reuse parseMarketplace for display/meta. */
function singlePluginMarket(location, name) {
	const detected = detectPluginManifest(location);
	const meta = validatePluginManifest(detected.manifest, detected);
	const marketplaceName = name || meta.name;
	const parsed = parseMarketplace({
		name: marketplaceName,
		owner: meta.author ?? { name: "" },
		description: meta.description,
		plugins: [{
			name: meta.name,
			version: meta.version,
			description: meta.description,
			author: meta.author,
			homepage: meta.homepage,
			repository: meta.repository,
			license: meta.license,
			keywords: meta.keywords,
			icon: meta.icon,
			category: meta.category,
			source: "./"
		}]
	}, {
		format: detected.format,
		root: location
	});
	return {
		name: marketplaceName,
		format: detected.format,
		parsed,
		warnings: [...detected.warnings, ...meta.warnings]
	};
}
/** Manages market sources: local, git, and marketplace.json links. */
var MarketManager = class {
	store;
	log;
	fetchImpl;
	data = null;
	/** Tolerance warnings from the last load. */
	warnings = [];
	constructor(options) {
		this.store = options.store;
		this.log = options.log;
		this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
		this.cleanupPreviewCache();
	}
	/** Drop the previous process's preview clones (tmp is transient by design). */
	cleanupPreviewCache() {
		try {
			for (const entry of readdirSync(this.store.paths.tmp)) if (entry.startsWith("preview-")) rmTree(path.join(this.store.paths.tmp, entry));
		} catch {}
	}
	load() {
		const { markets, warnings } = this.store.readMarkets();
		this.data = markets;
		this.warnings = warnings;
		return this;
	}
	/** The loaded table; the first call loads it. */
	ensureData() {
		let data = this.data;
		if (data === null) {
			this.load();
			data = this.data;
		}
		if (data === null) throw hubError("marketplaces 数据不可用", "internal");
		return data;
	}
	list() {
		return this.ensureData().markets;
	}
	get(id) {
		return this.list().find((market) => market.id === id) ?? null;
	}
	save() {
		this.store.saveMarkets(this.ensureData());
	}
	/** Market source root (local→location; git→cache clone; url→null). */
	marketRoot(market) {
		return marketRoot(market, this.store);
	}
	/** Auto-detect the market source (local/git/url). */
	async detectSource(location) {
		return await detectSource(location, {
			store: this.store,
			fetchImpl: this.fetchImpl
		});
	}
	/** Resolve an entry's source directory; `allowClone:false` stays offline. */
	resolvePluginSourceRoot(market, pluginName, options = {}) {
		return resolvePluginSourceRoot(market, pluginName, {
			store: this.store,
			markets: this,
			...options
		});
	}
	/** Local file path of an entry icon (in-root raster only, ≤256 KiB). */
	entryIconFile(market, entry) {
		return entryIconFile$1(market, entry, this.store);
	}
	/** Add a market and refresh it immediately. */
	async add(input) {
		const rawLocation = String(input.location ?? "").trim();
		let type = String(input.type ?? "").trim();
		let location = rawLocation;
		if (type === "" || type === "auto") {
			const detected = await this.detectSource(rawLocation);
			type = detected.type;
			location = detected.location;
		}
		const normalizedLocation = normalizeLocation(type, location);
		const id = marketIdFor(type, normalizedLocation);
		if (this.get(id)) throw hubError(`市场已存在：${id}`, "conflict");
		const wantedKey = marketLocationKey(normalizedLocation);
		const duplicate = wantedKey === "" ? null : this.list().find((market) => marketLocationKey(market.location) === wantedKey);
		if (duplicate) throw hubError(`该市场已存在：${duplicate.title || duplicate.name}（${duplicate.location}）。如需重新添加，请先移除原市场。`, "market_exists");
		const market = {
			id,
			name: String(input.name ?? "").trim() || path.basename(normalizedLocation),
			title: "",
			format: String(input.format ?? "").trim() || "claude",
			type,
			location: normalizedLocation,
			display: {
				title: "",
				description: "",
				owner: { name: "" }
			},
			owner: { name: "" },
			featured: [],
			addedAt: (/* @__PURE__ */ new Date()).toISOString(),
			lastRefreshed: "",
			plugins: [],
			warnings: []
		};
		this.ensureData().markets.push(market);
		this.save();
		try {
			await this.refresh(id);
		} catch (error) {
			if (type !== "url") {
				const rollback = this.ensureData();
				rollback.markets = rollback.markets.filter((item) => item.id !== id);
				this.save();
				throw error;
			}
			market.refreshError = error instanceof Error ? error.message : String(error);
			this.save();
		}
		return this.get(id);
	}
	/** Read-only preview of one market source (never registers or persists anything). */
	async preview(input, options = {}) {
		const raw = String(input.location ?? "").trim();
		if (raw === "") throw hubError("市场地址不能为空", "bad_request");
		const formatHint = String(input.format ?? "").trim() || void 0;
		const refresh = input.refresh === true;
		const fetchImpl = options.fetchImpl ?? this.fetchImpl;
		const jsonTimeoutMs = options.jsonTimeoutMs ?? 15e3;
		const resolvedDir = path.resolve(expandTildeValue(raw));
		if (isDirectory(resolvedDir)) {
			const read = this.readFromDirectory(resolvedDir, void 0, formatHint);
			return {
				type: "local",
				location: resolvedDir,
				via: "local",
				...previewHead(read.format, read.parsed, read.marketplaceName),
				plugins: previewPlugins(read.parsed)
			};
		}
		if (isHttpLocation(raw)) {
			const github = githubRawInfo(raw);
			if (github !== null) for (const [formatId, relative] of rawManifestCandidates()) try {
				const parsed = parseMarketplace(await fetchJsonProbe(`${github.base}/${relative}`, fetchImpl, jsonTimeoutMs), {
					format: formatId,
					root: raw,
					origin: raw
				});
				return {
					type: "git",
					location: raw,
					via: "raw",
					...previewHead(formatId, parsed, ""),
					plugins: previewPlugins(parsed)
				};
			} catch {}
			else try {
				const manifest = await fetchJsonProbe(raw, fetchImpl, jsonTimeoutMs);
				const format = formatHint ?? "claude";
				const parsed = parseMarketplace(manifest, {
					format,
					root: raw,
					origin: raw
				});
				return {
					type: "url",
					location: raw,
					via: "raw",
					...previewHead(format, parsed, ""),
					plugins: previewPlugins(parsed)
				};
			} catch {}
		}
		if (isGitLocation(raw) || isHttpLocation(raw)) {
			const target = this.previewCloneTarget(raw);
			if (refresh) rmTree(target);
			if (!isDirectory(target)) {
				mkdirSync(path.dirname(target), { recursive: true });
				if (typeof options.cloneImpl === "function") options.cloneImpl(raw, target);
				else runGit([
					"clone",
					"--depth",
					"1",
					"--",
					raw,
					target
				], { timeoutMs: options.cloneTimeoutMs ?? 12e4 });
			}
			const read = this.readFromDirectory(target, void 0, formatHint);
			return {
				type: "git",
				location: raw,
				via: "clone",
				...previewHead(read.format, read.parsed, read.marketplaceName),
				plugins: previewPlugins(read.parsed)
			};
		}
		if (isPathLike(raw)) throw hubError(`本地市场目录不存在：${resolvedDir}`, "not_found");
		throw hubError(`无法识别的市场地址：${raw}（支持本地目录、git 仓库地址或 marketplace.json 直链）`, "bad_request");
	}
	/** Clone-cache path of one git location for previews. */
	previewCloneTarget(location) {
		const hash = createHash("sha1").update(location).digest("hex").slice(0, 12);
		return path.join(this.store.paths.tmp, `preview-${hash}`);
	}
	/** Read marketplace.json from a directory/git repo; a single-plugin directory takes the compatibility branch. */
	readFromDirectory(root, name, formatHint) {
		if (!isDirectory(root)) throw hubError(`市场目录不存在：${root}`, "not_found");
		let detected;
		try {
			detected = detectMarketplaceFile(root, { ...formatHint !== void 0 ? { hintFormat: formatHint } : {} });
		} catch (error) {
			if (looksLikePluginDir(root)) {
				const single = singlePluginMarket(root, name);
				return {
					format: single.format,
					marketplaceName: single.name,
					parsed: single.parsed,
					warnings: single.warnings
				};
			}
			throw error;
		}
		const parsed = parseMarketplace(detected.manifest, {
			format: detected.format,
			root
		});
		return {
			format: detected.format,
			marketplaceName: typeof detected.manifest.name === "string" && detected.manifest.name.trim() !== "" ? detected.manifest.name.trim() : name ?? "",
			parsed,
			warnings: parsed.warnings
		};
	}
	/** Clone a git market repository (shallow). */
	cloneGitMarket(market) {
		const repo = this.marketRoot(market);
		if (repo === null) throw hubError(`无法定位 git 市场缓存目录：${market.id}`, "bad_request");
		rmTree(repo);
		mkdirSync(path.dirname(repo), { recursive: true });
		runGit([
			"clone",
			"--depth",
			"1",
			"--",
			market.location,
			repo
		]);
	}
	/** Refresh a git market repository: fetch + reset when present, re-clone on failure. */
	syncGitMarket(market) {
		const repo = this.marketRoot(market);
		if (repo === null) throw hubError(`无法定位 git 市场缓存目录：${market.id}`, "bad_request");
		if (!existsSync(path.join(repo, ".git"))) {
			this.cloneGitMarket(market);
			return;
		}
		try {
			runGit([
				"fetch",
				"--depth",
				"1",
				"origin",
				"HEAD"
			], { cwd: repo });
			runGit([
				"reset",
				"--hard",
				"FETCH_HEAD"
			], { cwd: repo });
		} catch (error) {
			this.log("warn", `git 市场 ${market.id} 增量更新失败，改为重新克隆：${error instanceof Error ? error.message : String(error)}`);
			this.cloneGitMarket(market);
		}
	}
	/** Fetch a URL market manifest and write the snapshot. */
	async fetchUrlMarket(market) {
		if (typeof this.fetchImpl !== "function") throw hubError("当前运行环境没有 fetch，无法使用 URL 市场", "network_error");
		const response = await this.fetchImpl(market.location, {
			signal: AbortSignal.timeout?.(15e3),
			headers: { accept: "application/json" }
		});
		if (!response.ok) throw hubError(`拉取 ${market.location} 失败：HTTP ${String(response.status)}`, "network_error");
		const text = await response.text();
		let manifest;
		try {
			manifest = JSON.parse(text);
		} catch (error) {
			throw hubError(`URL 市场返回的不是合法 JSON：${error instanceof Error ? error.message : String(error)}`, "network_error");
		}
		const snapshot = path.join(this.store.paths.markets, market.id, "marketplace.json");
		mkdirSync(path.dirname(snapshot), { recursive: true });
		writeFileSync(snapshot, text, "utf8");
		return manifest;
	}
	/** Resolve a github/git entry source (reuse cache when present, shallow-clone otherwise). */
	resolveGitSource(market, source) {
		const url = gitSourceUrl(source);
		if (!url) throw hubError("Git source 缺少 url/repo", "bad_request");
		const dir = gitSourceDir(this.store, market.id, source);
		if (!existsSync(dir)) {
			mkdirSync(path.dirname(dir), { recursive: true });
			runGit([
				"clone",
				"--depth",
				"1",
				"--",
				url,
				dir
			]);
			const commit = source.kind === "github" || source.kind === "git" ? source.commit : void 0;
			if (commit) {
				runGit([
					"fetch",
					"--depth",
					"1",
					"origin",
					commit
				], { cwd: dir });
				runGit(["checkout", "FETCH_HEAD"], { cwd: dir });
			}
		}
		const sourcePath = source.kind === "github" || source.kind === "git" ? source.path : void 0;
		return sourcePath ? resolveRelativeSource(dir, sourcePath) : dir;
	}
	/** Resolve a plugin entry's installable directory (installer entry; may clone). */
	resolveInstallSource(market, pluginName) {
		const result = this.resolvePluginSourceRoot(market, pluginName, { allowClone: true });
		if (!result.resolved || result.path === null) throw hubError(result.reason || `无法解析插件 ${pluginName} 的源目录`, "source_unavailable");
		return result.path;
	}
	/** Refresh one market. A url-source failure only records refreshError and never throws. */
	async refresh(id) {
		const market = this.get(id);
		if (!market) throw hubError(`市场不存在：${id}`, "not_found");
		const warnings = [];
		let parsed;
		try {
			if (market.type === "local") {
				const read = this.readFromDirectory(market.location, market.name, market.format);
				market.format = read.format;
				parsed = read.parsed;
				warnings.push(...read.warnings);
			} else if (market.type === "git") {
				this.syncGitMarket(market);
				const root = this.marketRoot(market);
				const read = this.readFromDirectory(root ?? "", market.name, market.format);
				market.format = read.format;
				parsed = read.parsed;
				warnings.push(...read.warnings);
			} else if (market.type === "url") {
				parsed = parseMarketplace(await this.fetchUrlMarket(market), {
					format: market.format,
					root: market.location,
					origin: market.location
				});
				warnings.push(...parsed.warnings);
			} else throw hubError(`未知市场类型：${market.type}`, "bad_request");
			market.plugins = toStoredPlugins(parsed, { origin: market.type === "url" ? market.location : void 0 });
			market.title = parsed.display?.title || parsed.name || market.title || market.name;
			market.display = parsed.display ?? {
				title: market.title,
				description: "",
				owner: { name: "" }
			};
			market.owner = market.display.owner ?? { name: "" };
			market.featured = Array.isArray(parsed.featured) ? parsed.featured.slice(0, 200) : [];
			market.lastRefreshed = (/* @__PURE__ */ new Date()).toISOString();
			delete market.refreshError;
			market.warnings = warnings.slice(0, 50);
			this.save();
			this.log("info", `市场 ${market.id} 刷新成功：${market.plugins.length} 个插件`);
			return market;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			market.refreshError = message;
			market.warnings = warnings.slice(0, 50);
			this.save();
			this.log("warn", `市场 ${market.id} 刷新失败：${message}`);
			if (market.type === "url") return market;
			throw error;
		}
	}
	/** Refresh every market; record each error. */
	async refreshAll() {
		const results = [];
		for (const market of this.list()) try {
			await this.refresh(market.id);
			results.push({
				id: market.id,
				ok: true
			});
		} catch (error) {
			results.push({
				id: market.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			});
		}
		return results;
	}
	/** Remove a market record (and its cache clone directory). */
	remove(id) {
		const market = this.get(id);
		if (!market) throw hubError(`市场不存在：${id}`, "not_found");
		const data = this.ensureData();
		data.markets = data.markets.filter((item) => item.id !== id);
		this.save();
		if (market.type !== "local") rmTree(path.join(this.store.paths.markets, market.id));
		this.log("info", `市场 ${id} 已移除`);
		return market;
	}
	/** List cache directories no longer referenced by any market (self-check hint). */
	orphanCacheDirs() {
		const root = this.store.paths.markets;
		if (!isDirectory(root)) return [];
		const known = new Set(this.list().map((market) => market.id));
		try {
			return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !known.has(entry.name)).map((entry) => entry.name);
		} catch {
			return [];
		}
	}
};
/** Blocking sleep (milliseconds) for lock retries. */
function sleepSync(ms) {
	const shared = new Int32Array(new SharedArrayBuffer(4));
	Atomics.wait(shared, 0, 0, ms);
}
function timestampForFile(date = /* @__PURE__ */ new Date()) {
	return date.toISOString().replace(/[:.]/gu, "-");
}
function isObject$2(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** The empty state file. */
function emptyState() {
	return {
		schemaVersion: 2,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		plugins: []
	};
}
/** The empty market table. */
function emptyMarkets() {
	return {
		schemaVersion: 2,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		markets: []
	};
}
/** Normalize one plugin record; invalid records return `null`. */
function normalizePluginRecord(record, warnings) {
	if (!isObject$2(record)) return null;
	const key = typeof record.key === "string" ? record.key.trim() : "";
	const name = typeof record.name === "string" ? record.name.trim() : "";
	const format = typeof record.format === "string" ? record.format.trim() : "";
	const version = typeof record.version === "string" ? record.version.trim() : "";
	if (key === "" || name === "" || format === "" || version === "") {
		warnings.push(`丢弃字段不全的插件记录：${JSON.stringify(record).slice(0, 120)}`);
		return null;
	}
	const previousVersions = Array.isArray(record.previousVersions) ? record.previousVersions.filter((item) => isObject$2(item) && typeof item.version === "string" && typeof item.installedPath === "string").slice(-5).map((item) => ({
		version: item.version,
		installedPath: item.installedPath,
		installedAt: typeof item.installedAt === "string" ? item.installedAt : ""
	})) : [];
	return {
		key,
		format,
		name,
		version,
		market: typeof record.market === "string" ? record.market : "",
		installedPath: typeof record.installedPath === "string" ? record.installedPath : "",
		enabled: record.enabled !== false,
		installedAt: typeof record.installedAt === "string" ? record.installedAt : (/* @__PURE__ */ new Date()).toISOString(),
		capabilities: isObject$2(record.capabilities) ? record.capabilities : {},
		disabledCapabilities: normalizeDisabledCapabilities(record.disabledCapabilities),
		previousVersions
	};
}
/** Normalize one persisted marketplace entry (meta is whitelisted; unknown fields drop). */
function normalizeStoredEntry(entry) {
	if (!isObject$2(entry)) return null;
	const name = typeof entry.name === "string" ? entry.name.trim() : "";
	if (name === "") return null;
	const normalized = {
		name,
		version: typeof entry.version === "string" ? entry.version.trim() : "",
		description: typeof entry.description === "string" ? entry.description.trim() : "",
		source: isObject$2(entry.source) ? entry.source : { kind: "unknown" },
		installable: entry.installable !== false,
		meta: normalizeEntryMeta(entry.meta)
	};
	const warning = typeof entry.warning === "string" ? entry.warning.trim() : "";
	if (warning !== "") normalized.warning = warning;
	const origin = typeof entry.origin === "string" ? entry.origin.trim() : "";
	if (origin !== "") normalized.origin = origin;
	return normalized;
}
/** Normalize one marketplace record. */
function normalizeMarketRecord(record, warnings) {
	if (!isObject$2(record)) return null;
	const id = typeof record.id === "string" ? record.id.trim() : "";
	if (id === "") {
		warnings.push("丢弃缺少 id 的市场记录");
		return null;
	}
	const name = typeof record.name === "string" && record.name.trim() !== "" ? record.name.trim() : id;
	const title = typeof record.title === "string" && record.title.trim() !== "" ? record.title.trim() : name;
	const display = normalizeMarketDisplay(record.display, title);
	const owner = normalizeAuthor$1(record.owner) ?? display.owner ?? { name: "" };
	display.owner = owner;
	const plugins = [];
	for (const entry of Array.isArray(record.plugins) ? record.plugins : []) {
		const normalized = normalizeStoredEntry(entry);
		if (normalized !== null) plugins.push(normalized);
	}
	const type = [
		"local",
		"git",
		"url"
	].includes(String(record.type)) ? record.type : "local";
	return {
		id,
		name,
		title,
		format: typeof record.format === "string" ? record.format : "claude",
		type,
		location: typeof record.location === "string" ? record.location : "",
		addedAt: typeof record.addedAt === "string" ? record.addedAt : (/* @__PURE__ */ new Date()).toISOString(),
		lastRefreshed: typeof record.lastRefreshed === "string" ? record.lastRefreshed : "",
		display,
		owner,
		featured: normalizeStringArray(record.featured),
		plugins,
		refreshError: typeof record.refreshError === "string" && record.refreshError !== "" ? record.refreshError : void 0,
		warnings: Array.isArray(record.warnings) ? record.warnings.filter((item) => typeof item === "string") : []
	};
}
/**
* Normalize any raw state object to the current schema (shared by readState
* and migrate.ts).
*
* @param raw - raw state.json value.
* @param warnings - tolerance warnings collector.
*/
function normalizeState(raw, warnings = []) {
	if (!isObject$2(raw)) {
		warnings.push("state 顶层必须是 JSON 对象，已按空表处理");
		return emptyState();
	}
	if (raw.schemaVersion !== 2) warnings.push(`state.json 的 schemaVersion=${String(raw.schemaVersion)}（当前 2）；请先运行迁移`);
	const plugins = [];
	const seen = /* @__PURE__ */ new Set();
	for (const record of Array.isArray(raw.plugins) ? raw.plugins : []) {
		const normalized = normalizePluginRecord(record, warnings);
		if (normalized === null) continue;
		if (seen.has(normalized.key)) {
			warnings.push(`插件 ${normalized.key} 在 state 中重复，保留最后一条`);
			const index = plugins.findIndex((item) => item.key === normalized.key);
			if (index >= 0) plugins.splice(index, 1);
		}
		seen.add(normalized.key);
		plugins.push(normalized);
	}
	return {
		schemaVersion: 2,
		updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : (/* @__PURE__ */ new Date()).toISOString(),
		plugins
	};
}
/**
* Normalize any raw marketplaces object to the current schema (shared by
* readMarkets and migrate.ts).
*
* @param raw - raw marketplaces.json value.
* @param warnings - tolerance warnings collector.
*/
function normalizeMarkets(raw, warnings = []) {
	if (!isObject$2(raw)) {
		warnings.push("marketplaces 顶层必须是 JSON 对象，已按空表处理");
		return emptyMarkets();
	}
	if (raw.schemaVersion !== 2) warnings.push(`marketplaces.json 的 schemaVersion=${String(raw.schemaVersion)}（当前 2）；请先运行迁移`);
	const markets = [];
	const ids = /* @__PURE__ */ new Set();
	for (const record of Array.isArray(raw.markets) ? raw.markets : []) {
		const normalized = normalizeMarketRecord(record, warnings);
		if (normalized === null) continue;
		if (ids.has(normalized.id)) {
			warnings.push(`市场 id ${normalized.id} 重复，保留最后一条`);
			const index = markets.findIndex((item) => item.id === normalized.id);
			if (index >= 0) markets.splice(index, 1);
		}
		ids.add(normalized.id);
		markets.push(normalized);
	}
	return {
		schemaVersion: 2,
		updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : (/* @__PURE__ */ new Date()).toISOString(),
		markets
	};
}
/** Atomic IO, locking, self-repair, and logging over the hub home directory. */
var HubStore = class {
	home;
	lockHeld = false;
	/** @param home - hub storage root (absolute path). */
	constructor(home) {
		this.home = home;
	}
	/** All storage paths. */
	get paths() {
		return {
			home: this.home,
			state: path.join(this.home, "state.json"),
			marketplaces: path.join(this.home, "marketplaces.json"),
			cache: path.join(this.home, "cache"),
			markets: path.join(this.home, "cache", "markets"),
			logs: path.join(this.home, "logs"),
			tmp: path.join(this.home, "tmp"),
			lock: path.join(this.home, "tmp", "hub.lock"),
			logFile: path.join(this.home, "logs", "hub.log")
		};
	}
	/** Create the base directories (idempotent). */
	ensureDirs() {
		for (const dir of [
			this.home,
			this.paths.cache,
			this.paths.markets,
			this.paths.logs,
			this.paths.tmp
		]) mkdirSync(dir, { recursive: true });
	}
	/** Append one log line; never throws. */
	log(level, message) {
		const line = `${(/* @__PURE__ */ new Date()).toISOString()} [${level}] ${message}\n`;
		try {
			mkdirSync(this.paths.logs, { recursive: true });
			appendFileSync(this.paths.logFile, line, "utf8");
		} catch {}
	}
	/** Atomic JSON write: temp file + rename. */
	atomicWriteJson(filePath, value) {
		mkdirSync(path.dirname(filePath), { recursive: true });
		const tmp = `${filePath}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
		const text = `${JSON.stringify(value, null, 2)}\n`;
		const fd = openSync(tmp, "w");
		try {
			writeSync(fd, text, 0, "utf8");
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		renameSync(tmp, filePath);
	}
	/** Read JSON; a missing file returns `null`, a corrupt file backs up and returns the empty factory value. */
	readJsonSafe(filePath, emptyFactory, warnings = []) {
		if (!existsSync(filePath)) return null;
		let text;
		try {
			text = readFileSync(filePath, "utf8");
		} catch (error) {
			warnings.push(`无法读取 ${path.basename(filePath)}：${error instanceof Error ? error.message : String(error)}`);
			return null;
		}
		try {
			return JSON.parse(text.replace(/^\uFEFF/u, ""));
		} catch (error) {
			const backup = path.join(this.paths.logs, `corrupt-${timestampForFile()}-${path.basename(filePath)}`);
			try {
				mkdirSync(this.paths.logs, { recursive: true });
				renameSync(filePath, backup);
				warnings.push(`${path.basename(filePath)} 已损坏，备份到 ${backup}，使用空表重建`);
			} catch {
				warnings.push(`${path.basename(filePath)} 已损坏，备份失败，使用空表重建`);
			}
			this.log("warn", `${filePath} 损坏：${error instanceof Error ? error.message : String(error)}`);
			return emptyFactory ? emptyFactory() : null;
		}
	}
	/**
	* Read state: fields normalize to the current schema only; old schema files
	* migrate at startup through migrate.ts.
	*/
	readState() {
		const warnings = [];
		const raw = this.readJsonSafe(this.paths.state, emptyState, warnings);
		if (raw === null) return {
			state: emptyState(),
			warnings
		};
		return {
			state: normalizeState(raw, warnings),
			warnings
		};
	}
	/** Save state. */
	saveState(state) {
		this.ensureDirs();
		this.atomicWriteJson(this.paths.state, {
			schemaVersion: 2,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
			plugins: state.plugins ?? []
		});
	}
	/** Read the market table; a corrupt file rebuilds. */
	readMarkets() {
		const warnings = [];
		const raw = this.readJsonSafe(this.paths.marketplaces, emptyMarkets, warnings);
		if (raw === null) return {
			markets: emptyMarkets(),
			warnings
		};
		return {
			markets: normalizeMarkets(raw, warnings),
			warnings
		};
	}
	/** Save the market table. */
	saveMarkets(markets) {
		this.ensureDirs();
		this.atomicWriteJson(this.paths.marketplaces, {
			schemaVersion: 2,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
			markets: markets.markets ?? []
		});
	}
	/**
	* Self-repair: drop installs whose directories are gone, clean missing
	* rollback directories.
	*
	* @param state - current state file.
	* @param checker - install validity predicate.
	*/
	repairState(state, checker) {
		const warnings = [];
		const removed = [];
		const plugins = [];
		for (const record of state.plugins ?? []) {
			if (!(existsSync(record.installedPath) && checker.isValidInstall(record))) {
				removed.push(record);
				warnings.push(`插件 ${record.name}@${record.version} 的安装目录不可用（${record.installedPath}），已从状态剔除`);
				continue;
			}
			const previousVersions = record.previousVersions.filter((item) => {
				if (existsSync(item.installedPath)) return true;
				warnings.push(`插件 ${record.name} 的回滚版本 ${item.version} 目录丢失，已清理`);
				return false;
			});
			plugins.push({
				...record,
				previousVersions
			});
		}
		return {
			state: {
				...state,
				plugins
			},
			removed,
			warnings
		};
	}
	/** Acquire the process lock (synchronous retry). */
	acquireLock(timeoutMs = 5e3) {
		if (this.lockHeld) return;
		this.ensureDirs();
		const deadline = Date.now() + timeoutMs;
		let acquired = false;
		while (Date.now() < deadline) try {
			const fd = openSync(this.paths.lock, "wx");
			writeFileSync(fd, JSON.stringify({
				pid: process.pid,
				at: (/* @__PURE__ */ new Date()).toISOString(),
				host: os.hostname()
			}));
			closeSync(fd);
			acquired = true;
			break;
		} catch (error) {
			if (error?.code !== "EEXIST") throw error;
			if (this.stealStaleLock()) continue;
			sleepSync(50);
		}
		if (!acquired) throw new Error("另一个 hub 操作正在进行（锁超时）；请稍后重试，或删除 tmp/hub.lock（确认没有其他 DSH 实例在写）");
		this.lockHeld = true;
	}
	/** Release the process lock. */
	releaseLock() {
		if (!this.lockHeld) return;
		this.lockHeld = false;
		try {
			unlinkSync(this.paths.lock);
		} catch {}
	}
	/**
	* Run `fn` synchronously while holding the process lock.
	*
	* @param fn - critical section.
	* @param options - lock timeout.
	*/
	withLock(fn, options = {}) {
		if (this.lockHeld) {
			this.log("warn", "检测到同进程重入加锁，直接复用当前锁");
			return fn();
		}
		this.acquireLock(options.timeoutMs);
		try {
			return fn();
		} finally {
			this.releaseLock();
		}
	}
	/**
	* Run `fn` asynchronously while holding the process lock.
	*
	* @param fn - critical section.
	* @param options - lock timeout.
	*/
	async withLockAsync(fn, options = {}) {
		if (this.lockHeld) {
			this.log("warn", "检测到同进程重入加锁，直接复用当前锁");
			return fn();
		}
		this.acquireLock(options.timeoutMs);
		try {
			return await fn();
		} finally {
			this.releaseLock();
		}
	}
	/** Steal a stale lock: its pid is gone or it is older than 60 seconds. */
	stealStaleLock() {
		try {
			const raw = JSON.parse(readFileSync(this.paths.lock, "utf8"));
			let alive = false;
			if (typeof raw.pid === "number") try {
				process.kill(raw.pid, 0);
				alive = true;
			} catch {
				alive = false;
			}
			const ageMs = Date.now() - Date.parse(typeof raw.at === "string" ? raw.at : "");
			if (!(!alive || !Number.isFinite(ageMs) || ageMs > 6e4)) return false;
			rmSync(this.paths.lock, { force: true });
			this.log("warn", `抢占陈旧锁（pid=${String(raw.pid)}）`);
			return true;
		} catch {
			try {
				rmSync(this.paths.lock, { force: true });
				return true;
			} catch {
				return false;
			}
		}
	}
	/** Clear state files (tests). */
	reset() {
		for (const file of [this.paths.state, this.paths.marketplaces]) rmSync(file, { force: true });
	}
};
Object.freeze([Object.freeze({
	from: 1,
	to: 2
})]);
function isObject$1(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function timestampForDir(date = /* @__PURE__ */ new Date()) {
	return date.toISOString().replace(/[:.]/gu, "-");
}
/** Strict JSON read; failures throw an actionable Chinese reason (no backup, no write). */
function readJsonStrict(filePath) {
	let text;
	try {
		text = readFileSync(filePath, "utf8");
	} catch (error) {
		throw new Error(`无法迁移 ${path.basename(filePath)}：${error instanceof Error ? error.message : String(error)}`);
	}
	try {
		return JSON.parse(text.replace(/^\uFEFF/u, ""));
	} catch (error) {
		throw new Error(`无法迁移 ${path.basename(filePath)}：不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
	}
}
/** Upgrade one v1 market record to the v2 shape (title/display/owner/plugins[].meta), dropping the in-memory `root` field. */
function migrateMarketRecord(market) {
	const name = typeof market.name === "string" && market.name.trim() !== "" ? market.name.trim() : String(market.id ?? "");
	const title = typeof market.title === "string" && market.title.trim() !== "" ? market.title.trim() : name;
	const display = normalizeMarketDisplay(market.display ?? { title: name }, title);
	const owner = normalizeAuthor$1(market.owner) ?? display.owner ?? { name: "" };
	display.owner = owner;
	const plugins = (Array.isArray(market.plugins) ? market.plugins : []).map((entry) => {
		if (!isObject$1(entry)) return entry;
		const source = isObject$1(entry.meta) ? entry.meta : null;
		const description = typeof entry.description === "string" ? entry.description : "";
		const meta = normalizeEntryMeta({
			...source ?? {},
			...description !== "" ? { description } : {}
		});
		return {
			...entry,
			meta
		};
	});
	const migrated = {
		...market,
		title,
		display,
		owner,
		plugins
	};
	delete migrated.root;
	return migrated;
}
/**
* Run the schema migration.
*
* @param store - only paths / ensureDirs / atomicWriteJson are needed.
* @throws {Error} on illegal JSON, an unknown schemaVersion, or a backup/write
*   failure (original files preserved).
*/
function runMigrations(store) {
	store.ensureDirs();
	const warnings = [];
	const targets = [{
		kind: "state",
		file: store.paths.state
	}, {
		kind: "markets",
		file: store.paths.marketplaces
	}].filter((target) => existsSync(target.file));
	if (targets.length === 0) return {
		migrated: false,
		from: 2,
		to: 2,
		backup: null
	};
	const pending = [];
	for (const target of targets) {
		const raw = readJsonStrict(target.file);
		if (!isObject$1(raw)) throw new Error(`无法迁移 ${path.basename(target.file)}：顶层必须是 JSON 对象`);
		const version = raw.schemaVersion;
		if (version === 2) continue;
		if (version === 1) {
			pending.push({
				...target,
				raw,
				version
			});
			continue;
		}
		throw new Error(`无法迁移 ${path.basename(target.file)}：不支持的 schemaVersion=${String(version)}（仅支持 1→2）`);
	}
	if (pending.length === 0) return {
		migrated: false,
		from: 2,
		to: 2,
		backup: null
	};
	const now = (/* @__PURE__ */ new Date()).toISOString();
	let stateOutput = null;
	let marketsOutput = null;
	for (const item of pending) {
		if (item.kind === "state") {
			stateOutput = {
				schemaVersion: 2,
				updatedAt: now,
				plugins: normalizeState(item.raw, warnings).plugins
			};
			continue;
		}
		marketsOutput = {
			schemaVersion: 2,
			updatedAt: now,
			markets: normalizeMarkets(item.raw, warnings).markets.map((market) => migrateMarketRecord(market))
		};
	}
	const fromVersion = pending[0]?.version ?? 1;
	const backupDir = path.join(store.paths.logs, "migrations", `v${String(fromVersion)}-${timestampForDir()}`);
	const backups = [];
	try {
		mkdirSync(backupDir, { recursive: true });
		for (const target of targets) {
			const backupFile = path.join(backupDir, path.basename(target.file));
			copyFileSync(target.file, backupFile);
			backups.push({
				file: target.file,
				backupFile
			});
		}
	} catch (error) {
		throw new Error(`迁移备份失败，原文件未改动：${error instanceof Error ? error.message : String(error)}`);
	}
	try {
		if (stateOutput !== null) store.atomicWriteJson(store.paths.state, stateOutput);
		if (marketsOutput !== null) store.atomicWriteJson(store.paths.marketplaces, marketsOutput);
	} catch (error) {
		for (const item of backups) try {
			copyFileSync(item.backupFile, item.file);
		} catch {}
		throw new Error(`迁移写入失败，已尝试恢复原文件（备份在 ${backupDir}）：${error instanceof Error ? error.message : String(error)}`);
	}
	return {
		migrated: true,
		from: fromVersion,
		to: 2,
		backup: backupDir
	};
}
// src/plugin-commands.ts
/**
* Commands shipped inside installed agent plugins, adapted as host commands
* `<plugin>-<command>`.
*
* Limitation (probed): a host command handler can only return one text block —
* it cannot inject the command result as a new user message. So this renders
* the full Markdown text and asks the user to copy-send it; no homemade
* execution channel.
*
* Host command names only allow `[a-z][a-z0-9_-]*` with no colon; the
* namespace separator is therefore `-`.
*
* @module dsh-agent-extension/plugin-commands
*/
const COPY_HINT = "（Agent 插件命令不会自动注入会话；请复制上面内容发送给模型。）";
/** Host-side runtime for agent-plugin commands. */
var PluginCommandRuntime = class PluginCommandRuntime {
	getEnabledPlugins;
	log;
	commands = null;
	disposers = /* @__PURE__ */ new Map();
	/** Registration state. */
	registered = [];
	/** Conflicts and failures. */
	conflicts = [];
	reason = "";
	constructor(options) {
		this.getEnabledPlugins = options.getEnabledPlugins;
		this.log = options.log;
	}
	/** Record the host commands service (missing service only records the reason). */
	attach(ctx) {
		const commands = ctx?.get?.("commands") ?? ctx?.commands;
		if (!commands || typeof commands.register !== "function") {
			this.reason = "宿主未提供 commands 服务";
			return false;
		}
		this.commands = commands;
		this.reason = "";
		return true;
	}
	/** Host command name for one plugin command. */
	static commandName(pluginName, commandName) {
		return toCommandName(`${pluginName}-${commandName}`);
	}
	/** Unregister every registered plugin command. */
	clear() {
		for (const disposer of this.disposers.values()) try {
			disposer();
		} catch (error) {
			this.log("warn", `注销插件命令失败：${error instanceof Error ? error.message : String(error)}`);
		}
		this.disposers.clear();
		this.registered = [];
		this.conflicts = [];
	}
	/** Rebuild command registrations from the current enabled state. */
	sync() {
		this.clear();
		if (this.commands === null) return;
		for (const plugin of this.getEnabledPlugins()) {
			const scan = scanCommands(plugin.installedPath, plugin.format);
			for (const warning of scan.warnings) this.log("warn", `${plugin.name}: ${warning}`);
			for (const command of scan.commands) {
				if (isCapabilityDisabled(plugin, "commands", command.name)) continue;
				const name = PluginCommandRuntime.commandName(plugin.name, command.name);
				if (this.disposers.has(name)) {
					this.conflicts.push({
						name,
						plugin: plugin.key,
						reason: "同一插件内命令重名"
					});
					continue;
				}
				const description = `[${plugin.name}] ${command.description}`.slice(0, 200);
				try {
					const disposer = this.commands.register({
						name,
						description,
						input: { hint: command.argumentHint || "[参数]" },
						handler: ({ rawInput }) => {
							return {
								kind: "success",
								text: `${renderCommandTemplate(command.body, rawInput ?? "")}\n\n${COPY_HINT}`
							};
						}
					});
					this.disposers.set(name, disposer);
					this.registered.push({
						name,
						plugin: plugin.key,
						file: command.file
					});
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					this.conflicts.push({
						name,
						plugin: plugin.key,
						reason: message
					});
					this.log("warn", `注册插件命令 /${name} 失败（冲突跳过）：${message}`);
				}
			}
		}
	}
	/** State for `/agent-plugin info` / status. */
	stats() {
		return {
			available: this.commands !== null,
			reason: this.reason,
			registered: this.registered,
			conflicts: this.conflicts
		};
	}
};
// src/skills.ts
/**
* Skill injection: register the `skills/**\/SKILL.md` of enabled agent plugins
* as a host skill provider.
*
* Host interface (probed): `ctx.skills.registerProvider(create)`; `create`
* receives an `{invalidate}` lifecycle control and returns
* `{name, list(options), get(candidate, options)}`. A candidate needs
* name/description/invocation/source/provider/resourceBase/rank/locator.
*
* @module dsh-agent-extension/skills
*/
const SKILL_PROVIDER_NAME = "agent-extension";
/** Host-side skill runtime. */
var SkillRuntime = class {
	getEnabledPlugins;
	log;
	controls = /* @__PURE__ */ new Set();
	disposer = null;
	cache = null;
	/** Whether the provider is registered, plus the reason when not. */
	registered = false;
	reason = "";
	/** Warnings from the last candidate collection. */
	warnings = [];
	constructor(options) {
		this.getEnabledPlugins = options.getEnabledPlugins;
		this.log = options.log;
	}
	/** Register the provider synchronously during apply; records the reason when the host lacks the skills service. */
	register(ctx) {
		const skills = ctx?.get?.("skills") ?? ctx?.skills;
		if (!skills || typeof skills.registerProvider !== "function") {
			this.registered = false;
			this.reason = "宿主未提供 skills 服务（未启用 @deepseek-ai/dsh-skill）";
			return false;
		}
		try {
			this.disposer = skills.registerProvider((control) => {
				this.controls.add(control);
				return this.provider();
			});
			this.registered = true;
			this.reason = "";
			return true;
		} catch (error) {
			this.registered = false;
			this.reason = `注册技能 provider 失败：${error instanceof Error ? error.message : String(error)}`;
			this.log("error", this.reason);
			return false;
		}
	}
	/** The provider reads current enabled state on every list; toggling calls invalidate so the host re-queries. */
	provider() {
		return {
			name: SKILL_PROVIDER_NAME,
			list: async () => this.listCandidates(),
			get: async (candidate) => this.loadSkill(candidate)
		};
	}
	/** Collect skill candidates across all enabled plugins (deduplicated, with warnings). */
	collect() {
		const plugins = this.getEnabledPlugins();
		const candidates = [];
		const warnings = [];
		const seen = /* @__PURE__ */ new Set();
		for (const plugin of plugins) {
			const scan = scanSkills(plugin.installedPath, plugin.format);
			for (const warning of scan.warnings) warnings.push(`${plugin.name}: ${warning}`);
			for (const skill of scan.skills) {
				if (isCapabilityDisabled(plugin, "skills", skill.name)) continue;
				if (seen.has(skill.name)) {
					warnings.push(`技能名冲突：${skill.name}（${plugin.name}），后者跳过`);
					continue;
				}
				seen.add(skill.name);
				candidates.push({
					name: skill.name,
					description: skill.description || `来自 Agent 插件 ${plugin.name} 的技能`,
					whenToUse: skill.whenToUse || void 0,
					invocation: skill.invocation,
					source: "agent-plugin",
					provider: SKILL_PROVIDER_NAME,
					rank: 100,
					path: skill.file,
					resourceBase: {
						kind: "directory",
						path: skill.dir
					},
					locator: {
						file: skill.file,
						dir: skill.dir,
						plugin: plugin.key
					},
					metadata: { plugin: plugin.key }
				});
			}
		}
		this.warnings = warnings.slice(0, 100);
		return candidates;
	}
	/** Cached candidate list. */
	listCandidates() {
		if (this.cache !== null) return this.cache;
		const candidates = this.collect();
		this.cache = candidates.map((candidate) => ({ ...candidate }));
		return this.cache;
	}
	/** Read the full skill definition back through the candidate's locator. */
	loadSkill(candidate) {
		const locator = candidate?.locator;
		const file = locator?.file;
		if (typeof file !== "string") return void 0;
		try {
			const skill = parseSkillFile(file, String(candidate?.name ?? "skill"));
			return {
				name: candidate?.name,
				description: candidate?.description,
				whenToUse: candidate?.whenToUse,
				invocation: candidate?.invocation,
				source: candidate?.source,
				provider: candidate?.provider,
				path: file,
				resourceBase: {
					kind: "directory",
					path: String(locator.dir ?? "")
				},
				content: skill.content,
				metadata: candidate?.metadata
			};
		} catch (error) {
			this.log("warn", `读取技能 ${String(candidate?.name)} 失败：${error instanceof Error ? error.message : String(error)}`);
			return;
		}
	}
	/** Tell the host to drop its skill catalog cache after a plugin state change. */
	invalidate() {
		this.cache = null;
		for (const control of this.controls) try {
			control?.invalidate?.();
		} catch (error) {
			this.log("warn", `技能目录失效通知失败：${error instanceof Error ? error.message : String(error)}`);
		}
	}
	/** Unregister the provider on dispose. */
	dispose() {
		if (typeof this.disposer === "function") try {
			this.disposer();
		} catch {}
		this.disposer = null;
		this.registered = false;
		this.controls.clear();
		this.cache = null;
	}
	/** Skill stats for `/agent-plugin info`. */
	stats() {
		const plugins = this.getEnabledPlugins();
		let count = 0;
		for (const plugin of plugins) count += Array.isArray(plugin.capabilities?.skills) ? plugin.capabilities.skills.length : scanSkills(plugin.installedPath, plugin.format).skills.length;
		return {
			registered: this.registered,
			reason: this.reason,
			providers: this.controls.size,
			skills: count,
			warnings: this.warnings
		};
	}
};
// src/hub.ts
/**
* Hub orchestration: home resolution, storage migration, state self-repair,
* market/installer/capability runtime assembly, and operations.
*
* Home resolution order: config.home → DSH_AGENT_EXTENSION_HOME → ~/.dsh/agent-extension
*
* Design points:
* - start() runs the migrate.ts schema migration before reading
*   state/marketplaces; a migration failure only records migrationError
*   (returned with /store) and never blocks the reads;
* - Every write goes through runOperation for in-process single-writer mutual
*   exclusion; busy throws code='operation_in_progress'. Reads
*   (snapshot/describe with fetch:false) take no lock;
* - describePlugin unifies the "installed / not installed" detail data
*   resolution; whether a missing entry touches the network is fetch's call.
*
* @module dsh-agent-extension/hub
*/
const PACKAGE = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const HUB_NAME = "dsh-agent-extension";
const HUB_VERSION = PACKAGE.version;
/** Error code → HTTP status (ui-routes consumes this directly). */
const STATUS_BY_CODE = Object.freeze({
	bad_request: 400,
	forbidden: 403,
	not_found: 404,
	method_not_allowed: 405,
	conflict: 409,
	market_exists: 409,
	operation_in_progress: 409,
	market_unavailable: 409,
	source_unavailable: 409,
	version_invalid: 422,
	network_error: 502,
	git_error: 502,
	internal: 500
});
/**
* A hub error carrying a machine-readable code.
*
* Every throw site names its code explicitly; `asHubError` maps a plain Error
* from lower layers to `internal`.
*/
var HubError = class extends Error {
	/** Stable error code for UI branching. */
	code;
	/** Suggested HTTP status. */
	status;
	/** The active operation when code is operation_in_progress. */
	operation;
	constructor(message, options = {}) {
		super(message);
		this.name = "HubError";
		this.code = options.code ?? "bad_request";
		this.status = options.status ?? STATUS_BY_CODE[this.code] ?? 400;
		if (options.operation) this.operation = options.operation;
	}
};
/** HubError shortcut. */
function hubError(message, code = "bad_request", extra = {}) {
	return new HubError(message, {
		code,
		...extra
	});
}
/** Normalize any thrown value into a HubError (keeping an existing code/status). */
function asHubError(error) {
	if (error instanceof HubError) return error;
	return hubError(error instanceof Error ? error.message : String(error), "internal");
}
/** Readable message of any thrown value. */
function messageOf$1(error) {
	return error instanceof Error ? error.message : String(error);
}
function nonEmptyString$2(value) {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : "";
}
/** Loose author normalization: string → {name}, object → {name,email,url}; absent fields stay null. Reused by ui-data. */
function normalizeAuthor(value) {
	if (typeof value === "string") {
		const name = value.trim();
		return name === "" ? null : {
			name,
			email: null,
			url: null
		};
	}
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value;
	const name = nonEmptyString$2(record.name);
	if (name === "") return null;
	return {
		name,
		email: nonEmptyString$2(record.email) || null,
		url: nonEmptyString$2(record.url) || null
	};
}
/** Readable label of a marketplace entry source. */
function sourceLabel$1(source) {
	if (!source || typeof source !== "object") return "";
	const record = source;
	switch (record.kind) {
		case "local": return String(record.raw ?? "");
		case "github": return [String(record.repo ?? ""), typeof record.path === "string" && record.path !== "" ? `#${record.path}` : ""].filter(Boolean).join("");
		case "git": return [String(record.url ?? ""), typeof record.path === "string" && record.path !== "" ? `#${record.path}` : ""].filter(Boolean).join("");
		case "npm": return typeof record.package === "string" ? record.package : "npm";
		default: return typeof record.raw === "string" ? record.raw : String(record.kind ?? "");
	}
}
/** Declared-level update classification: a missing or incomparable version stays unknown. */
function declaredUpdateState(currentVersion, latestVersion) {
	const latest = nonEmptyString$2(latestVersion);
	if (latest === "") return "unknown";
	return classifyUpdate(nonEmptyString$2(currentVersion), latest);
}
function buildUpdateInfo(input = {}) {
	const current = nonEmptyString$2(input.currentVersion) || null;
	const latest = nonEmptyString$2(input.latestVersion) || null;
	if (input.orphan === true) return {
		state: "unknown",
		currentVersion: current,
		latestVersion: null,
		checkedBy: "none",
		reason: "来源市场已移除，无法检查更新"
	};
	if (latest === null) return {
		state: "unknown",
		currentVersion: current,
		latestVersion: null,
		checkedBy: "declared",
		reason: "市场条目没有声明版本，无法判断是否有更新"
	};
	const state = declaredUpdateState(current ?? "", latest);
	if (state === "unknown") return {
		state: "unknown",
		currentVersion: current,
		latestVersion: latest,
		checkedBy: "declared",
		reason: `版本号无法比较：${current ?? "未知"} vs ${latest}`
	};
	return {
		state,
		currentVersion: current,
		latestVersion: latest,
		checkedBy: "declared",
		reason: null
	};
}
/** Manifest summary for describe (no bodies). */
function pickManifest(meta, raw) {
	return {
		name: meta.name,
		version: meta.version,
		description: meta.description ?? "",
		author: normalizeAuthor(meta.author),
		homepage: nonEmptyString$2(meta.homepage) || null,
		repository: nonEmptyString$2(meta.repository) || null,
		license: nonEmptyString$2(meta.license) || null,
		keywords: Array.isArray(meta.keywords) ? meta.keywords.filter((item) => typeof item === "string") : [],
		category: nonEmptyString$2(meta.category) || null,
		icon: meta.icon ?? null,
		rawKeys: raw !== null && typeof raw === "object" && !Array.isArray(raw) ? Object.keys(raw) : []
	};
}
/**
* Scan one plugin directory and shape it into describe capability sections
* (skill/command bodies stripped).
*/
function shapeCapabilities({ hub, root, formatId, manifest, record, pluginName }) {
	const warnings = [];
	const skillsScan = scanSkills(root, formatId);
	const commandsScan = scanCommands(root, formatId);
	const hooksRead = readHooksConfig(root, formatId, manifest);
	const hooksParsed = normalizeHooks(hooksRead.config);
	const mcpRead = readMcpServers(root, formatId, manifest);
	warnings.push(...skillsScan.warnings, ...commandsScan.warnings, ...hooksRead.warnings, ...hooksParsed.warnings, ...mcpRead.warnings);
	const hookStats = hub.hooks?.stats() ?? {
		attached: false,
		reason: "hooks 运行时未装配",
		events: [],
		enabled: false,
		counters: {},
		recent: []
	};
	const hooks = Object.keys(hooksParsed.events).map((event) => {
		const groups = hooksParsed.events[event] ?? [];
		const mapping = HOOK_EVENT_MAP[event];
		const enabled = record ? !isCapabilityDisabled(record, "hooks", event) : true;
		const hostStat = (hookStats.events ?? []).find((item) => item.event === event) ?? null;
		let effective = false;
		let reason = "";
		if (!mapping) reason = "未知事件（宿主不会触发）";
		else if (mapping.host === null) reason = mapping.reason ?? "宿主没有对应事件";
		else if (!enabled) reason = "该 hooks 事件已在插件里禁用";
		else {
			effective = hostStat?.effective === true;
			reason = effective ? mapping.note ?? "" : hostStat?.reason || hookStats.reason || "hooks 未挂载";
		}
		return {
			event,
			host: mapping?.host ?? null,
			mode: mapping?.mode ?? "",
			canBlock: mapping?.canBlock === true,
			entries: groups.reduce((sum, group) => sum + group.entries.length, 0),
			enabled,
			effective,
			reason
		};
	});
	const mcpState = mcpAvailability(hub.ctx);
	const mcpServers = mcpRead.servers.map((server) => ({
		name: server.name,
		transport: server.transport,
		command: server.command,
		args: server.args,
		url: server.url,
		enabled: record ? !isCapabilityDisabled(record, "mcpServers", server.name) : true,
		effective: false,
		reason: mcpState.reason
	}));
	const commandOwner = record?.name ?? pluginName;
	return {
		skills: skillsScan.skills.map((skill) => ({
			name: skill.name,
			description: skill.description ?? "",
			whenToUse: skill.whenToUse ?? "",
			enabled: record ? !isCapabilityDisabled(record, "skills", skill.name) : true
		})),
		commands: commandsScan.commands.map((command) => ({
			name: command.name,
			rawName: command.rawName ?? command.name,
			hostName: PluginCommandRuntime.commandName(commandOwner, command.name),
			description: command.description ?? "",
			argumentHint: command.argumentHint ?? "",
			enabled: record ? !isCapabilityDisabled(record, "commands", command.name) : true
		})),
		hooks,
		mcpServers,
		hooksSource: hooksRead.source ?? "",
		mcpSource: mcpRead.source ?? "",
		warnings
	};
}
/** Expand `~` / `~/` in a config value; everything else goes to path.resolve verbatim. */
function expandHome(value) {
	if (value === "~") return os.homedir();
	if (value.startsWith("~/") || value.startsWith("\\~\\") || value.startsWith("~\\")) return path.join(os.homedir(), value.slice(2));
	return value;
}
/** The hub orchestration instance. */
var AgentPluginHub = class {
	home;
	formats;
	ctx;
	config;
	hookExecutor;
	store;
	markets;
	installer;
	state;
	warnings;
	started = false;
	/** Storage schema migration result; null when nothing migrated. */
	migration = null;
	/** Migration failure reason (returned with /store; readable Chinese). */
	migrationError = null;
	/** HTTP route state of the plugin-page Web UI, filled by index.js after mount. */
	uiRoutes = {
		active: false,
		reason: "未挂载"
	};
	skills = null;
	pluginCommands = null;
	hooks = null;
	operation = null;
	operationSeq = 0;
	constructor(options = {}) {
		const configured = typeof options.home === "string" ? options.home.trim() : "";
		const fromEnv = typeof process.env.DSH_AGENT_EXTENSION_HOME === "string" ? process.env.DSH_AGENT_EXTENSION_HOME.trim() : "";
		const fallback = path.join(os.homedir(), ".dsh", "agent-extension");
		this.home = path.resolve(expandHome(configured || fromEnv || fallback));
		this.formats = FORMATS;
		this.ctx = options.ctx ?? null;
		this.config = options.config ?? {};
		this.hookExecutor = options.hookExecutor ?? null;
		this.store = new HubStore(this.home);
		this.markets = new MarketManager({
			store: this.store,
			log: (level, message) => this.log(level, message)
		});
		this.installer = new Installer({
			store: this.store,
			markets: this.markets,
			log: (level, message) => this.log(level, message)
		});
		this.state = {
			schemaVersion: 2,
			updatedAt: "",
			plugins: []
		};
		this.warnings = [];
	}
	/** All storage paths. */
	get paths() {
		return this.store.paths;
	}
	/** Whether a write operation is in flight. */
	get busy() {
		return this.operation !== null;
	}
	/** The active operations list (the /store `operations` field). */
	operationsList() {
		return this.operation === null ? [] : [{ ...this.operation }];
	}
	/** Double-write one diagnostic line: ctx.logger (prefixed) + the on-disk hub.log. */
	log(level, message) {
		this.store.log(level, message);
		const logger = this.ctx?.logger;
		const line = `dsh-agent-extension: ${message}`;
		if (level === "error") logger?.error(line);
		else if (level === "warn") logger?.warn(line);
		else logger?.info(line);
	}
	listFormats() {
		return this.formats.map((format) => ({
			id: format.id,
			label: format.label,
			pluginManifests: [...format.pluginManifests],
			marketplaceFiles: [...format.marketplaceFiles]
		}));
	}
	/** Start: migrate storage → read state and self-repair → assemble runtimes. Never throws; failures land in warnings. */
	start() {
		this.store.ensureDirs();
		try {
			this.runMigrationsOnce();
			const read = this.store.readState();
			this.state = read.state;
			this.warnings.push(...read.warnings);
			this.markets.load();
			this.warnings.push(...this.markets.warnings);
			const repair = this.store.repairState(this.state, { isValidInstall: (record) => {
				try {
					const detected = detectPluginManifest(record.installedPath, { hintFormat: record.format });
					validatePluginManifest(detected.manifest, detected);
					return true;
				} catch {
					return false;
				}
			} });
			this.warnings.push(...repair.warnings);
			if (repair.removed.length > 0) {
				this.state = repair.state;
				this.store.saveState(this.state);
			}
			const getEnabledPlugins = () => this.getEnabledPlugins();
			const log = (level, message) => this.log(level, message);
			this.skills = new SkillRuntime({
				getEnabledPlugins,
				log
			});
			this.pluginCommands = new PluginCommandRuntime({
				getEnabledPlugins,
				log
			});
			this.hooks = new HookRuntime({
				getEnabledPlugins,
				config: this.config,
				log,
				...this.hookExecutor ? { executor: this.hookExecutor } : {}
			});
			if (this.ctx) {
				this.skills.register(this.ctx);
				this.pluginCommands.attach(this.ctx);
				this.pluginCommands.sync();
				this.hooks.attach(this.ctx);
			}
			this.refreshCapabilities({ save: true });
			this.started = true;
			this.log("info", `hub 启动完成：home=${this.home}，插件 ${this.state.plugins.length} 个，市场 ${this.markets.list().length} 个`);
		} catch (error) {
			const message = messageOf$1(error);
			this.warnings.push(`hub 启动异常：${message}`);
			this.store.log("error", `hub 启动异常：${message}`);
		}
		return this;
	}
	/** Run the schema migration once; a failure only records migrationError (reads keep working). */
	runMigrationsOnce() {
		try {
			const result = runMigrations(this.store);
			this.migration = {
				migrated: result.migrated === true,
				from: Number.isInteger(result.from) ? result.from : null,
				to: Number.isInteger(result.to) ? result.to : null,
				backup: typeof result.backup === "string" && result.backup !== "" ? result.backup : null
			};
			if (this.migration?.migrated === true) {
				this.warnings.push(`存储 schema 已迁移：v${String(this.migration.from)} → v${String(this.migration.to)}（备份：${this.migration.backup ?? "无"}）`);
				this.log("info", `存储 schema 已迁移：v${String(this.migration.from)} → v${String(this.migration.to)}`);
			}
			return this.migration;
		} catch (error) {
			this.migrationError = messageOf$1(error);
			this.warnings.push(`存储迁移失败：${this.migrationError}`);
			this.store.log("error", `存储迁移失败：${this.migrationError}`);
			return null;
		}
	}
	/**
	* Run one operation under single-writer mutual exclusion (sync or async fn).
	*
	* Busy throws a HubError with code='operation_in_progress'; the operation
	* leaves the list when done.
	*
	* @param kind - operation kind (market-add / install / update / update-all / describe …).
	* @param meta - operation metadata for the operations list.
	* @param fn - the operation body.
	*/
	runOperation(kind, meta = {}, fn) {
		const operation = this.beginOperation(kind, meta);
		let result;
		try {
			result = fn();
		} catch (error) {
			this.endOperation(operation);
			throw asHubError(error);
		}
		if (result !== null && typeof result === "object" && typeof result.then === "function") return result.then((value) => {
			this.endOperation(operation);
			return value;
		}, (error) => {
			this.endOperation(operation);
			throw asHubError(error);
		});
		this.endOperation(operation);
		return result;
	}
	/** Begin an operation; busy throws operation_in_progress. */
	beginOperation(kind, meta = {}) {
		if (this.operation !== null) {
			const active = this.operation;
			throw hubError(`另一个操作正在进行（${active.kind}），请稍候重试`, "operation_in_progress", { operation: active });
		}
		this.operationSeq += 1;
		const operation = {
			id: `op-${Date.now().toString(36)}-${this.operationSeq.toString(36)}`,
			kind,
			key: nonEmptyString$2(meta.key) || null,
			marketId: nonEmptyString$2(meta.marketId) || null,
			startedAt: (/* @__PURE__ */ new Date()).toISOString(),
			clientOpId: nonEmptyString$2(meta.clientOpId) || null
		};
		this.operation = operation;
		return operation;
	}
	/** End an operation. */
	endOperation(operation) {
		if (this.operation === operation) this.operation = null;
	}
	/** Currently enabled plugin records. */
	getEnabledPlugins() {
		return (this.state.plugins ?? []).filter((plugin) => plugin.enabled && existsSync(plugin.installedPath));
	}
	/** Re-scan the capability summary of every installed plugin; optionally invalidate the skill catalog immediately. */
	refreshCapabilities(options = {}) {
		const warnings = [];
		for (const record of this.state.plugins ?? []) {
			if (!existsSync(record.installedPath)) continue;
			try {
				const detected = detectPluginManifest(record.installedPath, { hintFormat: record.format });
				const meta = validatePluginManifest(detected.manifest, detected);
				const scan = scanCapabilities(record.installedPath, detected.format, detected.manifest);
				record.format = detected.format;
				record.capabilities = scan.summary;
				if (meta.version !== record.version) {
					warnings.push(`${record.name}: 清单版本 ${meta.version} 与状态版本 ${record.version} 不一致（以清单为准）`);
					record.version = meta.version;
				}
				warnings.push(...scan.warnings.map((item) => `${record.name}: ${item}`));
			} catch (error) {
				warnings.push(`${record.name}: 能力扫描失败：${messageOf$1(error)}`);
			}
		}
		this.warnings.push(...warnings);
		if (options.save === true) this.store.saveState(this.state);
		this.syncRuntimes();
		return warnings;
	}
	/** After capability changes: invalidate the skill catalog, rebuild plugin commands, refresh the hooks view. */
	syncRuntimes() {
		try {
			this.skills?.invalidate();
		} catch (error) {
			this.store.log("warn", `技能目录失效失败：${messageOf$1(error)}`);
		}
		try {
			this.pluginCommands?.sync();
		} catch (error) {
			this.store.log("warn", `重建插件命令失败：${messageOf$1(error)}`);
		}
		try {
			this.hooks?.refresh();
		} catch (error) {
			this.store.log("warn", `刷新 hooks 状态失败：${messageOf$1(error)}`);
		}
	}
	/** State snapshot for the `/agent-plugin` command (cache included). */
	snapshot() {
		const plugins = this.state.plugins ?? [];
		const markets = this.markets.list();
		return {
			name: HUB_NAME,
			version: HUB_VERSION,
			home: this.home,
			started: this.started,
			formats: this.formats.map((format) => format.id),
			plugins: {
				total: plugins.length,
				enabled: plugins.filter((plugin) => plugin.enabled).length
			},
			markets: {
				total: markets.length,
				errors: markets.filter((market) => market.refreshError).map((market) => ({
					id: market.id,
					error: market.refreshError ?? ""
				})),
				plugins: markets.reduce((sum, market) => sum + (market.plugins?.length ?? 0), 0)
			},
			skills: this.skills?.stats() ?? {
				registered: false,
				reason: "",
				skills: 0,
				providers: 0,
				warnings: []
			},
			commands: this.pluginCommands?.stats() ?? {
				available: false,
				reason: "",
				registered: [],
				conflicts: []
			},
			hooks: this.hooks?.stats() ?? {
				attached: false,
				enabled: true,
				reason: "",
				events: [],
				counters: {},
				recent: []
			},
			mcp: mcpAvailability(this.ctx),
			ui: { ...this.uiRoutes },
			busy: this.busy,
			operations: this.operationsList(),
			migrationError: this.migrationError,
			cache: this.installer.cacheStats(this.state),
			warnings: this.warnings.slice(-20)
		};
	}
	/** Find a record by key / unique plugin name. */
	findRecord(keyOrName) {
		return this.installer.findRecord(this.state, keyOrName);
	}
	/** Find one plugin entry across all markets. */
	findMarketEntry(pluginName, marketId) {
		if (marketId) {
			const market = this.markets.get(marketId);
			if (!market) throw hubError(`市场不存在：${marketId}（用 /agent-plugin market list 查看）`, "not_found");
			const plugin = (market.plugins ?? []).find((item) => item.name === pluginName);
			if (!plugin) throw hubError(`市场 ${marketId} 里没有插件 ${pluginName}，请先 /agent-plugin market refresh ${marketId}`, "not_found");
			return {
				market,
				plugin
			};
		}
		const matches = [];
		for (const market of this.markets.list()) for (const plugin of market.plugins ?? []) if (plugin.name === pluginName) matches.push({
			market,
			plugin
		});
		if (matches.length === 0) throw hubError(`所有市场里都没有插件 ${pluginName}；用 /agent-plugin market list 查看已添加市场，或先 refresh`, "not_found");
		if (matches.length > 1) throw hubError(`插件 ${pluginName} 出现在多个市场：${matches.map((item) => item.market.id).join("、")}；请指定市场：/agent-plugin install <marketId> ${pluginName}`, "conflict");
		return matches[0];
	}
	/**
	* Resolve the describe / icon target: the installed record wins, then the
	* market entry.
	*
	* @param input - key / market / name selectors.
	* @param settings - fetch-allowed flows may tolerate a missing entry.
	*/
	resolvePluginTarget(input = {}, settings = {}) {
		const keyText = nonEmptyString$2(input.key);
		const marketId = nonEmptyString$2(input.market);
		const nameText = nonEmptyString$2(input.name);
		const allowMissingEntry = settings.allowMissingEntry === true;
		const findEntry = (market, name) => (market?.plugins ?? []).find((plugin) => plugin.name === name) ?? null;
		if (keyText.includes("/")) {
			const slash = keyText.indexOf("/");
			const keyMarket = keyText.slice(0, slash);
			const keyName = keyText.slice(slash + 1);
			if (!isSafePluginName(keyName)) throw hubError(`插件 key 不合法：${keyText}`, "bad_request");
			const record = (this.state.plugins ?? []).find((plugin) => plugin.key === keyText) ?? null;
			const market = this.markets.get(keyMarket);
			if (!record && !market) throw hubError(`市场不存在：${keyMarket}（key：${keyText}）`, "not_found");
			const entry = findEntry(market, keyName);
			if (!record && !entry && !allowMissingEntry) throw hubError(`市场 ${keyMarket} 里没有插件 ${keyName}，请先刷新市场`, "not_found");
			return {
				key: keyText,
				name: record?.name ?? keyName,
				market,
				entry,
				record
			};
		}
		const name = nameText || keyText;
		if (marketId !== "") {
			if (name === "") throw hubError("请提供插件名（name）或完整 key", "bad_request");
			const expectedKey = Installer.keyFor(marketId, name);
			const record = (this.state.plugins ?? []).find((plugin) => plugin.key === expectedKey) ?? null;
			const market = this.markets.get(marketId);
			if (!record && !market) throw hubError(`市场不存在：${marketId}`, "not_found");
			const entry = findEntry(market, name);
			if (!record && !entry && !allowMissingEntry) throw hubError(`市场 ${marketId} 里没有插件 ${name}，请先刷新市场`, "not_found");
			return {
				key: expectedKey,
				name: record?.name ?? name,
				market,
				entry,
				record
			};
		}
		if (name === "") throw hubError("请提供插件 key 或 name", "bad_request");
		const candidates = /* @__PURE__ */ new Map();
		for (const record of this.state.plugins ?? []) {
			if (record.name !== name) continue;
			const market = this.markets.get(record.market);
			candidates.set(record.key, {
				record,
				market,
				entry: market ? findEntry(market, record.name) : null
			});
		}
		for (const market of this.markets.list()) for (const entry of market.plugins ?? []) {
			if (entry.name !== name) continue;
			const key = Installer.keyFor(market.id, entry.name);
			const existing = candidates.get(key);
			if (existing) {
				if (!existing.market) existing.market = market;
				if (!existing.entry) existing.entry = entry;
				continue;
			}
			candidates.set(key, {
				record: null,
				market,
				entry
			});
		}
		if (candidates.size === 0) throw hubError(`未找到插件：${name}（用 /agent-plugin list 或 GET /store 查看已安装与市场条目）`, "not_found");
		if (candidates.size > 1) throw hubError(`插件名 ${name} 出现在多个市场：${[...candidates.keys()].join("、")}；请改用完整 key 或指定 market`, "conflict");
		const [key, target] = [...candidates.entries()][0];
		return {
			key,
			name: target.record?.name ?? name,
			market: target.market,
			entry: target.entry,
			record: target.record
		};
	}
	/**
	* Unified detail data (installed reads the install directory; missing
	* entries resolve their source directory).
	*
	* Only `fetch:true` may touch the network: refresh the owning market first,
	* then allow git clones. The default is zero-network.
	*/
	async describePlugin(options = {}) {
		const fetchAllowed = options.fetch === true;
		const keyText = nonEmptyString$2(options.key);
		const marketId = nonEmptyString$2(options.market);
		const nameText = nonEmptyString$2(options.name);
		const resolve = () => this.resolvePluginTarget({
			key: keyText,
			market: marketId,
			name: nameText
		}, { allowMissingEntry: fetchAllowed });
		if (!fetchAllowed) return await this.collectDescribe(resolve(), {
			allowClone: false,
			warnings: []
		});
		return await this.runOperation("describe", {
			key: keyText || null,
			marketId: marketId || null
		}, () => this.store.withLockAsync(async () => {
			const warnings = [];
			let target = resolve();
			if (!target.record && target.market) {
				try {
					await this.markets.refresh(target.market.id);
					const market = this.markets.get(target.market.id) ?? target.market;
					const entry = (market.plugins ?? []).find((plugin) => plugin.name === target.name) ?? null;
					target = {
						...target,
						market,
						entry
					};
				} catch (error) {
					warnings.push(`刷新市场失败：${messageOf$1(error)}`);
				}
				if (!target.record && !target.entry) throw hubError(`市场 ${target.market?.id ?? ""} 里没有插件 ${target.name}（刷新后仍不存在）`, "not_found");
			}
			return await this.collectDescribe(target, {
				allowClone: true,
				warnings
			});
		}));
	}
	/** Collect describe data for a resolved target. */
	async collectDescribe(target, context) {
		const { key, name, market, entry, record } = target;
		const warnings = [...context.warnings];
		const formatHint = market?.format ?? record?.format ?? "claude";
		const installed = record ? {
			installed: true,
			key: record.key,
			version: record.version,
			enabled: record.enabled !== false
		} : {
			installed: false,
			key: null,
			version: null,
			enabled: null
		};
		let root = null;
		let source;
		if (record) {
			root = record.installedPath;
			const exists = existsSync(root);
			source = {
				kind: "installed",
				label: root,
				resolved: exists,
				cloneRequired: false,
				reason: exists ? null : "安装目录不存在，无法读取能力清单"
			};
			if (!exists && source.reason) warnings.push(source.reason);
		} else if (entry && market) {
			let resolution = null;
			try {
				resolution = await this.markets.resolvePluginSourceRoot(market, entry.name, { allowClone: context.allowClone === true });
			} catch (error) {
				resolution = {
					resolved: false,
					path: null,
					cloneRequired: false,
					reason: messageOf$1(error)
				};
			}
			const resolved = resolution?.resolved === true;
			source = {
				kind: entry.source?.kind ?? "unknown",
				label: sourceLabel$1(entry.source),
				resolved,
				cloneRequired: resolution?.cloneRequired === true,
				reason: nonEmptyString$2(resolution?.reason) || null
			};
			if (resolved) root = resolution?.path ?? null;
			else {
				if (source.reason) warnings.push(source.reason);
				if (source.cloneRequired && !context.allowClone) warnings.push("来源目录尚未缓存；POST /describe 带 fetch:true 允许联网克隆后查看详情");
			}
		} else {
			source = {
				kind: "unknown",
				label: "",
				resolved: false,
				cloneRequired: false,
				reason: "无法解析插件来源（市场条目缺失）"
			};
			if (source.reason) warnings.push(source.reason);
		}
		let manifest = null;
		let capabilities = null;
		let hooksSource = "";
		let mcpSource = "";
		let format = record?.format || market?.format || "";
		let version = record?.version ?? "";
		let versionValid = true;
		if (root !== null && root !== "" && existsSync(root)) try {
			const detected = detectPluginManifest(root, { hintFormat: formatHint });
			const meta = validatePluginManifest(detected.manifest, detected);
			warnings.push(...detected.warnings, ...meta.warnings ?? []);
			format = detected.format;
			manifest = pickManifest(meta, detected.manifest);
			const scan = shapeCapabilities({
				hub: this,
				root,
				formatId: detected.format,
				manifest: detected.manifest,
				record,
				pluginName: name
			});
			warnings.push(...scan.warnings);
			hooksSource = scan.hooksSource;
			mcpSource = scan.mcpSource;
			capabilities = {
				skills: scan.skills,
				commands: scan.commands,
				hooks: scan.hooks,
				mcpServers: scan.mcpServers
			};
			if (!record) version = meta.version || entry?.version || "";
		} catch (error) {
			warnings.push(`读取插件清单失败：${messageOf$1(error)}`);
		}
		if (!record && version === "") version = nonEmptyString$2(entry?.version);
		versionValid = version === "" || isInstallableVersion(version);
		const orphan = record !== null && market === null;
		const update = record ? buildUpdateInfo({
			currentVersion: record.version,
			latestVersion: entry?.version,
			orphan
		}) : {
			state: "none",
			currentVersion: null,
			latestVersion: nonEmptyString$2(entry?.version) || null,
			checkedBy: "declared",
			reason: null
		};
		const installable = record ? false : entry ? entry.installable !== false && versionValid && (source.resolved === true || source.cloneRequired === true) : false;
		let blockedReason = null;
		if (!record) {
			if (!entry) blockedReason = "市场里没有该插件条目";
			else if (!versionValid) blockedReason = `版本号不合法（需 x.y.z 三段），当前安装器不接受：${version}`;
			else if (entry.installable === false) blockedReason = nonEmptyString$2(entry.warning) || "来源类型无法安装";
			else if (source.resolved !== true && source.cloneRequired !== true) blockedReason = source.reason || "来源无法解析，暂时不能安装";
		}
		const counts = {
			skills: capabilities?.skills.length ?? 0,
			commands: capabilities?.commands.length ?? 0,
			hooks: capabilities?.hooks.length ?? 0,
			mcpServers: capabilities?.mcpServers.length ?? 0
		};
		return {
			key,
			name,
			version,
			versionValid,
			format,
			market: market ?? null,
			entry: entry ?? null,
			record: record ?? null,
			installed,
			orphan,
			update,
			source,
			manifest,
			capabilities,
			hooksSource,
			mcpSource,
			counts,
			installable,
			blockedReason,
			warnings: [...new Set(warnings)].slice(0, 20)
		};
	}
	/** Add a market (the source type may be auto-detected). */
	marketAdd(input) {
		return this.runOperation("market-add", {
			key: null,
			marketId: null,
			clientOpId: input.clientOpId ?? null
		}, () => this.store.withLockAsync(async () => {
			return await this.markets.add({
				...input.type !== void 0 ? { type: input.type } : {},
				location: input.location,
				...input.name !== void 0 ? { name: input.name } : {},
				...input.format !== void 0 ? { format: input.format } : {}
			});
		}));
	}
	/** Preview a market source without registering it (read-only; git sources use a tmp clone cache). */
	marketPreview(input) {
		return this.markets.preview({
			location: input.location,
			...input.format !== void 0 ? { format: input.format } : {},
			...input.refresh !== void 0 ? { refresh: input.refresh } : {}
		});
	}
	/** Refresh one or all markets; failures land in `failures` (a single id no longer 400s the whole call). */
	marketRefresh(marketId) {
		const id = nonEmptyString$2(marketId);
		return this.runOperation("market-refresh", { marketId: id || null }, () => this.store.withLockAsync(async () => {
			if (id !== "") {
				if (!this.markets.get(id)) throw hubError(`市场不存在：${id}`, "not_found");
				try {
					return {
						refreshed: [await this.markets.refresh(id)],
						failures: []
					};
				} catch (error) {
					return {
						refreshed: [],
						failures: [{
							id,
							error: messageOf$1(error),
							code: asHubError(error).code
						}]
					};
				}
			}
			const results = await this.markets.refreshAll();
			const failures = [];
			const refreshed = [];
			for (const item of results) {
				if (item.ok) {
					const market = this.markets.get(item.id);
					if (market) refreshed.push(market);
					continue;
				}
				failures.push({
					id: item.id,
					error: item.error ?? "刷新失败",
					code: asHubError(new Error(item.error ?? "刷新失败")).code
				});
			}
			return {
				refreshed,
				failures
			};
		}));
	}
	/**
	* Remove a market; installed plugins may stay and their names return as
	* `orphaned` (aligned with ZCODE ADR-0003).
	*/
	marketRemove(marketId) {
		const id = nonEmptyString$2(marketId);
		return this.runOperation("market-remove", { marketId: id }, () => this.store.withLock(() => {
			if (id === "") throw hubError("请提供市场 id", "bad_request");
			if (!this.markets.get(id)) throw hubError(`市场不存在：${id}`, "not_found");
			const orphaned = (this.state.plugins ?? []).filter((plugin) => plugin.market === id).map((plugin) => plugin.name);
			const removed = this.markets.remove(id);
			return {
				...removed,
				market: removed,
				orphaned
			};
		}));
	}
	/** Install a plugin. */
	install(input) {
		const name = nonEmptyString$2(input.name);
		const marketId = nonEmptyString$2(input.market);
		return this.runOperation("install", {
			key: marketId !== "" && name !== "" ? Installer.keyFor(marketId, name) : null,
			marketId: marketId || null,
			clientOpId: input.clientOpId ?? null
		}, () => this.store.withLockAsync(async () => {
			const { market, plugin } = this.findMarketEntry(name, marketId || void 0);
			if (input.refresh !== false) await this.markets.refresh(market.id);
			const refreshed = this.markets.get(market.id);
			if (!refreshed) throw hubError(`市场 ${market.id} 刷新后不存在`, "market_unavailable");
			const result = this.installer.install(this.state, {
				marketId: refreshed.id,
				pluginName: plugin.name,
				force: input.force === true
			});
			this.store.saveState(this.state);
			this.syncRuntimes();
			return result;
		}));
	}
	/** Uninstall a plugin. */
	uninstall(keyOrName) {
		return this.runOperation("uninstall", { key: this.keyOf(keyOrName) }, () => this.store.withLock(() => {
			const record = this.installer.uninstall(this.state, keyOrName);
			this.store.saveState(this.state);
			this.syncRuntimes();
			return record;
		}));
	}
	/** Enable / disable a plugin. */
	setEnabled(keyOrName, enabled) {
		return this.runOperation("enable", { key: this.keyOf(keyOrName) }, () => this.store.withLock(() => {
			const record = this.installer.setEnabled(this.state, keyOrName, enabled);
			this.store.saveState(this.state);
			this.syncRuntimes();
			return record;
		}));
	}
	/** Enable / disable one capability item of a plugin (skill, command, hooks event, MCP server entry). */
	setCapabilityEnabled(keyOrName, kind, name, enabled) {
		if (!CAPABILITY_KINDS.includes(kind)) throw hubError(`未知能力种类：${String(kind)}（可选 ${CAPABILITY_KINDS.join(" / ")}）`, "bad_request");
		const capability = nonEmptyString$2(name);
		if (capability === "") throw hubError("请提供能力名称", "bad_request");
		return this.runOperation("capability", { key: this.keyOf(keyOrName) }, () => this.store.withLock(() => {
			const record = this.findRecord(keyOrName);
			if (!record.disabledCapabilities) record.disabledCapabilities = normalizeDisabledCapabilities();
			const normalized = normalizeDisabledCapabilities(record.disabledCapabilities);
			record.disabledCapabilities = normalized;
			const list = normalized[kind];
			const index = list.indexOf(capability);
			if (enabled === true && index >= 0) list.splice(index, 1);
			if (enabled !== true && index < 0) list.push(capability);
			this.store.saveState(this.state);
			this.syncRuntimes();
			this.log("info", `${enabled === true ? "启用" : "禁用"} ${record.key} 的能力 ${kind}:${capability}`);
			return record;
		}));
	}
	/**
	* Update one plugin to the market's latest version.
	*
	* @param options - refresh:false reuses a just-refreshed market.
	*/
	update(keyOrName, force = false, options = {}) {
		return this.runOperation("update", {
			key: this.keyOf(keyOrName),
			clientOpId: options.clientOpId ?? null
		}, () => this.store.withLockAsync(async () => {
			let previousVersion = null;
			try {
				previousVersion = this.findRecord(keyOrName).version;
			} catch {
				previousVersion = null;
			}
			const result = await this.installer.update(this.state, keyOrName, {
				force,
				refresh: options.refresh !== false
			});
			if (result.changed) {
				this.store.saveState(this.state);
				this.syncRuntimes();
			}
			return {
				...result,
				previousVersion: result.changed ? previousVersion : null
			};
		}));
	}
	/**
	* Update everything: refresh per market once → serially update every
	* declared-level "available" plugin → one save/sync.
	*
	* A single plugin failure never aborts the loop; orphaned plugins (their
	* market was removed) stay out of the candidates.
	*/
	updateAll(options = {}) {
		return this.runOperation("update-all", { clientOpId: options.clientOpId ?? null }, () => this.store.withLockAsync(async () => {
			const force = options.force === true;
			const onlyKeys = Array.isArray(options.keys) && options.keys.length > 0 ? new Set(options.keys.map((item) => String(item))) : null;
			const records = (this.state.plugins ?? []).filter((record) => onlyKeys === null || onlyKeys.has(record.key));
			const marketIds = [...new Set(records.map((record) => record.market).filter((id) => id !== "" && this.markets.get(id) !== null))];
			const marketFailures = [];
			for (const id of marketIds) try {
				await this.markets.refresh(id);
			} catch (error) {
				marketFailures.push({
					id,
					error: messageOf$1(error),
					code: asHubError(error).code
				});
			}
			const succeeded = [];
			const failed = [];
			let skipped = 0;
			let changed = false;
			for (const record of records) {
				const current = (this.state.plugins ?? []).find((plugin) => plugin.key === record.key) ?? record;
				const market = current.market === "" ? null : this.markets.get(current.market);
				if (market === null) {
					skipped += 1;
					continue;
				}
				const entry = (market.plugins ?? []).find((plugin) => plugin.name === current.name) ?? null;
				if (entry === null || declaredUpdateState(current.version, entry.version) !== "available") {
					skipped += 1;
					continue;
				}
				try {
					const result = await this.installer.update(this.state, current.key, {
						force,
						refresh: false
					});
					if (result.changed) {
						changed = true;
						succeeded.push({
							key: current.key,
							changed: true,
							message: result.message,
							version: result.record?.version ?? null
						});
					} else skipped += 1;
				} catch (error) {
					failed.push({
						key: current.key,
						error: messageOf$1(error),
						code: asHubError(error).code
					});
				}
			}
			if (changed) {
				this.store.saveState(this.state);
				this.syncRuntimes();
			}
			const summary = {
				total: records.length,
				updated: succeeded.length,
				skipped,
				failed: failed.length,
				markets: marketIds.length
			};
			return {
				succeeded,
				failed,
				aborted: false,
				marketFailures,
				summary,
				message: `全部更新完成：更新 ${summary.updated} 个，跳过 ${skipped} 个，失败 ${failed.length} 个`
			};
		}));
	}
	/** Roll back a plugin (without targetVersion, to the newest usable history version). */
	rollback(keyOrName, targetVersion) {
		return this.runOperation("rollback", { key: this.keyOf(keyOrName) }, () => this.store.withLock(() => {
			const result = this.installer.rollback(this.state, keyOrName, targetVersion);
			this.store.saveState(this.state);
			this.syncRuntimes();
			return result;
		}));
	}
	/** Derive the key from key / plugin name (only a full key returns a string). */
	keyOf(keyOrName) {
		const value = nonEmptyString$2(keyOrName);
		return value.includes("/") ? value : null;
	}
	/** One format's definition (troubleshooting). */
	formatOf(id) {
		return findFormat(id) ?? null;
	}
	/** Unload: unregister the skill provider, plugin commands, and hooks listeners. */
	dispose() {
		try {
			this.skills?.dispose();
		} catch {}
		try {
			this.pluginCommands?.clear();
		} catch {}
		try {
			this.hooks?.dispose();
		} catch {}
		this.started = false;
	}
};
/** Decoded size cap of a data-URL icon. */
const MAX_DATA_ICON_BYTES = 32768;
/** Raster MIME allowed as icon output (SVG forbidden). */
const RASTER_MIME = Object.freeze({
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif"
});
const DATA_ICON = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/iu;
function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nonEmptyString$1(value) {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : "";
}
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
/** Resolve a localized object: default/en/zh-cn/zh first, else the first non-empty string. */
function resolveI18n(value) {
	if (typeof value === "string") return nonEmptyString$1(value) || null;
	if (!isObject(value)) return null;
	for (const key of [
		"default",
		"en",
		"zh-cn",
		"zh"
	]) {
		const text = nonEmptyString$1(value[key]);
		if (text !== "") return text;
	}
	const first = Object.values(value).find((item) => typeof item === "string" && item.trim() !== "");
	return typeof first === "string" ? first.trim() : null;
}
/** The market's root path in cache/source; a url market has none. */
function marketRootOf(hub, market) {
	if (!market) return null;
	if (typeof hub.markets?.marketRoot === "function") try {
		const root = hub.markets.marketRoot(market);
		if (typeof root === "string" && root !== "") return root;
		return null;
	} catch {}
	if (market.type === "local") return market.location || null;
	if (market.type === "git") return path.join(hub.store.paths.markets, market.id, "repo");
	return null;
}
/** Whether one file can serve as an icon (raster + size cap + in-root realpath check). */
function rasterOf(file, root = null) {
	if (typeof file !== "string" || file === "") return null;
	let stat;
	try {
		stat = statSync(file);
	} catch {
		return null;
	}
	if (!stat.isFile() || stat.size > 262144) return null;
	const mime = RASTER_MIME[path.extname(file).toLowerCase()];
	if (!mime) return null;
	if (root !== null && root !== "") try {
		if (lstatSync(file).isSymbolicLink()) return null;
		const realRoot = realpathSync(path.resolve(root));
		const realFile = realpathSync(file);
		const prefix = realRoot.endsWith(path.sep) ? realRoot : `${realRoot}${path.sep}`;
		if (realFile !== realRoot && !realFile.startsWith(prefix)) return null;
	} catch {
		return null;
	}
	return {
		file,
		mime
	};
}
/** Resolve a relative icon path inside the root; out-of-bounds/absolute/missing return null. */
function resolveRasterFile(root, raw) {
	const text = typeof raw === "string" ? raw.trim() : "";
	if (text === "" || root === null) return null;
	if (/^data:/iu.test(text) || /^https?:\/\//iu.test(text) || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(text)) return null;
	let file;
	try {
		file = resolveRelativeSource(root, text);
	} catch {
		return null;
	}
	return rasterOf(file, root);
}
/** Normalize an entry meta / manifest / market-level icon value into a string. */
function iconValueOf(value) {
	if (typeof value === "string") return value.trim();
	if (!isObject(value)) return "";
	for (const key of [
		"url",
		"path",
		"src",
		"raw"
	]) {
		const text = nonEmptyString$1(value[key]);
		if (text !== "") return text;
	}
	return "";
}
/** Validate a data-URL icon (allowlisted MIME + base64 + ≤32 KiB decoded). */
function validateDataIcon(value) {
	const match = DATA_ICON.exec(value);
	if (!match) return null;
	const base64 = match[2];
	if (Math.floor(base64.length * 3 / 4) > MAX_DATA_ICON_BYTES) return null;
	return {
		kind: "data",
		url: value,
		mime: match[1].toLowerCase()
	};
}
/** Compact market reference (avoids repeating the large markets[] fields). */
function marketRef(market) {
	if (!market) return null;
	return {
		id: market.id,
		name: market.name,
		title: nonEmptyString$1(market.title) || market.name,
		type: market.type,
		format: market.format
	};
}
/** Market-level display info. */
function marketDisplay(market) {
	const display = isObject(market?.display) ? market.display : {};
	return {
		title: nonEmptyString$1(display.title) || nonEmptyString$1(market?.title) || market?.name || "",
		description: nonEmptyString$1(display.description) || null,
		owner: normalizeAuthor(display.owner ?? market?.owner ?? null)
	};
}
/** Market health: ok | stale | missing | error. */
function marketHealth(hub, market) {
	const refreshError = nonEmptyString$1(market.refreshError);
	if (refreshError !== "") return {
		status: "error",
		message: refreshError
	};
	if (market.type === "local") {
		if (!existsSync(market.location)) return {
			status: "missing",
			message: `本地市场目录不存在：${market.location}`
		};
	} else if (market.type === "git") {
		const repo = marketRootOf(hub, market);
		if (!repo || !existsSync(path.join(repo, ".git"))) return {
			status: "missing",
			message: "市场尚未克隆到本地缓存"
		};
	} else if (market.type === "url") {
		const snapshot = path.join(hub.store.paths.markets, market.id, "marketplace.json");
		if (!existsSync(snapshot)) return {
			status: "missing",
			message: "URL 市场尚无本地快照"
		};
	}
	const refreshedAt = Date.parse(market.lastRefreshed ?? "");
	if (!Number.isFinite(refreshedAt)) return {
		status: "stale",
		message: "尚未刷新"
	};
	if (Date.now() - refreshedAt > 864e5) return {
		status: "stale",
		message: "超过 24 小时未刷新"
	};
	return {
		status: "ok",
		message: ""
	};
}
/** Market summary (the `/store.markets[]` rows and market-action returns). */
function buildMarketSummary(hub, market, operations = hub.operationsList()) {
	const refreshing = operations.some((operation) => operation.kind === "market-refresh" && (operation.marketId === null || operation.marketId === market.id));
	return {
		id: market.id,
		name: market.name,
		title: nonEmptyString$1(market.title) || market.name,
		type: market.type,
		format: market.format,
		location: market.location,
		locationKey: marketLocationKey(market.location),
		lastRefreshed: nonEmptyString$1(market.lastRefreshed) || null,
		refreshError: nonEmptyString$1(market.refreshError) || null,
		pluginCount: (market.plugins ?? []).length,
		display: marketDisplay(market),
		health: marketHealth(hub, market),
		refreshing
	};
}
/** Readable label of an entry source. */
function sourceLabel(source) {
	if (!isObject(source)) return "";
	switch (source.kind) {
		case "local": return String(source.raw ?? "");
		case "github": return [String(source.repo ?? ""), typeof source.path === "string" && source.path !== "" ? `#${source.path}` : ""].filter(Boolean).join("");
		case "git": return [String(source.url ?? ""), typeof source.path === "string" && source.path !== "" ? `#${source.path}` : ""].filter(Boolean).join("");
		case "npm": return typeof source.package === "string" ? source.package : "npm";
		default: return typeof source.raw === "string" ? source.raw : String(source.kind ?? "");
	}
}
/** An entry's icon file in a directory market (in-root raster, ≤256 KiB). */
function entryIconFile(hub, market, entry) {
	if (!market || !entry) return null;
	const raw = iconValueOf(entry.meta?.icon) || iconValueOf(entry.raw?.icon);
	const marketRaw = iconValueOf((market?.display)?.icon);
	const value = raw || marketRaw;
	if (value === "") return null;
	const root = marketRootOf(hub, market);
	if (typeof hub.markets.entryIconFile === "function") try {
		const resolved = hub.markets.entryIconFile(market, entry);
		const found = rasterOf(typeof resolved === "string" ? resolved : resolved?.file ?? resolved?.path ?? null, root);
		if (found) return found;
	} catch {}
	return resolveRasterFile(root, value);
}
/** An install copy's icon file (the manifest icon, relative to the install directory). */
function installedIconFile(installedPath, manifest) {
	if (installedPath === null || installedPath === "") return null;
	const raw = iconValueOf(manifest?.icon);
	if (raw === "") return null;
	return resolveRasterFile(installedPath, raw);
}
/**
* Normalize the icon descriptor: none | route | http | data.
*
* A route URL points at the local `/agent-plugin/api/icon?key=<key>&v=<version>`.
*/
function resolveIconDescriptor(hub, context = {}) {
	const { market = null, entry = null, manifest = null, key = "", version = "", installedPath = null } = context;
	const metaValue = iconValueOf(entry?.meta?.icon) || iconValueOf(entry?.raw?.icon);
	const manifestValue = iconValueOf(manifest?.icon);
	const marketValue = iconValueOf((market?.display)?.icon);
	const raw = metaValue || manifestValue || marketValue;
	if (raw === "") return {
		kind: "none",
		url: null,
		mime: null
	};
	if (/^data:/iu.test(raw)) return validateDataIcon(raw) ?? {
		kind: "none",
		url: null,
		mime: null
	};
	if (/^https:\/\//iu.test(raw)) return {
		kind: "http",
		url: raw,
		mime: null
	};
	if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(raw)) return {
		kind: "none",
		url: null,
		mime: null
	};
	let found = entry !== null ? entryIconFile(hub, market, entry) : null;
	if (!found && manifestValue !== "") found = installedIconFile(installedPath, manifest);
	if (!found) return {
		kind: "none",
		url: null,
		mime: null
	};
	const bust = nonEmptyString$1(version) || "0";
	return {
		kind: "route",
		url: `/agent-plugin/api/icon?key=${encodeURIComponent(key)}&v=${encodeURIComponent(bust)}`,
		mime: found.mime
	};
}
/**
* Assemble display info: entry meta first → manifest fallback → market-level
* bottom values.
*/
function buildDisplay(hub, context = {}) {
	const { market = null, entry = null, manifest = null, key = "", version = "", name = "", installedPath = null } = context;
	const meta = isObject(entry?.meta) ? entry.meta : {};
	const marketDisplayValue = isObject(market?.display) ? market.display : {};
	const titleI18n = isObject(meta.displayNameI18n) ? meta.displayNameI18n : null;
	const descriptionI18n = isObject(meta.descriptionI18n) ? meta.descriptionI18n : null;
	const title = nonEmptyString$1(meta.displayName) || resolveI18n(titleI18n) || nonEmptyString$1(meta.title) || nonEmptyString$1(manifest?.name) || nonEmptyString$1(name) || nonEmptyString$1(entry?.name) || "";
	const description = nonEmptyString$1(meta.description) || resolveI18n(descriptionI18n) || nonEmptyString$1(entry?.description) || nonEmptyString$1(manifest?.description) || resolveI18n(marketDisplayValue.description) || null;
	const category = nonEmptyString$1(meta.category) || nonEmptyString$1(manifest?.category) || null;
	let author = normalizeAuthor(meta.author ?? manifest?.author ?? null);
	const authorUrl = nonEmptyString$1(meta.authorUrl);
	if (author !== null && author.url === null && authorUrl !== "") author = {
		...author,
		url: authorUrl
	};
	const keywords = Array.isArray(meta.keywords) ? meta.keywords.filter((item) => typeof item === "string") : Array.isArray(manifest?.keywords) ? manifest.keywords.filter((item) => typeof item === "string") : [];
	const featured = Array.isArray(market?.featured) && typeof entry?.name === "string" ? market.featured.includes(entry.name) : false;
	return {
		title,
		titleI18n,
		description,
		descriptionI18n,
		category,
		categories: category === null ? [] : [category],
		author,
		homepage: nonEmptyString$1(meta.homepage) || nonEmptyString$1(manifest?.homepage) || null,
		repository: nonEmptyString$1(meta.repository) || nonEmptyString$1(manifest?.repository) || null,
		license: nonEmptyString$1(meta.license) || nonEmptyString$1(manifest?.license) || null,
		keywords,
		icon: resolveIconDescriptor(hub, {
			market,
			entry,
			manifest,
			key,
			version,
			installedPath
		}),
		featured
	};
}
/** Whether a manifest value counts as present (array length / non-empty scalar). */
function manifestValuePresent(value) {
	return Array.isArray(value) ? value.length > 0 : value !== void 0 && value !== null && value !== "";
}
/** Main source of a display: market | manifest | record. */
function displaySourceOf(entry, manifest) {
	if (isObject(entry?.meta) && Object.keys(entry.meta).length > 0) return "market";
	if (isObject(manifest)) {
		for (const key of [
			"author",
			"homepage",
			"repository",
			"license",
			"description",
			"keywords",
			"displayName",
			"title"
		]) if (manifestValuePresent(manifest[key])) return "manifest";
	}
	return "record";
}
/** Declared-level update info (a not-installed entry is fixed at none). */
function updateForEntry(record, entry) {
	if (!record) return {
		state: "none",
		currentVersion: null,
		latestVersion: nonEmptyString$1(entry?.version) || null,
		checkedBy: "declared",
		reason: null
	};
	return buildUpdateInfo({
		currentVersion: record.version,
		latestVersion: entry?.version,
		orphan: false
	});
}
/** Entry-level source info: zero-network by default (allowClone:false). */
function catalogSource(hub, market, entry) {
	const source = isObject(entry?.source) ? entry.source : { kind: "unknown" };
	const info = {
		kind: String(source.kind ?? "unknown"),
		label: sourceLabel(source),
		resolved: false,
		cloneRequired: false,
		reason: null
	};
	try {
		const resolution = hub.markets.resolvePluginSourceRoot(market, entry.name, { allowClone: false });
		if (resolution !== null && typeof resolution === "object" && typeof resolution.then === "function") {
			info.reason = "来源解析是异步接口，/store 不做联网解析";
			return info;
		}
		const record = resolution;
		info.resolved = record?.resolved === true;
		info.cloneRequired = record?.cloneRequired === true;
		info.reason = nonEmptyString$1(record?.reason) || null;
	} catch (error) {
		info.reason = messageOf(error);
	}
	return info;
}
/** Capability summary of an installed record (missing fields become empty arrays). */
function capabilitiesSummary(record) {
	const source = isObject(record?.capabilities) ? record.capabilities : {};
	const list = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
	return {
		skills: list(source.skills),
		commands: list(source.commands),
		hooks: list(source.hooks),
		mcpServers: list(source.mcpServers)
	};
}
/** Build one market entry ("product"). */
async function buildCatalogItem(hub, market, entry, record = null) {
	const key = `${market.id}/${entry.name}`;
	const version = nonEmptyString$1(entry.version);
	const versionValid = version === "" || isInstallableVersion(version);
	const source = catalogSource(hub, market, entry);
	const display = buildDisplay(hub, {
		market,
		entry,
		manifest: null,
		key,
		version,
		name: entry.name
	});
	const warnings = [];
	const entryWarning = nonEmptyString$1(entry.warning);
	if (entryWarning !== "") warnings.push(entryWarning);
	if (!source.resolved && source.reason) warnings.push(source.reason);
	const installable = entry.installable !== false && versionValid && (source.resolved === true || source.cloneRequired === true);
	let blockedReason = null;
	if (!versionValid) blockedReason = `市场声明的版本号不合法（需 x.y.z 三段）：${version}`;
	else if (entry.installable === false) blockedReason = nonEmptyString$1(entry.warning) || "来源类型无法安装";
	else if (source.resolved !== true && source.cloneRequired !== true) blockedReason = source.reason || "来源无法解析，暂时不能安装";
	return {
		key,
		name: entry.name,
		version: version || null,
		versionValid,
		format: market.format ?? "",
		market: marketRef(market),
		display,
		source,
		installable,
		blockedReason,
		installed: record !== null,
		installedVersion: record?.version ?? null,
		installedEnabled: record === null ? null : record.enabled !== false,
		update: updateForEntry(record, entry),
		warnings: [...new Set(warnings)]
	};
}
/** Build one installed item (including orphan/health/rollback availability). */
async function buildInstalledItem(hub, record, market = null, entry = null) {
	let manifest = null;
	let format = record.format;
	try {
		const detected = detectPluginManifest(record.installedPath, { hintFormat: record.format });
		manifest = detected.manifest;
		format = detected.format;
	} catch {}
	const orphan = market === null;
	const display = buildDisplay(hub, {
		market,
		entry,
		manifest,
		key: record.key,
		version: record.version,
		name: record.name,
		installedPath: record.installedPath
	});
	const previousVersions = (record.previousVersions ?? []).map((item) => ({
		version: item.version,
		installedAt: typeof item.installedAt === "string" ? item.installedAt : "",
		available: existsSync(item.installedPath)
	}));
	return {
		key: record.key,
		name: record.name,
		version: record.version,
		format,
		market: market === null ? null : marketRef(market),
		marketId: record.market,
		enabled: record.enabled !== false,
		installedAt: record.installedAt ?? "",
		installedPath: record.installedPath,
		capabilities: capabilitiesSummary(record),
		disabledCapabilities: normalizeDisabledCapabilities(record.disabledCapabilities),
		previousVersions,
		display,
		displaySource: displaySourceOf(entry, manifest),
		update: buildUpdateInfo({
			currentVersion: record.version,
			latestVersion: entry?.version,
			orphan
		}),
		orphan,
		health: { installedDirExists: existsSync(record.installedPath) }
	};
}
/** Build the store panel's whole snapshot (`GET /store`). */
async function buildStoreSnapshot(hub) {
	const plugins = hub.state.plugins ?? [];
	const markets = hub.markets.list();
	const operations = hub.operationsList();
	const installedByKey = new Map(plugins.map((record) => [record.key, record]));
	const entryByKey = /* @__PURE__ */ new Map();
	for (const market of markets) for (const entry of market.plugins ?? []) entryByKey.set(`${market.id}/${entry.name}`, {
		market,
		entry
	});
	const items = [];
	for (const market of markets) for (const entry of market.plugins ?? []) {
		const key = `${market.id}/${entry.name}`;
		items.push(await buildCatalogItem(hub, market, entry, installedByKey.get(key) ?? null));
	}
	const installed = [];
	for (const record of plugins) {
		const pair = entryByKey.get(record.key) ?? null;
		installed.push(await buildInstalledItem(hub, record, pair?.market ?? null, pair?.entry ?? null));
	}
	return {
		version: HUB_VERSION,
		home: hub.home,
		started: hub.started,
		ui: { ...hub.uiRoutes },
		formats: hub.listFormats(),
		runtime: {
			skills: hub.skills?.stats() ?? {
				registered: false,
				skills: 0,
				reason: "技能运行时未装配"
			},
			commands: hub.pluginCommands?.stats() ?? {
				available: false,
				registered: [],
				reason: "命令运行时未装配"
			},
			hooks: hub.hooks?.stats() ?? {
				attached: false,
				events: [],
				reason: "hooks 运行时未装配"
			},
			mcp: mcpAvailability(hub.ctx)
		},
		migrationError: hub.migrationError ?? null,
		operations,
		markets: markets.map((market) => buildMarketSummary(hub, market, operations)),
		items,
		installed,
		stats: {
			markets: markets.length,
			items: items.length,
			installable: items.filter((item) => item.installable).length,
			installed: installed.length,
			updatesAvailable: installed.filter((item) => item.update.state === "available").length,
			orphans: installed.filter((item) => item.orphan).length,
			marketsWithError: markets.filter((market) => nonEmptyString$1(market.refreshError)).length
		},
		warnings: hub.warnings.slice(-20)
	};
}
/** Unified detail of one plugin (`GET|POST /describe`). */
async function buildDescribe(hub, options = {}) {
	const core = await hub.describePlugin(options);
	const display = buildDisplay(hub, {
		market: core.market,
		entry: core.entry,
		manifest: core.manifest,
		key: core.key,
		version: core.version,
		name: core.name,
		installedPath: core.record?.installedPath ?? null
	});
	return {
		key: core.key,
		name: core.name,
		version: core.version || null,
		versionValid: core.versionValid,
		format: core.format ?? "",
		market: marketRef(core.market),
		orphan: core.orphan === true,
		display,
		source: core.source,
		installable: core.installable,
		blockedReason: core.blockedReason,
		installed: core.installed,
		update: core.update,
		manifest: core.manifest,
		capabilities: core.capabilities,
		hooksSource: core.hooksSource ?? "",
		mcpSource: core.mcpSource ?? "",
		counts: core.counts,
		warnings: core.warnings
	};
}
/** Resolve the actual file behind `/icon`: the market entry icon first, the install copy's manifest icon as fallback. */
function resolveStoreIconFile(hub, key) {
	const keyText = nonEmptyString$1(key);
	if (keyText === "") return null;
	let target;
	try {
		target = hub.resolvePluginTarget({ key: keyText });
	} catch {
		return null;
	}
	if (target.market !== null && target.entry !== null) {
		const found = entryIconFile(hub, target.market, target.entry);
		if (found) return found;
	}
	if (target.record !== null) {
		let manifest = null;
		try {
			manifest = detectPluginManifest(target.record.installedPath, { hintFormat: target.record.format }).manifest;
		} catch {
			manifest = null;
		}
		const found = installedIconFile(target.record.installedPath, manifest);
		if (found) return found;
	}
	return null;
}
// src/ui-routes.ts
/**
* Host-side HTTP API of the store panel.
*
* Design:
* - One `prefix` route `/agent-plugin/api`; this module dispatches inside;
* - Loopback only (the Host header must be 127.0.0.1 / localhost / [::1]) so a
*   remote Web UI can never reach install/uninstall; remote use needs an
*   authorization design first;
* - Mutating requests require a same-origin Origin + `application/json`,
*   blocking cross-site form CSRF; a browser-sent `sec-fetch-site: cross-site`
*   is rejected outright;
* - Success `{ok:true,data}`; failure `{ok:false,error,code}` with the HTTP
*   status matching the code;
* - GET is read-only (`/store` offline, `/describe` offline, `/icon` raster
*   only); only `POST /describe {fetch:true}` may refresh a market / clone a
*   source for the detail view.
*
* @module dsh-agent-extension/ui-routes
*/
const API_PREFIX = "/agent-plugin/api";
const MAX_BODY_BYTES = 262144;
const LOOPBACK_HOSTS = /* @__PURE__ */ new Set([
	"127.0.0.1",
	"localhost",
	"[::1]"
]);
/** GET routes (read-only, offline). */
const GET_ROUTES = /* @__PURE__ */ new Set([
	"/store",
	"/describe",
	"/icon"
]);
/** POST routes (may write; only /describe with fetch:true goes online). */
const POST_ROUTES = /* @__PURE__ */ new Set([
	"/describe",
	"/market/add",
	"/market/preview",
	"/market/refresh",
	"/market/remove",
	"/install",
	"/uninstall",
	"/enable",
	"/update",
	"/update-all",
	"/rollback",
	"/capability"
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
	const value = request.headers?.[name];
	if (Array.isArray(value)) return String(value[0] ?? "").toLowerCase();
	return String(value ?? "").toLowerCase();
}
/** Whether this request may reach the plugin API. */
function isAdmitted(request) {
	const hostHeader = String(request.headers?.host ?? "");
	if (!LOOPBACK_HOSTS.has(hostnameOf(hostHeader))) return false;
	const method = String(request.method ?? "GET").toUpperCase();
	if (method === "GET" || method === "HEAD") return true;
	if (headerValue(request, "sec-fetch-site") === "cross-site") return false;
	const origin = request.headers?.origin;
	if (origin !== void 0 && String(origin) !== `http://${hostHeader}` && String(origin) !== `https://${hostHeader}`) return false;
	return headerValue(request, "content-type").includes("application/json");
}
/** Read a JSON request body (within the size cap). */
function readJsonBody(request, limit = MAX_BODY_BYTES) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		request.on("data", (chunk) => {
			size += chunk.length;
			if (size > limit) {
				reject(hubError("请求体过大", "bad_request"));
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
					reject(hubError("请求体必须是 JSON 对象", "bad_request"));
					return;
				}
				resolve(parsed);
			} catch (error) {
				reject(hubError(`请求体不是合法 JSON：${error instanceof Error ? error.message : String(error)}`, "bad_request"));
			}
		});
		request.on("error", (error) => reject(error));
	});
}
/** Write a JSON response. */
function sendJson(response, status, payload) {
	const body = JSON.stringify(payload);
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"content-length": Buffer.byteLength(body)
	});
	response.end(body);
}
/** Unified error envelope (code + suggested status + in-flight operation details). */
function sendError(response, error) {
	const normalized = asHubError(error);
	const payload = {
		ok: false,
		error: normalized.message,
		code: normalized.code
	};
	if (normalized.operation) payload.details = { operation: normalized.operation };
	sendJson(response, normalized.status ?? 400, payload);
}
/** One query parameter. */
function queryParam(request, name) {
	return new URL(String(request.url ?? "/"), "http://localhost").searchParams.get(name) ?? "";
}
function nonEmptyString(value) {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : "";
}
/** Unified key / name / market extraction for write endpoints. */
function targetOf(body = {}) {
	const key = nonEmptyString(body.key);
	if (key !== "") {
		const slash = key.indexOf("/");
		if (slash > 0) return {
			key,
			market: key.slice(0, slash),
			name: key.slice(slash + 1)
		};
		return {
			key,
			market: "",
			name: key
		};
	}
	return {
		key: "",
		market: nonEmptyString(body.market),
		name: nonEmptyString(body.name)
	};
}
/** key-or-name argument of installed-plugin actions. */
function keyOrNameOf(body = {}) {
	return nonEmptyString(body.key) || nonEmptyString(body.name);
}
/** Record summary inside install/update responses. */
function recordSummary(record) {
	return {
		key: record.key,
		name: record.name,
		version: record.version,
		format: record.format,
		market: record.market,
		enabled: record.enabled !== false,
		installedAt: record.installedAt ?? "",
		installedPath: record.installedPath ?? "",
		capabilities: record.capabilities ?? {
			skills: [],
			commands: [],
			hooks: [],
			mcpServers: []
		},
		previousVersions: (record.previousVersions ?? []).map((item) => item.version)
	};
}
/** Serve the binary icon; missing/out-of-bounds/non-raster all answer 404 JSON. */
function serveIcon(hub, request, response) {
	const found = resolveStoreIconFile(hub, queryParam(request, "key"));
	if (!found) {
		sendJson(response, 404, {
			ok: false,
			error: "未找到图标",
			code: "not_found"
		});
		return;
	}
	let data;
	try {
		data = readFileSync(found.file);
	} catch {
		sendJson(response, 404, {
			ok: false,
			error: "未找到图标",
			code: "not_found"
		});
		return;
	}
	if (data.length > 262144) {
		sendJson(response, 404, {
			ok: false,
			error: "图标文件过大",
			code: "not_found"
		});
		return;
	}
	response.writeHead(200, {
		"content-type": found.mime,
		"content-length": data.length,
		"cache-control": "public, max-age=300",
		"x-content-type-options": "nosniff"
	});
	response.end(data);
}
/**
* Mount the plugin API.
*
* @param ctx - host cordis context.
* @param hub - the hub instance.
*/
function mountUiRoutes(ctx, hub) {
	const webServer = ctx?.get?.("webServer") ?? ctx?.webServer;
	if (!webServer || typeof webServer.register !== "function") {
		const status = {
			active: false,
			reason: "宿主未提供 webServer 服务，插件页 UI 不可用",
			path: API_PREFIX,
			dispose: () => {}
		};
		hub.uiRoutes = {
			active: status.active,
			reason: status.reason,
			path: API_PREFIX
		};
		return status;
	}
	const handle = async (request, response) => {
		const webRequest = {
			method: request.method,
			url: request.url,
			headers: request.headers
		};
		if (!isAdmitted(webRequest)) {
			sendJson(response, 403, {
				ok: false,
				error: "拒绝访问：插件 API 只允许本机回环页面的同源请求",
				code: "forbidden"
			});
			return;
		}
		const route = new URL(String(request.url ?? "/"), "http://localhost").pathname.slice(17) || "/";
		const method = String(request.method ?? "GET").toUpperCase();
		try {
			if (method === "GET" && route === "/store") {
				sendJson(response, 200, {
					ok: true,
					data: await buildStoreSnapshot(hub)
				});
				return;
			}
			if (method === "GET" && route === "/describe") {
				sendJson(response, 200, {
					ok: true,
					data: await buildDescribe(hub, {
						key: queryParam(webRequest, "key"),
						market: queryParam(webRequest, "market"),
						name: queryParam(webRequest, "name"),
						fetch: false
					})
				});
				return;
			}
			if (method === "GET" && route === "/icon") {
				serveIcon(hub, webRequest, response);
				return;
			}
			if (POST_ROUTES.has(route) && method === "POST") {
				sendJson(response, 200, {
					ok: true,
					data: await dispatch(hub, route, await readJsonBody(request))
				});
				return;
			}
			if (GET_ROUTES.has(route) || POST_ROUTES.has(route)) {
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
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			hub.log("warn", `插件页 API ${route} 失败：${message}`);
			sendError(response, error);
		}
	};
	const dispose = webServer.register({
		kind: "prefix",
		path: API_PREFIX,
		handler: handle
	});
	const status = {
		active: true,
		reason: "",
		path: API_PREFIX,
		dispose
	};
	hub.uiRoutes = {
		active: true,
		reason: "",
		path: API_PREFIX
	};
	hub.log("info", `插件页 API 已挂载：${API_PREFIX}`);
	return status;
}
/** POST route dispatch. */
async function dispatch(hub, route, body = {}) {
	switch (route) {
		case "/describe": return await buildDescribe(hub, {
			key: nonEmptyString(body.key),
			market: nonEmptyString(body.market),
			name: nonEmptyString(body.name),
			fetch: body.fetch === true
		});
		case "/market/add": {
			const market = await hub.marketAdd({
				location: String(body.location ?? ""),
				...body.name !== void 0 && body.name !== null ? { name: String(body.name) } : {},
				...body.format !== void 0 && body.format !== null ? { format: String(body.format) } : {},
				...body.type !== void 0 && body.type !== null ? { type: String(body.type) } : {},
				...nonEmptyString(body.clientOpId) !== "" ? { clientOpId: nonEmptyString(body.clientOpId) } : {}
			});
			return {
				message: `市场已添加：${market.name}`,
				market: buildMarketSummary(hub, market),
				detectedType: market.type,
				format: market.format,
				pluginCount: (market.plugins ?? []).length,
				refreshError: nonEmptyString(market.refreshError) || null
			};
		}
		case "/market/preview": {
			const data = await hub.marketPreview({
				location: String(body.location ?? ""),
				...body.format !== void 0 && body.format !== null ? { format: String(body.format) } : {},
				refresh: body.refresh === true
			});
			return {
				...data,
				pluginCount: data.plugins.length
			};
		}
		case "/market/refresh": {
			const result = await hub.marketRefresh(nonEmptyString(body.id));
			return {
				message: result.refreshed.length === 0 && result.failures.length === 0 ? "没有市场可刷新" : `已刷新 ${result.refreshed.length} 个市场${result.failures.length > 0 ? `，${result.failures.length} 个失败` : ""}`,
				refreshed: result.refreshed.map((market) => buildMarketSummary(hub, market)),
				failures: result.failures,
				stats: {
					total: result.refreshed.length + result.failures.length,
					ok: result.refreshed.length,
					failed: result.failures.length
				}
			};
		}
		case "/market/remove": {
			const result = await hub.marketRemove(nonEmptyString(body.id));
			return {
				message: `已移除市场：${nonEmptyString(body.id)}`,
				orphaned: result.orphaned
			};
		}
		case "/install": {
			const target = targetOf(body);
			const result = await hub.install({
				market: target.market,
				name: target.name,
				force: body.force === true,
				refresh: body.refresh !== false,
				...nonEmptyString(body.clientOpId) !== "" ? { clientOpId: nonEmptyString(body.clientOpId) } : {}
			});
			return {
				message: `安装完成：${result.record.name}@${result.record.version}`,
				installed: recordSummary(result.record),
				replaced: result.replaced === true,
				warnings: result.warnings ?? []
			};
		}
		case "/uninstall": {
			const record = await hub.uninstall(keyOrNameOf(body));
			return {
				message: `已卸载：${record.name}@${record.version}`,
				key: record.key
			};
		}
		case "/enable": {
			const record = await hub.setEnabled(keyOrNameOf(body), body.enabled === true);
			return {
				message: `${record.name} 已${record.enabled ? "启用" : "禁用"}`,
				key: record.key,
				enabled: record.enabled
			};
		}
		case "/update": {
			const result = await hub.update(keyOrNameOf(body), body.force === true, {
				refresh: body.refresh !== false,
				...nonEmptyString(body.clientOpId) !== "" ? { clientOpId: nonEmptyString(body.clientOpId) } : {}
			});
			return {
				message: result.message,
				changed: result.changed === true,
				key: result.record?.key ?? keyOrNameOf(body),
				previousVersion: result.previousVersion ?? null,
				record: result.record ? recordSummary(result.record) : null,
				warnings: result.warnings ?? []
			};
		}
		case "/update-all": {
			const result = await hub.updateAll({
				force: body.force === true,
				keys: Array.isArray(body.keys) ? body.keys.map(String) : [],
				...nonEmptyString(body.clientOpId) !== "" ? { clientOpId: nonEmptyString(body.clientOpId) } : {}
			});
			return {
				message: result.message,
				succeeded: result.succeeded,
				failed: result.failed,
				aborted: result.aborted === true,
				marketFailures: result.marketFailures,
				summary: result.summary
			};
		}
		case "/rollback": {
			const targetVersion = typeof body.version === "string" && body.version.trim() !== "" ? body.version.trim() : void 0;
			const result = await hub.rollback(keyOrNameOf(body), targetVersion);
			return {
				message: `已回滚 ${result.record.name}：${result.previousVersion} → ${result.record.version}`,
				key: result.record.key,
				version: result.record.version,
				previousVersion: result.previousVersion
			};
		}
		case "/capability": {
			const record = await hub.setCapabilityEnabled(keyOrNameOf(body), String(body.kind ?? ""), String(body.capability ?? ""), body.enabled === true);
			return {
				message: `${body.enabled === true ? "启用" : "禁用"} ${String(body.capability ?? "")}`,
				key: record.key,
				plugin: record.key,
				disabledCapabilities: record.disabledCapabilities
			};
		}
		default: throw hubError(`未知接口：${route}`, "not_found");
	}
}
// src/index.ts
/**
* dsh-agent-extension — DSH 的智能体扩展（Agent Extension）运行时与市场。
*
* 定位：本包是一个 DSH 插件（cordis bundle），负责在 DSH 里托管
* 跨 Harness 的 Agent 插件（Claude Code / CodeBuddy / ZCode 等格式）。
* 被托管的 Agent 插件不是 DSH 插件，不会出现在 DSH 的插件树里。
*
* 只依赖 Node 内置模块与宿主 ctx 接口：不得 import 任何 @deepseek-ai/*。
*
* @module dsh-agent-extension
*/
/** Cordis 插件名，用于日志与加载器识别。 */
const name = "agent-extension";
/** 等待宿主提供 commands 服务后再注册 `/agent-plugin`。 */
const inject = ["commands"];
/**
* 延迟等待可选服务就绪后执行 callback。
*
* 宿主按「服务可用性」驱动激活：本插件只硬依赖 commands，skills / webServer
* 可能在本插件 apply 之后才注册。直接用 ctx.get() 会拿到 undefined，
* 因此失败时用 ctx.inject(deps, callback) 挂到服务出现的那一刻。
*/
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
* 插件入口。启动失败不会让宿主加载失败：错误写入 hub 日志并在 status 里展示。
*
* @param ctx - 宿主注入的上下文（此时 commands 服务已可用）。
* @param config - 来自 cordis.patch.yml 的配置。
* @returns AgentPluginHub
*/
function apply(ctx, config = {}) {
	const hub = new AgentPluginHub({
		...config?.home !== void 0 ? { home: config.home } : {},
		ctx,
		config
	});
	hub.start();
	try {
		const disposeCommand = registerHubCommand(ctx, hub);
		if (typeof disposeCommand === "function") ctx.effect(() => disposeCommand, "dsh-agent-extension: /agent-plugin command");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		hub.warnings.push(message);
		hub.log("error", `注册 /agent-plugin 失败：${message}`);
	}
	try {
		ctx.effect?.(() => () => hub.dispose(), "dsh-agent-extension: hub lifecycle");
	} catch {}
	if (!hub.skills?.registered) deferService(ctx, ["skills"], (scope) => {
		if (hub.skills && !hub.skills.registered) hub.skills.register(scope);
	}, (message) => hub.log("warn", message));
	let uiRoutes = {
		active: false,
		reason: "未挂载",
		path: "/agent-plugin/api",
		dispose: () => {}
	};
	try {
		uiRoutes = mountUiRoutes(ctx, hub);
		if (uiRoutes.active && typeof ctx.effect === "function") ctx.effect(() => () => uiRoutes.dispose(), "dsh-agent-extension: plugin-page API");
	} catch (error) {
		hub.uiRoutes = {
			active: false,
			reason: `挂载插件页 API 失败：${error instanceof Error ? error.message : String(error)}`,
			path: "/agent-plugin/api"
		};
		hub.log("error", hub.uiRoutes.reason);
	}
	if (!hub.uiRoutes.active) deferService(ctx, ["webServer"], (scope) => {
		if (hub.uiRoutes.active) return;
		const status = mountUiRoutes(scope, hub);
		if (typeof scope?.effect === "function") scope.effect(() => () => status.dispose?.(), "dsh-agent-extension: plugin-page API");
	}, (message) => {
		hub.uiRoutes = {
			active: false,
			reason: message,
			path: "/agent-plugin/api"
		};
		hub.log("warn", message);
	});
	hub.log("info", `v${HUB_VERSION} 已加载；home=${hub.home}；已安装 ${hub.state.plugins.length} 个插件，市场 ${hub.markets.list().length} 个；插件页 API：${hub.uiRoutes.active ? "已挂载" : hub.uiRoutes.reason}`);
	return hub;
}
export { apply, inject, name };
