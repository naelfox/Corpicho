import { describe, expect, it } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { createTestDb } from '@/test/db'
import { ValidationError } from '@/lib/validate'
import { getMessages, listConversations, retryLastMessage, sendCoachMessage } from './coach'

const now = new Date('2026-11-22T15:00:00Z')
const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 50, text: 50, reasoning: 0 },
}
const ok = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: { content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] },
  })
const failing = () =>
  new MockLanguageModelV4({ doGenerate: async () => { throw new TypeError('fetch failed') } })
const deps = (m: MockLanguageModelV4) => ({ model: m, modelId: 'gpt-5.4-mini', limitUsd: 5, now })

describe('coach', () => {
  it('grava as duas mensagens, cria a conversa com título e devolve a resposta', async () => {
    const db = await createTestDb()
    const m = ok('Você ainda pode comer 1400 kcal.')
    const r = await sendCoachMessage(db, { text: 'Quantas calorias ainda posso consumir hoje?', deps: deps(m) })
    expect(r.reply).toBe('Você ainda pode comer 1400 kcal.')
    const msgs = await getMessages(db, r.conversationId)
    expect(msgs.map((x) => [x.role, x.content])).toEqual([
      ['user', 'Quantas calorias ainda posso consumir hoje?'],
      ['assistant', 'Você ainda pode comer 1400 kcal.'],
    ])
    const list = await listConversations(db)
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('Quantas calorias ainda posso consumir hoje?')
    // o contexto vai na chamada
    expect(JSON.stringify(m.doGenerateCalls[0].prompt)).toContain('sem registros')
  })

  it('título com no máximo 60 caracteres e mensagens seguintes na mesma conversa', async () => {
    const db = await createTestDb()
    const a = await sendCoachMessage(db, { text: 'x'.repeat(100), deps: deps(ok('1')) })
    expect((await listConversations(db))[0].title).toHaveLength(60)
    const b = await sendCoachMessage(db, { conversationId: a.conversationId, text: 'oi', deps: deps(ok('2')) })
    expect(b.conversationId).toBe(a.conversationId)
    expect(await getMessages(db, a.conversationId)).toHaveLength(4)
  })

  it('erro da IA: só a mensagem do usuário fica; retry adiciona a resposta sem duplicar', async () => {
    const db = await createTestDb()
    await expect(sendCoachMessage(db, { text: 'Como está minha evolução?', deps: deps(failing()) })).rejects.toMatchObject({ name: 'AiError' })
    const [conv] = await listConversations(db)
    let msgs = await getMessages(db, conv.id)
    expect(msgs.map((x) => x.role)).toEqual(['user'])
    const r = await retryLastMessage(db, conv.id, deps(ok('Bem!')))
    expect(r.reply).toBe('Bem!')
    msgs = await getMessages(db, conv.id)
    expect(msgs.map((x) => x.role)).toEqual(['user', 'assistant'])
  })

  it('retry sem mensagem pendente do usuário é recusado', async () => {
    const db = await createTestDb()
    const r = await sendCoachMessage(db, { text: 'oi', deps: deps(ok('olá')) })
    await expect(retryLastMessage(db, r.conversationId, deps(ok('x')))).rejects.toBeInstanceOf(ValidationError)
  })

  it('manda só as últimas 20 mensagens', async () => {
    const db = await createTestDb()
    let id: string | undefined
    for (let i = 0; i < 12; i++) id = (await sendCoachMessage(db, { conversationId: id, text: `pergunta ${i}`, deps: deps(ok(`resp ${i}`)) })).conversationId
    const m = ok('fim')
    await sendCoachMessage(db, { conversationId: id, text: 'última', deps: deps(m) })
    const prompt = m.doGenerateCalls[0].prompt.filter((p) => p.role !== 'system')
    expect(prompt).toHaveLength(20)
    expect(JSON.stringify(prompt)).toContain('última')
    expect(JSON.stringify(prompt)).not.toContain('pergunta 0"')
  })
})
