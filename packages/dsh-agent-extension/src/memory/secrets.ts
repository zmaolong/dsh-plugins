/**
 * 写入路径的 secrets 确定性拦截。
 *
 * 记忆库会被注入到后续所有会话的上下文，密钥一旦写进去就是一个高暴露面的
 * 持久副本（提炼器/模型写入无人工把关）。hindsight memory-defense、agentcairn
 * redact-first、claude-mem redaction、codex 写入闸门的共同实践：写入前做
 * 确定性检查——本模块采用**高置信窄匹配 + 整条拒绝**（不做自动改写：改写
 * 可能损坏事实本身，且「脱敏后的密钥引用」价值存疑，交回给写入方决定）。
 *
 * 清单只收高置信模式（随机密钥串、私钥块、内嵌凭据的连接串），不收
 * 「password 字段」这类需要语义判断的低置信信号——宁漏勿误，误伤会训练
 * 用户绕过或抱怨；真正的语义过滤由提炼 prompt 的负面清单承担。
 *
 * @module dsh-agent-extension/memory/secrets
 */

/** 一条命中：类别名（进错误信息与日志，不回显命中内容本身）。 */
interface SecretPattern {
  /** 类别名，用于错误信息提示。 */
  label: string
  /** 高置信窄匹配正则。 */
  pattern: RegExp
}

/**
 * 高置信 secrets 模式清单（顺序即错误信息里的展示顺序，无语义差异）。
 *
 * 匹配全部在单行内完成（正则不含换行），字段拼接时用换行分隔避免跨字段
 * 拼出假命中。
 */
const SECRET_PATTERNS: readonly SecretPattern[] = [
  // 私钥块（PEM/OpenSSH/PGP），任何变体都拒绝。
  { label: '私钥块', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----/u },
  // OpenAI / Anthropic / OpenRouter 风格密钥（sk-…、sk-proj-…、sk-ant-…）。
  { label: 'API 密钥（sk-…）', pattern: /\bsk-(?:proj-|ant-|svcacct-)?[A-Za-z0-9_-]{20,}\b/u },
  // GitHub 细粒度/经典 PAT。
  { label: 'GitHub token（gh?_…）', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u },
  // AWS Access Key ID。
  { label: 'AWS Access Key', pattern: /\bAKIA[0-9A-Z]{16}\b/u },
  // Slack bot/user/app token。
  { label: 'Slack token（xox…）', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u },
  // Google API key。
  { label: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/u },
  // JWT 三段式（header 固定 eyJ 开头）。
  { label: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u },
  // 连接串内嵌凭据（scheme://user:pass@host）。
  {
    label: '连接串内嵌凭据',
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql|smtp|ftp):\/\/[^\s:@/]+:[^\s@/]{4,}@/u,
  },
  // Bearer 头后跟长密钥串。
  { label: 'Bearer 凭据', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/iu },
  // 键值对形式的密钥赋值（值 ≥24 个无空白字符，示例占位如 your-api-key-here 不会命中）。
  {
    label: '键值对形式的密钥',
    pattern: /\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret(?:[_-]?(?:key|token))?|client[_-]?secret|token|password|passwd|pwd)\b\s*[:=]\s*["']?[A-Za-z0-9+/_=.-]{24,}["']?/iu,
  },
]

/**
 * 扫描一段文本，返回第一个命中的模式类别名；无命中返回 null。
 *
 * 只报类别不回显命中内容：错误信息会进入会话上下文与日志。
 *
 * @param value - 待检查文本（name/description/content/tags 拼接后传入）。
 */
export function findSecretMatch(value: string): string | null {
  for (const { label, pattern } of SECRET_PATTERNS) {
    if (pattern.test(value)) return label
  }
  return null
}

/**
 * 供 `save` 入口使用的校验：命中即抛错（整条拒绝，不做改写）。
 *
 * @param value - name/description/content/tags 等全部写入字段按换行拼接。
 */
export function assertNoSecrets(value: string): void {
  const label = findSecretMatch(value)
  if (label !== null) {
    throw new Error(`内容疑似包含敏感凭据（${label}），未写入。记忆会被注入到后续会话，请把密钥替换为占位说明（如「密钥见密码管理器」）后重试`)
  }
}
