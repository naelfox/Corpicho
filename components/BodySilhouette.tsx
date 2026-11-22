'use client'

import { useState, type KeyboardEvent } from 'react'
import { REGIONS, type Region } from '@/lib/body'
import type { Muscle } from '@/lib/training'
import { deltaTone, num1, signed } from './format'

/**
 * Silhueta do corpo, frente e costas, desenhada à mão em SVG (figura neutra, sem gênero).
 * Lados do ponto de vista da pessoa: na FRENTE, o braço direito dela fica à esquerda de quem olha;
 * nas COSTAS, o direito fica à direita.
 *
 * - Com `values`, cada região ganha um rótulo (chip) ao lado com a última medida e a diferença,
 *   ligado à região por uma linha guia. Os chips são os botões acessíveis (alvo de 44 px).
 * - Sem `values` (ex.: Treino), mostra só a figura; com `onSelect`, as próprias regiões viram botões.
 * - `highlight` aceita regiões (`cintura`) e músculos (`peitoral`, `triceps`…, ver `MUSCLES`).
 */

export type { Muscle }

/** Músculos que a silhueta sabe destacar (ids usados pela IA do treino) e seus nomes em pt-BR. */
export const MUSCLES: { id: Muscle; label: string; side: 'front' | 'back' | 'both' }[] = [
  { id: 'peitoral', label: 'Peitoral', side: 'front' },
  { id: 'ombros', label: 'Ombros', side: 'both' },
  { id: 'biceps', label: 'Bíceps', side: 'front' },
  { id: 'triceps', label: 'Tríceps', side: 'back' },
  { id: 'antebraco', label: 'Antebraço', side: 'both' },
  { id: 'abdomen', label: 'Abdômen', side: 'front' },
  { id: 'obliquos', label: 'Oblíquos', side: 'front' },
  { id: 'costas', label: 'Costas', side: 'back' },
  { id: 'lombar', label: 'Lombar', side: 'back' },
  { id: 'gluteos', label: 'Glúteos', side: 'back' },
  { id: 'quadriceps', label: 'Quadríceps', side: 'front' },
  { id: 'posteriores', label: 'Posteriores de coxa', side: 'back' },
  { id: 'panturrilhas', label: 'Panturrilhas', side: 'both' },
  { id: 'trapezio', label: 'Trapézio', side: 'back' },
]

type Side = 'front' | 'back'
type Shape = {
  key: string
  d: string
  region?: Region
  muscles: Muscle[]
  /** Só aparece quando destacado (ex.: oblíquos por cima da cintura). */
  overlay?: boolean
}

// ── Geometria ────────────────────────────────────────────────────────────────
// A figura é desenhada num espaço próprio (centro x = 180, de y = 12 a 430) e reduzida por S
// dentro do viewBox, deixando colunas laterais para os rótulos.

const VW = 360
const S = 0.86
const OY = 24
const VH = 420
const COL = 112 // largura de cada coluna de rótulos (unidades do viewBox)
const FIG = `translate(180 ${OY}) scale(${S}) translate(-180 -12)`
const tx = (x: number) => 180 + (x - 180) * S
const ty = (y: number) => OY + (y - 12) * S

/** Espelha um caminho em torno de x = 180 (só comandos M/L/Q/C/Z, coordenadas absolutas). */
function mirror(d: string): string {
  let i = 0
  return d.replace(/-?\d*\.?\d+/g, (n) => (i++ % 2 === 0 ? String(360 - Number(n)) : n))
}
const both = (half: string) => `${half} ${mirror(half)}`

// Meia figura (lado direito de quem olha). O outro lado é o espelho.
const P = {
  torso:
    'M 180 82 L 194 82 Q 204 88 220 90 Q 236 94 238 110 L 238 122 L 226 124 Q 222 136 218 144 Q 213 157 212 170 Q 213 188 219 204 Q 227 220 226 238 L 180 248 Z',
  arm:
    'M 226 116 Q 238 112 241 124 Q 247 156 248 184 Q 253 216 253 244 Q 258 256 254 268 Q 249 276 244 270 Q 242 258 243 246 Q 238 220 234 190 Q 229 158 226 132 Z',
  leg:
    'M 181 234 L 226 234 Q 225 290 216 330 Q 222 360 216 388 L 208 410 Q 218 418 220 428 L 194 428 L 193 410 Q 187 380 189 336 Q 183 300 183 250 Z',
  neck: 'M 170 56 Q 171 70 167 84 L 193 84 Q 189 70 190 56 Z',
  delt: 'M 196 86 Q 222 84 234 96 Q 242 106 240 122 Q 233 116 226 116 Q 222 100 200 94 Z',
  chest: 'M 181 96 L 202 96 Q 219 99 223 114 Q 223 130 213 138 Q 199 143 181 140 Z',
  waist: 'M 181 144 L 217 144 Q 213 156 212 170 L 181 170 Z',
  abs: 'M 181 174 L 212 174 Q 213 188 218 202 L 181 202 Z',
  hips: 'M 181 206 L 219 206 Q 227 220 226 236 L 181 236 Z',
  obliques: 'M 204 146 L 216 146 Q 212 160 212 172 Q 213 186 216 198 L 206 198 Q 203 172 204 146 Z',
  upperArm: 'M 227 122 Q 236 118 240 126 Q 246 156 247 182 Q 241 188 234 184 Q 230 156 227 132 Z',
  forearm: 'M 235 190 Q 241 192 248 188 Q 252 216 252 242 Q 248 246 243 244 Q 239 218 235 190 Z',
  thigh: 'M 184 240 L 224 240 Q 222 290 214 326 Q 202 332 191 326 Q 185 290 184 240 Z',
  calf: 'M 191 336 Q 202 331 214 336 Q 221 358 215 384 L 207 406 L 195 406 Q 188 380 191 336 Z',
  // Costas
  trap: 'M 180 78 L 191 80 Q 196 88 214 92 Q 202 100 192 116 L 180 128 Z',
  lats: 'M 182 132 L 195 119 Q 205 104 222 106 Q 224 124 219 140 Q 214 154 212 166 L 182 166 Z',
  lowBack: 'M 182 170 L 212 170 Q 213 186 217 200 L 182 200 Z',
  glute: 'M 182 204 L 218 204 Q 228 220 226 236 Q 218 248 202 246 Q 186 244 182 236 Z',
  hamstring: 'M 185 250 Q 204 250 224 244 Q 222 290 214 326 Q 202 332 191 326 Q 185 290 185 250 Z',
  calfBack: 'M 191 336 Q 202 330 215 336 Q 224 356 216 382 L 207 406 L 195 406 Q 186 378 191 336 Z',
}

/** Na frente, a metade da direita (de quem olha) é o lado esquerdo da pessoa; nas costas, o direito. */
function limb(side: Side, half: 'R' | 'L', base: 'braco' | 'coxa' | 'panturrilha'): Region {
  const personLeft = side === 'front' ? half === 'R' : half === 'L'
  return `${base}_${personLeft ? 'e' : 'd'}` as Region
}

function pair(side: Side, key: string, half: string, base: 'braco' | 'coxa' | 'panturrilha' | null, muscles: Muscle[]): Shape[] {
  return (['R', 'L'] as const).map((h) => ({
    key: `${key}_${h}`,
    d: h === 'R' ? half : mirror(half),
    region: base ? limb(side, h, base) : undefined,
    muscles,
  }))
}

const SHAPES: Record<Side, Shape[]> = {
  front: [
    { key: 'pescoco', d: P.neck, region: 'pescoco', muscles: [] },
    { key: 'peitoral', d: both(P.chest), region: 'peitoral', muscles: ['peitoral'] },
    { key: 'cintura', d: both(P.waist), region: 'cintura', muscles: ['abdomen'] },
    { key: 'abdomen', d: both(P.abs), region: 'abdomen', muscles: ['abdomen'] },
    { key: 'quadril', d: both(P.hips), region: 'quadril', muscles: [] },
    { key: 'obliquos', d: both(P.obliques), muscles: ['obliquos'], overlay: true },
    ...pair('front', 'braco', P.upperArm, 'braco', ['biceps']),
    ...pair('front', 'antebraco', P.forearm, null, ['antebraco']),
    ...pair('front', 'coxa', P.thigh, 'coxa', ['quadriceps']),
    ...pair('front', 'panturrilha', P.calf, 'panturrilha', ['panturrilhas']),
    { key: 'ombros', d: both(P.delt), region: 'ombros', muscles: ['ombros'] },
  ],
  back: [
    { key: 'trapezio', d: both(P.trap), muscles: ['trapezio'] },
    { key: 'costas', d: both(P.lats), muscles: ['costas'] },
    { key: 'lombar', d: both(P.lowBack), muscles: ['lombar'] },
    { key: 'pescoco', d: P.neck, region: 'pescoco', muscles: [] },
    { key: 'quadril', d: both(P.glute), region: 'quadril', muscles: ['gluteos'] },
    ...pair('back', 'braco', P.upperArm, 'braco', ['triceps']),
    ...pair('back', 'antebraco', P.forearm, null, ['antebraco']),
    ...pair('back', 'coxa', P.hamstring, 'coxa', ['posteriores']),
    ...pair('back', 'panturrilha', P.calfBack, 'panturrilha', ['panturrilhas']),
    { key: 'ombros', d: both(P.delt), region: 'ombros', muscles: ['ombros'] },
  ],
}

// ── Rótulos ──────────────────────────────────────────────────────────────────
// Coluna (E = esquerda de quem olha), altura do centro do chip no viewBox e ponto na figura.

type Callout = { region: Region; col: 'L' | 'R'; y: number; anchor: [number, number] }
const C = (region: Region, col: 'L' | 'R', y: number, ax: number, ay: number): Callout => ({ region, col, y, anchor: [ax, ay] })

const CALLOUTS: Record<Side, Callout[]> = {
  front: [
    C('pescoco', 'L', 30, 173, 74),
    C('braco_d', 'L', 100, 122, 152),
    C('cintura', 'L', 168, 160, 157),
    C('quadril', 'L', 236, 150, 222),
    C('coxa_d', 'L', 304, 158, 285),
    C('panturrilha_d', 'L', 376, 157, 368),
    C('ombros', 'R', 30, 230, 102),
    C('peitoral', 'R', 98, 204, 118),
    C('braco_e', 'R', 166, 238, 152),
    C('abdomen', 'R', 234, 198, 188),
    C('coxa_e', 'R', 304, 202, 285),
    C('panturrilha_e', 'R', 376, 203, 368),
  ],
  back: [
    C('pescoco', 'L', 30, 173, 74),
    C('braco_e', 'L', 120, 122, 152),
    C('quadril', 'L', 210, 160, 222),
    C('coxa_e', 'L', 300, 158, 285),
    C('panturrilha_e', 'L', 376, 157, 368),
    C('ombros', 'R', 50, 230, 102),
    C('braco_d', 'R', 140, 238, 152),
    C('coxa_d', 'R', 300, 202, 285),
    C('panturrilha_d', 'R', 376, 203, 368),
  ],
}

const LABEL = Object.fromEntries(REGIONS.map((r) => [r.id, r.label])) as Record<Region, string>
const SHORT: Record<Region, string> = {
  pescoco: 'Pescoço', ombros: 'Ombros', peitoral: 'Peitoral', braco_d: 'Braço D', braco_e: 'Braço E',
  cintura: 'Cintura', abdomen: 'Abdômen', quadril: 'Quadril', coxa_d: 'Coxa D', coxa_e: 'Coxa E',
  panturrilha_d: 'Panturrilha D', panturrilha_e: 'Panturrilha E',
}

export type RegionValue = { cm: number; delta: number | null }

/** "Cintura, 93 cm, −2 cm" — usado como aria-label do botão da região. */
export function regionAria(region: Region, v?: RegionValue | null): string {
  if (!v) return `${LABEL[region]}, sem medida`
  const base = `${LABEL[region]}, ${num1(v.cm)} cm`
  return v.delta ? `${base}, ${signed(v.delta)} cm` : base
}

/** Qual lado mostra mais do que está destacado (para abrir a figura já no lado certo). */
export function sideFor(highlight: readonly string[]): Side {
  const count = (s: Side) =>
    SHAPES[s].filter((sh) => (sh.region && highlight.includes(sh.region)) || sh.muscles.some((m) => highlight.includes(m))).length
  return count('back') > count('front') ? 'back' : 'front'
}

export function BodySilhouette({
  side,
  values,
  highlight = [],
  onSelect,
  active = null,
}: {
  side: Side
  values?: Partial<Record<Region, RegionValue | null | undefined>>
  highlight?: readonly (Region | Muscle | string)[]
  onSelect?: (r: Region) => void
  /** Região em foco (ex.: a folha dela está aberta). */
  active?: Region | null
}) {
  const [pressed, setPressed] = useState<Region | null>(null)
  const labels = values !== undefined
  const lit = new Set<string>(highlight)
  const isLit = (sh: Shape) => (sh.region !== undefined && lit.has(sh.region)) || sh.muscles.some((m) => lit.has(m))
  const isOn = (r?: Region) => r !== undefined && (r === pressed || r === active)

  const press = {
    onPointerDown: (r: Region) => setPressed(r),
    end: () => setPressed(null),
  }
  const shapes = SHAPES[side]
  const regionsAsButtons = !!onSelect && !labels

  const fill = (sh: Shape) =>
    isLit(sh) ? 'var(--accent)' : isOn(sh.region) ? 'color-mix(in oklab, var(--accent) 55%, var(--figure-region))' : 'var(--figure-region)'

  const keyDown = (r: Region) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(r)
    }
  }

  const sideName = side === 'front' ? 'Corpo, frente' : 'Corpo, costas'
  const litNames = MUSCLES.filter((m) => lit.has(m.id)).map((m) => m.label.toLowerCase())
  const viewBox = labels ? `0 0 ${VW} ${VH}` : `${COL - 8} 0 ${VW - 2 * COL + 16} ${VH}`
  const ratio = labels ? VW / VH : (VW - 2 * COL + 16) / VH

  return (
    <div className={`relative mx-auto w-full ${labels ? 'max-w-[400px]' : 'max-w-[180px]'}`} style={{ aspectRatio: ratio }}>
      <svg
        viewBox={viewBox}
        className="absolute inset-0 size-full select-none"
        {...(labels
          ? { 'aria-hidden': true }
          : regionsAsButtons
            ? { role: 'group', 'aria-label': sideName }
            : { role: 'img', 'aria-label': litNames.length ? `${sideName}. Músculos: ${litNames.join(', ')}` : sideName })}
      >
        {labels &&
          CALLOUTS[side].map((c) => {
            const on = isOn(c.region) || lit.has(c.region)
            return (
              <line
                key={`l-${c.region}`}
                x1={c.col === 'L' ? COL : VW - COL}
                y1={c.y}
                x2={tx(c.anchor[0])}
                y2={ty(c.anchor[1])}
                stroke={on ? 'var(--accent)' : 'var(--line)'}
                strokeWidth={1}
              />
            )
          })}
        <g transform={FIG}>
          <g fill="var(--figure)" stroke="var(--figure)" strokeWidth={0.6} strokeLinejoin="round">
            <path d={both(P.torso)} />
            <path d={both(P.arm)} />
            <path d={both(P.leg)} />
          </g>
          {shapes.map((sh) => {
            if (sh.overlay && !isLit(sh)) return null
            const r = sh.region
            const tappable = !!onSelect && r !== undefined
            return (
              <path
                key={sh.key}
                d={sh.d}
                fill={fill(sh)}
                stroke="var(--card)"
                strokeWidth={1.5}
                strokeLinejoin="round"
                pointerEvents={sh.overlay ? 'none' : undefined}
                className={`transition-[fill] duration-150 ${tappable ? 'cursor-pointer outline-none focus-visible:[stroke:var(--accent)] focus-visible:[stroke-width:3]' : ''}`}
                {...(tappable && {
                  onClick: () => onSelect!(r),
                  onPointerDown: () => press.onPointerDown(r),
                  onPointerUp: press.end,
                  onPointerLeave: press.end,
                  onPointerCancel: press.end,
                })}
                {...(tappable && regionsAsButtons && {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': LABEL[r],
                  onKeyDown: keyDown(r),
                })}
              />
            )
          })}
          {/* Alvos de toque maiores para as partes finas (pescoço, braços, panturrilhas). */}
          {onSelect &&
            shapes
              .filter((sh) => sh.region && /^(pescoco|braco|panturrilha)/.test(sh.key))
              .map((sh) => (
                <path
                  key={`hit-${sh.key}`}
                  d={sh.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={12}
                  pointerEvents="stroke"
                  aria-hidden
                  className="cursor-pointer"
                  onClick={() => onSelect(sh.region!)}
                  onPointerDown={() => press.onPointerDown(sh.region!)}
                  onPointerUp={press.end}
                  onPointerLeave={press.end}
                  onPointerCancel={press.end}
                />
              ))}
          <ellipse cx={180} cy={38} rx={20} ry={24} fill="var(--figure)" pointerEvents="none" />
        </g>
        {labels &&
          CALLOUTS[side].map((c) => {
            const on = isOn(c.region) || lit.has(c.region)
            return (
              <circle
                key={`d-${c.region}`}
                cx={tx(c.anchor[0])}
                cy={ty(c.anchor[1])}
                r={on ? 3.5 : 2.5}
                fill={on ? 'var(--accent)' : 'var(--muted)'}
                stroke="var(--card)"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            )
          })}
      </svg>

      {labels &&
        CALLOUTS[side].map((c) => {
          const v = values?.[c.region] ?? null
          const on = isOn(c.region) || lit.has(c.region)
          return (
            <button
              key={c.region}
              type="button"
              aria-label={regionAria(c.region, v)}
              disabled={!onSelect}
              onClick={() => onSelect?.(c.region)}
              onPointerDown={() => press.onPointerDown(c.region)}
              onPointerUp={press.end}
              onPointerLeave={press.end}
              onPointerCancel={press.end}
              style={{ top: `${(c.y / VH) * 100}%`, width: `${(COL / VW) * 100}%`, [c.col === 'L' ? 'left' : 'right']: 0 }}
              className={`absolute flex h-11 -translate-y-1/2 flex-col justify-center rounded-xl border bg-[var(--card)] px-2 text-left leading-tight transition-[border-color,background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] disabled:active:scale-100 ${
                on ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)]'
              }`}
            >
              <span aria-hidden className="flex items-baseline gap-1">
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--muted)]">{SHORT[c.region]}</span>
                {v?.delta ? (
                  <span className={`shrink-0 text-[12px] font-medium tabular-nums ${deltaTone(v.delta)}`}>{signed(v.delta)}</span>
                ) : null}
              </span>
              <span aria-hidden className={`truncate text-[14px] tabular-nums ${v ? 'font-semibold' : 'text-[var(--muted)]'}`}>
                {v ? `${num1(v.cm)} cm` : '—'}
              </span>
            </button>
          )
        })}
    </div>
  )
}
