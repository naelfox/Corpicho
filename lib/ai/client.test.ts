import { describe, expect, it } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { generateText } from 'ai'
import { createTestDb } from '@/test/db'
import { AiError, monthUsage, runAi } from './client'
import { costUsd } from './pricing'

const okModel = () =>
  new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: 'oi' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 200, text: 200, reasoning: 0 },
      },
      warnings: [],
    },
  })

const callText = (model: Parameters<typeof generateText>[0]['model'], signal: AbortSignal) =>
  generateText({ model, prompt: 'x', abortSignal: signal }).then((r) => ({ value: r.text, usage: r.usage }))

describe('runAi', () => {
  it('grava uso com o custo calculado', async () => {
    const db = await createTestDb()
    const model = okModel()
    const out = await runAi(db, {
      feature: 'teste',
      kind: 'text',
      call: callText,
      deps: { model, modelId: 'gpt-5.4-nano', limitUsd: 5 },
    })
    expect(out).toBe('oi')
    const rows = await db.query<{ tokens_in: number; tokens_out: number; cost_usd: string; model: string }>(
      'select * from ai_usage',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].tokens_in).toBe(1000)
    expect(rows[0].tokens_out).toBe(200)
    expect(Number(rows[0].cost_usd)).toBeCloseTo(costUsd('gpt-5.4-nano', 1000, 200), 8)
    expect(await monthUsage(db)).toMatchObject({ calls: 1 })
  })

  it('bloqueia quando o gasto do mês atinge o limite, sem chamar o modelo', async () => {
    const db = await createTestDb()
    await db.query(`insert into ai_usage (feature, model, cost_usd) values ('x', 'gpt-5.4', 5)`)
    const model = okModel()
    await expect(
      runAi(db, { feature: 't', kind: 'text', call: callText, deps: { model, modelId: 'gpt-5.4-nano', limitUsd: 5 } }),
    ).rejects.toMatchObject({ code: 'limit' })
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it('uso de meses anteriores não conta', async () => {
    const db = await createTestDb()
    await db.query(
      `insert into ai_usage (feature, model, cost_usd, created_at) values ('x', 'gpt-5.4', 50, '2026-10-31T12:00:00Z')`,
    )
    const now = new Date('2026-11-22T12:00:00Z')
    expect(await monthUsage(db, now)).toEqual({ costUsd: 0, calls: 0 })
  })

  it('401 vira invalid_key e não grava uso', async () => {
    const db = await createTestDb()
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw Object.assign(new Error('nope'), { statusCode: 401 })
      },
    })
    await expect(
      runAi(db, { feature: 't', kind: 'text', call: callText, deps: { model, modelId: 'gpt-5.4-nano', limitUsd: 5 } }),
    ).rejects.toMatchObject({ code: 'invalid_key' })
    expect(await db.query('select * from ai_usage')).toHaveLength(0)
  })

  it('429 vira quota', async () => {
    const db = await createTestDb()
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw Object.assign(new Error('rate'), { statusCode: 429 })
      },
    })
    await expect(
      runAi(db, { feature: 't', kind: 'text', call: callText, deps: { model, modelId: 'gpt-5.4-nano', limitUsd: 5 } }),
    ).rejects.toMatchObject({ code: 'quota' })
  })

  it('sem chave e sem modelo injetado: no_key', async () => {
    const db = await createTestDb()
    await expect(
      runAi(db, { feature: 't', kind: 'text', call: callText, deps: { getKey: async () => null, limitUsd: 5 } }),
    ).rejects.toBeInstanceOf(AiError)
    await expect(
      runAi(db, { feature: 't', kind: 'text', call: callText, deps: { getKey: async () => null, limitUsd: 5 } }),
    ).rejects.toMatchObject({ code: 'no_key' })
  })
})

describe('costUsd', () => {
  it('modelo desconhecido usa o preço mais caro', () => {
    expect(costUsd('modelo-x', 1_000_000, 0)).toBe(costUsd('gpt-5.5', 1_000_000, 0))
    expect(costUsd('gpt-5.4-nano', 1_000_000, 1_000_000)).toBeCloseTo(0.2 + 1.25, 8)
  })
})
