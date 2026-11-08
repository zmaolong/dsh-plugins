# Claude Code 项目说明

本仓库的通用 Agent 规范见 [`AGENTS.md`](AGENTS.md)，DSH 插件开发规范见 [`docs/PLUGIN-DEV.md`](docs/PLUGIN-DEV.md)。开工前请先读这两份。

官方资料（冲突时以官方为准）：

- 仓库 https://github.com/deepseek-ai/deepseek-harness
- 文档站 https://deepseek-harness.github.io/deepseek-harness/
- 插件索引 format 1 权威规范：https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/plugin-market.zh.md
- 插件展示元数据（`locale/*.json` 的 `meta.title/description`）：https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-package.md

要点速记：

- 插件必须是组合包（`dsh.bundle.patch`），`cordis.patch.yml` 行 `name` = 包名；
- 不 `import '@deepseek-ai/*'`，不写多余的 `engines.dsh`；
- 宿主端服务用 `ctx.inject` 延迟获取，清理用 `ctx.effect`；
- 每次改动跑 `npm run check && npm test`（包目录，离线）；
- 涉及版本/展示元数据时重跑 `node scripts\build-index.mjs`；
- commit 不加 Co-Authored-By；完成后 push `release-0.0.1`。