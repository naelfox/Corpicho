import type { Db } from './db'
import { addDays, todayIn, weekdayOf, type Day } from './dates'
import { REGIONS, type Region } from './body'
import { dailyTotals } from './meals'
import { round1 } from './validate'
import { analyzeWeek } from './ai/report'
import type { RunAiOptions } from './ai/client'

export type WeekNumbers = {
  weightStart: number | null
  weightEnd: number | null
  weightDelta: number | null
  measures: { region: Region; delta: number }[]
  avgKcal: number | null
  avgProtein: number | null
  daysLogged: number
  workouts: number
  trainingTrend: { name: string; loadDelta: number }[]
}

export type Report = { weekStart: Day; numbers: WeekNumbers; analysis: string | null; createdAt: string }
type Deps = RunAiOptions<unknown>['deps']

/** Segunda-feira da semana (seg–dom) que contém `day`. */
export const mondayOf = (day: Day): Day => addDays(day, -((weekdayOf(day) + 6) % 7))

/** Início de um dia no fuso do app (UTC-3, sem horário de verão). */
const startOf = (day: Day) => `${day}T00:00:00-03:00`

export async function weekNumbers(db: Db, weekStart: Day): Promise<WeekNumbers> {
  const weekEnd = addDays(weekStart, 6)
  const from = startOf(weekStart)
  const to = startOf(addDays(weekStart, 7)) // exclusivo

  const weights = await db.query<{ id: string; kg: string | number }>(
    `select id, kg from weights where measured_at >= $1 and measured_at < $2 order by measured_at, created_at`,
    [from, to],
  )
  const first = weights[0]
  const last = weights[weights.length - 1]
  const weightDelta = first && last && first.id !== last.id ? round1(Number(last.kg) - Number(first.kg)) : null

  // Medidas: última da semana contra a última antes da semana (só regiões com as duas).
  const rows = await db.query<{ region: Region; cm: string | number; inweek: boolean }>(
    `select distinct on (region, inweek) region, cm, inweek from (
       select region, cm, measured_at, created_at, (measured_at >= $1) as inweek
       from body_measurements where measured_at < $2) t
     order by region, inweek, measured_at desc, created_at desc`,
    [from, to],
  )
  const measures: WeekNumbers['measures'] = []
  for (const r of REGIONS) {
    const end = rows.find((x) => x.region === r.id && x.inweek)
    const before = rows.find((x) => x.region === r.id && !x.inweek)
    if (end && before) measures.push({ region: r.id, delta: round1(Number(end.cm) - Number(before.cm)) })
  }

  const days = await dailyTotals(db, weekStart, weekEnd)
  const avg = (f: (t: (typeof days)[number]['totals']) => number) =>
    days.length ? Math.round(days.reduce((s, d) => s + f(d.totals), 0) / days.length) : null

  const [w] = await db.query<{ n: string | number }>(
    `select count(*) as n from workout_sessions where finished_at is not null and day >= $1 and day <= $2`,
    [weekStart, weekEnd],
  )

  const best = (a: Day, b: Day) =>
    db.query<{ name: string; best: string | number }>(
      `select e.name, max(ss.load_kg) as best from session_sets ss
       join workout_sessions s on s.id = ss.session_id join exercises e on e.id = ss.exercise_id
       where s.finished_at is not null and s.day >= $1 and s.day <= $2 and ss.load_kg is not null
       group by e.id, e.name order by e.name`,
      [a, b],
    )
  const [now, prev] = await Promise.all([best(weekStart, weekEnd), best(addDays(weekStart, -28), addDays(weekStart, -1))])
  const prevMap = new Map(prev.map((p) => [p.name, Number(p.best)]))
  const trainingTrend = now.flatMap((n) => {
    const p = prevMap.get(n.name)
    return p === undefined ? [] : [{ name: n.name, loadDelta: round1(Number(n.best) - p) }]
  })

  return {
    weightStart: first ? Number(first.kg) : null,
    weightEnd: last ? Number(last.kg) : null,
    weightDelta,
    measures,
    avgKcal: avg((t) => t.kcal),
    avgProtein: avg((t) => t.protein),
    daysLogged: days.length,
    workouts: Number(w?.n ?? 0),
    trainingTrend,
  }
}

type Row = { week_start: string; numbers: WeekNumbers | string; analysis: string | null; created_at: string | Date }
const toReport = (r: Row): Report => ({
  weekStart: r.week_start,
  numbers: typeof r.numbers === 'string' ? (JSON.parse(r.numbers) as WeekNumbers) : r.numbers,
  analysis: r.analysis,
  createdAt: new Date(r.created_at).toISOString(),
})
const SELECT = `select to_char(week_start, 'YYYY-MM-DD') as week_start, numbers, analysis, created_at from weekly_reports`

/** Relatórios salvos, do mais novo para o mais antigo. */
export async function listReports(db: Db): Promise<Report[]> {
  return (await db.query<Row>(`${SELECT} order by week_start desc`)).map(toReport)
}

export async function getReport(db: Db, weekStart: Day): Promise<Report | null> {
  const [r] = await db.query<Row>(`${SELECT} where week_start = $1`, [weekStart])
  return r ? toReport(r) : null
}

async function hasAnyRecord(db: Db, weekStart: Day): Promise<boolean> {
  const from = startOf(weekStart)
  const to = startOf(addDays(weekStart, 7))
  const [r] = await db.query<{ any: boolean }>(
    `select (
       exists (select 1 from weights where measured_at >= $1 and measured_at < $2)
    or exists (select 1 from body_measurements where measured_at >= $1 and measured_at < $2)
    or exists (select 1 from body_composition where measured_at >= $1 and measured_at < $2)
    or exists (select 1 from meals where day >= $3::date and day <= $4::date)
    or exists (select 1 from workout_sessions where finished_at is not null and day >= $3::date and day <= $4::date)
    ) as any`,
    [from, to, weekStart, addDays(weekStart, 6)],
  )
  return !!r?.any
}

/** Cria o relatório da última semana fechada (seg–dom) se faltar e houver algum registro nela. Idempotente. */
export async function ensureLastWeekReport(db: Db, now: Date = new Date(), deps?: Deps): Promise<void> {
  const weekStart = addDays(mondayOf(todayIn(now)), -7)
  if (await getReport(db, weekStart)) return
  if (!(await hasAnyRecord(db, weekStart))) return
  const numbers = await weekNumbers(db, weekStart)
  let analysis: string | null = null
  try {
    analysis = (await analyzeWeek(db, numbers, { now, ...deps })) || null
  } catch (e) {
    console.error(e) // sem chave, sem rede, limite…: o relatório fica só com os números
  }
  await db.query(
    `insert into weekly_reports (week_start, numbers, analysis) values ($1, $2::jsonb, $3) on conflict (week_start) do nothing`,
    [weekStart, JSON.stringify(numbers), analysis],
  )
}

/** Gera (ou gera de novo) a análise da IA de um relatório salvo. Lança AiError. */
export async function regenerateAnalysis(db: Db, weekStart: Day, deps?: Deps): Promise<string> {
  const report = await getReport(db, weekStart)
  if (!report) throw new Error('Relatório não encontrado.')
  const analysis = await analyzeWeek(db, report.numbers, deps)
  await db.query(`update weekly_reports set analysis = $2 where week_start = $1`, [weekStart, analysis])
  return analysis
}
