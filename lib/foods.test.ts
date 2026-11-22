import { describe, it, expect } from 'vitest'
import { createTestDb } from '@/test/db'
import { ValidationError } from '@/lib/validate'
import { createFood, searchFoods, seedTaco, touchFood } from '@/lib/foods'

describe('foods', () => {
  it('seedTaco é idempotente', async () => {
    const db = await createTestDb()
    const n = await seedTaco(db)
    expect(n).toBeGreaterThan(500)
    expect(await seedTaco(db)).toBe(0)
    const [{ c }] = await db.query<{ c: string }>(`select count(*) c from foods`)
    expect(Number(c)).toBe(n)
  })

  it('busca sem acento/maiúsculas e por todas as palavras', async () => {
    const db = await createTestDb()
    await seedTaco(db)
    expect((await searchFoods(db, 'arroz')).map((f) => f.name)).toContain('Arroz, integral, cozido')
    const fe = await searchFoods(db, 'FEIJAO')
    expect(fe.length).toBeGreaterThan(0)
    expect(fe.every((f) => /feij/i.test(f.name))).toBe(true)
    expect((await searchFoods(db, 'arroz cozido')).map((f) => f.name)).toContain('Arroz, integral, cozido')
    const f = fe[0]
    expect(f.kcal100).toBeGreaterThan(0)
  })

  it('touchFood coloca o alimento primeiro; q vazio lista recentes', async () => {
    const db = await createTestDb()
    await seedTaco(db)
    const [, second] = await searchFoods(db, 'arroz')
    await touchFood(db, second.id)
    expect((await searchFoods(db, ''))[0].id).toBe(second.id)
    expect((await searchFoods(db, 'arroz'))[0].id).toBe(second.id)
  })

  it('createFood não duplica nome repetido e atualiza', async () => {
    const db = await createTestDb()
    const a = await createFood(db, { name: 'Bolo da vó', origin: 'usuario', kcal100: 300, protein100: 5, carbs100: 50, fat100: 10 })
    const b = await createFood(db, { name: 'bolo da vó', origin: 'usuario', kcal100: 320, protein100: 5, carbs100: 50, fat100: 10 })
    expect(b.id).toBe(a.id)
    expect(b.kcal100).toBe(320)
    const [{ c }] = await db.query<{ c: string }>(`select count(*) c from foods`)
    expect(Number(c)).toBe(1)
    expect((await searchFoods(db, 'avo')).length).toBe(0)
    expect((await searchFoods(db, 'vo bolo')).length).toBe(1)
  })

  it('createFood valida', async () => {
    const db = await createTestDb()
    const ok = { name: 'X', origin: 'usuario' as const, kcal100: 100, protein100: 1, carbs100: 1, fat100: 1 }
    await expect(createFood(db, { ...ok, name: '  ' })).rejects.toBeInstanceOf(ValidationError)
    await expect(createFood(db, { ...ok, name: 'a'.repeat(121) })).rejects.toBeInstanceOf(ValidationError)
    await expect(createFood(db, { ...ok, kcal100: 901 })).rejects.toBeInstanceOf(ValidationError)
    await expect(createFood(db, { ...ok, fat100: -1 })).rejects.toBeInstanceOf(ValidationError)
  })
})
