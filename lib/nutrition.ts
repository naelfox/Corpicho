import type { Day } from './dates'
import { round1 } from './validate'

export type Per100 = { kcal100: number; protein100: number; carbs100: number; fat100: number }
export type Macros = { kcal: number; protein: number; carbs: number; fat: number }
export type Sex = 'm' | 'f'

/** Macros de `grams` gramas do alimento: kcal inteiro, macros com 1 casa. */
export function scaleFood(food: Per100, grams: number): Macros {
  const k = grams / 100
  return {
    kcal: Math.round(food.kcal100 * k),
    protein: round1(food.protein100 * k),
    carbs: round1(food.carbs100 * k),
    fat: round1(food.fat100 * k),
  }
}

export function sumMacros(items: Macros[]): Macros {
  const t = items.reduce(
    (a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
  return { kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat) }
}

/** Taxa metabólica basal (Mifflin-St Jeor), kcal/dia. */
export function bmr(p: { sex: Sex; weightKg: number; heightCm: number; age: number }): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'm' ? 5 : -161)
}

/** Meta sugerida para emagrecer: TDEE − 500 kcal (piso 1500 m / 1200 f). */
export function suggestTargets(p: {
  sex: Sex
  weightKg: number
  heightCm: number
  age: number
  activityLevel: number
}): Macros {
  const floor = p.sex === 'm' ? 1500 : 1200
  const kcal = Math.max(floor, Math.round(bmr(p) * p.activityLevel - 500))
  const protein = Math.round(1.8 * p.weightKg)
  const fat = Math.round((0.25 * kcal) / 9)
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { kcal, protein, carbs, fat }
}

/** Idade completa em `today` (ambos YYYY-MM-DD). */
export function ageOn(birthDate: string, today: Day): number {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}
