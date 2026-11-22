import { describe, expect, it } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { createTestDb } from '@/test/db'
import { saveGoal, saveProfile, type Profile } from '@/lib/profile'
import { addWeight } from '@/lib/body'
import { ValidationError } from '@/lib/validate'
import { createPlan, finishSession, getActivePlan, getPlanDay, logSet, startSession } from '@/lib/training'
import { applyAdjustments, estimateSeconds, generatePlan, normalizeWorkoutPlan, suggestAdjustments } from './workout'

const now = new Date('2026-11-22T15:00:00Z')
const profile: Profile = {
  birthDate: '1990-05-10', sex: 'm', heightCm: 178, activityLevel: 1.375, fitness: 'baixo', experience: 'iniciante',
  daysPerWeek: 3, minutesPerSession: 40, equipment: ['Halteres'], restrictions: 'dor no joelho direito',
}

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
const deps = (m: MockLanguageModelV4) => ({ model: m, modelId: 'gpt-5.4-mini', limitUsd: 5, now })

const item = (name: string, extra: Record<string, unknown> = {}) => ({
  name, description: 'Aqueça 5 min antes.', kind: 'musculacao', muscles: ['peitoral'],
  sets: 3, reps: 10, durationS: null, restS: 60, loadKg: null, ...extra,
})
const day = (weekday: number, items = [item(`Ex ${weekday}`)]) => ({ weekday, items })

async function setup() {
  const db = await createTestDb()
  await saveProfile(db, profile)
  await saveGoal(db, { startWeightKg: 100, targetWeightKg: 85, kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 })
  await addWeight(db, 98, now)
  return db
}

describe('normalizeWorkoutPlan', () => {
  it('limita séries/reps/descanso/duração e descarta músculos desconhecidos', () => {
    const d = normalizeWorkoutPlan(
      { name: ' Plano ', notes: 'n', days: [day(1, [item('A', { sets: 30, reps: 200, restS: 9999, muscles: ['peitoral', 'pescoço', 'Tríceps'] })])] },
      { daysPerWeek: 3, minutesPerSession: 240 },
    )
    expect(d.name).toBe('Plano')
    expect(d.items[0]).toMatchObject({ weekday: 1, sets: 10, reps: 50, restS: 600 })
    expect(d.items[0].exercise.muscles).toEqual(['peitoral', 'triceps'])
    expect(d.items[0].durationS).toBeUndefined()
  })

  it('corta itens que passam do tempo do treino (mantém pelo menos um)', () => {
    // 3×(10×3 s + 60 s) = 270 s = 4,5 min por exercício
    expect(estimateSeconds({ sets: 3, reps: 10, restS: 60 })).toBe(270)
    expect(estimateSeconds({ durationS: 1200 })).toBe(1200)
    const items = Array.from({ length: 6 }, (_, i) => item(`E${i}`))
    const d = normalizeWorkoutPlan({ name: 'P', notes: '', days: [day(1, items)] }, { daysPerWeek: 3, minutesPerSession: 10 })
    expect(d.items).toHaveLength(2)
    const long = normalizeWorkoutPlan(
      { name: 'P', notes: '', days: [day(2, [item('Caminhada', { kind: 'cardio', sets: null, reps: null, restS: null, durationS: 3600 })])] },
      { daysPerWeek: 3, minutesPerSession: 30 },
    )
    expect(long.items).toHaveLength(1)
    expect(long.items[0].durationS).toBe(1800)
  })

  it('dias repetidos ou inválidos são descartados', () => {
    const d = normalizeWorkoutPlan(
      { name: 'P', notes: '', days: [day(1), day(1), day(9), day(3, [item('  ')])] },
      { daysPerWeek: 5, minutesPerSession: 60 },
    )
    expect(d.items.map((i) => i.weekday)).toEqual([1])
  })
})

describe('generatePlan', () => {
  it('devolve um rascunho com os dias do perfil (não salva)', async () => {
    const db = await setup()
    const m = model(JSON.stringify({ name: 'Plano iniciante', notes: 'Vá com calma.', days: [day(1), day(3), day(5)] }))
    const d = await generatePlan(db, deps(m))
    expect(new Set(d.items.map((i) => i.weekday))).toEqual(new Set([1, 3, 5]))
    expect(d.name).toBe('Plano iniciante')
    expect(await getActivePlan(db)).toBeNull()
    const prompt = JSON.stringify(m.doGenerateCalls[0].prompt)
    expect(prompt).toContain('dor no joelho direito')
    expect(prompt).toContain('Halteres')
    const usage = await db.query<{ feature: string }>(`select feature from ai_usage`)
    expect(usage).toEqual([{ feature: 'workout_plan' }])
    await createPlan(db, { ...d, origin: 'ia' })
    expect((await getActivePlan(db))?.items).toHaveLength(3)
  })

  it('mais dias que days_per_week → cortado', async () => {
    const db = await setup()
    const m = model(JSON.stringify({ name: 'P', notes: '', days: [day(0), day(1), day(2), day(3), day(4), day(5)] }))
    const d = await generatePlan(db, deps(m))
    expect(new Set(d.items.map((i) => i.weekday)).size).toBe(3)
  })

  it('sem perfil: ValidationError; JSON inválido: bad_output', async () => {
    const db = await createTestDb()
    await expect(generatePlan(db, deps(model('{}')))).rejects.toBeInstanceOf(ValidationError)
    const db2 = await setup()
    await expect(generatePlan(db2, deps(model('não é json')))).rejects.toMatchObject({ code: 'bad_output' })
  })
})

describe('ajustes sugeridos', () => {
  const sup = { name: 'Supino', description: 'x', kind: 'musculacao' as const, muscles: ['peitoral'] }
  const agach = { name: 'Agachamento', description: 'x', kind: 'musculacao' as const, muscles: ['quadriceps'] }
  const at = (d: string) => new Date(`${d}T15:00:00Z`)

  // Supino: 2 sessões, RPE 6. Agachamento: 2 sessões, RPE 9. Descanso médio ≥ 1 dia.
  async function withHistory() {
    const db = await setup()
    await createPlan(db, {
      name: 'Plano A', origin: 'ia', notes: 'nota',
      items: [
        { weekday: 1, exercise: sup, sets: 3, reps: 10, restS: 60, loadKg: 20 },
        { weekday: 1, exercise: agach, sets: 3, reps: 10, restS: 90, loadKg: 40 },
      ],
    })
    const [s, a] = await getPlanDay(db, 1)
    for (const [day, rpeS, rpeA] of [['2026-11-16', 6, 9], ['2026-11-19', 6, 9]] as const) {
      const sid = await startSession(db, { now: at(day) })
      await logSet(db, sid, { exerciseId: s.exercise.id, setNo: 1, reps: 10, loadKg: 20, rpe: rpeS })
      await logSet(db, sid, { exerciseId: a.exercise.id, setNo: 1, reps: 10, loadKg: 40, rpe: rpeA })
      await finishSession(db, sid, { durationMin: 40, rpe: 7 }, at(day))
    }
    return { db, s, a }
  }
  const adj = (planItemId: string, field: string, from: number, to: number) => ({ planItemId, field, from, to, reason: 'motivo' })
  const suggest = (db: Awaited<ReturnType<typeof setup>>, changes: unknown[]) =>
    suggestAdjustments(db, deps(model(JSON.stringify({ summary: 'Resumo', changes }))))

  it('sem plano ativo: ValidationError', async () => {
    const db = await setup()
    await expect(suggestAdjustments(db, deps(model('{}')))).rejects.toThrow('Crie um plano primeiro')
  })

  it('aceita +10 %, descarta +30 % e aumento em exercício com RPE médio ≥ 8', async () => {
    const { db, s, a } = await withHistory()
    const r = await suggest(db, [
      adj(s.id, 'loadKg', 20, 22),
      adj(s.id, 'reps', 10, 11),
      adj(a.id, 'loadKg', 40, 42), // RPE 9
    ])
    expect(r.changes.map((c) => `${c.planItemId === s.id ? 's' : 'a'}:${c.field}`)).toEqual(['s:loadKg', 's:reps'])
    const r2 = await suggest(db, [adj(s.id, 'loadKg', 20, 26)])
    expect(r2.changes).toEqual([])
    expect(r2.summary).toBe('Resumo')
    const usage = await db.query<{ feature: string }>(`select feature from ai_usage`)
    expect(usage.every((u) => u.feature === 'workout_adjust')).toBe(true)
  })

  it('reduções em exercício com RPE alto passam; ids/campos desconhecidos e from errado são descartados', async () => {
    const { db, s, a } = await withHistory()
    const r = await suggest(db, [
      adj(a.id, 'loadKg', 40, 36),
      adj('nao-existe', 'loadKg', 20, 21),
      adj(s.id, 'cadencia', 1, 2),
      adj(s.id, 'loadKg', 25, 26), // from ≠ atual
      adj(s.id, 'restS', 60, 50), // reduzir descanso > 10 %
      adj(s.id, 'restS', 60, 90), // mais descanso: livre
    ])
    expect(r.changes.map((c) => [c.field, c.to])).toEqual([['loadKg', 36], ['restS', 90]])
  })

  it('menos de 2 sessões ou pouco descanso: nenhum aumento', async () => {
    const db = await setup()
    await createPlan(db, { name: 'P', origin: 'manual', items: [{ weekday: 1, exercise: sup, sets: 3, reps: 10, loadKg: 20 }] })
    const [s] = await getPlanDay(db, 1)
    const sid = await startSession(db, { now: at('2026-11-19') })
    await logSet(db, sid, { exerciseId: s.exercise.id, setNo: 1, reps: 10, loadKg: 20, rpe: 5 })
    await finishSession(db, sid, { durationMin: 30, rpe: 5 }, at('2026-11-19'))
    expect((await suggest(db, [adj(s.id, 'loadKg', 20, 22)])).changes).toEqual([])
    // duas sessões em dias seguidos: restDaysAvg = 0
    const sid2 = await startSession(db, { now: at('2026-11-20') })
    await logSet(db, sid2, { exerciseId: s.exercise.id, setNo: 1, reps: 10, loadKg: 20, rpe: 5 })
    await finishSession(db, sid2, { durationMin: 30, rpe: 5 }, at('2026-11-20'))
    const r = await suggest(db, [adj(s.id, 'loadKg', 20, 22), adj(s.id, 'loadKg', 20, 18)])
    expect(r.changes.map((c) => c.to)).toEqual([18])
  })

  it('applyAdjustments cria plano novo ativo; o antigo continua no banco', async () => {
    const { db, s } = await withHistory()
    const before = await getActivePlan(db)
    const id = await applyAdjustments(db, [adj(s.id, 'loadKg', 20, 22) as never], now)
    const after = await getActivePlan(db)
    expect(after?.id).toBe(id)
    expect(after?.id).not.toBe(before?.id)
    expect(after?.name).toBe('Plano A (ajustado 22/11)')
    expect(after?.origin).toBe('ia')
    expect(after?.items.map((i) => i.loadKg)).toEqual([22, 40])
    const plans = await db.query<{ id: string; active: boolean }>(`select id, active from workout_plans order by created_at`)
    expect(plans).toHaveLength(2)
    expect(plans.filter((p) => p.active)).toHaveLength(1)
    await expect(applyAdjustments(db, [adj(s.id, 'loadKg', 20, 30) as never], now)).rejects.toBeInstanceOf(ValidationError)
  })
})
