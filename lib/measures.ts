import { normalize } from './foods'

/** Medida caseira: rótulo curto e o peso aproximado de 1 unidade dela, em gramas (líquidos: 1 ml ≈ 1 g). */
export type Measure = { label: string; grams: number }

type Rule = { when: (n: string, has: (...w: string[]) => boolean) => boolean; measures: Measure[] }

const cooked = (has: (...w: string[]) => boolean) => has('cozido', 'cozida', 'refogado', 'refogada', 'grelhado', 'grelhada', 'assado', 'assada', 'frito', 'frita')
const sweetOrProcessed = (has: (...w: string[]) => boolean) => has('doce', 'calda', 'suco', 'polpa', 'barra', 'passa', 'desidratada', 'desidratado')

/**
 * Valores médios de tabelas brasileiras de medidas caseiras. São aproximações: a porção real varia
 * com a colher, o prato e quem serve. A primeira regra que casa vence; sem regra, só gramas.
 */
const RULES: Rule[] = [
  { when: (_, has) => has('requeijao'), measures: [{ label: 'colher de sopa', grams: 20 }] },
  { when: (n) => n.startsWith('pao de queijo'), measures: [{ label: 'unidade média', grams: 40 }] },
  { when: (n) => n.startsWith('pao') && n.includes('frances'), measures: [{ label: 'unidade', grams: 50 }] },
  { when: (n, has) => n.startsWith('pao') && has('forma'), measures: [{ label: 'fatia', grams: 25 }] },
  { when: (n) => n.startsWith('torrada'), measures: [{ label: 'unidade', grams: 8 }] },
  { when: (n, has) => has('arroz') && has('cozido') && !has('farinha', 'creme'), measures: [{ label: 'colher de sopa cheia', grams: 25 }, { label: 'colher de servir', grams: 45 }] },
  { when: (n, has) => has('feijao') && has('cozido') && !has('tropeiro', 'broto'), measures: [{ label: 'colher de sopa', grams: 20 }, { label: 'concha média', grams: 86 }] },
  { when: (n, has) => has('macarrao') && !has('cru', 'instantaneo'), measures: [{ label: 'pegador', grams: 110 }] },
  { when: (n, has) => has('moido', 'moida') && !has('cru', 'crua'), measures: [{ label: 'colher de sopa cheia', grams: 25 }, { label: 'colher de servir', grams: 60 }] },
  { when: (n, has) => n.startsWith('ovo') && has('codorna'), measures: [{ label: 'unidade', grams: 10 }] },
  { when: (n, has) => n.startsWith('ovo') && has('clara'), measures: [{ label: 'clara', grams: 30 }] },
  { when: (n, has) => n.startsWith('ovo') && has('gema'), measures: [{ label: 'gema', grams: 17 }] },
  { when: (n, has) => n.startsWith('ovo') && has('inteiro'), measures: [{ label: 'unidade', grams: 50 }] },
  { when: (n, has) => has('frango') && has('coxa') && cooked(has), measures: [{ label: 'coxa (sem osso)', grams: 60 }] },
  { when: (n, has) => (has('file', 'peito', 'bife', 'posta') || n.startsWith('carne') || n.startsWith('frango')) && cooked(has) && !has('coracao', 'moela', 'bucho'), measures: [{ label: 'filé/pedaço médio', grams: 100 }] },
  { when: (n, has) => has('atum', 'sardinha') && has('conserva'), measures: [{ label: 'colher de sopa', grams: 20 }] },
  { when: (n, has) => has('queijo') && has('minas', 'ricota'), measures: [{ label: 'fatia média', grams: 30 }] },
  { when: (n, has) => has('queijo') && has('mozarela', 'mussarela', 'prato'), measures: [{ label: 'fatia', grams: 15 }] },
  { when: (n, has) => has('queijo') && has('parmesao'), measures: [{ label: 'colher de sopa (ralado)', grams: 10 }] },
  { when: (_, has) => has('presunto', 'mortadela', 'apresuntado', 'peru'), measures: [{ label: 'fatia', grams: 15 }] },
  { when: (_, has) => has('refrigerante'), measures: [{ label: 'copo (200 ml)', grams: 200 }, { label: 'lata (350 ml)', grams: 350 }] },
  { when: (n, has) => n.startsWith('limao') && has('suco'), measures: [{ label: 'colher de sopa', grams: 15 }] },
  { when: (_, has) => has('suco'), measures: [{ label: 'copo (200 ml)', grams: 200 }] },
  { when: (_, has) => has('cafe') && has('infusao'), measures: [{ label: 'xícara de cafezinho', grams: 50 }, { label: 'xícara de chá', grams: 180 }] },
  { when: (_, has) => has('condensado'), measures: [{ label: 'colher de sopa', grams: 20 }] },
  { when: (n) => n.startsWith('creme de leite'), measures: [{ label: 'colher de sopa', grams: 15 }] },
  { when: (n, has) => n.startsWith('leite') && has('po'), measures: [{ label: 'colher de sopa', grams: 16 }] },
  { when: (n, has) => n.startsWith('leite') && !has('coco'), measures: [{ label: 'copo (200 ml)', grams: 200 }, { label: 'xícara de chá', grams: 180 }] },
  { when: (n) => n.startsWith('iogurte'), measures: [{ label: 'pote', grams: 170 }] },
  { when: (n, has) => n.startsWith('banana') && has('nanica') && !sweetOrProcessed(has), measures: [{ label: 'unidade média', grams: 100 }] },
  { when: (n, has) => n.startsWith('banana') && !sweetOrProcessed(has), measures: [{ label: 'unidade média', grams: 70 }] },
  { when: (n, has) => /^maca( |$)/.test(n) && !sweetOrProcessed(has), measures: [{ label: 'unidade média', grams: 130 }] },
  { when: (n, has) => (n.startsWith('laranja') || n.startsWith('tangerina') || n.startsWith('mexerica')) && !sweetOrProcessed(has), measures: [{ label: 'unidade média', grams: 140 }] },
  { when: (n, has) => n.startsWith('mamao') && !sweetOrProcessed(has), measures: [{ label: 'fatia média', grams: 150 }] },
  { when: (n, has) => (n.startsWith('melancia') || n.startsWith('melao')) && !sweetOrProcessed(has), measures: [{ label: 'fatia média', grams: 200 }] },
  { when: (n, has) => n.startsWith('abacaxi') && !sweetOrProcessed(has), measures: [{ label: 'fatia média', grams: 75 }] },
  { when: (n, has) => n.startsWith('tomate') && has('cru', 'salada'), measures: [{ label: 'fatia', grams: 15 }, { label: 'unidade média', grams: 100 }] },
  { when: (n) => n.startsWith('alface'), measures: [{ label: 'folha', grams: 10 }] },
  { when: (n, has) => (n.startsWith('batata') || n.startsWith('mandioca') || n.startsWith('aipim')) && has('cozida', 'sauté', 'saute'), measures: [{ label: 'colher de sopa cheia', grams: 30 }] },
  { when: (_, has) => has('farofa') || (has('farinha') && has('mandioca')), measures: [{ label: 'colher de sopa', grams: 16 }] },
  { when: (n, has) => cooked(has) && /^(cenoura|abobora|abobrinha|chuchu|brocolis|couve|vagem|beterraba|espinafre|repolho)/.test(n), measures: [{ label: 'colher de sopa cheia', grams: 25 }] },
  { when: (n) => n.startsWith('aveia'), measures: [{ label: 'colher de sopa', grams: 15 }] },
  { when: (n) => n.startsWith('acucar'), measures: [{ label: 'colher de chá', grams: 5 }, { label: 'colher de sopa', grams: 12 }] },
  { when: (n) => n.startsWith('mel ') || n === 'mel', measures: [{ label: 'colher de sopa', grams: 20 }] },
  { when: (n, has) => (n.startsWith('azeite') || n.startsWith('oleo')) && !has('conserva'), measures: [{ label: 'colher de chá', grams: 3 }, { label: 'colher de sopa', grams: 8 }] },
  { when: (n) => n.startsWith('manteiga') || n.startsWith('margarina'), measures: [{ label: 'colher de chá', grams: 5 }] },
  { when: (n, has) => n.startsWith('bolo') && !has('mistura'), measures: [{ label: 'fatia média', grams: 60 }] },
  { when: (n, has) => n.startsWith('biscoito') && has('recheado'), measures: [{ label: 'unidade', grams: 15 }] },
  { when: (n, has) => n.startsWith('biscoito') && has('polvilho'), measures: [{ label: 'unidade', grams: 2 }] },
  { when: (n) => n.startsWith('biscoito'), measures: [{ label: 'unidade', grams: 6 }] },
]

/** Medidas caseiras que fazem sentido para o alimento; [] quando não há uma confiável (fica só em gramas). */
export function measuresFor(foodName: string): Measure[] {
  const n = normalize(foodName)
  const words = new Set(n.split(' '))
  const has = (...w: string[]) => w.some((x) => words.has(x))
  return RULES.find((r) => r.when(n, has))?.measures ?? []
}
