'use client'

import { useState } from 'react'
import type { Dashboard } from '@/lib/api'

type Energy = Dashboard['energy']

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR')
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`
const parse = (day: string) => new Date(`${day}T12:00:00Z`)
const dayLabel = (day: string, weekday = false) =>
  parse(day).toLocaleDateString('pt-BR', { ...(weekday && { weekday: 'short' }), day: '2-digit', month: '2-digit', timeZone: 'UTC' })

/**
 * Consumido × gasto estimado por dia: duas linhas no mesmo eixo (mesma unidade), legenda fixa e
 * uma faixa de leitura embaixo que mostra o dia tocado (padrão: hoje). Dia sem refeição anotada
 * vira buraco na linha azul (não é zero: só não foi registrado).
 */
export function EnergyChart({ energy }: { energy: Energy }) {
  const { base, days } = energy
  const [sel, setSel] = useState(days.length - 1)

  if (base === null) {
    return (
      <p className="rounded-xl bg-[var(--track)] p-4 text-center text-[13px] text-[var(--muted)]">
        Complete o perfil e registre o peso para estimar seu gasto.
      </p>
    )
  }

  const logged = days.filter((d) => d.eaten !== null)
  const avg = logged.length ? logged.reduce((a, d) => a + d.eaten! - d.spent, 0) / logged.length : null

  const W = 320
  const H = 150
  const padL = 34
  const padR = 8
  const padTop = 8
  const padBottom = 20
  const all = days.flatMap((d) => (d.eaten === null ? [d.spent] : [d.eaten, d.spent]))
  const lo = Math.floor((Math.min(...all) * 0.9) / 500) * 500
  const hi = Math.ceil((Math.max(...all) * 1.05) / 500) * 500
  const step = hi - lo > 2000 ? 1000 : 500
  const ticks = Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step)
  const slot = (W - padL - padR) / Math.max(1, days.length - 1)
  const x = (i: number) => padL + i * slot
  const y = (v: number) => padTop + (1 - (v - lo) / (hi - lo || 1)) * (H - padTop - padBottom)

  const spentPath = days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.spent).toFixed(1)}`).join(' ')
  // Quebra a linha nos dias sem registro (M recomeça o traço).
  const eatenPath = days
    .map((d, i) => (d.eaten === null ? '' : `${i && days[i - 1].eaten !== null ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.eaten).toFixed(1)}`))
    .join(' ')

  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect()
    const vx = ((clientX - r.left) / r.width) * W
    setSel(Math.max(0, Math.min(days.length - 1, Math.round((vx - padL) / slot))))
  }
  const cur = days[sel]

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-[var(--muted)]">Saldo médio · {days.length} dias</p>
          {avg === null ? (
            <p className="text-[15px] text-[var(--muted)]">Anote refeições para ver o saldo</p>
          ) : (
            <p className="text-[24px] leading-tight font-semibold tabular-nums tracking-[-0.02em]">
              {signed(avg)}
              <span className="ml-1 text-[14px] font-normal text-[var(--muted)]">
                kcal/dia · {avg <= 0 ? 'déficit' : 'superávit'}
              </span>
            </p>
          )}
        </div>
        <ul className="flex shrink-0 flex-col gap-0.5 text-[12px] text-[var(--muted)]">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-[var(--eaten)]" /> Consumido
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-[var(--spent)]" /> Gasto total
          </li>
        </ul>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        tabIndex={0}
        aria-label={`Consumido e gasto por dia em ${days.length} dias. Use as setas para trocar o dia.`}
        className="mt-3 block touch-pan-y overflow-visible outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setSel((s) => Math.max(0, s - 1))
          if (e.key === 'ArrowRight') setSel((s) => Math.min(days.length - 1, s + 1))
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" className="fill-[var(--muted)] text-[10px] tabular-nums">
              {t >= 1000 ? `${(t / 1000).toLocaleString('pt-BR')}k` : t}
            </text>
          </g>
        ))}
        <line x1={x(sel)} x2={x(sel)} y1={padTop} y2={H - padBottom} stroke="var(--ink)" strokeOpacity={0.25} strokeWidth={1} />
        <path d={spentPath} fill="none" stroke="var(--spent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={eatenPath} fill="none" stroke="var(--eaten)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {days.map((d, i) =>
          d.eaten === null ? null : (
            <circle key={d.day} cx={x(i)} cy={y(d.eaten)} r={i === sel ? 4.5 : 2.5} fill="var(--card)" stroke="var(--eaten)" strokeWidth={2} />
          ),
        )}
        <circle cx={x(sel)} cy={y(cur.spent)} r={4.5} fill="var(--card)" stroke="var(--spent)" strokeWidth={2} />
        <text x={padL} y={H - 4} className="fill-[var(--muted)] text-[11px]">{dayLabel(days[0].day)}</text>
        <text x={W - padR} y={H - 4} textAnchor="end" className="fill-[var(--muted)] text-[11px]">hoje</text>
      </svg>

      {/* Leitura do dia escolhido: o valor em destaque, o nome em tom secundário. */}
      <div aria-live="polite" className="mt-2 grid grid-cols-3 gap-2 rounded-xl bg-[var(--track)] px-3 py-2 text-[12px] text-[var(--muted)]">
        <p className="col-span-3 font-medium capitalize text-[var(--ink)]">{dayLabel(cur.day, true)}</p>
        <p>
          <span className="block text-[15px] font-semibold tabular-nums text-[var(--ink)]">{cur.eaten === null ? '—' : fmt(cur.eaten)}</span>
          consumido
        </p>
        <p>
          <span className="block text-[15px] font-semibold tabular-nums text-[var(--ink)]">{fmt(cur.spent)}</span>
          gasto total
          <span className="block text-[11px]">{fmt(base)} corpo + {fmt(cur.spent - base)} atividade</span>
        </p>
        <p>
          <span className="block text-[15px] font-semibold tabular-nums text-[var(--ink)]">
            {cur.eaten === null ? '—' : signed(cur.eaten - cur.spent)}
          </span>
          saldo
        </p>
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)]">
        Gasto total = o que seu corpo gasta no dia só para funcionar (~{fmt(base)} kcal, estimado) + as atividades
        que você anotou. O cartão &ldquo;Gasto hoje&rdquo; mostra só as atividades.
      </p>
    </div>
  )
}
