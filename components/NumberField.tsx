'use client'

import { useId, type ReactNode } from 'react'
import { fieldLabel } from './Sheet'

/**
 * Campo numérico com teclado decimal. Aceita vírgula ou ponto e devolve o texto cru:
 * a conversão e a validação acontecem ao salvar, com `parseNum` (lib/validate).
 * `decimals = 0` abre o teclado numérico sem separador.
 */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  decimals = 1,
  placeholder,
  invalid,
  autoFocus,
}: {
  label: ReactNode
  value: string
  onChange: (raw: string) => void
  unit?: string
  decimals?: number
  placeholder?: string
  invalid?: boolean
  autoFocus?: boolean
}) {
  const id = useId()
  const clean = (raw: string) => {
    // Só dígitos e um separador; respeita o número de casas.
    let s = raw.replace(/[^\d.,]/g, '')
    if (decimals === 0) return s.replace(/[.,]/g, '')
    const i = s.search(/[.,]/)
    if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/[.,]/g, '').slice(0, decimals)
    return s
  }
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <div
        className={`flex h-12 items-center rounded-xl border bg-[var(--bg)] px-3 transition-[border-color] duration-150 focus-within:border-[var(--accent)] ${
          invalid ? 'border-[var(--danger)]' : 'border-[var(--line)]'
        }`}
      >
        <input
          id={id}
          type="text"
          inputMode={decimals === 0 ? 'numeric' : 'decimal'}
          enterKeyHint="done"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(clean(e.target.value))}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] tabular-nums outline-none placeholder:text-[var(--muted)]/60"
        />
        {unit && <span className="ml-2 shrink-0 text-[15px] text-[var(--muted)]">{unit}</span>}
      </div>
    </div>
  )
}
