import { describe, it, expect } from 'vitest'
import { createTestDb } from '@/test/db'
import { addComposition, addMeasurement, addWeight } from '@/lib/body'
import { PERIODS, evolutionSummary, getSeries } from '@/lib/series'

const now = new Date('2026-11-22T15:00:00Z')
const ago = (n: number) => new Date(now.getTime() - n * 86400000)

describe('séries', () => {
  it('períodos com rótulos', () => {
    expect(PERIODS.map((p) => p.label)).toEqual(['7 dias', '30 dias', '3 meses', '6 meses', '1 ano', 'Tudo'])
  })

  it('peso: 30d tem 2 pontos, tudo tem 3', async () => {
    const db = await createTestDb()
    await addWeight(db, 90, ago(40))
    await addWeight(db, 88, ago(10))
    await addWeight(db, 86.5, ago(1))
    const s = await getSeries(db, 'peso', '30d', now)
    expect(s.points.map((p) => p.value)).toEqual([88, 86.5])
    expect(s).toMatchObject({ first: 88, last: 86.5, delta: -1.5, unit: 'kg' })
    const all = await getSeries(db, 'peso', 'tudo', now)
    expect(all.points).toHaveLength(3)
    expect(all.delta).toBe(-3.5)
  })

  it('sem dados e ponto único', async () => {
    const db = await createTestDb()
    expect(await getSeries(db, 'cintura', '30d', now)).toEqual({ points: [], first: null, last: null, delta: null, unit: 'cm' })
    await addWeight(db, 80, ago(2))
    const s = await getSeries(db, 'peso', '7d', now)
    expect(s).toMatchObject({ first: 80, last: 80, delta: null })
  })

  it('bracos: média D/E no mesmo dia; só um lado usa o que houver', async () => {
    const db = await createTestDb()
    await addMeasurement(db, 'braco_d', 35, ago(3))
    await addMeasurement(db, 'braco_e', 34, ago(3))
    await addMeasurement(db, 'braco_d', 36, ago(1))
    const s = await getSeries(db, 'bracos', '30d', now)
    expect(s.points.map((p) => p.value)).toEqual([34.5, 36])
    expect(s.delta).toBe(1.5)
  })

  it('gordura traz source em cada ponto', async () => {
    const db = await createTestDb()
    await addComposition(db, { metric: 'body_fat_pct', value: 25, source: 'measured', method: 'balança', at: ago(5) })
    await addComposition(db, { metric: 'body_fat_pct', value: 24, source: 'calculated', at: ago(1) })
    await addComposition(db, { metric: 'muscle_kg', value: 40, source: 'measured', method: 'balança', at: ago(1) })
    const s = await getSeries(db, 'gordura', '30d', now)
    expect(s.points.map((p) => p.source)).toEqual(['measured', 'calculated'])
    expect(s.unit).toBe('%')
    expect((await getSeries(db, 'musculo', '30d', now)).points).toHaveLength(1)
  })

  it('evolutionSummary: só métricas com 2+ pontos em 30 dias', async () => {
    const db = await createTestDb()
    await addWeight(db, 90, ago(20))
    await addWeight(db, 88, ago(1))
    await addMeasurement(db, 'cintura', 90, ago(1))
    expect(await evolutionSummary(db, now)).toEqual([{ metric: 'peso', delta: -2, unit: 'kg' }])
  })
})
