import { describe, it, expect } from 'vitest'
import { createTestDb } from '@/test/db'
import { ValidationError } from '@/lib/validate'
import { createFood } from '@/lib/foods'
import {
  addMeal, dailyTotals, deleteMeal, deleteMealItem, getDayMeals, getDayTotals, getHistory, repeatMeal, MEAL_LABEL, mealTypeAt,
} from '@/lib/meals'

const arroz = { kcal100: 128, protein100: 2.5, carbs100: 26.2, fat100: 0.2 }
const now = new Date('2026-11-22T15:00:00Z')

describe('refeições', () => {
  it('mealTypeAt usa a hora de São Paulo', () => {
    const at = (h: string) => mealTypeAt(new Date(`2026-11-22T${h}:00-03:00`))
    expect(at('00:00')).toBe('cafe')
    expect(at('09:59')).toBe('cafe')
    expect(at('10:00')).toBe('almoco')
    expect(at('14:59')).toBe('almoco')
    expect(at('15:00')).toBe('lanche')
    expect(at('18:00')).toBe('jantar')
    expect(at('21:59')).toBe('jantar')
    expect(at('22:00')).toBe('outras')
    expect(at('23:30')).toBe('outras')
  })

  it('rótulos', () => {
    expect(MEAL_LABEL.cafe).toBe('Café da manhã')
    expect(MEAL_LABEL.almoco).toBe('Almoço')
  })

  it('addMeal calcula e grava macros; vira alimento do usuário', async () => {
    const db = await createTestDb()
    const id = await addMeal(db, { type: 'almoco', source: 'manual', now, items: [{ name: 'Arroz', grams: 150, per100: arroz }] })
    const [m] = await getDayMeals(db, '2026-11-22')
    expect(m.id).toBe(id)
    expect(m.day).toBe('2026-11-22')
    expect(m.items[0].kcal).toBe(192)
    expect(m.items[0].foodId).not.toBeNull()
    expect(m.totals.kcal).toBe(192)
    const foods = await db.query<{ origin: string }>(`select origin from foods where name = 'Arroz'`)
    expect(foods).toEqual([{ origin: 'usuario' }])
  })

  it('item com foodId usa o alimento existente e item com macros fica sem food_id', async () => {
    const db = await createTestDb()
    const f = await createFood(db, { name: 'Ovo', origin: 'usuario', kcal100: 150, protein100: 13, carbs100: 1, fat100: 10 })
    await addMeal(db, {
      type: 'cafe', source: 'manual', now,
      items: [
        { foodId: f.id, name: 'Ovo', grams: 100, per100: f },
        { name: 'Bolo', grams: 80, macros: { kcal: 300, protein: 4, carbs: 50, fat: 9 } },
      ],
    })
    const [m] = await getDayMeals(db, '2026-11-22')
    expect(m.items.find((i) => i.name === 'Bolo')!.foodId).toBeNull()
    expect(m.items.find((i) => i.name === 'Ovo')!.foodId).toBe(f.id)
    const [{ n }] = await db.query<{ n: string }>(`select count(*) as n from foods`)
    expect(Number(n)).toBe(1)
    const [{ t }] = await db.query<{ t: boolean }>(`select last_used_at is not null as t from foods where id = $1`, [f.id])
    expect(t).toBe(true)
  })

  it('getDayTotals soma dois itens', async () => {
    const db = await createTestDb()
    await addMeal(db, {
      type: 'almoco', source: 'manual', now,
      items: [
        { name: 'Arroz', grams: 150, per100: arroz },
        { name: 'Bolo', grams: 80, macros: { kcal: 300, protein: 4, carbs: 50, fat: 9 } },
      ],
    })
    expect(await getDayTotals(db, '2026-11-22')).toEqual({ kcal: 492, protein: 7.8, carbs: 89.3, fat: 9.3 })
    expect(await getDayTotals(db, '2026-11-21')).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  })

  it('usa o dia de São Paulo', async () => {
    const db = await createTestDb()
    await addMeal(db, { type: 'jantar', source: 'manual', now: new Date('2026-11-23T02:50:00Z'), items: [{ name: 'Arroz', grams: 100, per100: arroz }] })
    expect(await getDayMeals(db, '2026-11-22')).toHaveLength(1)
    expect(await getDayMeals(db, '2026-11-23')).toHaveLength(0)
  })

  it('ordena por tipo e depois por criação', async () => {
    const db = await createTestDb()
    const it1 = [{ name: 'Arroz', grams: 100, per100: arroz }]
    await addMeal(db, { type: 'jantar', source: 'manual', now, items: it1 })
    await addMeal(db, { type: 'cafe', source: 'manual', now, items: it1 })
    await addMeal(db, { type: 'outras', source: 'manual', now, items: it1 })
    await addMeal(db, { type: 'almoco', source: 'manual', now, items: it1 })
    expect((await getDayMeals(db, '2026-11-22')).map((m) => m.type)).toEqual(['cafe', 'almoco', 'jantar', 'outras'])
  })

  it('valida e não salva nada em caso de erro', async () => {
    const db = await createTestDb()
    await expect(addMeal(db, { type: 'cafe', source: 'manual', now, items: [] })).rejects.toBeInstanceOf(ValidationError)
    await expect(
      addMeal(db, {
        type: 'cafe', source: 'manual', now,
        items: [{ name: 'Arroz', grams: 100, per100: arroz }, { name: 'Ruim', grams: 0, per100: arroz }],
      }),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      addMeal(db, { type: 'cafe', source: 'manual', now, items: [{ name: '', grams: 10, per100: arroz }] }),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      addMeal(db, { type: 'cafe', source: 'manual', now, items: [{ name: 'X', grams: 5001, per100: arroz }] }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(await db.query('select 1 from meals')).toHaveLength(0)
    expect(await db.query(`select 1 from foods`)).toHaveLength(0)
  })

  it('mudar o alimento depois não altera o item salvo', async () => {
    const db = await createTestDb()
    await addMeal(db, { type: 'almoco', source: 'manual', now, items: [{ name: 'Arroz', grams: 150, per100: arroz }] })
    await db.query(`update foods set kcal_100 = 500`)
    expect((await getDayMeals(db, '2026-11-22'))[0].items[0].kcal).toBe(192)
  })

  it('repeatMeal copia para hoje sem mexer na original', async () => {
    const db = await createTestDb()
    const id = await addMeal(db, {
      type: 'almoco', source: 'ia_confirmada', now: new Date('2026-11-20T15:00:00Z'),
      items: [{ name: 'Arroz', grams: 150, per100: arroz }],
    })
    await db.query(`update foods set kcal_100 = 500`)
    const copy = await repeatMeal(db, id, 'jantar', now)
    expect(copy).not.toBe(id)
    const old = (await getDayMeals(db, '2026-11-20'))[0]
    expect(old.items).toHaveLength(1)
    expect(old.type).toBe('almoco')
    const [n] = await getDayMeals(db, '2026-11-22')
    expect(n.type).toBe('jantar')
    expect(n.items[0]).toMatchObject({ name: 'Arroz', grams: 150, kcal: 192, source: 'manual' })
    expect(old.items[0].source).toBe('ia_confirmada')
    await expect(repeatMeal(db, '00000000-0000-0000-0000-000000000000', 'jantar', now)).rejects.toBeInstanceOf(ValidationError)
  })

  it('deleteMeal e deleteMealItem', async () => {
    const db = await createTestDb()
    const id = await addMeal(db, {
      type: 'almoco', source: 'manual', now,
      items: [{ name: 'A', grams: 100, per100: arroz }, { name: 'B', grams: 100, per100: arroz }],
    })
    const [m] = await getDayMeals(db, '2026-11-22')
    await deleteMealItem(db, m.items[0].id)
    expect((await getDayMeals(db, '2026-11-22'))[0].items).toHaveLength(1)
    await deleteMeal(db, id)
    expect(await db.query('select 1 from meals')).toHaveLength(0)
    expect(await db.query('select 1 from meal_items')).toHaveLength(0)
  })

  it('getHistory e dailyTotals', async () => {
    const db = await createTestDb()
    for (const d of ['2026-11-18', '2026-11-20', '2026-11-22']) {
      await addMeal(db, { type: 'almoco', source: 'manual', now: new Date(`${d}T15:00:00Z`), items: [{ name: 'Arroz', grams: 100, per100: arroz }] })
    }
    const h = await getHistory(db, {})
    expect(h.map((x) => x.day)).toEqual(['2026-11-22', '2026-11-20', '2026-11-18'])
    expect(h[0].meals[0].items).toHaveLength(1)
    expect((await getHistory(db, { before: '2026-11-22', limit: 1 })).map((x) => x.day)).toEqual(['2026-11-20'])
    const t = await dailyTotals(db, '2026-11-19', '2026-11-22')
    expect(t.map((x) => x.day)).toEqual(['2026-11-20', '2026-11-22'])
    expect(t[0].totals.kcal).toBe(128)
  })

  it('item estimado pela IA vira alimento "ia" e nunca muda um alimento do usuário', async () => {
    const db = await createTestDb()
    const mine = await createFood(db, { name: 'Bolo da vó', origin: 'usuario', ...arroz })
    const per100 = { kcal100: 400, protein100: 6, carbs100: 55, fat100: 18 }
    await addMeal(db, { type: 'lanche', source: 'ia_confirmada', now, items: [{ name: 'bolo da vó', grams: 80, per100, origin: 'ia' }] })
    const rows = await db.query<{ id: string; origin: string; kcal_100: string }>(
      `select id, origin, kcal_100 from foods where lower(name) = 'bolo da vó' order by origin`,
    )
    expect(rows).toHaveLength(2)
    expect(Number(rows.find((r) => r.origin === 'usuario')!.kcal_100)).toBe(128)
    expect(Number(rows.find((r) => r.origin === 'ia')!.kcal_100)).toBe(400)
    const usuario = rows.find((r) => r.origin === 'usuario')!
    expect(usuario.id).toBe(mine.id)
    const ia = rows.find((r) => r.origin === 'ia')!
    const [m] = await getDayMeals(db, '2026-11-22')
    expect(m.items[0].foodId).toBe(ia.id)
    expect(m.items[0].kcal).toBe(320)
    // Segunda vez com o mesmo nome: não sobrescreve o "ia" existente, só liga a ele.
    await addMeal(db, { type: 'lanche', source: 'ia_confirmada', now, items: [{ name: 'Bolo da vó', grams: 50, per100: { ...per100, kcal100: 300 }, origin: 'ia' }] })
    const again = await db.query<{ id: string; kcal_100: string }>(`select id, kcal_100 from foods where origin = 'ia'`)
    expect(again).toHaveLength(1)
    expect(Number(again[0].kcal_100)).toBe(400)
    const meals = await getDayMeals(db, '2026-11-22')
    expect(meals[1].items[0].foodId).toBe(ia.id)
    expect(meals[1].items[0].kcal).toBe(150)
  })

  it('origem padrão do alimento novo é "usuario"', async () => {
    const db = await createTestDb()
    await addMeal(db, { type: 'almoco', source: 'ia_confirmada', now, items: [{ name: 'Cuscuz', grams: 100, per100: arroz }] })
    expect(await db.query(`select origin from foods where name = 'Cuscuz'`)).toEqual([{ origin: 'usuario' }])
  })
})
