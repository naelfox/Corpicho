import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { Db } from '@/lib/db'
import { todayIn } from '@/lib/dates'
import { ageOn } from '@/lib/nutrition'
import { getProfile } from '@/lib/profile'
import { getSeries } from '@/lib/series'
import { runAi, type RunAiOptions } from './client'

/** Uma atividade entendida do texto, com o gasto estimado (ou o número que a pessoa disse). */
export type BurnItem = {
  label: string
  kcal: number
  /** 'informado' = a pessoa disse o número (relógio, esteira); 'estimado' = calculado pela IA/MET. */
  basis: 'informado' | 'estimado'
  confidence: 'alta' | 'media' | 'baixa'
}

const itemSchema = z.object({
  label: z.string(),
  minutes: z.number().nullable(),
  met: z.number().nullable(),
  statedKcal: z.number().nullable(),
  kcal: z.number(),
  confidence: z.enum(['alta', 'media', 'baixa']),
})
const schema = z.object({ items: z.array(itemSchema) })

const INSTRUCTIONS = `Você lê o que uma pessoa escreveu (ou ditou por voz) sobre a atividade física que fez e transforma em gastos calóricos para anotar. Responda em português do Brasil.
O texto pode ter erros de ditado, falta de pontuação e números por extenso ("meia hora", "uma hora e meia"). Identifique cada atividade citada. Para cada uma informe:
- label: nome curto da atividade (ex.: Corrida, Musculação, Caminhada, Futebol, Bike), até 40 caracteres;
- minutes: duração em minutos, se foi dita ou dá para deduzir; senão null;
- met: o MET da atividade na intensidade descrita (Compendium of Physical Activities; ex.: caminhada leve 3.5, corrida 8 km/h 8.3, musculação 5, bike moderada 7, futebol 7); null se a pessoa já disse as calorias;
- statedKcal: se a pessoa disse quantas calorias gastou (do relógio, esteira, app), esse número; senão null;
- kcal: sua estimativa do gasto total da atividade para os dados da pessoa;
- confidence: "alta" se a atividade e a duração (ou as calorias) estão claras, "media" se você estimou a duração, "baixa" se nem a atividade está clara.
Não invente atividades que a pessoa não citou. Se o texto não fala de atividade física, devolva a lista vazia.`

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * Confere e fecha o número de cada item: calorias ditas pela pessoa valem como estão;
 * com MET, duração e peso, o gasto é MET × kg × horas (a conta não fica a cargo do modelo);
 * senão, a estimativa da IA. Descarta o que não tem nome ou fica fora de 1–5000 kcal.
 */
export function normalizeBurnItems(raw: unknown[], weightKg: number | null): BurnItem[] {
  const out: BurnItem[] = []
  for (const r of raw) {
    const it = r as Partial<z.infer<typeof itemSchema>> | null
    const label = typeof it?.label === 'string' ? it.label.trim().slice(0, 80) : ''
    if (!label) continue
    let kcal: number | null = null
    let basis: BurnItem['basis'] = 'estimado'
    if (isNum(it?.statedKcal) && it.statedKcal > 0) {
      kcal = it.statedKcal
      basis = 'informado'
    } else if (isNum(it?.met) && isNum(it?.minutes) && weightKg && it.met > 0 && it.met <= 25 && it.minutes > 0 && it.minutes <= 1440) {
      kcal = (it.met * weightKg * it.minutes) / 60
    } else if (isNum(it?.kcal)) {
      kcal = it.kcal
    }
    if (kcal === null) continue
    const k = Math.round(kcal)
    if (k < 1 || k > 5000) continue
    const confidence = basis === 'informado' ? 'alta' : it?.confidence === 'alta' || it?.confidence === 'media' ? it.confidence : 'baixa'
    out.push({ label, kcal: k, basis, confidence })
    if (out.length === 10) break
  }
  return out
}

/** Peso, sexo e idade para a IA estimar o gasto (o que faltar fica de fora). */
async function personContext(db: Db): Promise<{ text: string; weightKg: number | null }> {
  const [profile, weight] = await Promise.all([getProfile(db), getSeries(db, 'peso', 'tudo')])
  const parts: string[] = []
  if (weight.last) parts.push(`peso ${weight.last} kg`)
  if (profile) {
    parts.push(profile.sex === 'f' ? 'mulher' : 'homem')
    parts.push(`${ageOn(profile.birthDate, todayIn())} anos`)
    parts.push(`${profile.heightCm} cm`)
  }
  return { text: parts.length ? `Dados da pessoa: ${parts.join(', ')}.` : 'Dados da pessoa: desconhecidos (use um adulto de 75 kg).', weightKg: weight.last }
}

/** Descrição da atividade (digitada ou ditada pelo teclado) → gastos para conferir. Lança AiError; nada é salvo aqui. */
export async function analyzeBurnText(db: Db, text: string, deps?: RunAiOptions<unknown>['deps']): Promise<BurnItem[]> {
  const t = text.trim()
  if (!t) return []
  const person = await personContext(db)
  const raw = await runAi(db, {
    feature: 'burn_text',
    kind: 'text',
    deps,
    call: async (model: LanguageModel, signal: AbortSignal) => {
      const r = await generateText({
        model,
        instructions: INSTRUCTIONS,
        messages: [{ role: 'user', content: `${person.text}\n\nO que fiz: ${t.slice(0, 2000)}` }],
        output: Output.object({ schema }),
        maxRetries: 1,
        abortSignal: signal,
      })
      return { value: r.output.items, usage: r.usage }
    },
  })
  return normalizeBurnItems(raw, person.weightKg)
}
