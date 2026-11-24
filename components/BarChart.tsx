'use client'

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const WEEKDAY = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const parse = (day: string) => new Date(`${day}T12:00:00Z`)
const dayLabel = (day: string) => parse(day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })

/**
 * Barras por dia em SVG, com a meta tracejada por cima. Barra que bateu a meta = acento cheio;
 * abaixo dela = acento claro (sem vermelho: não é bronca). Até 10 dias rotula cada barra com a
 * inicial do dia da semana; acima disso, só a primeira e a última data.
 */
export function BarChart({
  days,
  goal,
  unit = 'kcal',
  height = 140,
}: {
  days: { day: string; kcal: number }[]
  goal: number
  unit?: string
  height?: number
}) {
  const W = 320
  const padX = 4
  const padTop = 16
  const padBottom = 20
  const H = height
  const max = Math.max(goal * 1.15, ...days.map((d) => d.kcal), 1)
  const plotH = H - padTop - padBottom
  const y = (v: number) => padTop + (1 - v / max) * plotH
  const slot = (W - 2 * padX) / days.length
  const barW = Math.max(2, slot * (days.length > 10 ? 0.7 : 0.56))
  const few = days.length <= 10
  const hit = days.filter((d) => d.kcal >= goal).length
  const goalY = y(goal)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`Gasto por dia em ${days.length} dias: meta de ${fmt(goal)} ${unit} batida em ${hit}`}
      className="block overflow-visible"
    >
      {days.map((d, i) => {
        const cx = padX + slot * i + slot / 2
        const top = d.kcal > 0 ? Math.min(y(d.kcal), H - padBottom - 3) : H - padBottom - 3
        return (
          <g key={d.day}>
            <rect
              x={cx - barW / 2}
              y={top}
              width={barW}
              height={H - padBottom - top}
              rx={Math.min(4, barW / 2)}
              fill={d.kcal === 0 ? 'var(--track)' : 'var(--accent)'}
              fillOpacity={d.kcal === 0 ? 1 : d.kcal >= goal ? 1 : 0.38}
            />
            {few && d.kcal > 0 && (
              <text x={cx} y={top - 4} textAnchor="middle" className="fill-[var(--muted)] text-[10px] tabular-nums">
                {fmt(d.kcal)}
              </text>
            )}
            {few && (
              <text x={cx} y={H - 4} textAnchor="middle" className="fill-[var(--muted)] text-[11px]">
                {WEEKDAY[parse(d.day).getUTCDay()]}
              </text>
            )}
          </g>
        )
      })}
      <line
        x1={padX}
        x2={W - padX}
        y1={goalY}
        y2={goalY}
        stroke="var(--ink)"
        strokeOpacity={0.45}
        strokeWidth={1.25}
        strokeDasharray="4 4"
      />
      <text x={W - padX} y={goalY - 5} textAnchor="end" className="fill-[var(--muted)] text-[10px] font-medium">
        meta {fmt(goal)}
      </text>
      {!few && days.length > 0 && (
        <>
          <text x={padX} y={H - 4} className="fill-[var(--muted)] text-[11px]">
            {dayLabel(days[0].day)}
          </text>
          <text x={W - padX} y={H - 4} textAnchor="end" className="fill-[var(--muted)] text-[11px]">
            {dayLabel(days[days.length - 1].day)}
          </text>
        </>
      )}
    </svg>
  )
}
