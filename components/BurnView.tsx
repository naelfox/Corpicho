'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Flame, Plus, Trash2 } from 'lucide-react'
import {
  deleteBurnApi, loadBurnSummary, loadBurns, saveBurn, saveBurnGoal, subscribe, type Burn, type BurnSummary,
} from '@/lib/api'
import { addDays, todayIn } from '@/lib/dates'
import { ValidationError } from '@/lib/validate'
import { BarChart } from './BarChart'
import { Segmented } from './Chips'
import { ConfirmRow } from './ConfirmRow'
import { NumberField } from './NumberField'
import { Sheet, btnGhost, btnPrimary, fieldLabel } from './Sheet'
import { toast } from './Toast'
import { dateOnly } from './format'

const card = 'rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)]'
const kcal = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const textInput =
  'h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-[16px] outline-none transition-[border-color] duration-150 placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)]'
const QUICK = ['Academia', 'Caminhada', 'Corrida', 'Bike', 'Relógio (dia todo)']

function failed(e: unknown, fallback: string) {
  if (e instanceof ValidationError) toast(e.message, 'erro')
  else {
    console.error(e)
    toast(fallback, 'erro')
  }
}

/** Recarrega o resumo de `days` dias sempre que os dados mudam. */
function useBurnSummary(days: number) {
  const [data, setData] = useState<BurnSummary | null>(null)
  const load = useCallback(async () => {
    try {
      setData(await loadBurnSummary(days))
    } catch (e) {
      console.error(e)
    }
  }, [days])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga do banco local
    void load()
    return subscribe(load)
  }, [load])
  return data
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-[var(--track)] px-3 py-2">
      <p className="truncate text-[12px] text-[var(--muted)]">{label}</p>
      <p className="text-[17px] leading-tight font-semibold tabular-nums">
        {value}
        {hint && <span className="ml-0.5 text-[12px] font-normal text-[var(--muted)]">{hint}</span>}
      </p>
    </div>
  )
}

/** Uma frase honesta sobre o período: está chegando na meta ou não, sem bronca. */
function verdict(s: BurnSummary): string {
  const n = s.days.length
  if (s.total === 0) return 'Nada anotado neste período ainda.'
  const pct = Math.round((s.average / s.goal) * 100)
  if (s.average >= s.goal) return `Na média você passou da meta (${pct}%). Está gastando o suficiente.`
  if (pct >= 75) return `Quase lá: a média ficou em ${pct}% da meta. Faltam ~${kcal(s.goal - s.average)} kcal por dia.`
  return `A média ficou em ${pct}% da meta, ${s.daysHit} de ${n} dias bateram. Faltam ~${kcal(s.goal - s.average)} kcal por dia.`
}

function History() {
  const [rows, setRows] = useState<Burn[] | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await loadBurns())
    } catch (e) {
      console.error(e)
      setRows([])
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga do banco local
    void load()
    return subscribe(load)
  }, [load])

  const remove = async (id: string) => {
    setConfirm(null)
    try {
      await deleteBurnApi(id)
      toast('Gasto apagado.')
    } catch (e) {
      failed(e, 'Não deu para apagar.')
    }
  }

  if (!rows) return null
  if (rows.length === 0) return <p className="text-[14px] text-[var(--muted)]">Nenhum gasto anotado ainda.</p>

  return (
    <ul className="flex flex-col">
      {rows.map((r) => (
        <li key={r.id} className="border-b border-[var(--line)]/70 last:border-0">
          {confirm === r.id ? (
            <div className="py-1.5">
              <ConfirmRow text={`Apagar ${kcal(r.kcal)} kcal?`} onCancel={() => setConfirm(null)} onConfirm={() => void remove(r.id)} />
            </div>
          ) : (
            <div className="flex min-h-12 items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px]">{r.label || 'Gasto'}</p>
                <p className="text-[12px] text-[var(--muted)] tabular-nums">{dateOnly(`${r.day}T12:00:00Z`)}</p>
              </div>
              <span className="text-[15px] font-semibold tabular-nums">{kcal(r.kcal)} kcal</span>
              <button
                type="button"
                aria-label={`Apagar ${kcal(r.kcal)} kcal de ${dateOnly(`${r.day}T12:00:00Z`)}`}
                onClick={() => setConfirm(r.id)}
                className="-mr-2 grid size-11 place-items-center rounded-xl text-[var(--muted)] transition-transform duration-150 active:scale-[0.92]"
              >
                <Trash2 aria-hidden size={17} />
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Meta diária de gasto, editável no lugar. */
function GoalRow({ goal }: { goal: number }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      await saveBurnGoal(value)
      toast('Meta de gasto salva.')
      setEditing(false)
    } catch (e) {
      failed(e, 'Não deu para salvar a meta.')
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2">
        <p className="text-[14px] text-[var(--muted)]">
          Meta diária: <span className="font-semibold text-[var(--ink)] tabular-nums">{kcal(goal)} kcal</span>
        </p>
        <button
          type="button"
          onClick={() => {
            setValue(String(goal))
            setEditing(true)
          }}
          className="h-10 rounded-lg px-3 text-[14px] font-medium text-[var(--accent-text)] active:scale-[0.96]"
        >
          Alterar
        </button>
      </div>
    )
  }
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <NumberField label="Meta diária de gasto" value={value} onChange={setValue} unit="kcal" decimals={0} autoFocus />
      </div>
      <button type="button" onClick={() => setEditing(false)} className={btnGhost}>
        Cancelar
      </button>
      <button type="button" onClick={() => void save()} disabled={!value.trim() || busy} className={btnPrimary}>
        Salvar
      </button>
    </div>
  )
}

/** Folha do gasto calórico: anotar, gráfico 7/30 dias contra a meta, meta e histórico. */
export function BurnSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [period, setPeriod] = useState<7 | 30>(7)
  const data = useBurnSummary(period)
  const [value, setValue] = useState('')
  const [label, setLabel] = useState('')
  const [when, setWhen] = useState<'hoje' | 'ontem'>('hoje')
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const today = todayIn()
      await saveBurn({ kcalStr: value, label, day: when === 'hoje' ? today : addDays(today, -1) })
      toast('Gasto anotado.')
      setValue('')
      setLabel('')
      setWhen('hoje')
      setInvalid(false)
    } catch (e) {
      setInvalid(true)
      failed(e, 'Não deu para salvar o gasto.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Gasto calórico">
      <h2 className="mb-1 text-[19px] font-semibold tracking-[-0.01em]">Gasto calórico</h2>
      <p className="mb-4 text-[14px] leading-snug text-[var(--muted)]">
        Anote o que gastou se mexendo (o número do relógio, da esteira ou do app de corrida).
      </p>

      <NumberField label="Quanto gastou" value={value} onChange={setValue} unit="kcal" decimals={0} placeholder="ex.: 350" invalid={invalid} />
      <div className="mt-3">
        <span className={fieldLabel}>O que foi (opcional)</span>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setLabel(q)}
              aria-pressed={label === q}
              className={`h-9 rounded-full border px-3 text-[14px] transition-[background-color,border-color] duration-150 active:scale-[0.96] ${
                label === q ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium' : 'border-[var(--line)] text-[var(--muted)]'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="O que foi"
          placeholder="ex.: Futebol"
          maxLength={80}
          className={textInput}
        />
      </div>
      <div className="mt-3">
        <Segmented
          label="Dia"
          options={[
            { id: 'hoje', label: 'Hoje' },
            { id: 'ontem', label: 'Ontem' },
          ]}
          value={when}
          onChange={setWhen}
        />
      </div>
      <button type="button" onClick={() => void save()} disabled={!value.trim() || busy} className={`${btnPrimary} mt-4 w-full`}>
        {busy ? 'Salvando…' : 'Anotar gasto'}
      </button>

      <div className="mt-6 mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-[var(--muted)]">Estou gastando o suficiente?</h3>
        <div className="w-40">
          <Segmented
            label="Período"
            compact
            options={[
              { id: 7, label: '7 dias' },
              { id: 30, label: '30 dias' },
            ]}
            value={period}
            onChange={setPeriod}
          />
        </div>
      </div>
      {data && (
        <>
          <BarChart days={data.days} goal={data.goal} height={150} />
          <div className="mt-3 flex gap-2">
            <Stat label="Média/dia" value={kcal(data.average)} hint="kcal" />
            <Stat label="Dias na meta" value={`${data.daysHit}/${data.days.length}`} />
            <Stat label="Total" value={kcal(data.total)} hint="kcal" />
          </div>
          <p className="mt-3 text-[14px] leading-snug">{verdict(data)}</p>
          <div className="mt-2">
            <GoalRow goal={data.goal} />
          </div>
        </>
      )}

      <h3 className="mt-5 mb-1 text-[13px] font-medium text-[var(--muted)]">Anotados</h3>
      <History />
    </Sheet>
  )
}

/** Cartão do gasto de hoje + barras da semana; toque abre a folha. */
export function BurnCard() {
  const data = useBurnSummary(7)
  const [open, setOpen] = useState(false)
  if (!data) return null
  const pct = Math.min(100, Math.round((data.today / data.goal) * 100))

  return (
    <section className={card} aria-label="Gasto calórico">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Flame aria-hidden size={20} strokeWidth={1.75} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] text-[var(--muted)]">Gasto hoje</span>
            <span className="block text-[20px] leading-tight font-semibold tabular-nums">
              {kcal(data.today)}
              <span className="ml-1 text-[14px] font-normal text-[var(--muted)]">de {kcal(data.goal)} kcal</span>
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Anotar gasto"
          className="-mr-1 flex h-10 shrink-0 items-center gap-1 rounded-full bg-[var(--accent-soft)] px-3.5 text-[15px] font-medium text-[var(--accent-text)] transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.96]"
        >
          <Plus aria-hidden size={17} strokeWidth={2.25} /> Anotar
        </button>
      </div>
      <div
        role="progressbar"
        aria-label="Gasto de hoje em relação à meta"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--track)]"
      >
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-[var(--ease-out)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <button type="button" onClick={() => setOpen(true)} className="mt-3 block w-full text-left" aria-label="Ver gráfico do gasto">
        <BarChart days={data.days} goal={data.goal} height={110} />
        <span className="mt-1 flex items-center justify-between text-[12px] text-[var(--muted)]">
          <span>
            {data.daysHit} de 7 dias na meta · média {kcal(data.average)} kcal
          </span>
          <ChevronRight aria-hidden size={16} />
        </span>
      </button>
      <BurnSheet open={open} onClose={() => setOpen(false)} />
    </section>
  )
}
