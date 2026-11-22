import { describe, expect, it } from 'vitest'
import { createTestDb } from '@/test/db'
import { addMeasurement, addWeight } from '@/lib/body'
import { ensureLastWeekReport, listReports, regenerateAnalysis, weekNumbers } from './reports'

const now = new Date('2026-11-22T15:00:00Z') // domingo; semana fechada = 09–15/11
const W = '2026-11-09'
const at = (d: string) => new Date(`${d}T15:00:00Z`)
const noAi = { getKey: async () => null }

async function meal(db: Awaited<ReturnType<typeof createTestDb>>, day: string, kcal: number, protein: number) {
  await db.query(`insert into meals (day, type) values ($1, 'almoco')`, [day])
  const [m] = await db.query<{ id: string }>(`select id from meals where day = $1`, [day])
  await db.query(
    `insert into meal_items (meal_id, name, grams, kcal, protein_g, carbs_g, fat_g, source) values ($1,'X',100,$2,$3,0,0,'manual')`,
    [m.id, kcal, protein],
  )
}

describe('weekNumbers', () => {
  it('peso início/fim e delta', async () => {
    const db = await createTestDb()
    await addWeight(db, 95.0, at('2026-11-09'))
    await addWeight(db, 94.2, at('2026-11-15'))
    const n = await weekNumbers(db, W)
    expect(n).toMatchObject({ weightStart: 95, weightEnd: 94.2, weightDelta: -0.8 })
  })

  it('um só peso: delta null', async () => {
    const db = await createTestDb()
    await addWeight(db, 95, at('2026-11-10'))
    expect(await weekNumbers(db, W)).toMatchObject({ weightStart: 95, weightEnd: 95, weightDelta: null })
  })

  it('médias ignoram dias sem registro', async () => {
    const db = await createTestDb()
    await meal(db, '2026-11-09', 2000, 100)
    await meal(db, '2026-11-11', 1500, 80)
    const n = await weekNumbers(db, W)
    expect(n).toMatchObject({ avgKcal: 1750, avgProtein: 90, daysLogged: 2 })
  })

  it('sem dados: nulls e zeros', async () => {
    const db = await createTestDb()
    expect(await weekNumbers(db, W)).toEqual({
      weightStart: null, weightEnd: null, weightDelta: null, measures: [], avgKcal: null, avgProtein: null,
      daysLogged: 0, workouts: 0, trainingTrend: [],
    })
  })

  it('medidas: delta contra a última antes da semana; só regiões com as duas', async () => {
    const db = await createTestDb()
    await addMeasurement(db, 'cintura', 100, at('2026-11-02'))
    await addMeasurement(db, 'cintura', 98.5, at('2026-11-14'))
    await addMeasurement(db, 'quadril', 110, at('2026-11-12'))
    const n = await weekNumbers(db, W)
    expect(n.measures).toEqual([{ region: 'cintura', delta: -1.5 }])
  })

  it('treinos e evolução de cargas', async () => {
    const db = await createTestDb()
    const [ex] = await db.query<{ id: string }>(`insert into exercises (name, kind) values ('Supino','musculacao') returning id`)
    const sess = async (day: string, load: number, done = true) => {
      const [s] = await db.query<{ id: string }>(
        `insert into workout_sessions (day, finished_at) values ($1, ${done ? 'now()' : 'null'}) returning id`, [day])
      await db.query(`insert into session_sets (session_id, exercise_id, set_no, reps, load_kg) values ($1,$2,1,10,$3)`, [s.id, ex.id, load])
    }
    await sess('2026-10-20', 40)
    await sess('2026-11-10', 45)
    await sess('2026-11-12', 42.5)
    await sess('2026-11-13', 60, false)
    const n = await weekNumbers(db, W)
    expect(n.workouts).toBe(2)
    expect(n.trainingTrend).toEqual([{ name: 'Supino', loadDelta: 5 }])
  })
})

describe('ensureLastWeekReport', () => {
  it('não cria relatório de semana vazia', async () => {
    const db = await createTestDb()
    await ensureLastWeekReport(db, now, noAi)
    expect(await listReports(db)).toEqual([])
  })

  it('duas vezes → 1 relatório; sem chave → analysis null', async () => {
    const db = await createTestDb()
    await addWeight(db, 95, at('2026-11-09'))
    await addWeight(db, 94.2, at('2026-11-15'))
    await ensureLastWeekReport(db, now, noAi)
    await ensureLastWeekReport(db, now, noAi)
    const list = await listReports(db)
    expect(list).toHaveLength(1)
    expect(list[0].weekStart).toBe(W)
    expect(list[0].analysis).toBeNull()
    expect(list[0].numbers.weightDelta).toBe(-0.8)
  })

  it('chamadas simultâneas compartilham uma execução (uma só chamada à IA)', async () => {
    const db = await createTestDb()
    await addWeight(db, 95, at('2026-11-09'))
    const { MockLanguageModelV4 } = await import('ai/test')
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text: 'ok' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
        warnings: [],
      },
    })
    const deps = { model, modelId: 'gpt-5.4-mini', limitUsd: 5, now }
    await Promise.all([ensureLastWeekReport(db, now, deps), ensureLastWeekReport(db, now, deps)])
    expect(model.doGenerateCalls).toHaveLength(1)
    expect(await listReports(db)).toHaveLength(1)
  })

  it('regenerateAnalysis atualiza o texto', async () => {
    const db = await createTestDb()
    await addWeight(db, 95, at('2026-11-09'))
    await ensureLastWeekReport(db, now, noAi)
    const { MockLanguageModelV4 } = await import('ai/test')
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text: '**O que melhorou**\n- ok' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
        warnings: [],
      },
    })
    const text = await regenerateAnalysis(db, W, { model, modelId: 'gpt-5.4-mini', limitUsd: 5, now })
    expect(text).toContain('O que melhorou')
    expect((await listReports(db))[0].analysis).toBe(text)
  })
})
