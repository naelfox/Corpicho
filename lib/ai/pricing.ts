/**
 * USD por 1 milhão de tokens (tarifa padrão, contexto curto).
 * Fonte: https://platform.openai.com/docs/pricing (conferido em 2026-11-22). Reconferir de tempos em tempos.
 */
export const PRICES: Record<string, { inPerM: number; outPerM: number }> = {
  'gpt-5.4-nano': { inPerM: 0.2, outPerM: 1.25 },
  'gpt-5.4-mini': { inPerM: 0.75, outPerM: 4.5 },
  'gpt-5.4': { inPerM: 2.5, outPerM: 15 },
  'gpt-5.5': { inPerM: 5, outPerM: 30 },
}

const MOST_EXPENSIVE = Object.values(PRICES).reduce((a, b) => (b.outPerM > a.outPerM ? b : a))

/** Modelo desconhecido: usa o preço mais caro (estimativa conservadora, nunca zero). */
export function costUsd(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICES[model] ?? MOST_EXPENSIVE
  return (tokensIn * p.inPerM + tokensOut * p.outPerM) / 1_000_000
}
