import { describe, expect, it } from 'vitest'
import { createTestDb } from '@/test/db'
import { saveGoal, saveProfile, type Profile } from '@/lib/profile'
import { addComposition, addMeasurement, addWeight } from '@/lib/body'
import { addMeal } from '@/lib/meals'
import { buildContext } from './context'

const now = new Date('2026-11-22T15:00:00Z')
const profile: Profile = {
  birthDate: '1990-05-10', sex: 'm', heightCm: 178, activityLevel: 1.375, fitness: 'baixo', experience: 'iniciante',
  daysPerWeek: 3, minutesPerSession: 40, equipment: ['Halteres'], restrictions: 'dor no joelho',
}
const goal = { startWeightKg: 100, targetWeightKg: 85, kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 }

describe('buildContext', () => {
  it('banco vazio: diz "sem registros" em alimentação, medidas, treino e peso', async () => {
    const db = await createTestDb()
    const c = await buildContext(db, now)
    expect(c).toContain('2026-11-22')
    expect(c).toMatch(/Alimentação 7 dias[\s\S]*sem registros/)
    expect(c).toMatch(/Alimentação 30 dias[\s\S]*sem registros/)
    expect(c).toMatch(/Peso[\s\S]*sem registros/)
    expect(c).toMatch(/Medidas[\s\S]*sem registros/)
    expect(c).toMatch(/Composição[\s\S]*sem registros/)
    expect(c).toMatch(/Treino 14 dias[\s\S]*sem registros/)
  })

  it('com refeição hoje: kcal consumidas e restantes, médias e origem da composição', async () => {
    const db = await createTestDb()
    await saveProfile(db, profile)
    await saveGoal(db, goal)
    await addMeal(db, {
      type: 'almoco', source: 'manual', now,
      items: [{ name: 'Arroz', grams: 100, macros: { kcal: 600, protein: 30, carbs: 80, fat: 10 } }],
    })
    await addWeight(db, 98, new Date('2026-11-10T12:00:00Z'))
    await addWeight(db, 96.5, now)
    await addMeasurement(db, 'cintura', 95, now)
    await addComposition(db, { metric: 'body_fat_pct', value: 28, source: 'estimated', method: 'foto', at: now })
    const c = await buildContext(db, now)
    expect(c).toContain('600 kcal')
    expect(c).toContain('1400 kcal restantes')
    expect(c).toMatch(/1 dia com registro/)
    expect(c).toContain('96,5 kg')
    expect(c).toContain('Cintura')
    expect(c).toContain('estimado')
    expect(c).toContain('dor no joelho')
    expect(c).toMatch(/domingo/i)
  })

  it('restrições do perfil são cortadas em 300 caracteres', async () => {
    const db = await createTestDb()
    await saveProfile(db, { ...profile, restrictions: 'z'.repeat(500) })
    const c = await buildContext(db, now)
    expect(c).toContain('z'.repeat(300) + '.')
    expect(c).not.toContain('z'.repeat(301))
  })
})
