'use client'

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { ChevronRight, Eye, EyeOff } from 'lucide-react'
import { loadMonthUsage } from '@/lib/api'
import { testKey } from '@/lib/ai/client'
import { PRICES } from '@/lib/ai/pricing'
import {
  getModels,
  getMonthlyLimitUsd,
  getOpenAiKey,
  setModels,
  setMonthlyLimitUsd,
  setOpenAiKey,
} from '@/lib/settings'
import { ValidationError, parseNum } from '@/lib/validate'
import { NumberField } from './NumberField'
import { Sheet, btnGhost, btnPrimary, fieldLabel } from './Sheet'
import { ThemeToggle } from './ThemeToggle'
import { toast } from './Toast'

const usd = (n: number) => `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const MODEL_IDS = Object.keys(PRICES)

export function SettingsSheet({
  open,
  onClose,
  onEditProfile,
}: {
  open: boolean
  onClose: () => void
  onEditProfile: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Ajustes">
      {open && <SettingsBody onEditProfile={onEditProfile} />}
    </Sheet>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-[var(--line)] pt-5">
      <h2 className="text-[13px] font-semibold tracking-[0.04em] text-[var(--muted)] uppercase">{title}</h2>
      {children}
    </section>
  )
}

function SettingsBody({ onEditProfile }: { onEditProfile: () => void }) {
  return (
    <div className="flex flex-col gap-6 pb-2">
      <p className="text-[20px] font-semibold tracking-[-0.01em]">Ajustes</p>
      <Section title="Perfil">
        <button
          type="button"
          onClick={onEditProfile}
          className="flex h-14 items-center justify-between rounded-xl bg-[var(--bg)] px-4 text-left text-[16px] font-medium transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.98]"
        >
          Editar perfil e meta
          <ChevronRight aria-hidden size={18} className="text-[var(--muted)]" />
        </button>
      </Section>
      <Section title="Inteligência artificial">
        <KeyField />
        <ModelsField />
        <LimitField />
      </Section>
      <Section title="Aparência">
        <ThemeToggle />
      </Section>
      <p className="text-[13px] leading-snug text-[var(--muted)]">
        Seus dados ficam só neste aparelho. Desinstalar o app ou limpar os dados dele apaga tudo.
      </p>
    </div>
  )
}

/** Chave da OpenAI: nunca é mostrada inteira, só os 4 últimos caracteres. */
function KeyField() {
  const [saved, setSaved] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | 'delete' | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    void getOpenAiKey().then((k) => alive && setSaved(k))
    return () => {
      alive = false
    }
  }, [])

  const save = async () => {
    const k = draft.trim()
    if (!k) return
    setBusy('save')
    try {
      await setOpenAiKey(k)
      setSaved(k)
      setDraft('')
      setStatus(null)
      toast('Chave salva.')
    } catch (e) {
      console.error(e)
      toast('Não deu para salvar a chave.', 'erro')
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    const k = draft.trim() || saved
    if (!k) return
    setBusy('test')
    setStatus(null)
    try {
      const ok = await testKey(k)
      setStatus(ok ? { ok, text: 'A chave funcionou.' } : { ok, text: 'Não funcionou: confira a chave e a internet.' })
    } catch (e) {
      console.error(e)
      toast('Não deu para testar a chave.', 'erro')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('delete')
    try {
      await setOpenAiKey(null)
      setSaved(null)
      setStatus(null)
      toast('Chave apagada.')
    } catch (e) {
      console.error(e)
      toast('Não deu para apagar a chave.', 'erro')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <label htmlFor="openai-key" className={fieldLabel}>
        Chave da OpenAI
      </label>
      {saved && (
        <p className="mb-2 text-[15px]">
          Salva: <span className="font-mono tracking-wider">••••{saved.slice(-4)}</span>
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <input
          id="openai-key"
          type={show ? 'text' : 'password'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={saved ? 'Colar outra chave' : 'sk-…'}
          className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 font-mono text-[16px] outline-none transition-[border-color] duration-150 focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Esconder chave' : 'Mostrar chave'}
          className="grid size-12 shrink-0 place-items-center rounded-xl text-[var(--muted)] transition-transform duration-150 active:scale-[0.94]"
        >
          {show ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={!draft.trim() || busy !== null} className={btnPrimary}>
          {busy === 'save' ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={test}
          disabled={!(draft.trim() || saved) || busy !== null}
          className={`${btnGhost} border border-[var(--line)] text-[var(--ink)]`}
        >
          {busy === 'test' ? 'Testando…' : 'Testar'}
        </button>
        {saved && (
          <button type="button" onClick={remove} disabled={busy !== null} className={`${btnGhost} text-[var(--danger)]`}>
            Apagar
          </button>
        )}
      </div>
      {status && (
        <p role="status" className={`mt-2 text-[14px] ${status.ok ? 'text-[var(--accent-text)]' : 'text-[var(--danger)]'}`}>
          {status.text}
        </p>
      )}
      <p className="mt-2 text-[13px] leading-snug text-[var(--muted)]">
        Fica guardada só neste celular e vai direto para a OpenAI, sem passar por outro servidor.
      </p>
    </div>
  )
}

function ModelsField() {
  const [models, setLocal] = useState<{ vision: string; text: string } | null>(null)
  const visionId = useId()
  const textId = useId()

  useEffect(() => {
    let alive = true
    void getModels().then((m) => alive && setLocal(m))
    return () => {
      alive = false
    }
  }, [])

  if (!models) return null

  const change = (kind: 'vision' | 'text', id: string) => {
    const next = { ...models, [kind]: id }
    setLocal(next)
    void setModels(next).then(() => toast('Modelo salvo.'))
  }

  const select = (id: string, kind: 'vision' | 'text', label: string) => {
    // Modelo salvo que saiu da lista de preços continua aparecendo para não sumir da tela.
    const ids = MODEL_IDS.includes(models[kind]) ? MODEL_IDS : [models[kind], ...MODEL_IDS]
    return (
      <div className="min-w-0">
        <label htmlFor={id} className={fieldLabel}>
          {label}
        </label>
        <select
          id={id}
          value={models[kind]}
          onChange={(e) => change(kind, e.target.value)}
          className="h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-[16px] outline-none focus:border-[var(--accent)]"
        >
          {ids.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
    )
  }

  const price = (m: string) => {
    const p = PRICES[m]
    return p ? `${usd(p.inPerM)} entrada / ${usd(p.outPerM)} saída por 1 milhão de tokens` : 'preço desconhecido'
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {select(visionId, 'vision', 'Modelo para fotos')}
        {select(textId, 'text', 'Modelo para texto')}
      </div>
      <p className="text-[13px] leading-snug text-[var(--muted)]">
        Fotos: {price(models.vision)}. Texto: {price(models.text)}.
      </p>
    </div>
  )
}

function LimitField() {
  const [limit, setLimit] = useState('')
  const [savedLimit, setSavedLimit] = useState<number | null>(null)
  const [usage, setUsage] = useState<{ costUsd: number; calls: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [l, u] = await Promise.all([getMonthlyLimitUsd(), loadMonthUsage().catch(() => null)])
    setSavedLimit(l)
    setLimit(String(l).replace('.', ','))
    setUsage(u)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial dos ajustes
    void load()
  }, [load])

  const save = async () => {
    try {
      const n = parseNum(limit, { min: 0.5, max: 1000, label: 'Limite do mês (US$)' })
      await setMonthlyLimitUsd(n)
      setSavedLimit(n)
      setError(null)
      toast('Limite salvo.')
    } catch (e) {
      if (e instanceof ValidationError) setError(e.message)
      else throw e
    }
  }

  const pct = usage && savedLimit ? Math.min(100, (usage.costUsd / savedLimit) * 100) : 0
  const dirty = savedLimit !== null && limit !== String(savedLimit).replace('.', ',')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <NumberField label="Limite de gasto por mês" value={limit} onChange={setLimit} unit="US$" decimals={2} invalid={!!error} />
        </div>
        <button type="button" onClick={save} disabled={!dirty} className={btnPrimary}>
          Salvar
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[14px] text-[var(--danger)]">
          {error}
        </p>
      )}
      <div className="rounded-xl bg-[var(--bg)] px-4 py-3">
        <p className="text-[13px] text-[var(--muted)]">Uso neste mês (estimado)</p>
        <p className="mt-0.5 text-[17px] font-semibold tabular-nums">
          {usage
            ? `${usd(usage.costUsd)} em ${usage.calls} ${usage.calls === 1 ? 'chamada' : 'chamadas'}`
            : '—'}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--track)]">
          <div
            className={`h-full rounded-full ${pct >= 90 ? 'bg-[var(--danger)]' : 'bg-[var(--accent)]'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {savedLimit !== null && (
          <p className="mt-1.5 text-[13px] text-[var(--muted)]">
            de {usd(savedLimit)}. Ao chegar no limite, a IA pausa até o mês virar.
          </p>
        )}
      </div>
    </div>
  )
}
