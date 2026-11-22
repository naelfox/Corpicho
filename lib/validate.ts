export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/** Converte texto (aceita vírgula) em número dentro de [min, max]; erros em pt-BR. */
export function parseNum(input: string | number, opts: { min: number; max: number; label: string }): number {
  const { min, max, label } = opts
  const raw = typeof input === 'number' ? String(input) : input.trim().replace(',', '.')
  if (raw === '' || !/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new ValidationError(`${label}: informe um número válido.`)
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ValidationError(`${label}: informe um valor entre ${min.toLocaleString('pt-BR')} e ${max.toLocaleString('pt-BR')}.`)
  }
  return n
}

/** Arredonda para 1 casa decimal. */
export function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10
}
