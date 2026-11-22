import { withTx, type Db } from './db'
import { todayIn, type Day } from './dates'
import { createFood, touchFood } from './foods'
import { scaleFood, sumMacros, type Macros, type Per100 } from './nutrition'
import { ValidationError, parseNum } from './validate'

export type MealType = 'cafe' | 'almoco' | 'lanche' | 'jantar' | 'outras'

export const MEAL_LABEL: Record<MealType, string> = {
  cafe: 'Café da manhã',
  almoco: 'Almoço',
  lanche: 'Lanche',
  jantar: 'Jantar',
  outras: 'Outras',
}

const MEAL_TYPES = Object.keys(MEAL_LABEL) as MealType[]

export type NewItem =
  | { foodId?: string; name: string; grams: number; per100: Per100 }
  | { name: string; grams: number; macros: Macros }

export type MealSource = 'manual' | 'ia_confirmada'

export type MealItem = {
  id: string
  foodId: string | null
  name: string
  grams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  source: MealSource
}

export type MealWithItems = {
  id: string
  day: Day
  type: MealType
  photoPath: string | null
  createdAt: string
  items: MealItem[]
  totals: Macros
}

type Checked = { foodId: string | null; per100: Per100 | null; name: string; grams: number; macros: Macros }

function check(item: NewItem): Checked {
  const name = item.name.trim()
  if (name.length < 1 || name.length > 120) throw new ValidationError('Nome: use de 1 a 120 caracteres.')
  const grams = parseNum(item.grams, { min: 0.1, max: 5000, label: 'Quantidade (g)' })
  if ('per100' in item) {
    return { foodId: item.foodId ?? null, per100: item.per100, name, grams, macros: scaleFood(item.per100, grams) }
  }
  const m = item.macros
  return {
    foodId: null,
    per100: null,
    name,
    grams,
    macros: {
      kcal: Math.round(parseNum(m.kcal, { min: 0, max: 20000, label: 'Calorias' })),
      protein: parseNum(m.protein, { min: 0, max: 1000, label: 'Proteína' }),
      carbs: parseNum(m.carbs, { min: 0, max: 1000, label: 'Carboidratos' }),
      fat: parseNum(m.fat, { min: 0, max: 1000, label: 'Gordura' }),
    },
  }
}

export async function addMeal(
  db: Db,
  input: { type: MealType; items: NewItem[]; source: MealSource; photoPath?: string; now?: Date },
): Promise<string> {
  if (!MEAL_TYPES.includes(input.type)) throw new ValidationError('Refeição: tipo inválido.')
  if (input.source !== 'manual' && input.source !== 'ia_confirmada') throw new ValidationError('Origem inválida.')
  if (input.items.length === 0) throw new ValidationError('Adicione pelo menos um alimento.')
  const items = input.items.map(check)
  const day = todayIn(input.now)
  return withTx(db, async () => {
    const [meal] = await db.query<{ id: string }>(
      `insert into meals (day, type, photo_path) values ($1, $2, $3) returning id`,
      [day, input.type, input.photoPath ?? null],
    )
    for (const it of items) {
      let foodId = it.foodId
      if (!foodId && it.per100) {
        foodId = (await createFood(db, { name: it.name, origin: 'usuario', ...it.per100 })).id
      }
      if (foodId) await touchFood(db, foodId)
      await db.query(
        `insert into meal_items (meal_id, food_id, name, grams, kcal, protein_g, carbs_g, fat_g, source)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [meal.id, foodId, it.name, it.grams, it.macros.kcal, it.macros.protein, it.macros.carbs, it.macros.fat, input.source],
      )
    }
    return meal.id
  })
}

type MealRow = { id: string; day: string; type: MealType; photo_path: string | null; created_at: string | Date }
type ItemRow = {
  id: string
  meal_id: string
  food_id: string | null
  name: string
  grams: string | number
  kcal: string | number
  protein_g: string | number
  carbs_g: string | number
  fat_g: string | number
  source: MealSource
}

const MEAL_SELECT = `select id, to_char(day, 'YYYY-MM-DD') as day, type, photo_path, created_at from meals`
const ORDER = `order by day desc, array_position(enum_range(null::meal_type), type), created_at, ctid`

async function load(db: Db, meals: MealRow[]): Promise<MealWithItems[]> {
  if (meals.length === 0) return []
  const rows = await db.query<ItemRow>(
    `select id, meal_id, food_id, name, grams, kcal, protein_g, carbs_g, fat_g, source
     from meal_items where meal_id = any($1::uuid[]) order by created_at, ctid`,
    [meals.map((m) => m.id)],
  )
  return meals.map((m) => {
    const items = rows
      .filter((r) => r.meal_id === m.id)
      .map((r) => ({
        id: r.id,
        foodId: r.food_id,
        name: r.name,
        grams: Number(r.grams),
        kcal: Number(r.kcal),
        protein: Number(r.protein_g),
        carbs: Number(r.carbs_g),
        fat: Number(r.fat_g),
        source: r.source,
      }))
    return {
      id: m.id,
      day: m.day,
      type: m.type,
      photoPath: m.photo_path,
      createdAt: new Date(m.created_at).toISOString(),
      items,
      totals: sumMacros(items),
    }
  })
}

export async function getDayMeals(db: Db, day: Day): Promise<MealWithItems[]> {
  return load(db, await db.query<MealRow>(`${MEAL_SELECT} where day = $1 ${ORDER}`, [day]))
}

export async function getDayTotals(db: Db, day: Day): Promise<Macros> {
  return sumMacros((await getDayMeals(db, day)).map((m) => m.totals))
}

export async function deleteMeal(db: Db, id: string): Promise<void> {
  await db.query(`delete from meals where id = $1`, [id])
}

export async function deleteMealItem(db: Db, id: string): Promise<void> {
  await db.query(`delete from meal_items where id = $1`, [id])
}

/** Copia os itens (com os mesmos gramas e macros) para uma refeição nova de hoje. */
export async function repeatMeal(db: Db, mealId: string, type: MealType, now?: Date): Promise<string> {
  if (!MEAL_TYPES.includes(type)) throw new ValidationError('Refeição: tipo inválido.')
  return withTx(db, async () => {
    const [exists] = await db.query(`select 1 from meals where id = $1`, [mealId])
    if (!exists) throw new ValidationError('Refeição não encontrada.')
    const [meal] = await db.query<{ id: string }>(`insert into meals (day, type) values ($1, $2) returning id`, [
      todayIn(now),
      type,
    ])
    await db.query(
      `insert into meal_items (meal_id, food_id, name, grams, kcal, protein_g, carbs_g, fat_g, source)
       select $1, food_id, name, grams, kcal, protein_g, carbs_g, fat_g, 'manual'
       from meal_items where meal_id = $2 order by created_at, ctid`,
      [meal.id, mealId],
    )
    return meal.id
  })
}

/** Dias com registro, do mais recente para o mais antigo, antes de `before` (exclusivo). */
export async function getHistory(
  db: Db,
  opts: { before?: Day; limit?: number } = {},
): Promise<{ day: Day; meals: MealWithItems[] }[]> {
  const limit = opts.limit ?? 14
  const days = await db.query<{ day: string }>(
    `select distinct to_char(day, 'YYYY-MM-DD') as day from meals
     where ($1::date is null or day < $1::date) order by day desc limit $2`,
    [opts.before ?? null, limit],
  )
  if (days.length === 0) return []
  const meals = await load(
    db,
    await db.query<MealRow>(`${MEAL_SELECT} where day = any($1::date[]) ${ORDER}`, [days.map((d) => d.day)]),
  )
  return days.map(({ day }) => ({ day, meals: meals.filter((m) => m.day === day) }))
}

/** Totais por dia no intervalo [from, to]; dias sem registro ficam de fora. */
export async function dailyTotals(db: Db, from: Day, to: Day): Promise<{ day: Day; totals: Macros }[]> {
  const rows = await db.query<{ day: string; kcal: string; protein: string; carbs: string; fat: string }>(
    `select to_char(m.day, 'YYYY-MM-DD') as day, sum(i.kcal) as kcal, sum(i.protein_g) as protein,
            sum(i.carbs_g) as carbs, sum(i.fat_g) as fat
     from meals m join meal_items i on i.meal_id = m.id
     where m.day between $1::date and $2::date group by m.day order by m.day`,
    [from, to],
  )
  return rows.map((r) => ({
    day: r.day,
    totals: sumMacros([{ kcal: Number(r.kcal), protein: Number(r.protein), carbs: Number(r.carbs), fat: Number(r.fat) }]),
  }))
}
