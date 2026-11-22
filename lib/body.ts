import type { Db } from './db'
import type { Profile } from './profile'
import { ValidationError, parseNum, round1 } from './validate'

export type Region =
  | 'pescoco' | 'ombros' | 'peitoral' | 'braco_d' | 'braco_e' | 'cintura'
  | 'abdomen' | 'quadril' | 'coxa_d' | 'coxa_e' | 'panturrilha_d' | 'panturrilha_e'

export const REGIONS: { id: Region; label: string; side: 'front' | 'back' | 'both' }[] = [
  { id: 'pescoco', label: 'Pescoço', side: 'both' },
  { id: 'ombros', label: 'Ombros', side: 'both' },
  { id: 'peitoral', label: 'Peitoral', side: 'front' },
  { id: 'braco_d', label: 'Braço direito', side: 'both' },
  { id: 'braco_e', label: 'Braço esquerdo', side: 'both' },
  { id: 'cintura', label: 'Cintura', side: 'front' },
  { id: 'abdomen', label: 'Abdômen', side: 'front' },
  { id: 'quadril', label: 'Quadril', side: 'both' },
  { id: 'coxa_d', label: 'Coxa direita', side: 'both' },
  { id: 'coxa_e', label: 'Coxa esquerda', side: 'both' },
  { id: 'panturrilha_d', label: 'Panturrilha direita', side: 'both' },
  { id: 'panturrilha_e', label: 'Panturrilha esquerda', side: 'both' },
]

export type CompMetric = 'body_fat_pct' | 'muscle_kg' | 'visceral_fat' | 'water_pct' | 'bmi' | 'weight_kg'
export type CompSource = 'measured' | 'calculated' | 'estimated'
export type CompositionEntry = { metric: CompMetric; value: number; source: CompSource; method: string | null; at: string }

const UNIT: Record<CompMetric, string> = {
  body_fat_pct: '%', muscle_kg: 'kg', visceral_fat: 'nível', water_pct: '%', bmi: 'kg/m²', weight_kg: 'kg',
}
const PCT: CompMetric[] = ['body_fat_pct', 'water_pct']

const iso = (v: unknown) => new Date(v as string | Date).toISOString()

export async function addWeight(db: Db, kg: number | string, at: Date = new Date()): Promise<void> {
  const v = parseNum(kg, { min: 20, max: 400, label: 'Peso (kg)' })
  await db.query(`insert into weights (measured_at, kg) values ($1, $2)`, [at.toISOString(), v])
}

export async function addMeasurement(db: Db, region: Region, cm: number | string, at: Date = new Date()): Promise<void> {
  if (!REGIONS.some((r) => r.id === region)) throw new ValidationError('Região inválida.')
  const v = parseNum(cm, { min: 5, max: 300, label: 'Medida (cm)' })
  await db.query(`insert into body_measurements (measured_at, region, cm) values ($1, $2, $3)`, [at.toISOString(), region, v])
}

export async function deleteRecord(
  db: Db,
  table: 'weights' | 'body_measurements' | 'body_composition',
  id: string,
): Promise<void> {
  if (!['weights', 'body_measurements', 'body_composition'].includes(table)) throw new ValidationError('Tabela inválida.')
  await db.query(`delete from ${table} where id = $1`, [id])
}

export async function latestByRegion(
  db: Db,
): Promise<Record<Region, { cm: number; at: string; delta: number | null } | undefined>> {
  const rows = await db.query<{ region: Region; cm: string | number; measured_at: string | Date; rn: number }>(
    `select region, cm, measured_at, rn from (
       select region, cm, measured_at,
              row_number() over (partition by region order by measured_at desc, created_at desc) as rn
       from body_measurements) t
     where rn <= 2`,
  )
  const out = {} as Record<Region, { cm: number; at: string; delta: number | null } | undefined>
  for (const r of REGIONS) out[r.id] = undefined
  const prev = new Map<Region, number>()
  for (const r of rows) if (Number(r.rn) === 2) prev.set(r.region, Number(r.cm))
  for (const r of rows) {
    if (Number(r.rn) !== 1) continue
    const p = prev.get(r.region)
    out[r.region] = { cm: Number(r.cm), at: iso(r.measured_at), delta: p === undefined ? null : round1(Number(r.cm) - p) }
  }
  return out
}

export async function regionHistory(db: Db, region: Region): Promise<{ id: string; cm: number; at: string }[]> {
  const rows = await db.query<{ id: string; cm: string | number; measured_at: string | Date }>(
    `select id, cm, measured_at from body_measurements where region = $1 order by measured_at desc, created_at desc`,
    [region],
  )
  return rows.map((r) => ({ id: r.id, cm: Number(r.cm), at: iso(r.measured_at) }))
}

export async function addComposition(
  db: Db,
  input: { metric: CompMetric; value: number | string; source: CompSource; method?: string; at?: Date },
): Promise<void> {
  const { metric, source } = input
  const method = input.method?.trim() || null
  if (source === 'measured' && !method) throw new ValidationError('Informe o método da medição (ex.: bioimpedância).')
  const value = parseNum(input.value, { min: 0, max: PCT.includes(metric) ? 100 : 1_000_000, label: 'Valor' })
  await db.query(
    `insert into body_composition (measured_at, metric, value, unit, source, method) values ($1, $2, $3, $4, $5, $6)`,
    [(input.at ?? new Date()).toISOString(), metric, value, UNIT[metric], source, method],
  )
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return round1(weightKg / (m * m))
}

export function navyBodyFat(i: {
  sex: 'm' | 'f'
  heightCm: number
  neckCm: number
  waistCm: number
  hipCm?: number
}): number | null {
  const { sex, heightCm, neckCm, waistCm, hipCm } = i
  if (![heightCm, neckCm, waistCm].every((n) => Number.isFinite(n) && n > 0)) return null
  let v: number
  if (sex === 'm') {
    if (waistCm <= neckCm) return null
    v = 86.01 * Math.log10(waistCm - neckCm) - 70.041 * Math.log10(heightCm) + 36.76
  } else {
    if (hipCm === undefined || !Number.isFinite(hipCm) || hipCm <= 0) return null
    if (waistCm + hipCm <= neckCm) return null
    v = 163.205 * Math.log10(waistCm + hipCm - neckCm) - 97.684 * Math.log10(heightCm) - 78.387
  }
  return Number.isFinite(v) ? round1(v) : null
}

export async function currentComposition(db: Db, profile: Profile): Promise<CompositionEntry[]> {
  const rows = await db.query<{ metric: CompMetric; value: string | number; source: CompSource; method: string | null; measured_at: string | Date }>(
    `select distinct on (metric) metric, value, source, method, measured_at
     from body_composition order by metric, measured_at desc, created_at desc`,
  )
  const out: CompositionEntry[] = rows
    .filter((r) => r.metric !== 'bmi' && r.metric !== 'weight_kg')
    .map((r) => ({ metric: r.metric, value: Number(r.value), source: r.source, method: r.method, at: iso(r.measured_at) }))

  const [w] = await db.query<{ kg: string | number; measured_at: string | Date }>(
    `select kg, measured_at from weights order by measured_at desc, created_at desc limit 1`,
  )
  if (w) {
    const kg = Number(w.kg)
    const at = iso(w.measured_at)
    out.push({ metric: 'weight_kg', value: kg, source: 'measured', method: 'balança', at })
    out.push({ metric: 'bmi', value: bmi(kg, profile.heightCm), source: 'calculated', method: 'peso e altura', at })
  }

  const ms = await db.query<{ region: Region; cm: string | number; measured_at: string | Date }>(
    `select distinct on (region) region, cm, measured_at from body_measurements
     where region in ('pescoco','cintura','quadril') order by region, measured_at desc, created_at desc`,
  )
  const m = Object.fromEntries(ms.map((r) => [r.region, r]))
  if (m.pescoco && m.cintura && (profile.sex === 'm' || m.quadril)) {
    const used = [m.pescoco, m.cintura, ...(profile.sex === 'f' ? [m.quadril] : [])]
    const newest = Math.max(...used.map((r) => new Date(r.measured_at).getTime()))
    const est = navyBodyFat({
      sex: profile.sex,
      heightCm: profile.heightCm,
      neckCm: Number(m.pescoco.cm),
      waistCm: Number(m.cintura.cm),
      hipCm: m.quadril ? Number(m.quadril.cm) : undefined,
    })
    const measuredIdx = out.findIndex((x) => x.metric === 'body_fat_pct' && x.source === 'measured')
    const measuredNewer = measuredIdx >= 0 && new Date(out[measuredIdx].at).getTime() >= newest
    if (est !== null && !measuredNewer) {
      if (measuredIdx >= 0) out.splice(measuredIdx, 1)
      else {
        const i = out.findIndex((x) => x.metric === 'body_fat_pct')
        if (i >= 0) out.splice(i, 1)
      }
      out.push({ metric: 'body_fat_pct', value: est, source: 'estimated', method: 'fórmula da Marinha', at: iso(new Date(newest)) })
    }
  }
  return out
}

/** Registros de composição informados pelo usuário (com id, para apagar), do mais recente ao mais antigo. */
export async function compositionHistory(
  db: Db,
  limit = 50,
): Promise<{ id: string; metric: CompMetric; value: number; unit: string; source: CompSource; method: string | null; at: string }[]> {
  const rows = await db.query<{
    id: string; metric: CompMetric; value: string | number; unit: string; source: CompSource; method: string | null; measured_at: string | Date
  }>(
    `select id, metric, value, unit, source, method, measured_at from body_composition
     order by measured_at desc, created_at desc limit $1`,
    [limit],
  )
  return rows.map((r) => ({
    id: r.id, metric: r.metric, value: Number(r.value), unit: r.unit, source: r.source, method: r.method, at: iso(r.measured_at),
  }))
}
