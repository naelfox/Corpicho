import { generateText, type LanguageModel, type UserContent } from 'ai'
import type { Db } from '@/lib/db'
import { ValidationError } from '@/lib/validate'
import { AiError, runAi, type RunAiOptions } from './client'

export const PHOTO_COMPARE_INSTRUCTIONS = `Você compara fotos do corpo de uma pessoa tiradas em duas datas ("antes" e "depois"), para ela acompanhar a própria evolução. Responda em português do Brasil.
Regras:
- Descreva só mudanças visuais aparentes entre "antes" e "depois": postura, contorno da silhueta, definição muscular, impressão de volume.
- Não informe números de nenhum tipo. Não cite medidas, centímetros, peso, quilos, idade nem percentual de gordura, nem como estimativa.
- Não faça julgamentos médicos, diagnósticos nem comentários sobre saúde.
- Se não houver mudança clara, diga isso com naturalidade. Não invente diferenças.
- Lembre, em uma frase, que luz, ângulo, roupa e horário do dia mudam bastante a percepção.
- Tom neutro e encorajador, sem julgar o corpo. Seja breve: no máximo 5 frases curtas.`

type Deps = RunAiOptions<unknown>['deps']

/**
 * Descreve as mudanças visuais entre fotos "antes" e "depois" (data URLs já reduzidas).
 * Lança AiError (ver AI_ERROR_TEXT). Nada é salvo além do registro de uso.
 */
export async function describeChanges(
  db: Db,
  input: { before: string[]; after: string[]; beforeLabels?: string[]; afterLabels?: string[]; deps?: Deps },
): Promise<string> {
  if (input.before.length === 0 || input.after.length === 0) {
    throw new ValidationError('Escolha uma foto de antes e uma de depois.')
  }
  const content: UserContent = [{ type: 'text', text: 'Compare as fotos de antes e depois.' }]
  input.before.forEach((data, i) => {
    content.push({ type: 'text', text: input.beforeLabels?.[i] ?? `Antes – foto ${i + 1}` })
    content.push({ type: 'file', data, mediaType: 'image/jpeg' })
  })
  input.after.forEach((data, i) => {
    content.push({ type: 'text', text: input.afterLabels?.[i] ?? `Depois – foto ${i + 1}` })
    content.push({ type: 'file', data, mediaType: 'image/jpeg' })
  })
  const text = await runAi(db, {
    feature: 'photo_compare',
    kind: 'vision',
    deps: input.deps,
    call: async (model: LanguageModel, signal: AbortSignal) => {
      const r = await generateText({
        model,
        instructions: PHOTO_COMPARE_INSTRUCTIONS,
        messages: [{ role: 'user', content }],
        maxRetries: 1,
        abortSignal: signal,
      })
      return { value: r.text, usage: r.usage }
    },
  })
  const out = text.trim()
  if (!out) throw new AiError('bad_output')
  return out
}
