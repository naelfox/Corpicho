import { generateText, type LanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { Db } from '@/lib/db'
import { todayIn } from '@/lib/dates'
import { costUsd } from './pricing'

export type AiErrorCode = 'no_key' | 'invalid_key' | 'offline' | 'quota' | 'limit' | 'timeout' | 'bad_output' | 'failed'

export class AiError extends Error {
  code: AiErrorCode
  constructor(code: AiErrorCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause })
    this.name = 'AiError'
    this.code = code
  }
}

export const AI_ERROR_TEXT: Record<AiErrorCode, string> = {
  no_key: 'Cole sua chave da OpenAI em Ajustes para usar a IA.',
  invalid_key: 'A chave da OpenAI foi recusada. Confira em Ajustes.',
  offline: 'Sem conexão com a internet. Tente de novo ou registre à mão.',
  quota: 'Sua conta da OpenAI está sem crédito ou no limite de uso.',
  limit: 'Você atingiu o limite de gasto do mês definido em Ajustes.',
  timeout: 'A IA demorou demais para responder. Tente de novo.',
  bad_output: 'A IA respondeu num formato inesperado. Tente de novo.',
  failed: 'Não foi possível falar com a IA agora.',
}

export const TIMEOUT_MS = { vision: 45_000, text: 30_000 }

type Usage = { inputTokens?: number; outputTokens?: number }

export type RunAiOptions<T> = {
  feature: string
  kind: 'vision' | 'text'
  call: (model: LanguageModel, signal: AbortSignal) => Promise<{ value: T; usage: Usage }>
  deps?: {
    model?: LanguageModel
    modelId?: string
    now?: Date
    limitUsd?: number
    getKey?: () => Promise<string | null>
  }
}

/** Início do mês corrente em America/Sao_Paulo (sem horário de verão desde 2019: UTC-3). */
function monthStart(now: Date): string {
  return `${todayIn(now).slice(0, 7)}-01T00:00:00-03:00`
}

export async function monthUsage(db: Db, now: Date = new Date()): Promise<{ costUsd: number; calls: number }> {
  const [r] = await db.query<{ cost: string | null; calls: string }>(
    `select coalesce(sum(cost_usd), 0) as cost, count(*) as calls from ai_usage where created_at >= $1`,
    [monthStart(now)],
  )
  return { costUsd: Number(r.cost), calls: Number(r.calls) }
}

function statusOf(e: unknown): number | undefined {
  const s = (e as { statusCode?: unknown } | null)?.statusCode
  return typeof s === 'number' ? s : undefined
}

export function mapError(e: unknown): AiError {
  if (e instanceof AiError) return e
  const err = e as { name?: string; message?: string; responseBody?: string; cause?: unknown } | null
  const status = statusOf(e)
  const body = `${err?.responseBody ?? ''} ${err?.message ?? ''}`
  if (status === 401 || status === 403) return new AiError('invalid_key', e)
  if (status === 429 || /insufficient_quota/.test(body)) return new AiError('quota', e)
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return new AiError('timeout', e)
  if (
    err?.name === 'NoObjectGeneratedError' ||
    err?.name === 'AI_NoObjectGeneratedError' ||
    err?.name === 'AI_TypeValidationError' ||
    err?.name === 'AI_JSONParseError' ||
    err?.name === 'ZodError'
  ) {
    return new AiError('bad_output', e)
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new AiError('offline', e)
  const c = err?.cause as { name?: string; message?: string } | undefined
  if (
    (e instanceof TypeError && /fetch|network/i.test(err?.message ?? '')) ||
    /failed to fetch|network|ECONNREFUSED|ENOTFOUND/i.test(`${err?.message ?? ''} ${c?.message ?? ''}`)
  ) {
    return new AiError('offline', e)
  }
  return new AiError('failed', e)
}

export async function runAi<T>(db: Db, opts: RunAiOptions<T>): Promise<T> {
  const deps = opts.deps ?? {}
  let model = deps.model
  let modelId = deps.modelId
  if (!model) {
    const getKey = deps.getKey ?? (async () => (await import('@/lib/settings')).getOpenAiKey())
    const key = await getKey()
    if (!key) throw new AiError('no_key')
    modelId = modelId ?? (await (await import('@/lib/settings')).getModels())[opts.kind]
    model = createOpenAI({ apiKey: key })(modelId)
  }
  const id = modelId ?? 'unknown'
  const limit = deps.limitUsd ?? (await (await import('@/lib/settings')).getMonthlyLimitUsd())
  const used = await monthUsage(db, deps.now)
  if (used.costUsd >= limit) throw new AiError('limit')

  const signal = AbortSignal.timeout(TIMEOUT_MS[opts.kind])
  let res: { value: T; usage: Usage }
  try {
    res = await opts.call(model, signal)
  } catch (e) {
    throw mapError(e)
  }
  const tin = res.usage.inputTokens ?? 0
  const tout = res.usage.outputTokens ?? 0
  await db.query(
    `insert into ai_usage (feature, model, tokens_in, tokens_out, cost_usd) values ($1, $2, $3, $4, $5)`,
    [opts.feature, id, tin, tout, costUsd(id, tin, tout)],
  )
  return res.value
}

/** Chamada mínima para validar a chave. Não grava uso. */
export async function testKey(key: string): Promise<boolean> {
  try {
    const { getModels } = await import('@/lib/settings')
    const { text } = await getModels()
    await generateText({
      model: createOpenAI({ apiKey: key.trim() })(text),
      prompt: 'Responda: ok',
      maxOutputTokens: 5,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS.text),
    })
    return true
  } catch {
    return false
  }
}
