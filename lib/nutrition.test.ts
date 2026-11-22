import { describe, it, expect } from 'vitest'
import { ageOn, bmr, scaleFood, sumMacros, suggestTargets } from '@/lib/nutrition'

describe('nutrition', () => {
  it('scaleFood', () => {
    expect(scaleFood({ kcal100: 128, protein100: 2.5, carbs100: 28, fat100: 0.2 }, 150)).toEqual({
      kcal: 192,
      protein: 3.8,
      carbs: 42,
      fat: 0.3,
    })
  })
  it('bmr Mifflin-St Jeor', () => {
    expect(bmr({ sex: 'm', weightKg: 90, heightCm: 178, age: 35 })).toBe(1842.5)
    expect(bmr({ sex: 'f', weightKg: 90, heightCm: 178, age: 35 })).toBe(1676.5)
  })
  it('suggestTargets', () => {
    const t = suggestTargets({ sex: 'm', weightKg: 90, heightCm: 178, age: 35, activityLevel: 1.375 })
    expect(t.kcal).toBe(2033)
    expect(t.protein).toBe(162)
    expect(t.fat).toBe(56)
    expect(t.carbs).toBe(Math.round((2033 - 162 * 4 - 56 * 9) / 4))
  })
  it('suggestTargets respeita o piso', () => {
    const m = suggestTargets({ sex: 'm', weightKg: 50, heightCm: 150, age: 60, activityLevel: 1.2 })
    expect(m.kcal).toBe(1500)
    const f = suggestTargets({ sex: 'f', weightKg: 45, heightCm: 150, age: 60, activityLevel: 1.2 })
    expect(f.kcal).toBe(1200)
    expect(f.carbs).toBeGreaterThanOrEqual(0)
  })
  it('sumMacros', () => {
    expect(
      sumMacros([
        { kcal: 100, protein: 1.1, carbs: 2.2, fat: 0.3 },
        { kcal: 50, protein: 2.2, carbs: 1.1, fat: 0.4 },
      ]),
    ).toEqual({ kcal: 150, protein: 3.3, carbs: 3.3, fat: 0.7 })
    expect(sumMacros([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  })
  it('ageOn', () => {
    expect(ageOn('1990-05-10', '2025-05-09')).toBe(34)
    expect(ageOn('1990-05-10', '2025-05-10')).toBe(35)
  })
})
