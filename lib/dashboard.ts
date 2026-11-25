import type { Db } from './db'
import { addDays, todayIn, weekdayOf, type Day } from './dates'
import { burnSummary } from './burns'
import { dailyTotals, getDayTotals } from './meals'
import { ageOn, bmr, type Macros } from './nutrition'
import { getGoal, getProfile } from './profile'
import { evolutionSummary, getSeries } from './series'
import { ValidationError } from './validate'

export type Dashboard = {
  weight: { current: number | null; target: number; start: number; progressPct: number }
  today: Macros
  targets: Macros
  remainingKcal: number
  workoutsThisWeek: number
  weightSeries: { at: string; value: number }[]
  summary: Awaited<ReturnType<typeof evolutionSummary>>
  /** Consumido × gasto por dia (14 dias). `base` null = falta perfil ou peso para estimar o basal. */
  energy: { base: number | null; days: { day: Day; eaten: number | null; spent: number }[] }
}

export const ENERGY_DAYS = 14

/** Tudo o que o Início mostra, numa chamada só. */
export async function getDashboard(db: Db, now: Date = new Date()): Promise<Dashboard> {
  const goal = await getGoal(db)
  if (!goal) throw new ValidationError('Defina sua meta')

  const day = todayIn(now)
  const monday = addDays(day, -((weekdayOf(day) + 6) % 7))
  const sunday = addDays(monday, 6)

  const [series, today, summary, [w], profile, burns, eaten] = await Promise.all([
    getSeries(db, 'peso', '30d', now),
    getDayTotals(db, day),
    evolutionSummary(db, now),
    db.query<{ n: string | number }>(
      `select count(*) as n from workout_sessions
       where finished_at is not null and day >= $1 and day <= $2`,
      [monday, sunday],
    ),
    getProfile(db),
    burnSummary(db, ENERGY_DAYS, now),
    dailyTotals(db, addDays(day, -(ENERGY_DAYS - 1)), day),
  ])

  const latest = (await getSeries(db, 'peso', 'tudo', now)).last
  const { startWeightKg: start, targetWeightKg: target } = goal
  let progressPct = 0
  if (latest !== null && start !== target) {
    progressPct = Math.round(Math.min(100, Math.max(0, ((start - latest) / (start - target)) * 100)))
  }
  // shortcut: basal × 1,2 (sedentário) + gasto anotado; o nível de atividade do perfil já conta treino e duplicaria.
  const base = profile && latest !== null
    ? Math.round(bmr({ sex: profile.sex, weightKg: latest, heightCm: profile.heightCm, age: ageOn(profile.birthDate, day) }) * 1.2)
    : null
  const eatenBy = new Map(eaten.map((e) => [e.day, e.totals.kcal]))
  const energy = {
    base,
    days: burns.days.map((b) => ({ day: b.day, eaten: eatenBy.get(b.day) ?? null, spent: (base ?? 0) + b.kcal })),
  }
  const targets: Macros = { kcal: goal.kcal, protein: goal.proteinG, carbs: goal.carbsG, fat: goal.fatG }

  return {
    weight: { current: latest, target, start, progressPct },
    today,
    targets,
    remainingKcal: targets.kcal - today.kcal,
    workoutsThisWeek: Number(w?.n ?? 0),
    weightSeries: series.points.map((p) => ({ at: p.at, value: p.value })),
    summary,
    energy,
  }
}
