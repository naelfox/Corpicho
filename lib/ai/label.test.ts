import { describe, expect, it } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { createTestDb } from '@/test/db'
import { analyzeLabel, normalizeLabel } from './label'

const per100 = { kcal100: 432, protein100: 10, carbs100: 68.3, fat100: 13.3 }
const raw = { isLabel: true, name: ' Biscoito cream cracker ', per100, portionLabel: '6 biscoitos', portionGrams: 30 }

describe('normalizeLabel', () => {
  it('limpa o nome e guarda a porção', () => {
    expect(normalizeLabel(raw)).toEqual({ name: 'Biscoito cream cracker', per100, portion: { label: '6 biscoitos', grams: 30 } })
  })
  it('sem porção legível fica null; foto que não é rótulo ou valor absurdo é recusada', () => {
    expect(normalizeLabel({ ...raw, portionGrams: 0 }).portion).toBeNull()
    expect(() => normalizeLabel({ ...raw, isLabel: false })).toThrow('bad_output')
    expect(() => normalizeLabel({ ...raw, per100: { ...per100, kcal100: 950 } })).toThrow('bad_output')
  })
})

describe('analyzeLabel', () => {
  it('lê a resposta da IA e registra o uso', async () => {
    const db = await createTestDb()
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text: JSON.stringify(raw) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 50, text: 50, reasoning: 0 },
        },
        warnings: [],
      },
    })
    const r = await analyzeLabel(db, 'data:image/jpeg;base64,AA', { model, modelId: 'gpt-5.4-mini', limitUsd: 5 })
    expect(r.portion).toEqual({ label: '6 biscoitos', grams: 30 })
    expect(await db.query(`select feature from ai_usage`)).toEqual([{ feature: 'label' }])
  })
})
