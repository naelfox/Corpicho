import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { Db } from '@/lib/db'
import type { Measure } from '@/lib/measures'
import type { Per100 } from '@/lib/nutrition'
import { round1 } from '@/lib/validate'
import { AiError, runAi, type RunAiOptions } from './client'

/** O que a IA leu do rótulo, já conferido. `portion` null = o rótulo não traz a porção legível. */
export type LabelRead = { name: string; per100: Per100; portion: Measure | null }

const schema = z.object({
  isLabel: z.boolean(),
  name: z.string(),
  per100: z.object({ kcal100: z.number(), protein100: z.number(), carbs100: z.number(), fat100: z.number() }),
  portionLabel: z.string(),
  portionGrams: z.number(),
})

const INSTRUCTIONS = `Você lê a foto da embalagem de um alimento (tabela de informação nutricional brasileira). Responda em português do Brasil.
Informe:
- isLabel: false se a foto não mostra uma tabela nutricional legível;
- name: nome curto do produto como a pessoa chamaria (ex.: Biscoito cream cracker, Café solúvel, Iogurte natural). Se a marca aparecer, inclua no fim (ex.: "Biscoito cream cracker Vitarella");
- per100: kcal, proteínas, carboidratos e gorduras totais por 100 g (ou 100 ml) exatamente como a coluna "100 g" do rótulo. Se o rótulo só tiver a coluna da porção, converta: valor ÷ gramas da porção × 100;
- portionLabel: a porção em medida caseira, curta (ex.: "3 biscoitos", "1 xícara", "1 colher de sopa", "1 unidade"). Se o rótulo não disser a medida caseira, use "porção";
- portionGrams: gramas (ou ml) dessa porção, como no rótulo (ex.: "Porção de 30 g (6 biscoitos)" → 30). Se não houver, 0.
Não invente números: copie do rótulo. Ignore %VD.`

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** Confere o que a IA devolveu. Lança AiError('bad_output') se não for um rótulo legível. */
export function normalizeLabel(raw: z.infer<typeof schema>): LabelRead {
  const p = raw.per100
  const vals = [p.kcal100, p.protein100, p.carbs100, p.fat100]
  const name = raw.name.trim().slice(0, 120)
  if (!raw.isLabel || !name || !vals.every(isNum) || vals.some((v) => v < 0)) throw new AiError('bad_output')
  if (p.kcal100 > 900 || p.protein100 > 100 || p.carbs100 > 100 || p.fat100 > 100) throw new AiError('bad_output')
  const label = raw.portionLabel.trim().slice(0, 40)
  const g = raw.portionGrams
  return {
    name,
    per100: { kcal100: round1(p.kcal100), protein100: round1(p.protein100), carbs100: round1(p.carbs100), fat100: round1(p.fat100) },
    portion: label && isNum(g) && g > 0 && g <= 5000 ? { label, grams: round1(g) } : null,
  }
}

/** Foto da embalagem → alimento pronto para conferir e salvar. Lança AiError; nada é salvo aqui. */
export async function analyzeLabel(db: Db, imageDataUrl: string, deps?: RunAiOptions<unknown>['deps']): Promise<LabelRead> {
  const raw = await runAi(db, {
    feature: 'label',
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
              { type: 'text', text: 'Leia este rótulo.' },
              { type: 'file', data: imageDataUrl, mediaType: 'image/jpeg' },
            ],
          },
        ],
        output: Output.object({ schema }),
        maxRetries: 1,
        abortSignal: signal,
      })
      return { value: r.output, usage: r.usage }
    },
  })
  return normalizeLabel(raw)
}
