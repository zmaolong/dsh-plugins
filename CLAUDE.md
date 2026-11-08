# Claude Code 项目说明

本仓库的通用 Agent 规范见 [`AGENTS.md`](AGENTS.md)，DSH 插件开发规范见 [`docs/PLUGIN-DEV.md`](docs/PLUGIN-DEV.md)。开工前请先读这两份。

要点速记：

- 插件必须是组合包（`dsh.bundle.patch`），`cordis.patch.yml` 行 `name` = 包名；
- 不 `import '@deepseek-ai/*'`，不写多余的 `engines.dsh`；
- 宿主端服务用 `ctx.inject` 延迟获取，清理用 `ctx.effect`；
- 每次改动跑 `npm run check && npm test`（包目录，离线）；
- 涉及版本/展示元数据时重跑 `node scripts\build-index.mjs`；
- commit 不加 Co-Authored-By；完成后 push `release-0.0.1`。