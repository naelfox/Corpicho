import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { Db } from '@/lib/db'
import { bestFoodMatch } from '@/lib/foods'
import type { Per100 } from '@/lib/nutrition'
import { round1 } from '@/lib/validate'
import { runAi, type RunAiOptions } from './client'

export type PlateItem = {
  name: string
  estimatedGrams: number
  per100: Per100
  confidence: 'alta' | 'media' | 'baixa'
  foodId?: string
}

const itemSchema = z.object({
  name: z.string(),
  searchTerms: z.string(),
  estimatedGrams: z.number(),
  per100: z.object({ kcal100: z.number(), protein100: z.number(), carbs100: z.number(), fat100: z.number() }),
  confidence: z.enum(['alta', 'media', 'baixa']),
})
const schema = z.object({ items: z.array(itemSchema) })

const INSTRUCTIONS = `Você analisa a foto de um prato de comida para uma pessoa que registra o que come. Responda em português do Brasil.
Identifique cada alimento distinto que aparece na foto. Para cada um informe:
- name: nome do alimento como aparece (ex.: Arroz branco cozido);
- searchTerms: 2 a 4 palavras para buscar na tabela TACO, no estilo dela: comece pelo alimento principal e depois tipo e preparo (ex.: "arroz tipo 1 cozido", "feijao carioca cozido", "ovo galinha cozido", "pao trigo frances", "frango peito grelhado"). Se o item for um prato composto, comece pelo prato (ex.: "feijoada");
- estimatedGrams: peso visual estimado em gramas da porção no prato;
- per100: kcal, proteína, carboidrato e gordura (g) por 100 g (kcal100, protein100, carbs100, fat100);
- confidence: "alta", "media" ou "baixa".
Não invente alimentos que não estão visíveis. Se não houver comida na foto, devolva a lista vazia.`

const TEXT_INSTRUCTIONS = `Você lê o que uma pessoa escreveu (ou ditou por voz) sobre o que comeu e transforma em itens para registrar. Responda em português do Brasil.
O texto pode ter erros de ditado, falta de pontuação e números por extenso ("dois ovos", "meia xícara"). Identifique cada alimento ou bebida citado. Para cada um informe:
- name: nome claro do alimento (ex.: Ovo mexido, Pão francês, Café com leite);
- searchTerms: 2 a 4 palavras para buscar na tabela TACO, no estilo dela: comece pelo alimento principal e depois tipo e preparo (ex.: "arroz tipo 1 cozido", "feijao carioca cozido", "ovo galinha mexido", "pao trigo frances", "frango peito grelhado"). Se o item for um prato composto, comece pelo prato (ex.: "feijoada");
- estimatedGrams: o total em gramas (ou ml, para bebidas) da quantidade dita. Converta unidades e medidas caseiras: "2 ovos" ≈ 100, "1 pão francês" ≈ 50, "1 concha de feijão" ≈ 140, "3 colheres de sopa de arroz" ≈ 75, "1 copo de suco" ≈ 240, "1 fatia de queijo" ≈ 20. Sem quantidade dita, use uma porção comum de um adulto;
- per100: kcal, proteína, carboidrato e gordura (g) por 100 g (kcal100, protein100, carbs100, fat100);
- confidence: "alta" se o alimento e a quantidade estão claros, "media" se você estimou a quantidade, "baixa" se nem o alimento está claro.
Não invente alimentos que a pessoa não citou. Se o texto não fala de comida, devolva a lista vazia.`

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

export function normalizePlateItems(raw: unknown[]): PlateItem[] {
  const out: PlateItem[] = []
  const seen = new Set<string>()
  for (const r of raw) {
    const it = r as Partial<PlateItem> | null
    const name = typeof it?.name === 'string' ? it.name.trim() : ''
    const g = it?.estimatedGrams
    const p = it?.per100
    if (!name || !isNum(g) || g <= 0 || g > 2000 || !p) continue
    const vals = [p.kcal100, p.protein100, p.carbs100, p.fat100]
    if (!vals.every(isNum) || vals.some((v) => v < 0)) continue
    if (p.kcal100 > 900 || p.protein100 > 100 || p.carbs100 > 100 || p.fat100 > 100) continue
    const grams = Math.round(g)
    if (grams <= 0) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const confidence = it?.confidence === 'alta' || it?.confidence === 'media' ? it.confidence : 'baixa'
    const item: PlateItem = {
      name,
      estimatedGrams: grams,
      per100: {
        kcal100: round1(p.kcal100),
        protein100: round1(p.protein100),
        carbs100: round1(p.carbs100),
        fat100: round1(p.fat100),
      },
      confidence,
    }
    if (typeof it?.foodId === 'string') item.foodId = it.foodId
    out.push(item)
    if (out.length === 12) break
  }
  return out
}

export async function analyzePlate(
  db: Db,
  imageDataUrl: string,
  deps?: RunAiOptions<unknown>['deps'],
): Promise<PlateItem[]> {
  const raw = await runAi(db, {
    feature: 'plate',
    kind: 'vision',
    deps,
    call: async (model: LanguageModel, signal: AbortSignal) => {
      const r = await generateText({
        model,
        instructions: INSTRUCTIONS,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analise este prato.' },
              { type: 'file', data: imageDataUrl, mediaType: 'image/jpeg' },
            ],
          },
        ],
        output: Output.object({ schema }),
        maxRetries: 1,
        abortSignal: signal,
      })
      return { value: r.output.items, usage: r.usage }
    },
  })
  return matchTaco(db, raw)
}

/**
 * Descrição em texto (digitada ou ditada pelo teclado) → itens com gramas, como na foto.
 * Lança AiError; nada é salvo aqui.
 */
export async function analyzeMealText(
  db: Db,
  text: string,
  deps?: RunAiOptions<unknown>['deps'],
): Promise<PlateItem[]> {
  const t = text.trim()
  if (!t) return []
  const raw = await runAi(db, {
    feature: 'meal_text',
    kind: 'text',
    deps,
    call: async (model: LanguageModel, signal: AbortSignal) => {
      const r = await generateText({
        model,
        instructions: TEXT_INSTRUCTIONS,
        messages: [{ role: 'user', content: t.slice(0, 2000) }],
        output: Output.object({ schema }),
        maxRetries: 1,
        abortSignal: signal,
      })
      return { value: r.output.items, usage: r.usage }
    },
  })
  return matchTaco(db, raw)
}

type RawItem = z.infer<typeof itemSchema>

/** Normaliza o que a IA devolveu e troca cada item pelo alimento da TACO mais parecido (se houver). */
async function matchTaco(db: Db, raw: RawItem[]): Promise<PlateItem[]> {
  // Mesma chave da deduplicação em normalizePlateItems (nome sem espaços nas pontas, minúsculo).
  const terms = new Map<string, string>()
  for (const i of raw) {
    const key = typeof i.name === 'string' ? i.name.trim().toLowerCase() : ''
    if (key && !terms.has(key)) terms.set(key, i.searchTerms)
  }
  const items: PlateItem[] = []
  for (const it of normalizePlateItems(raw)) {
    const q = terms.get(it.name.toLowerCase()) ?? it.name
    // Busca por relevância (não a ordem de "usados recentemente" da busca manual). Sem bom candidato, fica a IA.
    const food = await bestFoodMatch(db, q)
    items.push(
      food
        ? {
            ...it,
            name: food.name,
            foodId: food.id,
            per100: {
              kcal100: food.kcal100,
              protein100: food.protein100,
              carbs100: food.carbs100,
              fat100: food.fat100,
            },
          }
        : it,
    )
  }
  return items
}
