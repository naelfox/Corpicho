import type { Db } from './db'
import { addDays, todayIn, type Day } from './dates'
import { ValidationError } from './validate'

/**
 * Gasto calórico anotado pela pessoa (academia, caminhada, o número do relógio…), por dia,
 * e uma meta diária de gasto para conferir se está chegando lá.
 */

export const DEFAULT_BURN_GOAL = 300

export type Burn = { id: string; day: Day; kcal: number; label: string; at: string }
export type BurnDay = { day: Day; kcal: number }
export type BurnSummary = {
  goal: number
  today: number
  /** Um item por dia do período, do mais antigo a hoje (dias sem registro = 0). */
  days: BurnDay[]
  total: number
  /** Média por dia do período (inclui os dias zerados: é o que de fato foi gasto). */
  average: number
  /** Dias do período que bateram a meta. */
  daysHit: number
}

export async function addBurn(db: Db, input: { day: Day; kcal: number; label?: string }): Promise<string> {
  const kcal = Math.round(input.kcal)
  if (!Number.isFinite(kcal) || kcal < 1 || kcal > 5000) throw new ValidationError('Gasto: informe um valor entre 1 e 5.000 kcal.')
  const label = (input.label ?? '').trim().slice(0, 80)
  const [r] = await db.query<{ id: string }>(
    `insert into calorie_burns (day, kcal, label) values ($1, $2, $3) returning id`,
    [input.day, kcal, label],
  )
  return r.id
}

export async function deleteBurn(db: Db, id: string): Promise<void> {
  await db.query(`delete from calorie_burns where id = $1`, [id])
}

/** Registros do mais recente ao mais antigo. */
export async function listBurns(db: Db, limit = 60): Promise<Burn[]> {
  const rows = await db.query<{ id: string; day: string; kcal: number; label: string; created_at: string | Date }>(
    `select id, to_char(day, 'YYYY-MM-DD') as day, kcal, label, created_at from calorie_burns
     order by day desc, created_at desc limit $1`,
    [limit],
  )
  return rows.map((r) => ({ id: r.id, day: r.day, kcal: Number(r.kcal), label: r.label, at: new Date(r.created_at).toISOString() }))
}

export async function getBurnGoal(db: Db): Promise<number> {
  const [r] = await db.query<{ kcal: number }>(`select kcal from burn_goal where id = 1`)
  return r ? Number(r.kcal) : DEFAULT_BURN_GOAL
}

export async function setBurnGoal(db: Db, kcal: number): Promise<void> {
  const k = Math.round(kcal)
  if (!Number.isFinite(k) || k < 50 || k > 3000) throw new ValidationError('Meta de gasto: informe um valor entre 50 e 3.000 kcal.')
  await db.query(
    `insert into burn_goal (id, kcal) values (1, $1)
     on conflict (id) do update set kcal = excluded.kcal, updated_at = now()`,
    [k],
  )
}

/** Gasto por dia nos últimos `days` dias (até hoje), com meta, média e dias que bateram a meta. */
export async function burnSummary(db: Db, days: number, now: Date = new Date()): Promise<BurnSummary> {
  const today = todayIn(now)
  const from = addDays(today, -(days - 1))
  const [goal, rows] = await Promise.all([
    getBurnGoal(db),
    db.query<{ day: string; kcal: string | number }>(
      `select to_char(day, 'YYYY-MM-DD') as day, sum(kcal) as kcal from calorie_burns
       where day between $1::date and $2::date group by day`,
      [from, today],
    ),
  ])
  const byDay = new Map(rows.map((r) => [r.day, Number(r.kcal)]))
  const list: BurnDay[] = Array.from({ length: days }, (_, i) => {
    const day = addDays(from, i)
    return { day, kcal: byDay.get(day) ?? 0 }
  })
  const total = list.reduce((a, d) => a + d.kcal, 0)
  return {
    goal,
    today: byDay.get(today) ?? 0,
    days: list,
    total,
    average: Math.round(total / days),
    daysHit: list.filter((d) => d.kcal >= goal).length,
  }
}
