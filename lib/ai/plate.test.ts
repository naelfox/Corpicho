import { describe, expect, it } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { createTestDb } from '@/test/db'
import { seedTaco, searchFoods } from '@/lib/foods'
import { normalizePlateItems, analyzePlate } from './plate'

const p = { kcal100: 76, protein100: 4.8, carbs100: 14, fat100: 0.5 }

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

describe('normalizePlateItems', () => {
  it('descarta nome vazio e gramas inválidas', () => {
    const out = normalizePlateItems([
      { name: '', estimatedGrams: 100, per100: p, confidence: 'alta' },
      { name: 'Arroz', estimatedGrams: -5, per100: p, confidence: 'alta' },
      { name: 'Feijão', estimatedGrams: 100.4, per100: p, confidence: 'media' },
    ])
    expect(out).toEqual([{ name: 'Feijão', estimatedGrams: 100, per100: p, confidence: 'media' }])
  })
  it('descarta kcal absurda, gramas > 2000, duplicados e limita a 12', () => {
    const base = { estimatedGrams: 50, per100: p, confidence: 'baixa' }
    expect(normalizePlateItems([{ name: 'X', ...base, per100: { ...p, kcal100: 901 } }])).toEqual([])
    expect(normalizePlateItems([{ name: 'X', ...base, estimatedGrams: 2001 }])).toEqual([])
    expect(normalizePlateItems([{ name: 'X', ...base, per100: { ...p, fat100: -1 } }])).toEqual([])
    expect(normalizePlateItems([{ name: 'A', ...base }, { name: ' a ', ...base }])).toHaveLength(1)
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `i${i}`, ...base }))
    expect(normalizePlateItems(many)).toHaveLength(12)
  })
})

describe('analyzePlate', () => {
  it('casa com a TACO e usa os valores dela', async () => {
    const db = await createTestDb()
    await seedTaco(db)
    const taco = (await searchFoods(db, 'arroz cozido', 1))[0]
    const m = model(
      JSON.stringify({
        items: [
          { name: 'Arroz branco cozido', searchTerms: 'arroz cozido', estimatedGrams: 150, per100: p, confidence: 'alta' },
          { name: 'Molho misterioso', searchTerms: 'zzzxxx', estimatedGrams: 30, per100: p, confidence: 'baixa' },
        ],
      }),
    )
    const out = await analyzePlate(db, 'data:image/jpeg;base64,AAAA', deps(m))
    expect(out[0].foodId).toBe(taco.id)
    expect(out[0].name).toBe(taco.name)
    expect(out[0].per100).toEqual({
      kcal100: taco.kcal100,
      protein100: taco.protein100,
      carbs100: taco.carbs100,
      fat100: taco.fat100,
    })
    expect(out[1].foodId).toBeUndefined()
    expect(out[1].per100).toEqual(p)
  })
  it('lista vazia devolve []', async () => {
    const db = await createTestDb()
    expect(await analyzePlate(db, 'data:image/jpeg;base64,AAAA', deps(model('{"items":[]}')))).toEqual([])
  })
  it('JSON inválido vira bad_output', async () => {
    const db = await createTestDb()
    await expect(analyzePlate(db, 'data:image/jpeg;base64,AAAA', deps(model('não é json')))).rejects.toMatchObject({
      code: 'bad_output',
    })
  })
})
