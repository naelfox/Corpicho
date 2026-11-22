import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { Db } from '@/lib/db'
import { searchFoods } from '@/lib/foods'
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
- searchTerms: 1 a 3 palavras genéricas para buscar numa tabela de alimentos brasileira (ex.: "arroz cozido", "feijao carioca cozido", "frango peito grelhado");
- estimatedGrams: peso visual estimado em gramas da porção no prato;
- per100: kcal, proteína, carboidrato e gordura (g) por 100 g (kcal100, protein100, carbs100, fat100);
- confidence: "alta", "media" ou "baixa".
Não invente alimentos que não estão visíveis. Se não houver comida na foto, devolva a lista vazia.`

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
  const terms = new Map<string, string>()
  raw.forEach((i) => terms.set(i.name, i.searchTerms))
  const items: PlateItem[] = []
  for (const it of normalizePlateItems(raw)) {
    const q = terms.get(it.name) ?? it.name
    const [food] = q.trim() ? await searchFoods(db, q, 1) : []
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
