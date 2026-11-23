import { describe, expect, it } from 'vitest'
import taco from './taco.json'
import { measuresFor } from './measures'

const labels = (name: string) => measuresFor(name).map((m) => `${m.label}=${m.grams}`)

describe('medidas caseiras', () => {
  it('dá as medidas do prato do dia a dia', () => {
    expect(labels('Arroz, tipo 1, cozido')).toEqual(['colher de sopa cheia=25', 'colher de servir=45'])
    expect(labels('Feijão, carioca, cozido')).toEqual(['colher de sopa=20', 'concha média=86'])
    expect(labels('Ovo, de galinha, inteiro, cozido/10minutos')).toEqual(['unidade=50'])
    expect(labels('Pão, trigo, francês')).toEqual(['unidade=50'])
    expect(labels('Frango, peito, sem pele, grelhado')).toEqual(['filé/pedaço médio=100'])
    expect(labels('Carne, bovina, acém, moído, cozido')).toEqual(['colher de sopa cheia=25', 'colher de servir=60'])
    expect(labels('Banana, nanica, crua')).toEqual(['unidade média=100'])
    expect(labels('Banana, prata, crua')).toEqual(['unidade média=70'])
    expect(labels('Laranja, pêra, suco')).toEqual(['copo (200 ml)=200'])
  })

  it('não confunde parecidos nem dá medida de cozido ao cru', () => {
    expect(measuresFor('Arroz, tipo 1, cru')).toEqual([])
    expect(measuresFor('Macarrão, trigo, cru')).toEqual([])
    expect(labels('Maçã, Fuji, com casca, crua')).toEqual(['unidade média=130'])
    expect(labels('Pão, de queijo, assado')).toEqual(['unidade média=40'])
    expect(labels('Queijo, requeijão, cremoso')).toEqual(['colher de sopa=20'])
    expect(measuresFor('Banana, doce em barra')).toEqual([])
    expect(measuresFor('Frango, coração, grelhado')).toEqual([])
  })

  it('vale para alimento criado pelo usuário pelo nome', () => {
    expect(labels('macarrao cozido')).toEqual(['pegador=110'])
    expect(measuresFor('Bolo de cenoura da vó')).toEqual([{ label: 'fatia média', grams: 60 }])
  })

  it('todas as medidas têm peso positivo e rótulo', () => {
    for (const f of taco as { name: string }[]) for (const m of measuresFor(f.name)) {
      expect(m.grams).toBeGreaterThan(0)
      expect(m.label.length).toBeGreaterThan(0)
    }
  })
})
