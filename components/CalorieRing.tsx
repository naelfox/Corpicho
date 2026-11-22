'use client'

import { useEffect, useState } from 'react'

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR')

/**
 * Anel de calorias: consumido / meta, com o que falta no centro.
 * Passou da meta: anel cheio em tom quente neutro (sem alarme vermelho).
 * Anima o preenchimento ao montar (o CSS global desliga a transição com reduced-motion).
 */
export function CalorieRing({ consumed, target, size = 168 }: { consumed: number; target: number; size?: number }) {
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const over = consumed > target
  const frac = target > 0 ? Math.min(1, Math.max(0, consumed / target)) : 0
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(frac))
    return () => cancelAnimationFrame(id)
  }, [frac])

  const diff = Math.abs(Math.round(target - consumed))
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? 'var(--carbs)' : 'var(--accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          style={{ transition: 'stroke-dashoffset 700ms var(--ease-out), stroke 200ms' }}
        />
      </svg>
      <div
        role="img"
        aria-label={`${fmt(consumed)} de ${fmt(target)} quilocalorias, ${over ? 'passou' : 'faltam'} ${fmt(diff)}`}
        className="absolute inset-0 flex flex-col items-center justify-center text-center"
      >
        <span className="text-[30px] leading-none font-semibold tabular-nums tracking-[-0.02em]">{fmt(consumed)}</span>
        <span className="mt-1 text-[13px] text-[var(--muted)]">de {fmt(target)} kcal</span>
        <span className={`mt-1.5 text-[13px] font-medium ${over ? 'text-[var(--carbs)]' : 'text-[var(--accent-text)]'}`}>
          {over ? `passou ${fmt(diff)} kcal` : `faltam ${fmt(diff)} kcal`}
        </span>
      </div>
    </div>
  )
}
