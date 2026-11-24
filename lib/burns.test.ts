import { describe, it, expect } from 'vitest'
import { createTestDb } from '@/test/db'
import { ValidationError } from '@/lib/validate'
import { DEFAULT_BURN_GOAL, addBurn, burnSummary, deleteBurn, getBurnGoal, listBurns, setBurnGoal } from '@/lib/burns'

// domingo 22/11/2026, meio da tarde em São Paulo
const now = new Date('2026-11-22T15:00:00Z')

describe('gasto calórico', () => {
  it('meta padrão e meta salva', async () => {
    const db = await createTestDb()
    expect(await getBurnGoal(db)).toBe(DEFAULT_BURN_GOAL)
    await setBurnGoal(db, 450)
    await setBurnGoal(db, 500)
    expect(await getBurnGoal(db)).toBe(500)
    await expect(setBurnGoal(db, 10)).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejeita gasto fora de 1–5000', async () => {
    const db = await createTestDb()
    await expect(addBurn(db, { day: '2026-11-22', kcal: 0 })).rejects.toBeInstanceOf(ValidationError)
    await expect(addBurn(db, { day: '2026-11-22', kcal: 6000 })).rejects.toBeInstanceOf(ValidationError)
  })

  it('soma por dia, preenche dias vazios, média e dias que bateram a meta', async () => {
    const db = await createTestDb()
    await setBurnGoal(db, 300)
    await addBurn(db, { day: '2026-11-22', kcal: 200, label: 'Caminhada' })
    await addBurn(db, { day: '2026-11-22', kcal: 150, label: 'Academia' })
    await addBurn(db, { day: '2026-11-20', kcal: 300 })
    await addBurn(db, { day: '2026-11-18', kcal: 100 })
    await addBurn(db, { day: '2026-11-10', kcal: 999 }) // fora dos 7 dias
    const s = await burnSummary(db, 7, now)
    expect(s.days.map((d) => d.day)).toEqual([
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22',
    ])
    expect(s.days.map((d) => d.kcal)).toEqual([0, 0, 100, 0, 300, 0, 350])
    expect(s).toMatchObject({ goal: 300, today: 350, total: 750, average: 107, daysHit: 2 })
  })

  it('lista do mais recente e apaga', async () => {
    const db = await createTestDb()
    const a = await addBurn(db, { day: '2026-11-20', kcal: 300, label: '  Bike  ' })
    await addBurn(db, { day: '2026-11-22', kcal: 200 })
    const l = await listBurns(db)
    expect(l.map((b) => [b.day, b.kcal, b.label])).toEqual([
      ['2026-11-22', 200, ''],
      ['2026-11-20', 300, 'Bike'],
    ])
    await deleteBurn(db, a)
    expect(await listBurns(db)).toHaveLength(1)
  })
})
