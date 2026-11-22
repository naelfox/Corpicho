'use client'

import type { Macros } from '@/lib/nutrition'

const ROWS: { key: 'protein' | 'carbs' | 'fat'; label: string; color: string }[] = [
  { key: 'protein', label: 'Proteína', color: 'var(--protein)' },
  { key: 'carbs', label: 'Carboidrato', color: 'var(--carbs)' },
  { key: 'fat', label: 'Gordura', color: 'var(--fat)' },
]

const g = (n: number) => Math.round(n).toLocaleString('pt-BR')

/** Barras de proteína, carboidrato e gordura: consumido x meta do dia. */
export function MacroBars({ consumed, target }: { consumed: Macros; target: Macros }) {
  return (
    <div className="flex flex-col gap-3.5">
      {ROWS.map(({ key, label, color }) => {
        const pct = target[key] > 0 ? Math.min(100, (consumed[key] / target[key]) * 100) : 0
        return (
          <div key={key}>
            <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
              <span className="font-medium">{label}</span>
              <span className="text-[var(--muted)] tabular-nums">
                {g(consumed[key])} / {g(target[key])} g
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={Math.round(target[key])}
              aria-valuenow={Math.round(consumed[key])}
              className="h-2 overflow-hidden rounded-full bg-[var(--track)]"
            >
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out)]"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
