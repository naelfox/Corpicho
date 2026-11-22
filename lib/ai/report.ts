import { generateText, type LanguageModel } from 'ai'
import type { Db } from '@/lib/db'
import type { WeekNumbers } from '@/lib/reports'
import { runAi, type RunAiOptions } from './client'

const INSTRUCTIONS = `Você escreve o resumo semanal de uma pessoa que quer emagrecer, no app Corpicho. Responda em português do Brasil, com no máximo 150 palavras.
Regras:
- Use somente os números enviados (JSON). Não invente dados, causas nem valores. Valores null ou listas vazias significam que não há dado: diga isso em vez de supor.
- Estrutura, com estes títulos em negrito: **O que melhorou**, **O que merece atenção** e **Sugestões** (de 1 a 3 itens, em lista com "-", práticas e pequenas).
- Tom neutro e acolhedor, sem culpar a pessoa. Sem afirmações médicas nem diagnóstico; não mencione porcentagem de gordura.
- Peso em kg, medidas em cm (deltas negativos = diminuiu), kcal e proteína em médias dos dias com registro.`

/** Texto curto (markdown simples) analisando a semana a partir dos números. Lança AiError. */
export async function analyzeWeek(db: Db, numbers: WeekNumbers, deps?: RunAiOptions<unknown>['deps']): Promise<string> {
  const text = await runAi(db, {
    feature: 'weekly_report',
    kind: 'text',
    deps,
    call: async (model: LanguageModel, signal: AbortSignal) => {
      const r = await generateText({
        model,
        instructions: INSTRUCTIONS,
        prompt: `Números da semana (JSON):\n${JSON.stringify(numbers)}`,
        maxRetries: 1,
        abortSignal: signal,
      })
      return { value: r.text, usage: r.usage }
    },
  })
  return text.trim()
}
