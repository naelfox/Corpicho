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

/** Palavras de ligação que não contam na comparação de nomes. */
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'e', 'a', 'o', 'em', 'ao', 'na', 'no', 'tipo'])

/**
 * Palavras que marcam uma variante (preparo, versão, origem). Se o nome traz uma delas e a busca não,
 * o alimento é outro (ex.: "arroz cozido" não é "Arroz, integral, cozido"; "ovo" não é "Ovo, de codorna").
 */
const PREP = ['cru', 'crua', 'cozido', 'cozida', 'frito', 'frita', 'assado', 'assada', 'grelhado', 'grelhada', 'refogado', 'refogada']
const VARIANT = new Set([
  'integral', 'desnatado', 'semidesnatado', 'po', 'condensado', 'achocolatado', 'fermentado', 'diet', 'dietetico', 'light',
  'cabra', 'codorna', 'coco', 'clara', 'gema', ...PREP,
])
/** Termos sem preparo: aceita o cozido (custo 1) ou o cru (custo 2) da TACO; outro preparo, não. */
const DEFAULT_PREP: Record<string, number> = { cozido: 1, cozida: 1, cru: 2, crua: 2 }

const words = (s: string) => normalize(s).split(' ').filter((w) => w && !STOP.has(w))
/** Números e "10minutos" (tempo de cozimento da TACO) não diferenciam alimentos. */
const neutral = (w: string) => /^\d/.test(w)

/**
 * Melhor alimento para os termos que a IA deu para um item da foto (não para a busca manual).
 * O nome precisa começar pelo alimento principal (1ª palavra dos termos) e não trazer variante que os termos
 * não pedem (sem preparo nos termos, aceita o cozido ou o cru); ganha quem casa mais palavras e sobra menos.
 * Termos de uma palavra só casam com nome exato.
 * Sem candidato bom: null (fica o nome e os valores da IA).
 */
export async function bestFoodMatch(db: Db, terms: string): Promise<Food | null> {
  const t = words(terms)
  if (t.length === 0) return null
  const tset = new Set(t)
  const noPrep = !t.some((w) => PREP.includes(w))
  const rows = await db.query<FoodRow & { search: string }>(
    `select ${COLS}, search from foods where search = $1 or search like $2`,
    [t[0], `${t[0]} %`],
  )
  let best: { food: Food; score: number } | null = null
  for (const r of rows) {
    const n = words(r.search)
    if (n[0] !== t[0]) continue
    const nset = new Set(n)
    const matched = t.filter((w) => nset.has(w)).length
    const missing = t.length - matched
    let prepCost = 0
    const extra = n.filter((w) => {
      if (tset.has(w) || neutral(w)) return false
      if (noPrep && w in DEFAULT_PREP) {
        prepCost += DEFAULT_PREP[w]
        return false
      }
      return true
    })
    if (extra.some((w) => VARIANT.has(w))) continue
    if (t.length === 1 ? extra.length > 0 || prepCost > 0 : matched < 2 || missing >= matched || extra.length > 3) continue
    const score = 3 * matched - extra.length - missing - prepCost
    if (!best || score > best.score || (score === best.score && r.name < best.food.name)) best = { food: toFood(r), score }
  }
  return best?.food ?? null
}

export async function createFood(db: Db, input: Omit<Food, 'id'>): Promise<Food> {
  const name = input.name.trim()
  if (name.length < 1 || name.length > 120) throw new ValidationError('Nome: use de 1 a 120 caracteres.')
  if (!['taco', 'usuario', 'ia'].includes(input.origin)) throw new ValidationError('Origem inválida.')
  const kcal = parseNum(input.kcal100, { min: 0, max: 900, label: 'Calorias' })
  const protein = parseNum(input.protein100, { min: 0, max: 100, label: 'Proteína' })
  const carbs = parseNum(input.carbs100, { min: 0, max: 100, label: 'Carboidratos' })
  const fat = parseNum(input.fat100, { min: 0, max: 100, label: 'Gordura' })
  const params = [name, input.origin, normalize(name), kcal, protein, carbs, fat]
  const insert = `insert into foods (name, origin, search, kcal_100, protein_100, carbs_100, fat_100)
     values ($1, $2, $3, $4, $5, $6, $7)`
  if (input.origin === 'usuario') {
    // O usuário pode corrigir os valores do próprio alimento.
    const [row] = await db.query<FoodRow>(
      `${insert} on conflict (lower(name), origin) do update set
         kcal_100 = excluded.kcal_100, protein_100 = excluded.protein_100,
         carbs_100 = excluded.carbs_100, fat_100 = excluded.fat_100
       returning ${COLS}`,
      params,
    )
    return toFood(row)
  }
  // Estimativa da IA (ou TACO): nunca sobrescreve; o índice único é por (nome, origem), então um alimento
  // "usuario" com o mesmo nome nunca é tocado. Já existindo, devolve o que está salvo.
  const [row] = await db.query<FoodRow>(`${insert} on conflict do nothing returning ${COLS}`, params)
  if (row) return toFood(row)
  const [existing] = await db.query<FoodRow>(`select ${COLS} from foods where lower(name) = lower($1) and origin = $2`, [
    name,
    input.origin,
  ])
  return toFood(existing)
}

export async function touchFood(db: Db, id: string): Promise<void> {
  await db.query(`update foods set last_used_at = now() where id = $1`, [id])
}
