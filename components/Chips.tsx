'use client'

import type { ReactNode } from 'react'

/** Escolha única em linha (2–7 opções curtas): Sistema/Claro/Escuro, sexo, dias por semana… */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  compact = false,
}: {
  label: string
  options: { id: T; label: string; aria?: string }[]
  value: T | null
  onChange: (v: T) => void
  /** Texto menor e menos respiro lateral, para 4+ opções em tela estreita. */
  compact?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl bg-[var(--track)] p-1">
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={String(o.id)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.aria}
            onClick={() => onChange(o.id)}
            className={`h-11 min-w-0 truncate rounded-[10px] ${compact ? 'flex-auto px-1.5 text-[14px]' : 'flex-1 px-2 text-[15px]'} transition-[background-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
              active
                ? 'bg-[var(--card)] font-semibold text-[var(--ink)] shadow-[var(--shadow-card)]'
                : 'text-[var(--muted)]'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Lista de opções grandes, uma por linha, com título e explicação (nível de atividade, experiência…). */
export function OptionList<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: T; title: string; hint?: string }[]
  value: T | null
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={String(o.id)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`flex min-h-14 w-full flex-col justify-center rounded-2xl border px-4 py-3 text-left transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.98] ${
              active
                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                : 'border-[var(--line)] bg-[var(--card)]'
            }`}
          >
            <span className={`text-[16px] ${active ? 'font-semibold' : 'font-medium'}`}>{o.title}</span>
            {o.hint && <span className="mt-0.5 text-[13px] leading-snug text-[var(--muted)]">{o.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Chip que liga/desliga (escolha múltipla, ex.: equipamentos). */
export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      onClick={onClick}
      className={`h-11 rounded-full border px-4 text-[15px] transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.96] ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--ink)]'
          : 'border-[var(--line)] bg-[var(--card)] text-[var(--muted)]'
      }`}
    >
      {children}
    </button>
  )
}

/** Escolha única em chips que quebram linha (métricas, métodos…). */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  scroll = false,
}: {
  label: string
  options: { id: T; label: string }[]
  value: T | null
  onChange: (v: T) => void
  /** Uma linha só, rolando na horizontal (sangra até a borda do cartão). */
  scroll?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={
        scroll
          ? '-mx-4 flex snap-x gap-2 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          : 'flex flex-wrap gap-2'
      }
    >
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`h-11 shrink-0 snap-start rounded-full border px-4 text-[15px] whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.96] ${
              active
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--ink)]'
                : 'border-[var(--line)] bg-[var(--card)] text-[var(--muted)]'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
