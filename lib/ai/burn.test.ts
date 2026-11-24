import { describe, expect, it } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { createTestDb } from '@/test/db'
import { addWeight } from '@/lib/body'
import { analyzeBurnText, normalizeBurnItems } from './burn'

const model = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 50, text: 50, reasoning: 0 },
      },
      warnings: [],
    },
  })
const deps = (m: MockLanguageModelV4) => ({ model: m, modelId: 'gpt-5.4-mini', limitUsd: 5 })
const item = { label: 'Corrida', minutes: null, met: null, statedKcal: null, kcal: 300, confidence: 'media' }

describe('normalizeBurnItems', () => {
  it('calorias ditas pela pessoa valem como estão', () => {
    expect(normalizeBurnItems([{ ...item, statedKcal: 412.4, met: 8, minutes: 30 }], 80)).toEqual([
      { label: 'Corrida', kcal: 412, basis: 'informado', confidence: 'alta' },
    ])
  })
  it('com MET, minutos e peso calcula MET × kg × horas', () => {
    // 8 × 80 kg × 0,5 h = 320
    expect(normalizeBurnItems([{ ...item, met: 8, minutes: 30 }], 80)[0]).toMatchObject({ kcal: 320, basis: 'estimado' })
  })
  it('sem peso usa a estimativa da IA', () => {
    expect(normalizeBurnItems([{ ...item, met: 8, minutes: 30 }], null)[0].kcal).toBe(300)
  })
  it('descarta sem nome e fora de 1–5000 kcal', () => {
    expect(normalizeBurnItems([{ ...item, label: '  ' }, { ...item, kcal: 0 }, { ...item, kcal: 6000 }], 80)).toEqual([])
  })
})

describe('analyzeBurnText', () => {
  it('manda o texto com o peso e registra o uso como burn_text', async () => {
    const db = await createTestDb()
    await addWeight(db, 70)
    const m = model(JSON.stringify({ items: [{ ...item, label: 'Musculação', met: 5, minutes: 60 }] }))
    const out = await analyzeBurnText(db, 'fiz uma hora de musculação', deps(m))
    expect(out).toEqual([{ label: 'Musculação', kcal: 350, basis: 'estimado', confidence: 'media' }])
    const prompt = JSON.stringify(m.doGenerateCalls[0].prompt)
    expect(prompt).toContain('fiz uma hora de musculação')
    expect(prompt).toContain('peso 70 kg')
    const [u] = await db.query<{ feature: string }>(`select feature from ai_usage`)
    expect(u.feature).toBe('burn_text')
  })
  it('texto vazio não chama a IA', async () => {
    const db = await createTestDb()
    const m = model('{"items":[]}')
    expect(await analyzeBurnText(db, ' ', deps(m))).toEqual([])
    expect(m.doGenerateCalls).toHaveLength(0)
  })
})
