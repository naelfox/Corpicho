'use client'

import { useState } from 'react'
import { ChevronLeft, Sparkles } from 'lucide-react'
import { describeChangesApi, type Angle, type PhotoSession } from '@/lib/api'
import { AI_ERROR_TEXT, AiError } from '@/lib/ai/client'
import { ANGLES } from '@/lib/bodyPhotos'
import type { Day } from '@/lib/dates'
import { Segmented } from './Chips'
import { angleLabel, dayLabelBr, usePhoto, type PhotoCache } from './photoCache'
import { btnPrimary, fieldLabel } from './Sheet'
import { toast } from './Toast'

const card = 'rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)]'

export const COMPARE_DISCLAIMER = 'Descrição visual aproximada — não é medição.'

function DayPicker({ label, days, value, onChange }: { label: string; days: Day[]; value: Day; onChange: (d: Day) => void }) {
  return (
    <label className="min-w-0 flex-1">
      <span className={fieldLabel}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-[15px] text-[var(--ink)]"
      >
        {days.map((d) => (
          <option key={d} value={d}>
            {dayLabelBr(d)}
          </option>
        ))}
      </select>
    </label>
  )
}

function Side({ tag, day, angle, path, cache }: { tag: string; day: Day; angle: Angle; path?: string; cache: PhotoCache }) {
  const url = usePhoto(cache, path)
  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-[var(--track)]">
        {path ? (
          url ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL local
            <img src={url} alt={`${tag}: ${angleLabel(angle)} em ${dayLabelBr(day)}`} className="absolute inset-0 size-full object-contain" />
          ) : (
            <span aria-hidden className="absolute inset-0 animate-pulse bg-[var(--track)]" />
          )
        ) : (
          <span className="absolute inset-0 grid place-items-center px-2 text-center text-[13px] text-[var(--muted)]">
            Sem foto de {angleLabel(angle).toLowerCase()} neste dia
          </span>
        )}
      </div>
      <figcaption className="text-center text-[12px] text-[var(--muted)]">
        {tag} · {dayLabelBr(day)}
      </figcaption>
    </figure>
  )
}

/** Duas datas e um ângulo, lado a lado; a IA descreve só mudanças visuais aparentes. */
export function PhotoCompare({ sessions, cache, onBack }: { sessions: PhotoSession[]; cache: PhotoCache; onBack: () => void }) {
  // sessions vem do mais recente para o mais antigo; no seletor, do mais antigo para o mais recente.
  const days = sessions.map((s) => s.day).reverse()
  const [before, setBefore] = useState<Day>(days[0])
  const [after, setAfter] = useState<Day>(days[days.length - 1])
  const [angle, setAngle] = useState<Angle>('frente')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const photoOf = (day: Day) => sessions.find((s) => s.day === day)?.photos[angle]
  const a = photoOf(before)
  const b = photoOf(after)
  const ready = !!a && !!b && before !== after

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setResult(null)
  }

  const describe = async () => {
    if (!a || !b) return
    setBusy(true)
    try {
      setResult(await describeChangesApi({ beforeIds: [a.id], afterIds: [b.id] }))
    } catch (e) {
      if (!(e instanceof AiError)) console.error(e)
      toast(e instanceof AiError ? AI_ERROR_TEXT[e.code] : AI_ERROR_TEXT.failed, 'erro')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="anim-enter-up flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Voltar" className="grid size-10 place-items-center rounded-xl text-[var(--muted)] active:scale-[0.96]">
          <ChevronLeft aria-hidden size={22} />
        </button>
        <p className="text-[17px] font-semibold">Comparar</p>
      </div>

      <section className={`${card} flex flex-col gap-3`} aria-label="Escolha das fotos">
        <div className="flex gap-2">
          <DayPicker label="Antes" days={days} value={before} onChange={reset(setBefore)} />
          <DayPicker label="Depois" days={days} value={after} onChange={reset(setAfter)} />
        </div>
        <Segmented label="Ângulo" options={ANGLES} value={angle} onChange={reset(setAngle)} />
      </section>

      <section className={`${card} grid grid-cols-2 gap-2`} aria-label="Fotos lado a lado">
        <Side tag="Antes" day={before} angle={angle} path={a?.path} cache={cache} />
        <Side tag="Depois" day={after} angle={angle} path={b?.path} cache={cache} />
      </section>

      {before === after && <p className="px-1 text-[13px] text-[var(--muted)]">Escolha duas datas diferentes.</p>}

      <button
        type="button"
        onClick={() => void describe()}
        disabled={!ready || busy}
        className={`${btnPrimary} flex items-center justify-center gap-1.5`}
      >
        <Sparkles aria-hidden size={18} /> {busy ? 'Descrevendo…' : 'Descrever mudanças'}
      </button>

      {result && (
        <section className={`${card} anim-enter-up flex flex-col gap-2`} aria-label="Mudanças descritas" aria-live="polite">
          <p className="text-[15px] leading-relaxed whitespace-pre-line">{result}</p>
          <p className="text-[12px] text-[var(--muted)]">{COMPARE_DISCLAIMER}</p>
        </section>
      )}
    </div>
  )
}
