'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import {
  deleteSetApi, discardSessionApi, finishSessionApi, logActivityApi, logSetApi,
  type ExerciseKind, type OpenSession, type PlanItem,
} from '@/lib/api'
import { EXERCISE_KINDS } from '@/lib/training'
import { parseNum, ValidationError } from '@/lib/validate'
import { ChoiceChips } from './Chips'
import { ConfirmRow } from './ConfirmRow'
import { KIND_ICON, secondsText, volumeText } from './ExerciseCard'
import { NumberField } from './NumberField'
import { Sheet, btnGhost, btnPrimary, fieldLabel } from './Sheet'
import { toast } from './Toast'
import { num1 } from './format'

const RPE_OPTIONS = Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }))

/** Esforço percebido 1–10, com a régua explicada. */
export function RpeChips({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <div>
      <span className={fieldLabel}>Esforço percebido (RPE)</span>
      <ChoiceChips label="Esforço percebido de 1 a 10" options={RPE_OPTIONS} value={value ? String(value) : null} onChange={(v) => onChange(Number(v))} />
      <p className="mt-2 text-[12px] leading-snug text-[var(--muted)]">1 = muito leve · 5 = moderado · 10 = esforço máximo</p>
    </div>
  )
}

function failed(e: unknown, fallback: string) {
  if (e instanceof ValidationError) toast(e.message, 'erro')
  else {
    console.error(e)
    toast(fallback, 'erro')
  }
}

/** Minutos desde o início do treino (mínimo 1), como texto para o campo. */
function elapsedMin(startedAt: string): string {
  return String(Math.max(1, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000)))
}

type Row = { reps: string; load: string; min: string; setId: string | null; busy: boolean }
const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : num1(n))

function initialRows(items: PlanItem[], session: OpenSession): Record<string, Row[]> {
  const out: Record<string, Row[]> = {}
  for (const it of items) {
    const n = Math.max(1, it.sets ?? 1)
    out[it.id] = Array.from({ length: n }, (_, i) => {
      const done = session.sets.find((s) => s.exerciseId === it.exercise.id && s.setNo === i + 1)
      return {
        reps: str(done?.reps ?? it.reps),
        load: str(done?.loadKg ?? it.loadKg),
        min: str(((done?.durationS ?? it.durationS) || 0) / 60 || null),
        setId: done?.id ?? null,
        busy: false,
      }
    })
  }
  return out
}

function SetRow({ item, no, row, onChange, onToggle }: {
  item: PlanItem
  no: number
  row: Row
  onChange: (r: Partial<Row>) => void
  onToggle: () => void
}) {
  const timed = !!item.durationS
  const done = !!row.setId
  // Rótulos visíveis só na 1ª série; nas outras ficam para leitores de tela.
  const lbl = (t: string) => (no === 1 ? t : <span className="sr-only">{`${t}, série ${no}`}</span>)
  return (
    <li className="flex items-end gap-2">
      <span className="mb-3.5 w-6 shrink-0 text-center text-[13px] font-medium tabular-nums text-[var(--muted)]">{no}</span>
      {timed ? (
        <div className="min-w-0 flex-1">
          <NumberField label={lbl('Tempo')} value={row.min} onChange={(min) => onChange({ min })} unit="min" />
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <NumberField label={lbl('Reps')} value={row.reps} onChange={(reps) => onChange({ reps })} decimals={0} />
          </div>
          <div className="min-w-0 flex-1">
            <NumberField label={lbl('Carga')} value={row.load} onChange={(load) => onChange({ load })} unit="kg" placeholder="—" />
          </div>
        </>
      )}
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`Série ${no} de ${item.exercise.name} feita`}
        disabled={row.busy}
        onClick={onToggle}
        className={`grid size-12 shrink-0 place-items-center rounded-xl border transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.92] disabled:opacity-60 ${
          done
            ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]'
            : 'border-[var(--line)] bg-[var(--bg)] text-[var(--muted)]'
        }`}
      >
        <Check aria-hidden size={20} strokeWidth={done ? 2.5 : 1.75} />
      </button>
    </li>
  )
}

/**
 * Treino em andamento: cada exercício do dia com as séries já preenchidas pelo plano.
 * Marcar ✓ grava a série na hora (fechar a folha não perde nada: dá para continuar depois).
 * No fim, esforço (RPE) e duração concluem o treino.
 */
export function SessionSheet({ open, onClose, items, session }: {
  open: boolean
  onClose: () => void
  items: PlanItem[]
  session: OpenSession
}) {
  const [rows, setRows] = useState(() => initialRows(items, session))
  const [rpe, setRpe] = useState<number | null>(null)
  const [duration, setDuration] = useState(() => elapsedMin(session.startedAt))
  const [durationEdited, setDurationEdited] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const doneCount = Object.values(rows).flat().filter((r) => r.setId).length
  const total = Object.values(rows).flat().length

  const patch = (itemId: string, i: number, p: Partial<Row>) =>
    setRows((rs) => ({ ...rs, [itemId]: rs[itemId].map((r, j) => (j === i ? { ...r, ...p } : r)) }))

  // Acompanha o tempo decorrido até a pessoa digitar a duração.
  const refreshDuration = () => {
    if (!durationEdited) setDuration(elapsedMin(session.startedAt))
  }

  const toggle = async (item: PlanItem, i: number) => {
    const row = rows[item.id][i]
    patch(item.id, i, { busy: true })
    try {
      if (row.setId) {
        await deleteSetApi(row.setId)
        patch(item.id, i, { setId: null, busy: false })
        return
      }
      const set = item.durationS
        ? { durationS: Math.round(parseNum(row.min || '0', { min: 0.1, max: 600, label: 'Tempo (min)' }) * 60) }
        : {
            reps: row.reps.trim() ? Math.round(parseNum(row.reps, { min: 0, max: 500, label: 'Repetições' })) : undefined,
            loadKg: row.load.trim() ? parseNum(row.load, { min: 0, max: 500, label: 'Carga (kg)' }) : undefined,
          }
      const setId = await logSetApi(session.id, { exerciseId: item.exercise.id, setNo: i + 1, ...set })
      patch(item.id, i, { setId, busy: false })
      refreshDuration()
    } catch (e) {
      patch(item.id, i, { busy: false })
      failed(e, 'Não deu para salvar a série.')
    }
  }

  const finish = async () => {
    if (!rpe) return
    setBusy(true)
    try {
      await finishSessionApi(session.id, { durationStr: duration, rpe })
      toast('Treino concluído. Bom trabalho!')
      onClose()
    } catch (e) {
      failed(e, 'Não deu para concluir o treino.')
    } finally {
      setBusy(false)
    }
  }

  const discard = async () => {
    setConfirm(false)
    try {
      await discardSessionApi(session.id)
      toast('Treino descartado.')
      onClose()
    } catch (e) {
      failed(e, 'Não deu para descartar.')
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Treino de hoje">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-[19px] font-semibold tracking-[-0.01em]">Treino de hoje</h2>
        <span className="text-[13px] tabular-nums text-[var(--muted)]" aria-live="polite">
          {doneCount} de {total} séries
        </span>
      </div>

      <ol className="flex flex-col gap-5">
        {items.map((it) => {
          const Icon = KIND_ICON[it.exercise.kind]
          return (
            <li key={it.id}>
              <h3 className="flex items-center gap-1.5 text-[16px] font-semibold">
                <Icon aria-hidden size={16} className="text-[var(--muted)]" /> {it.exercise.name}
              </h3>
              <p className="mb-2 text-[13px] text-[var(--muted)]">
                Planejado: {volumeText(it)}
                {it.restS ? ` · descanso ${secondsText(it.restS)}` : ''}
                {it.loadKg ? ` · ${num1(it.loadKg)} kg` : ''}
              </p>
              <ul className="flex flex-col gap-2">
                {(rows[it.id] ?? []).map((r, i) => (
                  <SetRow key={i} item={it} no={i + 1} row={r} onChange={(p) => patch(it.id, i, p)} onToggle={() => void toggle(it, i)} />
                ))}
              </ul>
            </li>
          )
        })}
      </ol>

      <div className="mt-6 flex flex-col gap-4 border-t border-[var(--line)] pt-5">
        <RpeChips
          value={rpe}
          onChange={(n) => {
            setRpe(n)
            refreshDuration()
          }}
        />
        <NumberField
          label="Duração"
          value={duration}
          onChange={(v) => {
            setDuration(v)
            setDurationEdited(true)
          }}
          unit="min"
          decimals={0}
        />
        {confirm ? (
          <ConfirmRow text="Descartar este treino?" onCancel={() => setConfirm(false)} onConfirm={() => void discard()} />
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirm(true)} className={btnGhost}>
              Descartar
            </button>
            <button type="button" onClick={() => void finish()} disabled={!rpe || !duration.trim() || busy} className={`${btnPrimary} flex-1`}>
              {busy ? 'Salvando…' : 'Concluir treino'}
            </button>
          </div>
        )}
        {!rpe && <p className="-mt-2 text-center text-[12px] text-[var(--muted)]">Escolha o esforço para concluir.</p>}
      </div>
    </Sheet>
  )
}

const ACTIVITIES = ['Caminhada', 'Bicicleta', 'Corrida', 'Natação', 'Alongamento', 'Dança']
const ACTIVITY_KIND: Record<string, ExerciseKind> = {
  Caminhada: 'cardio', Bicicleta: 'cardio', Corrida: 'cardio', Natação: 'cardio', Alongamento: 'mobilidade', Dança: 'cardio',
}

/** Atividade fora do plano (caminhada de 40 min, por exemplo): fica registrada como um treino concluído. */
export function ActivitySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('Caminhada')
  const [kind, setKind] = useState<ExerciseKind>('cardio')
  const [minutes, setMinutes] = useState('')
  const [rpe, setRpe] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState(false)

  const save = async () => {
    if (!rpe) return
    setBusy(true)
    try {
      await logActivityApi({ name, kind, durationStr: minutes, rpe })
      toast('Atividade registrada.')
      setMinutes('')
      setRpe(null)
      setInvalid(false)
      onClose()
    } catch (e) {
      setInvalid(true)
      failed(e, 'Não deu para registrar a atividade.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Atividade avulsa">
      <h2 className="mb-1 text-[19px] font-semibold tracking-[-0.01em]">Atividade avulsa</h2>
      <p className="mb-4 text-[14px] leading-snug text-[var(--muted)]">Algo fora do plano, como uma caminhada. Conta nos treinos da semana.</p>
      <span className={fieldLabel}>Atividade</span>
      <ChoiceChips
        label="Atividade"
        scroll
        options={ACTIVITIES.map((a) => ({ id: a, label: a }))}
        value={ACTIVITIES.includes(name) ? name : null}
        onChange={(a) => {
          setName(a)
          setKind(ACTIVITY_KIND[a])
        }}
      />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Nome da atividade"
        placeholder="Outra atividade"
        maxLength={120}
        className="mt-3 h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-[16px] outline-none transition-[border-color] duration-150 placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)]"
      />
      <div className="mt-4">
        <span className={fieldLabel}>Tipo</span>
        <ChoiceChips label="Tipo" options={EXERCISE_KINDS} value={kind} onChange={setKind} />
      </div>
      <div className="mt-4">
        <NumberField label="Duração" value={minutes} onChange={setMinutes} unit="min" decimals={0} placeholder="ex.: 40" invalid={invalid} />
      </div>
      <div className="mt-4">
        <RpeChips value={rpe} onChange={setRpe} />
      </div>
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className={btnGhost}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!name.trim() || !minutes.trim() || !rpe || busy}
          className={`${btnPrimary} flex-1`}
        >
          {busy ? 'Salvando…' : 'Registrar'}
        </button>
      </div>
    </Sheet>
  )
}
