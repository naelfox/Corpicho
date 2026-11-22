'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  currentWeekNumbers, generateAnalysisApi, loadReports, subscribe, type Report, type WeekNumbers,
} from '@/lib/api'
import { AI_ERROR_TEXT, AiError } from '@/lib/ai/client'
import { REGIONS } from '@/lib/body'
import { addDays, type Day } from '@/lib/dates'
import { RichText } from './CoachView'
import { num1, signed } from './format'
import { Sheet, btnGhost, btnPrimary } from './Sheet'
import { toast } from './Toast'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const REGION_LABEL = new Map(REGIONS.map((r) => [r.id, r.label]))

/** "17–23 nov" (ou "28 out–3 nov" quando a semana cruza o mês). */
export function weekLabel(weekStart: Day): string {
  const end = addDays(weekStart, 6)
  const [, m1, d1] = weekStart.split('-').map(Number)
  const [, m2, d2] = end.split('-').map(Number)
  return m1 === m2 ? `${d1}–${d2} ${MONTHS[m2 - 1]}` : `${d1} ${MONTHS[m1 - 1]}–${d2} ${MONTHS[m2 - 1]}`
}

const card = 'rounded-2xl bg-[var(--bg)] p-3.5'
const label = 'mb-1 text-[13px] font-medium text-[var(--muted)]'

function Numbers({ n }: { n: WeekNumbers }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className={card}>
        <p className={label}>Peso</p>
        {n.weightStart === null || n.weightEnd === null ? (
          <p className="text-[15px] text-[var(--muted)]">Sem pesagens</p>
        ) : (
          <p className="text-[15px] tabular-nums">
            {num1(n.weightStart)} → {num1(n.weightEnd)} kg
            {n.weightDelta !== null && <span className="ml-2 text-[var(--muted)]">({signed(n.weightDelta)} kg)</span>}
          </p>
        )}
      </div>
      <div className={card}>
        <p className={label}>Medidas</p>
        {n.measures.length === 0 ? (
          <p className="text-[15px] text-[var(--muted)]">Sem comparação</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {n.measures.map((m) => (
              <li key={m.region} className="flex justify-between text-[15px]">
                <span>{REGION_LABEL.get(m.region) ?? m.region}</span>
                <span className="tabular-nums text-[var(--muted)]">{signed(m.delta)} cm</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className={card}>
          <p className={label}>Média diária</p>
          {n.avgKcal === null ? (
            <p className="text-[15px] text-[var(--muted)]">Sem refeições</p>
          ) : (
            <p className="text-[15px] tabular-nums">
              {n.avgKcal} kcal
              <br />
              {n.avgProtein} g prot.
            </p>
          )}
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            {n.daysLogged} {n.daysLogged === 1 ? 'dia registrado' : 'dias registrados'}
          </p>
        </div>
        <div className={card}>
          <p className={label}>Treinos</p>
          <p className="text-[22px] font-semibold tabular-nums">{n.workouts}</p>
        </div>
      </div>
      <div className={card}>
        <p className={label}>Evolução de cargas</p>
        {n.trainingTrend.length === 0 ? (
          <p className="text-[15px] text-[var(--muted)]">Sem comparação</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {n.trainingTrend.map((t) => (
              <li key={t.name} className="flex justify-between gap-3 text-[15px]">
                <span className="min-w-0 truncate">{t.name}</span>
                <span className="shrink-0 tabular-nums text-[var(--muted)]">{signed(t.loadDelta)} kg</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

type Detail = { weekStart: Day; numbers: WeekNumbers; analysis: string | null; open: boolean }

/** Lista de relatórios semanais e o detalhe de cada um (números + análise da IA), num sheet. */
export function ReportsView({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const list = await loadReports()
      setReports(list)
      setDetail((d) => {
        if (!d || d.open) return d
        const r = list.find((x) => x.weekStart === d.weekStart)
        return r ? { ...d, analysis: r.analysis } : d
      })
    } catch (e) {
      console.error(e)
      toast('Não deu para abrir os relatórios.', 'erro')
    }
  }, [])

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga ao abrir
    void refresh()
    return subscribe(refresh)
  }, [open, refresh])

  const close = (o: boolean) => {
    if (o) return
    setDetail(null)
    onClose()
  }

  const showCurrent = async () => {
    try {
      const c = await currentWeekNumbers()
      setDetail({ ...c, analysis: null, open: true })
    } catch (e) {
      console.error(e)
      toast('Não deu para calcular a semana.', 'erro')
    }
  }

  const analyze = async () => {
    if (!detail || busy) return
    setBusy(true)
    try {
      const analysis = await generateAnalysisApi(detail.weekStart)
      setDetail((d) => (d ? { ...d, analysis } : d))
    } catch (e) {
      console.error(e)
      toast(e instanceof AiError ? AI_ERROR_TEXT[e.code] : AI_ERROR_TEXT.failed, 'erro')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={close} title="Relatórios semanais">
      <div className="flex min-h-[70dvh] flex-col gap-3 pb-2">
        {detail ? (
          <>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setDetail(null)} aria-label="Voltar" className="-ml-2 grid size-11 place-items-center rounded-xl text-[var(--muted)] active:scale-[0.92]">
                <ChevronLeft aria-hidden size={22} />
              </button>
              <h2 className="text-[18px] font-semibold">
                {weekLabel(detail.weekStart)}
                {detail.open && <span className="ml-2 text-[13px] font-normal text-[var(--muted)]">até agora</span>}
              </h2>
            </div>
            <Numbers n={detail.numbers} />
            {!detail.open && (
              <section className="rounded-2xl bg-[var(--accent-soft)] p-4 text-[15px] leading-snug" aria-label="Análise">
                {detail.analysis ? <RichText text={detail.analysis} /> : <p className="text-[var(--muted)]">Ainda sem análise desta semana.</p>}
                <button type="button" onClick={() => void analyze()} disabled={busy} className={`${btnPrimary} mt-3 w-full`}>
                  {busy ? 'Analisando…' : detail.analysis ? 'Gerar análise de novo' : 'Gerar análise'}
                </button>
              </section>
            )}
          </>
        ) : (
          <>
            <h2 className="text-[18px] font-semibold">Relatórios</h2>
            {reports === null ? (
              <p className="text-[15px] text-[var(--muted)]">Carregando…</p>
            ) : reports.length === 0 ? (
              <p className="text-[15px] text-[var(--muted)]">
                O primeiro relatório aparece quando uma semana (seg–dom) com registros termina.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {reports.map((r) => (
                  <li key={r.weekStart}>
                    <button
                      type="button"
                      onClick={() => setDetail({ weekStart: r.weekStart, numbers: r.numbers, analysis: r.analysis, open: false })}
                      className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-[var(--bg)] px-4 text-left transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.98]"
                    >
                      <span className="flex-1 text-[15px] font-medium">{weekLabel(r.weekStart)}</span>
                      <span className="text-[13px] text-[var(--muted)]">{r.analysis ? 'com análise' : 'só números'}</span>
                      <ChevronRight aria-hidden size={18} className="text-[var(--muted)]" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => void showCurrent()} className={`${btnGhost} mt-auto w-full border border-[var(--line)]`}>
              Gerar relatório desta semana até agora
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}
