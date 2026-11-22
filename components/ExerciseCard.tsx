'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, CirclePlay, Dumbbell, HeartPulse, House, PersonStanding, Zap, type LucideIcon } from 'lucide-react'
import { demoUrl, EXERCISE_KINDS, type ExerciseKind } from '@/lib/training'
import { BodySilhouette, MUSCLES, sideFor } from './BodySilhouette'
import { num1 } from './format'

export const KIND_ICON: Record<ExerciseKind, LucideIcon> = {
  musculacao: Dumbbell,
  cardio: HeartPulse,
  funcional: Zap,
  casa: House,
  mobilidade: PersonStanding,
}
export const kindLabel = (k: ExerciseKind) => EXERCISE_KINDS.find((x) => x.id === k)?.label ?? k

/** O que o cartão precisa: serve para item do plano salvo e para o rascunho da IA. */
export type ExerciseView = {
  name: string
  description: string
  kind: ExerciseKind
  muscles: string[]
  sets?: number | null
  reps?: number | null
  durationS?: number | null
  restS?: number | null
  loadKg?: number | null
  demoUrl?: string
}

/** "45 s", "5 min", "1 min 30 s". */
export function secondsText(s: number): string {
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `${m} min ${r} s` : `${m} min`
}

/** "3 × 10", "3 × 45 s", "20 min". */
export function volumeText(e: Pick<ExerciseView, 'sets' | 'reps' | 'durationS'>): string {
  if (e.durationS) return e.sets && e.sets > 1 ? `${e.sets} × ${secondsText(e.durationS)}` : secondsText(e.durationS)
  if (e.sets && e.reps) return `${e.sets} × ${e.reps}`
  if (e.sets) return `${e.sets} séries`
  if (e.reps) return `${e.reps} repetições`
  return '—'
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-[var(--muted)]">{label}</dt>
      <dd className="text-[15px] font-semibold tabular-nums">{children}</dd>
    </div>
  )
}

/** Cartão do exercício: músculos acesos na silhueta, volume, descanso, carga sugerida, como fazer e demonstração. */
export function ExerciseCard({ ex, children }: { ex: ExerciseView; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const Icon = KIND_ICON[ex.kind] ?? Dumbbell
  const names = MUSCLES.filter((m) => ex.muscles.includes(m.id)).map((m) => m.label)

  return (
    <article className="rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)]" aria-label={ex.name}>
      <div className="flex gap-3">
        {ex.muscles.length > 0 ? (
          <div className="w-16 shrink-0">
            <BodySilhouette side={sideFor(ex.muscles)} highlight={ex.muscles} />
          </div>
        ) : (
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Icon aria-hidden size={26} strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[12px] text-[var(--muted)]">
            <Icon aria-hidden size={13} /> {kindLabel(ex.kind)}
          </p>
          <h3 className="text-[16px] leading-snug font-semibold">{ex.name}</h3>
          {names.length > 0 && <p className="mt-0.5 text-[13px] leading-snug text-[var(--muted)]">{names.join(' · ')}</p>}
          <dl className="mt-2 grid grid-cols-3 gap-2">
            <Stat label={ex.durationS ? 'Tempo' : 'Séries × reps'}>{volumeText(ex)}</Stat>
            <Stat label="Descanso">{ex.restS ? secondsText(ex.restS) : '—'}</Stat>
            <Stat label="Carga">{ex.loadKg ? `${num1(ex.loadKg)} kg` : '—'}</Stat>
          </dl>
        </div>
      </div>
      {open && ex.description && (
        <p className="anim-enter-up mt-3 text-[14px] leading-relaxed text-[var(--ink)]">{ex.description}</p>
      )}
      <div className="mt-2 -mb-1 flex gap-1">
        {ex.description && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex h-10 items-center gap-1 rounded-lg px-2 text-[14px] font-medium text-[var(--muted)] active:scale-[0.96]"
          >
            Como fazer
            <ChevronDown aria-hidden size={16} className={`transition-transform duration-200 ease-[var(--ease-out)] ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
        <button
          type="button"
          onClick={() => window.open(ex.demoUrl || demoUrl(ex.name), '_blank')}
          className="flex h-10 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-[var(--accent-text)] active:scale-[0.96]"
        >
          <CirclePlay aria-hidden size={17} /> Ver demonstração
        </button>
      </div>
      {children}
    </article>
  )
}
