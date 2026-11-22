import type { Db } from './db'
import type { Region } from './body'
import { todayIn } from './dates'
import { round1 } from './validate'

export type Period = '7d' | '30d' | '3m' | '6m' | '1a' | 'tudo'
export const PERIODS: { id: Period; label: string }[] = [
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '3m', label: '3 meses' },
  { id: '6m', label: '6 meses' },
  { id: '1a', label: '1 ano' },
  { id: 'tudo', label: 'Tudo' },
]
const DAYS: Record<Exclude<Period, 'tudo'>, number> = { '7d': 7, '30d': 30, '3m': 90, '6m': 180, '1a': 365 }

export type Metric = 'peso' | 'cintura' | 'abdomen' | 'quadril' | 'peitoral' | 'bracos' | 'coxas' | 'gordura' | 'musculo'
export type Unit = 'kg' | 'cm' | '%'
export type Point = { at: string; value: number; source?: 'measured' | 'calculated' | 'estimated' }
export type Series = { points: Point[]; first: number | null; last: number | null; delta: number | null; unit: Unit }

const REGION_METRICS: Partial<Record<Metric, Region[]>> = {
  cintura: ['cintura'], abdomen: ['abdomen'], quadril: ['quadril'], peitoral: ['peitoral'],
  bracos: ['braco_d', 'braco_e'], coxas: ['coxa_d', 'coxa_e'],
}
const METRICS: Metric[] = ['peso', 'cintura', 'abdomen', 'quadril', 'peitoral', 'bracos', 'coxas', 'gordura', 'musculo']

type Row = { at: string | Date; value: string | number; region?: string; source?: Point['source'] }
const iso = (v: string | Date) => new Date(v).toISOString()

/** Agrupa por dia local; por lado fica o último valor do dia; o ponto é a média dos lados presentes. */
function averageByDay(rows: Row[]): Point[] {
  const days = new Map<string, { at: string; sides: Map<string, { t: number; v: number }> }>()
  for (const r of rows) {
    const at = iso(r.at)
    const t = new Date(at).getTime()
    const day = todayIn(new Date(at))
    const g = days.get(day) ?? { at, sides: new Map() }
    if (at > g.at) g.at = at
    const cur = g.sides.get(r.region as string)
    if (!cur || t >= cur.t) g.sides.set(r.region as string, { t, v: Number(r.value) })
    days.set(day, g)
  }
  return [...days.values()]
    .map((g) => {
      const vs = [...g.sides.values()].map((s) => s.v)
      return { at: g.at, value: round1(vs.reduce((a, b) => a + b, 0) / vs.length) }
    })
    .sort((a, b) => a.at.localeCompare(b.at))
}

export async function getSeries(db: Db, metric: Metric, period: Period, now: Date = new Date()): Promise<Series> {
  const from = period === 'tudo' ? null : new Date(now.getTime() - DAYS[period] * 86400000).toISOString()
  const bounds = from ? [from, now.toISOString()] : [now.toISOString()]
  const range = from ? 'measured_at >= $1 and measured_at <= $2' : 'measured_at <= $1'
  const extra = `$${bounds.length + 1}`
  let unit: Unit = 'cm'
  let points: Point[]

  if (metric === 'peso') {
    unit = 'kg'
    const rows = await db.query<Row>(
      `select measured_at as at, kg as value from weights where ${range} order by measured_at, created_at`,
      bounds,
    )
    points = rows.map((r) => ({ at: iso(r.at), value: round1(Number(r.value)) }))
  } else if (metric === 'gordura' || metric === 'musculo') {
    unit = metric === 'gordura' ? '%' : 'kg'
    const rows = await db.query<Row>(
      `select measured_at as at, value, source from body_composition
       where metric = ${extra} and ${range} order by measured_at, created_at`,
      [...bounds, metric === 'gordura' ? 'body_fat_pct' : 'muscle_kg'],
    )
    points = rows.map((r) => ({ at: iso(r.at), value: round1(Number(r.value)), source: r.source }))
  } else {
    const rows = await db.query<Row>(
      `select measured_at as at, cm as value, region from body_measurements
       where region::text = any(${extra}) and ${range} order by measured_at, created_at`,
      [...bounds, REGION_METRICS[metric]!],
    )
    points = averageByDay(rows)
  }

  if (!points.length) return { points, first: null, last: null, delta: null, unit }
  const first = points[0].value
  const last = points[points.length - 1].value
  return { points, first, last, delta: points.length >= 2 ? round1(last - first) : null, unit }
}

export async function evolutionSummary(
  db: Db,
  now: Date = new Date(),
): Promise<{ metric: Metric; delta: number; unit: Unit }[]> {
  const out: { metric: Metric; delta: number; unit: Unit }[] = []
  for (const metric of METRICS) {
    const s = await getSeries(db, metric, '30d', now)
    if (s.points.length >= 2 && s.delta !== null) out.push({ metric, delta: s.delta, unit: s.unit })
  }
  return out
}
