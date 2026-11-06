# dsh-example-hello

最小 DSH 插件示例：加载时往宿主控制台打一行日志。

- 入口：`lib/index.js` 导出 `name` 和 `apply(ctx)`
- 组合包声明：`package.json` 的 `dsh.bundle.patch` → `cordis.patch.yml`
- 依赖：无

复制这个目录就是新插件的起点，改完跑一次 `node scripts/build-index.mjs` 更新索引即可。