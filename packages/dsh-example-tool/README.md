# dsh-example-tool

给模型加一个工具 `hello_tool` 的示例。

- `inject = ['tools']`：等宿主挂载 tools 服务后再注册；
- `ctx.tools.register(definition)`：定义里包含 `name`、`description`（面向模型）、`parameters`（JSON Schema）、`output.schema` + `output.render`、`execute`；
- 不 import 宿主包，纯 `ctx` 接口。

参数校验：这个示例把 `parameters` 直接写成 JSON Schema，宿主按声明校验模型传参。
如果你要用官方 `defineTool` 助手（带参数校验包装），需要把 `@deepseek-ai/dsh-tools`
写进 `dependencies` 并和宿主版本对齐——否则在 profile 里解析不到。