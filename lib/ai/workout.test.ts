import { describe, expect, it } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { createTestDb } from '@/test/db'
import { saveGoal, saveProfile, type Profile } from '@/lib/profile'
import { addWeight } from '@/lib/body'
import { ValidationError } from '@/lib/validate'
import { createPlan, getActivePlan } from '@/lib/training'
import { estimateSeconds, generatePlan, normalizeWorkoutPlan } from './workout'

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
