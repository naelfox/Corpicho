'use client'

import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { savePlan, type ExerciseKind, type PlanDraft } from '@/lib/api'
import { EXERCISE_KINDS, type NewPlanItem } from '@/lib/training'
import { parseNum, ValidationError } from '@/lib/validate'
import { MUSCLES } from './BodySilhouette'
import { Chip, ChoiceChips, Segmented } from './Chips'
import { KIND_ICON, volumeText } from './ExerciseCard'
import { NumberField } from './NumberField'
import { Sheet, btnGhost, btnPrimary, fieldLabel } from './Sheet'
import { toast } from './Toast'
import { num1 } from './format'

export const WEEKDAY_NAME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
/** A semana começa na segunda (como "treinos da semana" no Início). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const WEEK_OPTIONS = WEEK_ORDER.map((d) => ({ id: d, label: WEEKDAY_SHORT[d], aria: WEEKDAY_NAME[d] }))

/** Faixa da semana (seg–dom): ponto = dia com exercícios; hoje em destaque. */
export function WeekStrip({ value, today, hasItems, onChange }: {
  value: number
  today: number
  hasItems: (weekday: number) => boolean
  onChange: (weekday: number) => void
}) {
  return (
    <div role="radiogroup" aria-label="Dia da semana" className="grid grid-cols-7 gap-1 rounded-xl bg-[var(--track)] p-1">
      {WEEK_ORDER.map((d) => {
        const active = d === value
        const has = hasItems(d)
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${WEEKDAY_NAME[d]}${d === today ? ', hoje' : ''}${has ? '' : ', descanso'}`}
            onClick={() => onChange(d)}
            className={`flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] text-[13px] transition-[background-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.95] ${
              active ? 'bg-[var(--card)] font-semibold text-[var(--ink)] shadow-[var(--shadow-card)]' : 'text-[var(--muted)]'
            } ${d === today && !active ? 'font-semibold text-[var(--accent-text)]' : ''}`}
          >
            {WEEKDAY_SHORT[d]}
            <span aria-hidden className={`size-1.5 rounded-full ${has ? 'bg-[var(--accent)]' : 'bg-transparent'}`} />
          </button>
        )
      })}
    </div>
  )
}

const textInput =
  'h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-[16px] outline-none transition-[border-color] duration-150 placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)]'

type Form = {
  weekday: number
  name: string
  description: string
  kind: ExerciseKind
  muscles: string[]
  mode: 'reps' | 'tempo'
  sets: string
  reps: string
  min: string
  rest: string
  load: string
}

const s = (n: number | undefined) => (n === undefined ? '' : num1(n))
const emptyForm = (weekday: number): Form => ({
  weekday, name: '', description: '', kind: 'musculacao', muscles: [], mode: 'reps', sets: '3', reps: '10', min: '', rest: '60', load: '',
})
const toForm = (it: NewPlanItem): Form => ({
  weekday: it.weekday,
  name: it.exercise.name,
  description: it.exercise.description,
  kind: it.exercise.kind,
  muscles: it.exercise.muscles,
  mode: it.durationS ? 'tempo' : 'reps',
  sets: s(it.sets),
  reps: s(it.reps),
  min: it.durationS ? num1(it.durationS / 60) : '',
  rest: s(it.restS),
  load: s(it.loadKg),
})

const optional = (v: string, o: { min: number; max: number; label: string }) => (v.trim() ? parseNum(v, o) : undefined)
const int = (v: string, o: { min: number; max: number; label: string }) => {
  const n = optional(v, o)
  if (n !== undefined && !Number.isInteger(n)) throw new ValidationError(`${o.label}: use um número inteiro.`)
  return n
}

function fromForm(f: Form): NewPlanItem {
  const name = f.name.trim()
  if (!name) throw new ValidationError('Exercício: informe o nome.')
  const item: NewPlanItem = {
    weekday: f.weekday,
    exercise: { name, description: f.description.trim(), kind: f.kind, muscles: f.muscles },
    sets: int(f.sets, { min: 1, max: 10, label: 'Séries' }),
    restS: int(f.rest, { min: 0, max: 600, label: 'Descanso (s)' }),
    loadKg: optional(f.load, { min: 0, max: 500, label: 'Carga (kg)' }),
  }
  if (f.mode === 'tempo') {
    const min = parseNum(f.min, { min: 0.1, max: 120, label: 'Tempo (min)' })
    item.durationS = Math.round(min * 60)
  } else {
    item.reps = int(f.reps, { min: 1, max: 50, label: 'Repetições' })
  }
  for (const k of ['sets', 'reps', 'durationS', 'restS', 'loadKg'] as const) if (item[k] === undefined) delete item[k]
  return item
}

function ExerciseForm({ initial, editing, onCancel, onDone }: {
  initial: Form
  editing: boolean
  onCancel: () => void
  onDone: (it: NewPlanItem) => void
}) {
  const [f, setF] = useState(initial)
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }))

  const submit = () => {
    try {
      onDone(fromForm(f))
    } catch (e) {
      if (e instanceof ValidationError) toast(e.message, 'erro')
      else throw e
    }
  }

  return (
    <div className="anim-enter-up flex flex-col gap-4 rounded-2xl border border-[var(--line)] p-4">
      <div>
        <span className={fieldLabel}>Dia</span>
        <Segmented label="Dia da semana" compact options={WEEK_OPTIONS} value={f.weekday} onChange={(weekday) => set({ weekday })} />
      </div>
      <div>
        <label className={fieldLabel} htmlFor="ex-name">Exercício</label>
        <input id="ex-name" type="text" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="ex.: Agachamento livre" maxLength={120} autoFocus={!editing} className={textInput} />
      </div>
      <div>
        <span className={fieldLabel}>Tipo</span>
        <ChoiceChips label="Tipo" options={EXERCISE_KINDS} value={f.kind} onChange={(kind) => set({ kind })} />
      </div>
      <div>
        <span className={fieldLabel}>Músculos trabalhados</span>
        <div className="flex flex-wrap gap-2">
          {MUSCLES.map((m) => (
            <Chip
              key={m.id}
              active={f.muscles.includes(m.id)}
              onClick={() => set({ muscles: f.muscles.includes(m.id) ? f.muscles.filter((x) => x !== m.id) : [...f.muscles, m.id] })}
            >
              {m.label}
            </Chip>
          ))}
        </div>
      </div>
      <Segmented
        label="Medir por"
        options={[{ id: 'reps', label: 'Repetições' }, { id: 'tempo', label: 'Tempo' }]}
        value={f.mode}
        onChange={(mode) => set({ mode })}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Séries" value={f.sets} onChange={(sets) => set({ sets })} decimals={0} />
        {f.mode === 'reps' ? (
          <NumberField label="Repetições" value={f.reps} onChange={(reps) => set({ reps })} decimals={0} />
        ) : (
          <NumberField label="Tempo" value={f.min} onChange={(min) => set({ min })} unit="min" placeholder="ex.: 20" />
        )}
        <NumberField label="Descanso" value={f.rest} onChange={(rest) => set({ rest })} unit="s" decimals={0} />
        <NumberField label="Carga" value={f.load} onChange={(load) => set({ load })} unit="kg" placeholder="opcional" />
      </div>
      <div>
        <label className={fieldLabel} htmlFor="ex-desc">Como fazer (opcional)</label>
        <textarea
          id="ex-desc"
          value={f.description}
          onChange={(e) => set({ description: e.target.value })}
          rows={2}
          maxLength={1000}
          className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-3 text-[16px] leading-snug outline-none transition-[border-color] duration-150 focus:border-[var(--accent)]"
        />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className={btnGhost}>
          Cancelar
        </button>
        <button type="button" onClick={submit} disabled={!f.name.trim()} className={`${btnPrimary} flex-1`}>
          {editing ? 'Salvar exercício' : 'Adicionar'}
        </button>
      </div>
    </div>
  )
}

/**
 * Criar ou editar o plano à mão. Salvar cria um plano novo e ativo; o anterior fica no histórico.
 * Também abre um rascunho da IA para ajustes antes de usar.
 */
export function PlanEditor({ open, onClose, initial, origin, today }: {
  open: boolean
  onClose: () => void
  initial: PlanDraft | null
  origin: 'ia' | 'manual'
  today: number
}) {
  const [name, setName] = useState(initial?.name ?? 'Meu plano')
  const [notes] = useState(initial?.notes ?? '')
  const [items, setItems] = useState<NewPlanItem[]>(initial?.items ?? [])
  const [day, setDay] = useState(today)
  const [form, setForm] = useState<{ index: number | null; key: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const dayItems = items.map((it, index) => ({ it, index })).filter((x) => x.it.weekday === day)
  const counts = (d: number) => items.filter((i) => i.weekday === d).length

  const done = (it: NewPlanItem) => {
    setItems((xs) => (form?.index === null || form?.index === undefined ? [...xs, it] : xs.map((x, i) => (i === form.index ? it : x))))
    setDay(it.weekday)
    setForm(null)
  }

  const save = async () => {
    setBusy(true)
    try {
      await savePlan({ name, notes, items }, origin)
      toast('Plano salvo.')
      onClose()
    } catch (e) {
      if (e instanceof ValidationError) toast(e.message, 'erro')
      else {
        console.error(e)
        toast('Não deu para salvar o plano.', 'erro')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Plano de treino">
      <h2 className="mb-4 text-[19px] font-semibold tracking-[-0.01em]">{initial ? 'Editar plano' : 'Novo plano'}</h2>
      <label className={fieldLabel} htmlFor="plan-name">Nome do plano</label>
      <input id="plan-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={textInput} />

      <div className="mt-5">
        <span className={fieldLabel}>Dia da semana</span>
        <WeekStrip
          value={day}
          today={today}
          hasItems={(d) => counts(d) > 0}
          onChange={(d) => {
            setDay(d)
            setForm(null)
          }}
        />
      </div>

      <ul className="mt-3 flex flex-col">
        {dayItems.length === 0 && !form && (
          <li className="py-3 text-[14px] text-[var(--muted)]">{WEEKDAY_NAME[day]}: sem exercícios (dia de descanso).</li>
        )}
        {dayItems.map(({ it, index }) => {
          const Icon = KIND_ICON[it.exercise.kind]
          return (
            <li key={index} className="flex min-h-14 items-center gap-3 border-b border-[var(--line)]/70 last:border-0">
              <Icon aria-hidden size={18} className="shrink-0 text-[var(--muted)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{it.exercise.name}</p>
                <p className="text-[12px] tabular-nums text-[var(--muted)]">
                  {volumeText(it)}
                  {it.loadKg ? ` · ${num1(it.loadKg)} kg` : ''}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Editar ${it.exercise.name}`}
                onClick={() => setForm({ index, key: Date.now() })}
                className="grid size-11 place-items-center rounded-xl text-[var(--muted)] active:scale-[0.92]"
              >
                <Pencil aria-hidden size={17} />
              </button>
              <button
                type="button"
                aria-label={`Tirar ${it.exercise.name}`}
                onClick={() => {
                  setItems((xs) => xs.filter((_, i) => i !== index))
                  setForm(null)
                }}
                className="-mr-2 grid size-11 place-items-center rounded-xl text-[var(--muted)] active:scale-[0.92]"
              >
                <Trash2 aria-hidden size={17} />
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-3">
        {form ? (
          <ExerciseForm
            key={form.key}
            initial={form.index === null ? emptyForm(day) : toForm(items[form.index])}
            editing={form.index !== null}
            onCancel={() => setForm(null)}
            onDone={done}
          />
        ) : (
          <button
            type="button"
            onClick={() => setForm({ index: null, key: Date.now() })}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line)] text-[15px] font-medium text-[var(--accent-text)] active:scale-[0.98]"
          >
            <Plus aria-hidden size={18} /> Adicionar exercício
          </button>
        )}
      </div>

      <div className="mt-6 flex gap-2">
        <button type="button" onClick={onClose} className={btnGhost}>
          Cancelar
        </button>
        <button type="button" onClick={() => void save()} disabled={!name.trim() || !items.length || busy || !!form} className={`${btnPrimary} flex-1`}>
          {busy ? 'Salvando…' : 'Salvar plano'}
        </button>
      </div>
    </Sheet>
  )
}
