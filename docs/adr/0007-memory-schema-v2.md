# 0007 记忆数据模型 v2：schema 版本化、利用率与维护字段、Markdown 真源

- 状态：已采纳，部分取代 [ADR-0001](0001-memory-global-project.md) 中「JSON 只存设置/统计/项目登记」的索引形态
- 日期：2026-11-10
- 背景：记忆条目没有 schema 版本、没有迁移机制（违反仓库「磁盘数据必须自动迁移」硬规则）；手改 md 不生效（缓存只按目录 mtime 失效）；update 分支清空标签无效、`supersedes` 被忽略；未知 frontmatter 字段下次写入即丢；没有 per-entry 使用记录，导致「低价值」体检只能靠 `reinforcement` 误报；`MEMORY.md` 索引只写不读，truth 与派生混淆。

## 决策

1. **条目 schema v2**：新增字段 `lastUsedAt?`、`usedCount`（默认 0）、`confidence`（0–100，默认 50）、`pinned`（默认 false）、`mergedFrom[]`（默认空）、`source`（`capture|tool|user|import`，迁移条目默认 `capture`）；frontmatter 写 `schema: 2`，缺省视为 v1。不加 `links`、不做向量字段。
2. **自动迁移**：首次加载把 v1 条目备份到 `<home>/memory/.backup-v1-<timestamp>/`（保持相对路径）后就地补齐字段写回，幂等、失败不丢数据；旧 `MEMORY.md` 移入备份目录并停止生成；`settings.json`/`stats.json`/`projects.json` 读取时校验 schema 版本并容错。
3. **Markdown 仍是唯一真源**：一事实一文件、可手工编辑、可导出；索引是派生数据，放在进程内，按文件 `mtime+size` 失效；不引入 SQLite 或向量库。
4. **利用率采样落盘**：`memory_get`/`memory_search` 命中时只更新内存，30 秒或会话结束时批量落盘到派生 usage store；维护 Run 时把聚合快照回写到条目的 `usedCount`/`lastUsedAt`。检索读路径不写 md。
5. **写语义修复**：`tags` 显式传 `[]` 清空；update 与「同指纹强化」路径都处理 `supersedes`；未知 frontmatter 字段透传保留；进程内写串行化；项目身份解析写入移出 prompt 装配路径。
6. **检索下推**：`store.search` 接受可选 `type`/`includeArchived`/`limit`，修复「先 limit 后过滤」导致的空结果。

## 理由

- 文件真源保证人读、手改、导出与跨工具迁移能力；派生索引解决 2000 条规模下的列表、检索与体检性能。
- 利用率是维护 Run、排序与低价值判定的地基；每次检索写回 md 会造成写放大并与手改竞争，因此只采样落盘。
- schema 版本 + 迁移是仓库硬规则，也避免后续批次再次破坏用户数据。

## 放弃的方案

- **SQLite 当仓库**：牺牲人读与导出，且需要依赖。
- **每次检索写回 md**：写放大、与手改竞争、2000 条规模不可行。
- **向量缓存**：宿主无 embedding。
- **保留 `MEMORY.md`**：只写不读，派生数据混入真源。

## 后果

- 迁移必须在真实用户 home 上验证幂等与备份可恢复。
- `usedCount` 快照可能滞后（采样落盘），维护研判以派生 usage store 为准。
- 手改文件生效依赖 mtime+size 检测；极端同时刻同大小改动可能漏检（可接受，有备份与导出）。
- **多版本宿主并行**：旧版本宿主不识别 `schema: 2`，会在写入时按 v1 重写条目（并重建 `MEMORY.md`），
  新版本下次启动会再次迁移并保留新的备份目录。预览期属已知风险；正式发布前应提示用户升级所有宿主。