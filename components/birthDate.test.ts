import { describe, expect, it } from 'vitest'
import { fromIso, maskDate, toIso } from './birthDate'

describe('data de nascimento digitada', () => {
  it('insere as barras enquanto digita', () => {
    expect(maskDate('1')).toBe('1')
    expect(maskDate('130')).toBe('13/0')
    expect(maskDate('13021998')).toBe('13/02/1998')
    expect(maskDate('13/02/19989')).toBe('13/02/1998')
    expect(maskDate('13-02-1998')).toBe('13/02/1998')
  })

  it('converte para ISO só quando a data existe', () => {
    expect(toIso('13/02/1998')).toBe('1998-02-13')
    expect(toIso('13/02/199')).toBe('')
    expect(toIso('31/02/1998')).toBe('')
    expect(toIso('29/02/2000')).toBe('2000-02-29')
  })

  it('mostra a data salva no formato brasileiro', () => {
    expect(fromIso('1998-02-13')).toBe('13/02/1998')
    expect(fromIso('')).toBe('')
  })
})
