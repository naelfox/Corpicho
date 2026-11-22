'use client'

import { useId } from 'react'

/** `estimated`: ponto calculado por fórmula (não medido) — desenhado vazado e tracejado. */
export type ChartPoint = { at: string; value: number; estimated?: boolean }

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const dayLabel = (at: string) =>
  new Date(at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })

/**
 * Gráfico de linha em SVG, sem biblioteca. Largura responsiva (viewBox + width 100%).
 * - `compact`: só linha, pontos e rótulos de mínimo/máximo (mini-gráfico do Início).
 * - `showAxis`: acrescenta a data do primeiro e do último ponto embaixo.
 * Com 0 pontos mostra um texto; com 1 ponto, só o ponto e o valor.
 */
export function LineChart({
  points,
  unit,
  height = 120,
  compact = false,
  showAxis = false,
  emptyText = 'Sem registros ainda',
}: {
  points: ChartPoint[]
  unit: string
  height?: number
  compact?: boolean
  showAxis?: boolean
  emptyText?: string
}) {
  const gid = useId()
  if (points.length === 0) {
    return (
      <div
        style={{ height }}
        className="grid place-items-center rounded-xl bg-[var(--track)] text-[13px] text-[var(--muted)]"
      >
        {emptyText}
      </div>
    )
  }

  const W = 320
  const padX = 14
  const padTop = 18
  // Com eixo: espaço para o rótulo do mínimo (abaixo do ponto) não encostar na data.
  const padBottom = showAxis && !compact ? 36 : 18
  const H = height
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const times = points.map((p) => new Date(p.at).getTime())
  const t0 = times[0]
  const tSpan = times[times.length - 1] - t0 || 1
  const x = (i: number) => (points.length === 1 ? W / 2 : padX + ((times[i] - t0) / tSpan) * (W - 2 * padX))
  // Todos iguais (ou 1 ponto): linha no meio da altura, não colada embaixo.
  const y = (v: number) => padTop + (max === min ? 0.5 : 1 - (v - min) / span) * (H - padTop - padBottom)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const iMin = values.indexOf(min)
  const iMax = values.indexOf(max)
  const label = (i: number, v: number, above: boolean) => {
    const anchor = x(i) < 40 ? 'start' : x(i) > W - 40 ? 'end' : 'middle'
    return (
      <text
        x={x(i)}
        y={above ? y(v) - 8 : y(v) + 16}
        textAnchor={anchor}
        className="fill-[var(--muted)] text-[11px]"
      >
        {fmt(v)} {unit}
      </text>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`Gráfico de ${points.length} registros, de ${fmt(min)} a ${fmt(max)} ${unit}`}
      className="block overflow-visible"
    >
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {points.length > 1 && (
        <>
          <path
            d={`${path} L${x(points.length - 1).toFixed(1)} ${H - padBottom} L${x(0).toFixed(1)} ${H - padBottom} Z`}
            fill={`url(#${gid})`}
          />
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        </>
      )}
      {points.map((p, i) => (
        p.estimated ? (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.value)}
            r={points.length > 40 ? 2.5 : 4}
            fill="var(--card)"
            stroke="var(--src-estimated)"
            strokeWidth={1.75}
            strokeDasharray="2 2"
          />
        ) : (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={points.length > 40 ? 1.5 : 3} fill="var(--card)" stroke="var(--accent)" strokeWidth={2} />
        )
      ))}
      {points.length === 1 ? (
        label(0, points[0].value, true)
      ) : (
        <>
          {label(iMax, max, true)}
          {iMin !== iMax && label(iMin, min, false)}
        </>
      )}
      {showAxis && !compact && (
        <>
          <text x={padX} y={H - 4} className="fill-[var(--muted)] text-[11px]">
            {dayLabel(points[0].at)}
          </text>
          {points.length > 1 && (
            <text x={W - padX} y={H - 4} textAnchor="end" className="fill-[var(--muted)] text-[11px]">
              {dayLabel(points[points.length - 1].at)}
            </text>
          )}
        </>
      )}
    </svg>
  )
}
