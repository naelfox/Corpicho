import { describe, it, expect } from 'vitest'
import { createTestDb } from '@/test/db'
import { ValidationError } from '@/lib/validate'
import { withTx } from '@/lib/db'
import type { Profile } from '@/lib/profile'
import {
  REGIONS, addComposition, compositionHistory, addMeasurement, addWeight, bmi, currentComposition, deleteRecord, latestByRegion,
  navyBodyFat, regionHistory, weightHistory,
} from '@/lib/body'

const profile: Profile = {
  birthDate: '1990-01-01', sex: 'm', heightCm: 178, activityLevel: 1.4, fitness: 'medio', experience: 'iniciante',
  daysPerWeek: 3, minutesPerSession: 45, equipment: [], restrictions: '',
}
const d = (s: string) => new Date(s)

describe('corpo', () => {
  it('12 regiões com rótulos', () => {
    expect(REGIONS).toHaveLength(12)
    expect(REGIONS.find((r) => r.id === 'braco_d')?.label).toBe('Braço direito')
    expect(REGIONS.find((r) => r.id === 'abdomen')?.label).toBe('Abdômen')
  })

  it('latestByRegion com delta e regionHistory', async () => {
    const db = await createTestDb()
    await addMeasurement(db, 'cintura', 95, d('2026-11-01T12:00:00Z'))
    await addMeasurement(db, 'cintura', 93, d('2026-11-15T12:00:00Z'))
    const l = await latestByRegion(db)
    expect(l.cintura).toEqual({ cm: 93, at: '2026-11-15T12:00:00.000Z', delta: -2 })
    expect(l.pescoco).toBeUndefined()
    const h = await regionHistory(db, 'cintura')
    expect(h.map((x) => x.cm)).toEqual([93, 95])
  })

  it('weightHistory do mais recente ao mais antigo; apagar um peso errado', async () => {
    const db = await createTestDb()
    await addWeight(db, 82.4, d('2026-11-01T12:00:00Z'))
    await addWeight(db, 28, d('2026-11-15T12:00:00Z'))
    const h = await weightHistory(db)
    expect(h.map((x) => [x.kg, x.at])).toEqual([
      [28, '2026-11-15T12:00:00.000Z'],
      [82.4, '2026-11-01T12:00:00.000Z'],
    ])
    await deleteRecord(db, 'weights', h[0].id)
    expect((await weightHistory(db)).map((x) => x.kg)).toEqual([82.4])
  })

  it('primeira medida tem delta null', async () => {
    const db = await createTestDb()
    await addMeasurement(db, 'quadril', 100)
    expect((await latestByRegion(db)).quadril?.delta).toBeNull()
  })

  it('valida faixas', async () => {
    const db = await createTestDb()
    await expect(addWeight(db, 10)).rejects.toThrow(ValidationError)
    await expect(addWeight(db, 401)).rejects.toThrow(ValidationError)
    await expect(addMeasurement(db, 'cintura', 4)).rejects.toThrow(ValidationError)
    await expect(addMeasurement(db, 'cintura', 301)).rejects.toThrow(ValidationError)
    await expect(addComposition(db, { metric: 'water_pct', value: 101, source: 'measured', method: 'bioimpedância' })).rejects.toThrow(ValidationError)
    await expect(addComposition(db, { metric: 'muscle_kg', value: -1, source: 'measured', method: 'x' })).rejects.toThrow(ValidationError)
  })

  it('composição measured exige method', async () => {
    const db = await createTestDb()
    await expect(addComposition(db, { metric: 'body_fat_pct', value: 20, source: 'measured' })).rejects.toThrow(ValidationError)
  })

  it('deleteRecord apaga', async () => {
    const db = await createTestDb()
    await addMeasurement(db, 'cintura', 90)
    const [h] = await regionHistory(db, 'cintura')
    await deleteRecord(db, 'body_measurements', h.id)
    expect(await regionHistory(db, 'cintura')).toEqual([])
  })

  it('bmi e navyBodyFat', () => {
    expect(bmi(90, 178)).toBe(28.4)
    expect(Math.abs(navyBodyFat({ sex: 'm', heightCm: 178, neckCm: 40, waistCm: 95 })! - 28.8)).toBeLessThanOrEqual(0.1)
    expect(navyBodyFat({ sex: 'f', heightCm: 165, neckCm: 33, waistCm: 80 })).toBeNull()
    expect(navyBodyFat({ sex: 'm', heightCm: 178, neckCm: 40, waistCm: 40 })).toBeNull()
    expect(navyBodyFat({ sex: 'f', heightCm: 165, neckCm: 33, waistCm: 80, hipCm: 100 })).not.toBeNull()
  })

  it('currentComposition: IMC calculado, peso medido, gordura estimada', async () => {
    const db = await createTestDb()
    await addWeight(db, 90, d('2026-11-20T12:00:00Z'))
    await addMeasurement(db, 'pescoco', 40, d('2026-11-20T12:00:00Z'))
    await addMeasurement(db, 'cintura', 95, d('2026-11-20T12:00:00Z'))
    const c = await currentComposition(db, profile)
    const by = Object.fromEntries(c.map((x) => [x.metric, x]))
    expect(by.bmi).toMatchObject({ value: 28.4, source: 'calculated', method: 'peso e altura' })
    expect(by.weight_kg).toMatchObject({ value: 90, source: 'measured', method: 'balança' })
    expect(by.body_fat_pct).toMatchObject({ value: 28.8, source: 'estimated', method: 'fórmula da Marinha' })
  })

  it('gordura medida mais recente vence a estimada; mais antiga perde', async () => {
    const db = await createTestDb()
    await addMeasurement(db, 'pescoco', 40, d('2026-11-20T12:00:00Z'))
    await addMeasurement(db, 'cintura', 95, d('2026-11-20T12:00:00Z'))
    await addComposition(db, { metric: 'body_fat_pct', value: 25, source: 'measured', method: 'bioimpedância', at: d('2026-11-21T12:00:00Z') })
    let c = await currentComposition(db, profile)
    expect(c.filter((x) => x.metric === 'body_fat_pct')).toEqual([
      { metric: 'body_fat_pct', value: 25, source: 'measured', method: 'bioimpedância', at: '2026-11-21T12:00:00.000Z' },
    ])
    await addMeasurement(db, 'cintura', 90, d('2026-11-22T12:00:00Z'))
    c = await currentComposition(db, profile)
    const fat = c.filter((x) => x.metric === 'body_fat_pct')
    expect(fat).toHaveLength(1)
    expect(fat[0].source).toBe('estimated')
  })

  it('gordura medida com o mesmo instante da medição vence a estimada', async () => {
    const db = await createTestDb()
    await addMeasurement(db, 'pescoco', 40, d('2026-11-20T12:00:00Z'))
    await addMeasurement(db, 'cintura', 95, d('2026-11-20T12:00:00Z'))
    await addComposition(db, { metric: 'body_fat_pct', value: 25, source: 'measured', method: 'bioimpedância', at: d('2026-11-20T12:00:00Z') })
    const fat = (await currentComposition(db, profile)).filter((x) => x.metric === 'body_fat_pct')
    expect(fat).toHaveLength(1)
    expect(fat[0]).toMatchObject({ value: 25, source: 'measured' })
  })

  it('sem peso não há IMC', async () => {
    const db = await createTestDb()
    expect((await currentComposition(db, profile)).find((x) => x.metric === 'bmi')).toBeUndefined()
  })
})

describe('withTx concorrente', () => {
  it('serializa: a falha da primeira não afeta a segunda', async () => {
    const db = await createTestDb()
    const a = withTx(db, async () => {
      await db.query(`insert into weights (measured_at, kg) values (now(), 80)`)
      await new Promise((r) => setTimeout(r, 20))
      throw new Error('falha')
    })
    const b = withTx(db, async () => {
      await db.query(`insert into weights (measured_at, kg) values (now(), 85)`)
    })
    await expect(a).rejects.toThrow('falha')
    await b
    const rows = await db.query<{ kg: string }>(`select kg from weights`)
    expect(rows.map((r) => Number(r.kg))).toEqual([85])
  })

  it('preserva o erro original se o rollback falhar', async () => {
    const db = {
      query: async (t: string) => {
        if (t === 'rollback') throw new Error('rollback ruim')
        return []
      },
    }
    await expect(withTx(db as never, async () => { throw new Error('original') })).rejects.toThrow('original')
  })

  it('compositionHistory lista os registros com id, do mais recente, e apagar remove', async () => {
    const db = await createTestDb()
    await addComposition(db, { metric: 'body_fat_pct', value: '24,5', source: 'measured', method: 'Adipômetro', at: d('2026-11-01T12:00:00Z') })
    await addComposition(db, { metric: 'muscle_kg', value: 35, source: 'measured', method: 'DEXA', at: d('2026-11-10T12:00:00Z') })
    const h = await compositionHistory(db)
    expect(h.map((x) => [x.metric, x.value, x.unit, x.method])).toEqual([
      ['muscle_kg', 35, 'kg', 'DEXA'],
      ['body_fat_pct', 24.5, '%', 'Adipômetro'],
    ])
    await deleteRecord(db, 'body_composition', h[0].id)
    expect((await compositionHistory(db)).map((x) => x.metric)).toEqual(['body_fat_pct'])
  })
})
