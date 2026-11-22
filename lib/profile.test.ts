import { describe, it, expect } from 'vitest'
import { createTestDb } from '@/test/db'
import { ValidationError } from '@/lib/validate'
import { getGoal, getProfile, saveGoal, saveProfile, type Profile } from '@/lib/profile'

const profile: Profile = {
  birthDate: '1990-05-10',
  sex: 'm',
  heightCm: 178,
  activityLevel: 1.375,
  fitness: 'medio',
  experience: 'iniciante',
  daysPerWeek: 3,
  minutesPerSession: 45,
  equipment: ['halteres'],
  restrictions: '',
}
const goal = { startWeightKg: 90, targetWeightKg: 80, kcal: 2033, proteinG: 162, carbsG: 245, fatG: 56 }

describe('profile e meta', () => {
  it('getProfile vazio e saveProfile faz upsert', async () => {
    const db = await createTestDb()
    expect(await getProfile(db)).toBeNull()
    await saveProfile(db, profile)
    await saveProfile(db, { ...profile, heightCm: 180, equipment: [] })
    const p = await getProfile(db)
    expect(p).toEqual({ ...profile, heightCm: 180, equipment: [] })
    expect(await db.query('select 1 from profile')).toHaveLength(1)
  })
  it('saveProfile valida', async () => {
    const db = await createTestDb()
    await expect(saveProfile(db, { ...profile, heightCm: 300 })).rejects.toBeInstanceOf(ValidationError)
    await expect(saveProfile(db, { ...profile, sex: 'x' as 'm' })).rejects.toBeInstanceOf(ValidationError)
    expect(await getProfile(db)).toBeNull()
  })
  it('saveProfile rejeita datas impossíveis e futuras', async () => {
    const db = await createTestDb()
    for (const birthDate of ['2023-02-31', '2023-13-01', '2999-01-01']) {
      await expect(saveProfile(db, { ...profile, birthDate })).rejects.toBeInstanceOf(ValidationError)
    }
    expect(await getProfile(db)).toBeNull()
  })
  it('saveGoal insere sempre e getGoal devolve a mais recente', async () => {
    const db = await createTestDb()
    expect(await getGoal(db)).toBeNull()
    await saveGoal(db, goal)
    await saveGoal(db, { ...goal, kcal: 1900 })
    expect((await getGoal(db))?.kcal).toBe(1900)
    expect(await db.query('select 1 from goals')).toHaveLength(2)
    await expect(saveGoal(db, { ...goal, kcal: 100 })).rejects.toBeInstanceOf(ValidationError)
  })
})
