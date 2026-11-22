'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Dumbbell, FileText } from 'lucide-react'
import { loadDashboard, saveWeight, subscribe, type Dashboard as Data } from '@/lib/api'
import { ValidationError } from '@/lib/validate'
import type { Metric } from '@/lib/series'
import { CalorieRing } from './CalorieRing'
import { LineChart } from './LineChart'
import { MacroBars } from './MacroBars'
import { NumberField } from './NumberField'
import { Sheet, btnGhost, btnPrimary } from './Sheet'
import { toast } from './Toast'

const METRIC_LABEL: Record<Metric, string> = {
  peso: 'Peso', cintura: 'Cintura', abdomen: 'Abdômen', quadril: 'Quadril', peitoral: 'Peitoral',
  bracos: 'Braços', coxas: 'Coxas', gordura: 'Gordura', musculo: 'Músculo',
}

const card = 'rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)]'
const kg = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

function signed(n: number) {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`
}

function WeightSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      await saveWeight(value)
      toast('Peso registrado.')
      setValue('')
      setInvalid(false)
      onClose()
    } catch (e) {
      setInvalid(true)
      if (e instanceof ValidationError) toast(e.message, 'erro')
      else {
        console.error(e)
        toast('Não deu para salvar o peso.', 'erro')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Registrar peso">
      <h2 className="mb-4 text-[19px] font-semibold tracking-[-0.01em]">Registrar peso</h2>
      <NumberField label="Peso de hoje" value={value} onChange={setValue} unit="kg" placeholder="ex.: 82,4" invalid={invalid} autoFocus />
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className={btnGhost}>
          Cancelar
        </button>
        <button type="button" onClick={() => void save()} disabled={!value.trim() || busy} className={`${btnPrimary} flex-1`}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Sheet>
  )
}

/** Aba Início: um foco por cartão — calorias, macros, peso, treinos, evolução e atalho de relatórios. */
export function Dashboard() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [weightOpen, setWeightOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await loadDashboard())
      setError(null)
    } catch (e) {
      console.error(e)
      setError(e instanceof ValidationError ? e.message : 'Não deu para carregar o resumo.')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial do banco local
    void load()
    return subscribe(load)
  }, [load])

  if (!data) {
    return error ? (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-[15px] text-[var(--muted)]">{error}</p>
        <button type="button" onClick={() => void load()} className={btnPrimary}>
          Tentar de novo
        </button>
      </div>
    ) : (
      <div role="status" className="grid min-h-[50dvh] place-items-center">
        <span aria-hidden className="size-6 animate-spin rounded-full border-[3px] border-[var(--accent-soft)] border-t-[var(--accent)]" />
        <span className="sr-only">Carregando…</span>
      </div>
    )
  }

  const { weight, today, targets, workoutsThisWeek, weightSeries, summary } = data

  return (
    <div className="anim-enter-up flex flex-col gap-3 pt-3">
      <section className={card} aria-label="Calorias de hoje">
        <CalorieRing consumed={today.kcal} target={targets.kcal} />
      </section>

      <section className={card} aria-label="Macros de hoje">
        <MacroBars consumed={today} target={targets} />
      </section>

      <section className={card} aria-label="Peso">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[13px] text-[var(--muted)]">Peso</p>
            <p className="text-[26px] leading-tight font-semibold tabular-nums tracking-[-0.02em]">
              {weight.current === null ? '—' : kg(weight.current)}
              <span className="ml-1 text-[15px] font-normal text-[var(--muted)]">kg</span>
            </p>
          </div>
          <p className="text-[13px] text-[var(--muted)]">meta {kg(weight.target)} kg</p>
        </div>
        <div
          role="progressbar"
          aria-label="Progresso até a meta de peso"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={weight.progressPct}
          className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--track)]"
        >
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-[var(--ease-out)]"
            style={{ width: `${weight.progressPct}%` }}
          />
        </div>
        <p className="mt-1.5 text-[12px] text-[var(--muted)]">
          {weight.progressPct}% do caminho ({kg(weight.start)} → {kg(weight.target)} kg)
        </p>
        <div className="mt-3">
          <LineChart points={weightSeries} unit="kg" height={110} compact emptyText="Registre seu peso para ver o gráfico" />
        </div>
        <button type="button" onClick={() => setWeightOpen(true)} className={`${btnPrimary} mt-3 w-full`}>
          Registrar peso
        </button>
      </section>

      <section className={`${card} flex items-center gap-3`} aria-label="Treinos da semana">
        <span className="grid size-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
          <Dumbbell aria-hidden size={20} strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-[20px] leading-tight font-semibold tabular-nums">{workoutsThisWeek}</p>
          <p className="text-[13px] text-[var(--muted)]">{workoutsThisWeek === 1 ? 'treino nesta semana' : 'treinos nesta semana'}</p>
        </div>
      </section>

      <section className={card} aria-label="Resumo da evolução">
        <p className="mb-2 text-[13px] font-medium text-[var(--muted)]">Evolução em 30 dias</p>
        {summary.length === 0 ? (
          <p className="text-[15px] text-[var(--muted)]">Registre medidas para ver sua evolução</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {summary.map((s) => (
              <li key={s.metric} className="flex justify-between text-[15px]">
                <span>{METRIC_LABEL[s.metric]}</span>
                <span className="tabular-nums text-[var(--muted)]">
                  {signed(s.delta)} {s.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={() => toast('Em breve')}
        className={`${card} flex min-h-14 items-center gap-3 text-left transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.98]`}
      >
        <FileText aria-hidden size={20} strokeWidth={1.75} className="text-[var(--accent-text)]" />
        <span className="flex-1 text-[15px] font-medium">Relatórios</span>
        <ChevronRight aria-hidden size={18} className="text-[var(--muted)]" />
      </button>

      <WeightSheet open={weightOpen} onClose={() => setWeightOpen(false)} />
    </div>
  )
}
