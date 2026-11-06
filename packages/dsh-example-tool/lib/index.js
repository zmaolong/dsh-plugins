/**
 * 示例插件：给模型注册一个工具。
 *
 * 只用 ctx 提供的接口，不 import 任何 @deepseek-ai/* 包。
 * 工具定义直接是 JSON Schema 形态；宿主注册时会校验 output.schema 与参数结构。
 *
 * @module dsh-example-tool
 */

/** Cordis 插件名。 */
export const name = 'example-tool'

/** 等待宿主提供 tools 服务后再注册。 */
export const inject = ['tools']

const DEFINITION = {
  name: 'hello_tool',
  description:
    'Say hello to someone. Use it when the user asks for a greeting demo or wants to test that a custom DSH tool is registered.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: {
        type: 'string',
        description: 'Who to greet. Defaults to "world" when omitted.',
      },
      excited: {
        type: 'boolean',
        description: 'Add exclamation marks when true.',
      },
    },
    required: [],
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
    render(_args, value) {
      return [{ type: 'text', text: value.message }]
    },
  },
  execute(args) {
    const who = typeof args.name === 'string' && args.name.trim() !== '' ? args.name.trim() : 'world'
    return { message: `Hello, ${who}${args.excited === true ? '!!!' : '!'}` }
  },
}

/**
 * 注册 hello_tool。
 * @param ctx - 宿主注入的上下文（此时 tools 服务已可用）。
 */
export function apply(ctx) {
  ctx.tools.register(DEFINITION)
  console.log('[dsh-example-tool] 已注册工具 hello_tool')
}