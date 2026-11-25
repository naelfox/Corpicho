import { describe, it, expect } from 'vitest'
import { createTestDb } from '@/test/db'
import { ValidationError } from '@/lib/validate'
import { saveGoal, saveProfile } from '@/lib/profile'
import { addBurn } from '@/lib/burns'
import { addWeight } from '@/lib/body'
import { addMeal } from '@/lib/meals'
import { getDashboard } from '@/lib/dashboard'

// domingo 22/11/2026 (semana: seg 16/11 a dom 22/11)
const now = new Date('2026-11-22T15:00:00Z')
const goal = { startWeightKg: 100, targetWeightKg: 80, kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 }

describe('dashboard', () => {
  it('sem meta: erro', async () => {
    const db = await createTestDb()
    await expect(getDashboard(db, now)).rejects.toBeInstanceOf(ValidationError)
  })

  it('progresso de peso: 95 -> 25%, 105 -> 0, sem peso -> null', async () => {
    const db = await createTestDb()
    await saveGoal(db, goal)
    expect((await getDashboard(db, now)).weight).toEqual({ current: null, target: 80, start: 100, progressPct: 0 })
    await addWeight(db, 95, new Date('2026-11-20T12:00:00Z'))
    expect((await getDashboard(db, now)).weight).toMatchObject({ current: 95, progressPct: 25 })
    await addWeight(db, 105, new Date('2026-11-21T12:00:00Z'))
    expect((await getDashboard(db, now)).weight.progressPct).toBe(0)
    await addWeight(db, 70, new Date('2026-11-22T12:00:00Z'))
    expect((await getDashboard(db, now)).weight.progressPct).toBe(100)
  })

  it('start === target: 0%', async () => {
    const db = await createTestDb()
    await saveGoal(db, { ...goal, startWeightKg: 80 })
    await addWeight(db, 80, now)
    expect((await getDashboard(db, now)).weight.progressPct).toBe(0)
  })

  it('consumo de hoje e kcal restantes (pode ser negativo)', async () => {
    const db = await createTestDb()
    await saveGoal(db, goal)
    await addMeal(db, { type: 'almoco', source: 'manual', now, items: [{ name: 'X', grams: 300, per100: { kcal100: 500, protein100: 10, carbs100: 20, fat100: 5 } }] })
    const d = await getDashboard(db, now)
    expect(d.today.kcal).toBe(1500)
    expect(d.targets).toEqual({ kcal: 2000, protein: 150, carbs: 200, fat: 60 })
    expect(d.remainingKcal).toBe(500)
    await addMeal(db, { type: 'jantar', source: 'manual', now, items: [{ name: 'Y', grams: 100, per100: { kcal100: 700, protein100: 0, carbs100: 0, fat100: 0 } }] })
    expect((await getDashboard(db, now)).remainingKcal).toBe(-200)
  })

  it('treinos da semana (seg-dom, só finalizados)', async () => {
    const db = await createTestDb()
    await saveGoal(db, goal)
    const ins = (day: string, fin: boolean) =>
      db.query(`insert into workout_sessions (day, finished_at) values ($1, $2)`, [day, fin ? `${day}T12:00:00Z` : null])
    await ins('2026-11-15', true) // domingo anterior: fora
    await ins('2026-11-16', true)
    await ins('2026-11-22', true)
    await ins('2026-11-20', false) // não finalizado
    expect((await getDashboard(db, now)).workoutsThisWeek).toBe(2)
    // quarta: semana é a mesma
    expect((await getDashboard(db, new Date('2026-11-18T15:00:00Z'))).workoutsThisWeek).toBe(2)
  })

  it('série de peso 30d e resumo', async () => {
    const db = await createTestDb()
    await saveGoal(db, goal)
    await addWeight(db, 96, new Date('2026-11-01T12:00:00Z'))
    await addWeight(db, 95, new Date('2026-11-20T12:00:00Z'))
    const d = await getDashboard(db, now)
    expect(d.weightSeries).toHaveLength(2)
    expect(d.summary).toEqual([{ metric: 'peso', delta: -1, unit: 'kg' }])
  })

  it('consumido × gasto: basal × 1,2 + anotado; dia sem refeição = null', async () => {
    const db = await createTestDb()
    await saveGoal(db, goal)
    expect((await getDashboard(db, now)).energy.base).toBeNull()
    await saveProfile(db, {
      birthDate: '1996-11-22', sex: 'm', heightCm: 180, activityLevel: 1.55, fitness: 'medio',
      experience: 'iniciante', daysPerWeek: 3, minutesPerSession: 60, equipment: [], restrictions: '',
    })
    await addWeight(db, 90, new Date('2026-11-20T12:00:00Z'))
    await addBurn(db, { day: '2026-11-22', kcal: 300 })
    await addMeal(db, { type: 'almoco', source: 'manual', now, items: [{ name: 'X', grams: 300, per100: { kcal100: 600, protein100: 0, carbs100: 0, fat100: 0 } }] })
    const { energy } = await getDashboard(db, now)
    // 10·90 + 6,25·180 − 5·30 + 5 = 1880 → ×1,2 = 2256
    expect(energy.base).toBe(2256)
    expect(energy.days).toHaveLength(14)
    expect(energy.days[13]).toEqual({ day: '2026-11-22', eaten: 1800, spent: 2556 })
    expect(energy.days[12]).toEqual({ day: '2026-11-21', eaten: null, spent: 2256 })
  })
})
