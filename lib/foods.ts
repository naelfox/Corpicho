import type { Db } from './db'
import taco from './taco.json'
import { ValidationError, parseNum } from './validate'

export type Food = {
  id: string
  name: string
  origin: 'taco' | 'usuario' | 'ia'
  kcal100: number
  protein100: number
  carbs100: number
  fat100: number
}

export type TacoRow = { name: string; kcal: number; protein: number; carbs: number; fat: number }

type FoodRow = {
  id: string
  name: string
  origin: Food['origin']
  kcal_100: string | number
  protein_100: string | number
  carbs_100: string | number
  fat_100: string | number
}

const COLS = 'id, name, origin, kcal_100, protein_100, carbs_100, fat_100'

const toFood = (r: FoodRow): Food => ({
  id: r.id,
  name: r.name,
  origin: r.origin,
  kcal100: Number(r.kcal_100),
  protein100: Number(r.protein_100),
  carbs100: Number(r.carbs_100),
  fat100: Number(r.fat_100),
})

/** minúsculas, sem acento, pontuação vira espaço. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Insere a tabela TACO se ainda não houver alimentos dela. Devolve quantos inseriu. */
export async function seedTaco(db: Db, rows: TacoRow[] = taco as TacoRow[]): Promise<number> {
  const [{ c }] = await db.query<{ c: string }>(`select count(*) as c from foods where origin = 'taco'`)
  if (Number(c) > 0 || rows.length === 0) return 0
  const params: unknown[] = []
  const values = rows.map((r, i) => {
    params.push(r.name, normalize(r.name), r.kcal, r.protein, r.carbs, r.fat)
    const b = i * 6
    return `($${b + 1}, 'taco', $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`
  })
  const inserted = await db.query(
    `insert into foods (name, origin, search, kcal_100, protein_100, carbs_100, fat_100)
     values ${values.join(',')} on conflict do nothing returning id`,
    params,
  )
  return inserted.length
}

/** Todas as palavras de `q` precisam aparecer; usados recentemente primeiro, depois A–Z. */
export async function searchFoods(db: Db, q: string, limit = 20): Promise<Food[]> {
  const tokens = normalize(q).split(' ').filter(Boolean)
  const where = tokens.map((_, i) => `search like $${i + 1}`).join(' and ')
  const rows = await db.query<FoodRow>(
    `select ${COLS} from foods ${where ? `where ${where}` : ''}
     order by last_used_at desc nulls last, name
     limit $${tokens.length + 1}`,
    [...tokens.map((t) => `%${t}%`), limit],
  )
  return rows.map(toFood)
}

export async function createFood(db: Db, input: Omit<Food, 'id'>): Promise<Food> {
  const name = input.name.trim()
  if (name.length < 1 || name.length > 120) throw new ValidationError('Nome: use de 1 a 120 caracteres.')
  if (!['taco', 'usuario', 'ia'].includes(input.origin)) throw new ValidationError('Origem inválida.')
  const kcal = parseNum(input.kcal100, { min: 0, max: 900, label: 'Calorias' })
  const protein = parseNum(input.protein100, { min: 0, max: 100, label: 'Proteína' })
  const carbs = parseNum(input.carbs100, { min: 0, max: 100, label: 'Carboidratos' })
  const fat = parseNum(input.fat100, { min: 0, max: 100, label: 'Gordura' })
  const [row] = await db.query<FoodRow>(
    `insert into foods (name, origin, search, kcal_100, protein_100, carbs_100, fat_100)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (lower(name), origin) do update set
       kcal_100 = excluded.kcal_100, protein_100 = excluded.protein_100,
       carbs_100 = excluded.carbs_100, fat_100 = excluded.fat_100
     returning ${COLS}`,
    [name, input.origin, normalize(name), kcal, protein, carbs, fat],
  )
  return toFood(row)
}

export async function touchFood(db: Db, id: string): Promise<void> {
  await db.query(`update foods set last_used_at = now() where id = $1`, [id])
}
