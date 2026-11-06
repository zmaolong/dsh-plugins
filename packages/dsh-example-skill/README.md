# dsh-example-skill

随包提供一条内置 skill（`example-greeting`）的示例。

- `inject = ['skills']`：等宿主挂载 skills 服务；
- `ctx.skills.registerProvider(() => provider)`：注册一个 provider；
- `list()` 返回候选（`name` 用小写 kebab-case、`description` 面向模型、`provider` 必须与 provider 名一致、`rank` 是优先级数字）；
- `get(candidate)` 返回完整定义，`content` 是 skill 正文；
- `resourceBase` 指向 `assets/`，正文里引用的图片等就相对这个目录。

正文在 `assets/hello-skill.md`，改内容不用动代码。