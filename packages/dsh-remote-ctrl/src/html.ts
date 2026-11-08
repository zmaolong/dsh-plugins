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
export function renderPage(): string {
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
<script src="/static/mobile.js"></script>
</body>
</html>`
}
