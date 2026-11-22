import { describe, it, expect } from 'vitest'
import { parseNum, round1, ValidationError } from './validate'

const o = { min: 20, max: 400, label: 'Peso' }

describe('parseNum', () => {
  it('aceita vírgula', () => expect(parseNum('72,5', o)).toBe(72.5))
  it('aceita número', () => expect(parseNum(80, o)).toBe(80))
  it('rejeita vazio, negativo e texto', () => {
    for (const v of ['', '-1', 'abc']) expect(() => parseNum(v, o)).toThrow(ValidationError)
  })
  it('rejeita fora do intervalo citando o rótulo', () => {
    expect(() => parseNum('401', o)).toThrow(/Peso/)
    expect(() => parseNum('401', o)).toThrow(ValidationError)
  })
})

describe('round1', () => {
  it('arredonda a 1 casa', () => {
    expect(round1(94.2 - 95)).toBe(-0.8)
    expect(round1(1.25)).toBe(1.3)
    expect(round1(2)).toBe(2)
  })
})

describe('parseNum (limites em pt-BR)', () => {
  it('formata limites com vírgula', () => {
    expect(() => parseNum('9', { min: 0.5, max: 5, label: 'X' })).toThrow('X: informe um valor entre 0,5 e 5.')
  })
})
