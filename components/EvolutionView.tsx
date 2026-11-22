'use client'

import { useCallback, useEffect, useState } from 'react'
import { loadEvolutionSummary, loadSeries, subscribe, type Metric, type Period, type Series, type Unit } from '@/lib/api'
import { PERIODS } from '@/lib/series'
import { ChoiceChips, Segmented } from './Chips'
import { LineChart } from './LineChart'
import { deltaTone, num1, signed } from './format'

const card = 'rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)]'

export const EVOLUTION_METRICS: { id: Metric; label: string }[] = [
  { id: 'peso', label: 'Peso' },
  { id: 'cintura', label: 'Cintura' },
  { id: 'abdomen', label: 'Abdômen' },
  { id: 'quadril', label: 'Quadril' },
  { id: 'peitoral', label: 'Peitoral' },
  { id: 'bracos', label: 'Braços' },
  { id: 'coxas', label: 'Coxas' },
  { id: 'gordura', label: '% Gordura' },
  { id: 'musculo', label: 'Massa muscular' },
]
const NAME = Object.fromEntries(EVOLUTION_METRICS.map((m) => [m.id, m.label])) as Record<Metric, string>
// Rótulos curtos para caber 6 opções numa tela de 360 px; o leitor de tela ouve o nome completo.
const SHORT: Record<Period, string> = { '7d': '7d', '30d': '30d', '3m': '3m', '6m': '6m', '1a': '1a', tudo: 'Tudo' }

/** Para massa muscular, subir é o desejado; nas outras, descer. */
const good = (m: Metric) => (m === 'musculo' ? 'up' : 'down')
const withUnit = (n: number, unit: Unit) => (unit === '%' ? `${num1(n)}%` : `${num1(n)} ${unit}`)
const signedUnit = (n: number, unit: Unit) => (unit === '%' ? `${signed(n)} p.p.` : `${signed(n)} ${unit}`)

/** Evolução: escolhe métrica e período → gráfico + "de X para Y (Δ)" + resumo de 30 dias. */
export function EvolutionView() {
  const [metric, setMetric] = useState<Metric>('peso')
  const [period, setPeriod] = useState<Period>('30d')
  const [series, setSeries] = useState<Series | null>(null)
  const [summary, setSummary] = useState<{ metric: Metric; delta: number; unit: Unit }[] | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, sum] = await Promise.all([loadSeries(metric, period), loadEvolutionSummary()])
      setSeries(s)
      setSummary(sum)
    } catch (e) {
      console.error(e)
      setSeries({ points: [], first: null, last: null, delta: null, unit: 'cm' })
      setSummary([])
    }
  }, [metric, period])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga do banco local
    void load()
    return subscribe(load)
  }, [load])

  const hasEstimated = series?.points.some((p) => p.source === 'estimated') ?? false

  return (
    <div className="flex flex-col gap-3">
      <section className={card} aria-label="Gráfico de evolução">
        <ChoiceChips label="Métrica" scroll options={EVOLUTION_METRICS} value={metric} onChange={setMetric} />
        <div className="mt-3">
          <Segmented
            label="Período"
            compact
            options={PERIODS.map((p) => ({ id: p.id, label: SHORT[p.id], aria: p.label }))}
            value={period}
            onChange={setPeriod}
          />
        </div>
        <div className="mt-4 min-h-[180px]">
          {series && (
            <LineChart
              points={series.points.map((p) => ({ at: p.at, value: p.value, estimated: p.source === 'estimated' }))}
              unit={series.unit}
              height={180}
              showAxis
              emptyText={`Sem registros de ${NAME[metric].toLowerCase()} neste período`}
            />
          )}
        </div>
        {series && series.first !== null && series.last !== null && (
          <p className="mt-3 text-[15px]" aria-live="polite">
            {series.points.length < 2 ? (
              <span className="text-[var(--muted)]">Só um registro neste período: {withUnit(series.last, series.unit)}.</span>
            ) : (
              <>
                de <span className="font-semibold tabular-nums">{withUnit(series.first, series.unit)}</span> para{' '}
                <span className="font-semibold tabular-nums">{withUnit(series.last, series.unit)}</span>{' '}
                <span className={`tabular-nums ${deltaTone(series.delta, good(metric))}`}>
                  ({series.delta ? signedUnit(series.delta, series.unit) : 'sem mudança'})
                </span>
              </>
            )}
          </p>
        )}
        {hasEstimated && (
          <p className="mt-2 flex items-center gap-2 text-[12px] text-[var(--muted)]">
            <svg aria-hidden width="12" height="12" viewBox="0 0 12 12">
              <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--src-estimated)" strokeWidth="1.5" strokeDasharray="2 2" />
            </svg>
            Pontos tracejados são estimados por fórmula, não medidos.
          </p>
        )}
      </section>

      <section className={card} aria-label="Resumo da evolução">
        <h3 className="mb-2 text-[13px] font-medium text-[var(--muted)]">Últimos 30 dias</h3>
        {summary === null ? null : summary.length === 0 ? (
          <p className="text-[15px] text-[var(--muted)]">Registre medidas em dias diferentes para ver sua evolução.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {summary.map((s) => (
              <li key={s.metric} className="flex justify-between text-[15px]">
                <span>{NAME[s.metric]}</span>
                <span className={`tabular-nums ${deltaTone(s.delta, good(s.metric))}`}>{signedUnit(s.delta, s.unit)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
