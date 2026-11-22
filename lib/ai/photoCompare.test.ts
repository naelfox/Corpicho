import { describe, expect, it } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { createTestDb } from '@/test/db'
import { monthUsage } from './client'
import { PHOTO_COMPARE_INSTRUCTIONS, describeChanges } from './photoCompare'

const model = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 100, text: 100, reasoning: 0 },
      },
      warnings: [],
    },
  })
const deps = (m: MockLanguageModelV4) => ({ model: m, modelId: 'gpt-5.4-mini', limitUsd: 5 })

describe('PHOTO_COMPARE_INSTRUCTIONS', () => {
  it('proíbe números, medidas, percentual de gordura e julgamento médico; lembra luz e ângulo', () => {
    expect(PHOTO_COMPARE_INSTRUCTIONS).toMatch(/não (informe|cite|use) (números|medidas)/i)
    expect(PHOTO_COMPARE_INSTRUCTIONS).toMatch(/percentual de gordura/i)
    expect(PHOTO_COMPARE_INSTRUCTIONS).toMatch(/peso/i)
    expect(PHOTO_COMPARE_INSTRUCTIONS).toMatch(/médic/i)
    expect(PHOTO_COMPARE_INSTRUCTIONS).toMatch(/luz|iluminação/i)
    expect(PHOTO_COMPARE_INSTRUCTIONS).toMatch(/ângulo/i)
  })
})

describe('describeChanges', () => {
  it('manda as duas imagens rotuladas e grava o uso', async () => {
    const db = await createTestDb()
    const m = model('  A postura parece mais ereta.  ')
    const out = await describeChanges(db, {
      before: ['data:image/jpeg;base64,QU5URVM='],
      after: ['data:image/jpeg;base64,REVQT0lT'],
      beforeLabels: ['Antes – frente (01/11/2026)'],
      afterLabels: ['Depois – frente (20/11/2026)'],
      deps: deps(m),
    })
    expect(out).toBe('A postura parece mais ereta.')
    expect(m.doGenerateCalls).toHaveLength(1)
    const prompt = JSON.stringify(m.doGenerateCalls[0].prompt)
    expect(prompt).toContain('QU5URVM=')
    expect(prompt).toContain('REVQT0lT')
    expect(prompt).toContain('Antes – frente (01/11/2026)')
    expect(prompt).toContain('Depois – frente (20/11/2026)')
    expect(prompt.indexOf('QU5URVM=')).toBeLessThan(prompt.indexOf('REVQT0lT'))
    expect(prompt).toContain('percentual de gordura')
    const usage = await db.query<{ feature: string }>(`select feature from ai_usage`)
    expect(usage.map((u) => u.feature)).toEqual(['photo_compare'])
    expect((await monthUsage(db)).calls).toBe(1)
  })

  it('exige ao menos uma imagem antes e uma depois', async () => {
    const db = await createTestDb()
    const m = model('x')
    await expect(describeChanges(db, { before: [], after: ['data:image/jpeg;base64,A'], deps: deps(m) })).rejects.toThrow()
    expect(m.doGenerateCalls).toHaveLength(0)
  })

  it('resposta vazia vira bad_output', async () => {
    const db = await createTestDb()
    await expect(
      describeChanges(db, { before: ['data:image/jpeg;base64,QQ=='], after: ['data:image/jpeg;base64,Qg=='], deps: deps(model('   ')) }),
    ).rejects.toMatchObject({ code: 'bad_output' })
  })
})
