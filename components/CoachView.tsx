'use client'

import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowUp, MessageCirclePlus, MessagesSquare, RotateCcw } from 'lucide-react'
import { loadConversations, loadMessages, retryCoachApi, sendCoachApi, type CoachMessage, type Conversation } from '@/lib/api'
import { AI_ERROR_TEXT, AiError } from '@/lib/ai/client'
import { ValidationError } from '@/lib/validate'
import { Sheet } from './Sheet'
import { toast } from './Toast'

const SUGGESTIONS = [
  'Quantas calorias ainda posso consumir hoje?',
  'Estou comendo proteína suficiente?',
  'Como está minha evolução?',
  'Por que meu peso não está diminuindo?',
  'Monte um treino para esta semana.',
  'Analise minha alimentação dos últimos sete dias.',
  'Estou perdendo medidas?',
  'O que posso melhorar na minha rotina?',
]

/** **negrito** → <strong>; todo o resto vira texto (nunca HTML). */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

/** Markdown mínimo e seguro: parágrafos, listas (- / * / 1.), títulos (#) e **negrito**. */
export function RichText({ text }: { text: string }) {
  type Block = { kind: 'p' | 'ul' | 'ol'; lines: string[] }
  const blocks: Block[] = []
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim()
    if (!line) {
      blocks.push({ kind: 'p', lines: [] })
      continue
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/)
    const num = line.match(/^\d+[.)]\s+(.*)$/)
    const kind = bullet ? 'ul' : num ? 'ol' : 'p'
    const content = (bullet ?? num)?.[1] ?? line.replace(/^#{1,6}\s+/, '')
    const last = blocks[blocks.length - 1]
    if (last && last.kind === kind && last.lines.length && kind !== 'p') last.lines.push(content)
    else if (last && last.kind === 'p' && kind === 'p' && last.lines.length) last.lines.push(content)
    else if (last && last.kind === 'p' && !last.lines.length) {
      last.kind = kind
      last.lines.push(content)
    } else blocks.push({ kind, lines: [content] })
  }
  return (
    <div className="flex flex-col gap-2">
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.kind === 'p' ? (
            <p key={i}>
              {b.lines.map((l, k) => (
                <Fragment key={k}>
                  {k > 0 && <br />}
                  {inline(l)}
                </Fragment>
              ))}
            </p>
          ) : (
            <ul key={i} className={`flex flex-col gap-1 pl-5 ${b.kind === 'ul' ? 'list-disc' : 'list-decimal'}`}>
              {b.lines.map((l, k) => (
                <li key={k}>{inline(l)}</li>
              ))}
            </ul>
          ),
        )}
    </div>
  )
}

function Bubble({ m }: { m: CoachMessage }) {
  const mine = m.role === 'user'
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-[15px] leading-snug break-words ${
          mine
            ? 'rounded-br-md bg-[var(--accent)] text-[var(--accent-ink)] whitespace-pre-wrap'
            : 'rounded-bl-md bg-[var(--card)] shadow-[var(--shadow-card)]'
        }`}
      >
        {mine ? m.content : <RichText text={m.content} />}
      </div>
    </div>
  )
}

const errText = (e: unknown) =>
  e instanceof ValidationError ? e.message : e instanceof AiError ? AI_ERROR_TEXT[e.code] : AI_ERROR_TEXT.failed

/** Aba Coach: conversa com a IA sobre os dados do usuário, tudo gravado no aparelho. */
export function CoachView() {
  const [convId, setConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [convs, setConvs] = useState<Conversation[]>([])
  const [listOpen, setListOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages, sending, error])

  const refreshList = useCallback(async () => {
    try {
      setConvs(await loadConversations())
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial do banco local
    void refreshList()
  }, [refreshList])

  /** Depois de enviar/reenviar: relê do banco (a pergunta fica salva mesmo se a IA falhar). */
  const settle = async (id: string | null, failure: unknown | null) => {
    if (id) {
      setConvId(id)
      setMessages(await loadMessages(id))
    }
    setError(failure ? errText(failure) : null)
    if (failure && !(failure instanceof AiError) && !(failure instanceof ValidationError)) console.error(failure)
    await refreshList()
  }

  const run = async (op: () => Promise<{ conversationId: string }>, id: string | null) => {
    setSending(true)
    setError(null)
    try {
      const r = await op()
      await settle(r.conversationId, null)
    } catch (e) {
      if (e instanceof ValidationError) {
        toast(e.message, 'erro')
        setSending(false)
        return
      }
      if (e instanceof AiError && e.code === 'no_key') toast(AI_ERROR_TEXT.no_key, 'erro')
      await settle(e instanceof AiError && e.conversationId ? e.conversationId : id, e)
    } finally {
      setSending(false)
    }
  }

  const send = (raw: string) => {
    const t = raw.trim()
    if (!t || sending) return
    setText('')
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: t, createdAt: new Date().toISOString() }])
    void run(() => sendCoachApi({ conversationId: convId ?? undefined, text: t }), convId)
  }

  const retry = () => {
    if (convId && !sending) void run(() => retryCoachApi(convId), convId)
  }

  const open = async (id: string) => {
    setListOpen(false)
    try {
      setMessages(await loadMessages(id))
      setConvId(id)
      setError(null)
    } catch (e) {
      console.error(e)
      toast('Não deu para abrir a conversa.', 'erro')
    }
  }

  const fresh = () => {
    setListOpen(false)
    setConvId(null)
    setMessages([])
    setError(null)
    inputRef.current?.focus()
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send(text)
    }
  }

  const last = messages[messages.length - 1]
  const unanswered = !sending && last?.role === 'user' && !!convId
  const btnTop =
    'flex h-10 items-center gap-1.5 disabled:opacity-40 rounded-xl px-3 text-[14px] font-medium text-[var(--accent-text)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.97] [@media(hover:hover)]:hover:bg-[var(--track)]'

  return (
    <div className="flex flex-col pt-2">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" disabled={sending} onClick={() => { void refreshList(); setListOpen(true) }} className={`${btnTop} -ml-3`}>
          <MessagesSquare aria-hidden size={18} /> Conversas
        </button>
        <button type="button" disabled={sending} onClick={fresh} className={`${btnTop} -mr-3`}>
          <MessageCirclePlus aria-hidden size={18} /> Nova conversa
        </button>
      </div>

      {messages.length === 0 && !sending ? (
        <div className="anim-enter-up pt-4">
          <h2 className="text-[19px] font-semibold tracking-[-0.01em]">Pergunte ao seu coach</h2>
          <p className="mt-1 text-[14px] leading-snug text-[var(--muted)]">
            Ele responde com base nos seus registros de comida, corpo e treino. Não substitui médico ou nutricionista.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="min-h-11 rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-left text-[14px] leading-snug transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3" aria-live="polite">
          {messages.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
          {sending && (
            <div className="flex justify-start" role="status">
              <div className="rounded-2xl rounded-bl-md bg-[var(--card)] px-4 py-2.5 text-[15px] text-[var(--muted)] shadow-[var(--shadow-card)]">
                pensando…
              </div>
            </div>
          )}
          {unanswered && (
            <div className="flex justify-start">
              <div role="alert" className="max-w-[88%] rounded-2xl rounded-bl-md border border-[var(--danger)]/40 bg-[var(--card)] px-4 py-3 text-[14px]">
                <p className="text-[var(--danger)]">{error ?? 'Esta pergunta ficou sem resposta.'}</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-2 flex h-11 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 text-[15px] font-medium text-[var(--accent-ink)] active:scale-[0.97]"
                >
                  <RotateCcw aria-hidden size={16} /> Tentar de novo
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* espaço para a barra de mensagem fixa não cobrir a última bolha */}
      <div aria-hidden className="h-20" />
      <div ref={endRef} />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(text)
        }}
        className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t border-[var(--line)]/60 bg-[var(--bg)]/95 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-lg items-end gap-2 px-4 py-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            maxLength={2000}
            aria-label="Mensagem para o coach"
            placeholder="Pergunte algo ao coach"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-2.5 text-[16px] leading-snug outline-none [field-sizing:content] focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            aria-label="Enviar"
            disabled={sending || !text.trim()}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] transition-[transform,opacity] duration-150 ease-[var(--ease-out)] active:scale-[0.92] disabled:opacity-40"
          >
            <ArrowUp aria-hidden size={20} />
          </button>
        </div>
      </form>

      <Sheet open={listOpen} onOpenChange={setListOpen} title="Conversas">
        <h2 className="text-[19px] font-semibold tracking-[-0.01em]">Conversas</h2>
        <div className="mt-3 flex flex-col gap-1">
          {convs.length === 0 && <p className="py-4 text-[14px] text-[var(--muted)]">Nenhuma conversa ainda.</p>}
          {convs.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void open(c.id)}
              aria-current={c.id === convId ? 'true' : undefined}
              className={`min-h-12 rounded-xl px-3 py-2 text-left text-[15px] leading-snug transition-transform duration-150 active:scale-[0.98] ${
                c.id === convId ? 'bg-[var(--accent-soft)] font-medium' : '[@media(hover:hover)]:hover:bg-[var(--bg)]'
              }`}
            >
              <span className="line-clamp-2">{c.title || 'Conversa'}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={fresh}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line)] text-[15px] font-medium active:scale-[0.97]"
        >
          <MessageCirclePlus aria-hidden size={18} /> Nova conversa
        </button>
      </Sheet>
    </div>
  )
}
