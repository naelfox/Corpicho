import { TZ } from '@/lib/dates'

/** Número em pt-BR com até 1 casa (93,5). */
export const num1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

/** Diferença com sinal tipográfico: "+1,5", "−2", "0". */
export function signed(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${num1(Math.abs(n))}`
}

/** "22/11/2026, 14:05" no fuso do app. */
export const dateTime = (at: string) =>
  new Date(at).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ,
  })

/** "22/11/2026" no fuso do app. */
export const dateOnly = (at: string) =>
  new Date(at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ })

/**
 * Cor do delta sem tom de culpa: verde quando foi na direção desejada, neutro (cinza) no resto.
 * Nunca vermelho.
 */
export function deltaTone(delta: number | null | undefined, good: 'down' | 'up' = 'down'): string {
  if (!delta) return 'text-[var(--muted)]'
  return (good === 'down' ? delta < 0 : delta > 0) ? 'text-[var(--accent-text)]' : 'text-[var(--muted)]'
}
