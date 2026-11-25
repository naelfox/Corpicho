import { describe, it, expect } from 'vitest'
import { createTestDb } from '@/test/db'
import { ValidationError } from '@/lib/validate'
import { bestFoodMatch, createFood, deleteMyFood, listMyFoods, searchFoods, seedTaco, touchFood } from '@/lib/foods'

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
    await expect(createFood(db, { ...ok, protein100: 101 })).rejects.toBeInstanceOf(ValidationError)
    await expect(createFood(db, { ...ok, carbs100: 101 })).rejects.toBeInstanceOf(ValidationError)
    await expect(createFood(db, { ...ok, fat100: 101 })).rejects.toBeInstanceOf(ValidationError)
  })

  it('bestFoodMatch escolhe o alimento certo da TACO (foto do prato)', async () => {
    const db = await createTestDb()
    await seedTaco(db)
    const name = async (q: string) => (await bestFoodMatch(db, q))?.name ?? null
    expect(await name('arroz branco cozido')).toBe('Arroz, tipo 1, cozido')
    expect(await name('arroz cozido')).toBe('Arroz, tipo 1, cozido')
    expect(await name('arroz tipo 1 cozido')).toBe('Arroz, tipo 1, cozido')
    expect(await name('arroz integral cozido')).toBe('Arroz, integral, cozido')
    expect(await name('ovo cozido')).toMatch(/^Ovo, de galinha, inteiro, cozido/)
    expect(await name('ovo galinha cozido')).toMatch(/^Ovo, de galinha, inteiro, cozido/)
    expect(await name('ovo frito')).toBe('Ovo, de galinha, inteiro, frito')
    expect(await name('pao frances')).toBe('Pão, trigo, francês')
    expect(await name('pao trigo frances')).toBe('Pão, trigo, francês')
    expect(await name('feijao carioca cozido')).toBe('Feijão, carioca, cozido')
    // A TACO não tem leite de vaca líquido: melhor ficar sem casar do que pegar canjica/leite em pó.
    const leite = await name('leite')
    expect(leite === null || leite.startsWith('Leite, de vaca, integral')).toBe(true)
    expect(await name('pao')).not.toBe('Fruta-pão, crua')
    expect(await name('zzzxxx')).toBeNull()
    expect(await name('   ')).toBeNull()
  })

  it('bestFoodMatch ignora a ordem de usados recentemente', async () => {
    const db = await createTestDb()
    await seedTaco(db)
    const [integral] = await searchFoods(db, 'arroz integral cozido', 1)
    await touchFood(db, integral.id)
    expect((await bestFoodMatch(db, 'arroz cozido'))?.name).toBe('Arroz, tipo 1, cozido')
  })
})

describe('meus alimentos', () => {
  const base = { origin: 'usuario' as const, kcal100: 400, protein100: 5, carbs100: 70, fat100: 10 }

  it('guarda a porção, aparece primeiro na busca e corrigir sem porção mantém a antiga', async () => {
    const db = await createTestDb()
    await seedTaco(db)
    const f = await createFood(db, { ...base, name: 'Biscoito maizena', portion: { label: '6 biscoitos', grams: 30 } })
    expect(f.portion).toEqual({ label: '6 biscoitos', grams: 30 })
    expect((await searchFoods(db, 'biscoito'))[0].id).toBe(f.id)
    const again = await createFood(db, { ...base, name: 'biscoito maizena', kcal100: 410 })
    expect(again).toMatchObject({ id: f.id, kcal100: 410, portion: { label: '6 biscoitos', grams: 30 } })
    expect((await listMyFoods(db)).map((x) => x.name)).toEqual(['Biscoito maizena'])
    expect((await createFood(db, { ...base, name: 'Biscoito maizena', portion: null })).portion).toBeNull()
    await expect(createFood(db, { ...base, name: 'X', portion: { label: '', grams: 30 } })).rejects.toThrow(ValidationError)
  })

  it('apagar solta as refeições antigas e não toca na TACO', async () => {
    const db = await createTestDb()
    await seedTaco(db)
    const f = await createFood(db, { ...base, name: 'Granola caseira' })
    const [meal] = await db.query<{ id: string }>(`insert into meals (day, type) values ('2026-11-24', 'cafe') returning id`)
    await db.query(
      `insert into meal_items (meal_id, food_id, name, grams, kcal, protein_g, carbs_g, fat_g, source) values ($1, $2, 'Granola caseira', 40, 160, 2, 28, 4, 'manual')`,
      [meal.id, f.id],
    )
    await deleteMyFood(db, f.id)
    expect(await listMyFoods(db)).toEqual([])
    expect(await db.query(`select food_id, kcal from meal_items`)).toEqual([{ food_id: null, kcal: '160' }])
    const taco = (await searchFoods(db, 'arroz', 1))[0]
    await deleteMyFood(db, taco.id)
    expect((await searchFoods(db, 'arroz', 1))[0].id).toBe(taco.id)
  })
})
