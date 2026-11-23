'use client'

import { useMemo, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { measuresFor } from '@/lib/measures'

/** 0,5 → "½", 1,5 → "1½", 2 → "2". */
export const countText = (c: number) => {
  const whole = Math.floor(c)
  const half = c - whole >= 0.5
  return half ? `${whole || ''}½` : String(whole)
}

const STEP = 0.5
const MAX = 20

/**
 * Medidas caseiras (colher, concha, unidade…) para quem não tem balança: tocar numa medida
 * preenche o peso em gramas; tocar de novo, ou no +, soma mais uma; o − tira meia.
 * Digitar o peso à mão desfaz a seleção (o campo de gramas é sempre a fonte da verdade).
 */
export function MeasurePicker({ foodName, grams, onGrams }: { foodName: string; grams: string; onGrams: (g: number) => void }) {
  const measures = useMemo(() => measuresFor(foodName), [foodName])
  const [sel, setSel] = useState<{ i: number; count: number } | null>(null)
  if (measures.length === 0) return null

  const totalOf = (i: number, count: number) => Math.round(count * measures[i].grams)
  const active = sel && measures[sel.i] && String(totalOf(sel.i, sel.count)) === grams.trim() ? sel : null

  const choose = (i: number, count: number) => {
    const c = Math.min(MAX, Math.max(STEP, count))
    setSel({ i, count: c })
    onGrams(totalOf(i, c))
  }

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[12px] font-medium text-[var(--muted)]">Sem balança? Use uma medida (aproximada)</p>
      <div className="flex flex-wrap gap-1.5">
        {measures.map((m, i) => {
          const on = active?.i === i
          return (
            <button
              key={m.label}
              type="button"
              aria-pressed={on}
              onClick={() => choose(i, on ? active.count + 1 : 1)}
              className={`min-h-9 rounded-full border px-3 text-[13px] transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.96] ${
                on
                  ? 'border-[var(--accent)] bg-[var(--accent)]/12 font-semibold text-[var(--accent-text)]'
                  : 'border-[var(--line)] text-[var(--ink)]'
              }`}
            >
              {m.label} <span className="tabular-nums text-[var(--muted)]">· {m.grams} g</span>
            </button>
          )
        })}
      </div>
      {active && (
        <div className="mt-2 flex items-center gap-2" role="group" aria-label="Quantidade da medida">
          <button
            type="button"
            aria-label="Menos meia medida"
            onClick={() => choose(active.i, active.count - STEP)}
            disabled={active.count <= STEP}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink)] active:scale-[0.92] disabled:opacity-40"
          >
            <Minus aria-hidden size={16} />
          </button>
          <p aria-live="polite" className="min-w-0 flex-1 text-center text-[14px] tabular-nums">
            <span className="font-semibold">{countText(active.count)}</span> × {measures[active.i].label} ≈ {grams} g
          </p>
          <button
            type="button"
            aria-label="Mais meia medida"
            onClick={() => choose(active.i, active.count + STEP)}
            disabled={active.count >= MAX}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink)] active:scale-[0.92] disabled:opacity-40"
          >
            <Plus aria-hidden size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
