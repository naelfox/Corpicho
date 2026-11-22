import { generateText, type LanguageModel } from 'ai'
import type { Db } from '@/lib/db'
import { ValidationError } from '@/lib/validate'
import { AiError, runAi, type RunAiOptions } from './client'
import { buildContext } from './context'

export type CoachMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }
export type Conversation = { id: string; title: string; createdAt: string }
type Deps = RunAiOptions<unknown>['deps']

const MAX_TEXT = 2000
const HISTORY = 20

const INSTRUCTIONS = `Você é o coach do Corpicho, um app de emagrecimento. Responda sempre em português do Brasil.
Regras:
- Responda só com base nos dados abaixo e em conhecimento geral bem estabelecido. Nunca invente números da pessoa.
- Quando faltar dado, diga o que falta e como registrar no app (Comer para refeições, Corpo para peso, medidas e composição, Treino para treinos).
- Chame de estimativa o que for estimativa; valores "estimados" não são medições.
- Tom educativo, respostas curtas e práticas; use listas com "-" quando ajudar. Pode usar **negrito** com moderação.
- Em temas de saúde, lembre de forma breve (não em toda mensagem) que isso não substitui médico ou nutricionista. Não faça diagnóstico.
- Nunca recomende dietas extremas (abaixo de 1200 kcal por dia) nem aumentos bruscos de treino.
- Se pedirem um treino, sugira de forma geral e diga que o plano completo é gerado na aba Treino.`

type Row = { id: string; role: 'user' | 'assistant'; content: string; created_at: string | Date }
const toMsg = (r: Row): CoachMessage => ({ id: r.id, role: r.role, content: r.content, createdAt: new Date(r.created_at).toISOString() })

export async function listConversations(db: Db): Promise<Conversation[]> {
  const rows = await db.query<{ id: string; title: string; created_at: string | Date }>(
    `select c.id, c.title, c.created_at from ai_conversations c
     order by coalesce((select max(created_at) from ai_messages m where m.conversation_id = c.id), c.created_at) desc, c.created_at desc`,
  )
  return rows.map((r) => ({ id: r.id, title: r.title, createdAt: new Date(r.created_at).toISOString() }))
}

export async function getMessages(db: Db, conversationId: string): Promise<CoachMessage[]> {
  const rows = await db.query<Row>(
    `select id, role, content, created_at from ai_messages where conversation_id = $1
     order by created_at, (role = 'assistant'), ctid`,
    [conversationId],
  )
  return rows.map(toMsg)
}

/** Chama a IA com contexto + últimas 20 mensagens e grava a resposta. Lança AiError sem apagar nada. */
async function reply(db: Db, conversationId: string, deps?: Deps): Promise<string> {
  const now = deps?.now ?? new Date()
  const context = await buildContext(db, now)
  const history = (await getMessages(db, conversationId)).slice(-HISTORY)
  const text = await runAi(db, {
    feature: 'coach',
    kind: 'text',
    deps,
    call: async (model: LanguageModel, signal: AbortSignal) => {
      const r = await generateText({
        model,
        instructions: `${INSTRUCTIONS}\n\n# Dados da pessoa\n${context}`,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        maxRetries: 1,
        abortSignal: signal,
      })
      return { value: r.text, usage: r.usage }
    },
  })
  const answer = text.trim()
  if (!answer) throw new AiError('bad_output')
  await db.query(`insert into ai_messages (conversation_id, role, content) values ($1, 'assistant', $2)`, [conversationId, answer])
  return answer
}

/** Salva a mensagem do usuário antes de chamar a IA (sobrevive a erros), depois grava e devolve a resposta. */
export async function sendCoachMessage(
  db: Db,
  input: { conversationId?: string; text: string; deps?: Deps },
): Promise<{ conversationId: string; reply: string }> {
  const text = input.text.trim()
  if (!text) throw new ValidationError('Escreva uma mensagem.')
  if (text.length > MAX_TEXT) throw new ValidationError(`Mensagem muito longa (máximo ${MAX_TEXT} caracteres).`)
  let id = input.conversationId
  if (!id) {
    const [c] = await db.query<{ id: string }>(`insert into ai_conversations (title) values ($1) returning id`, [text.slice(0, 60)])
    id = c.id
  }
  await db.query(`insert into ai_messages (conversation_id, role, content) values ($1, 'user', $2)`, [id, text])
  try {
    return { conversationId: id, reply: await reply(db, id, input.deps) }
  } catch (e) {
    if (e instanceof AiError) e.conversationId = id // a tela precisa saber qual conversa foi criada
    throw e
  }
}

/** Reenvia a última mensagem do usuário (sem resposta) sem duplicá-la. */
export async function retryLastMessage(
  db: Db,
  conversationId: string,
  deps?: Deps,
): Promise<{ conversationId: string; reply: string }> {
  const last = (await getMessages(db, conversationId)).at(-1)
  if (!last || last.role !== 'user') throw new ValidationError('Não há mensagem para reenviar.')
  return { conversationId, reply: await reply(db, conversationId, deps) }
}
