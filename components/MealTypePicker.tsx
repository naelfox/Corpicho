'use client'

import { MEAL_TYPES, type MealType } from '@/lib/meals'

export const MEAL_SHORT: Record<MealType, string> = {
  cafe: 'Café',
  almoco: 'Almoço',
  lanche: 'Lanche',
  jantar: 'Jantar',
  outras: 'Outras',
}

/** Escolha da refeição (café, almoço…) em chips que quebram linha. */
export function MealTypePicker({ value, onChange }: { value: MealType; onChange: (t: MealType) => void }) {
  return (
    <div role="radiogroup" aria-label="Refeição" className="flex flex-wrap gap-2">
      {MEAL_TYPES.map((t) => {
        const active = t === value
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(t)}
            className={`h-10 rounded-full border px-4 text-[15px] transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.96] ${
              active
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--ink)]'
                : 'border-[var(--line)] bg-[var(--card)] text-[var(--muted)]'
            }`}
          >
            {MEAL_SHORT[t]}
          </button>
        )
      })}
    </div>
  )
}
