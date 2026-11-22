'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  deleteComposition, saveComposition,
  type CompMetric, type CompositionEntry, type CompositionRecord,
} from '@/lib/api'
import { ValidationError } from '@/lib/validate'
import { ChoiceChips } from './Chips'
import { ConfirmRow } from './ConfirmRow'
import { NumberField } from './NumberField'
import { Sheet, btnGhost, btnPrimary, fieldLabel } from './Sheet'
import { SourceBadge } from './SourceBadge'
import { toast } from './Toast'
import { dateOnly, dateTime, num1 } from './format'

const card = 'rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)]'

/** Nome e unidade de cada métrica de composição. */
export const COMP_LABEL: Record<CompMetric, { name: string; unit: string }> = {
  weight_kg: { name: 'Peso', unit: 'kg' },
  bmi: { name: 'IMC', unit: 'kg/m²' },
  body_fat_pct: { name: 'Gordura corporal', unit: '%' },
  muscle_kg: { name: 'Massa muscular', unit: 'kg' },
  visceral_fat: { name: 'Gordura visceral', unit: 'nível' },
  water_pct: { name: 'Água corporal', unit: '%' },
}
const ORDER: CompMetric[] = ['weight_kg', 'bmi', 'body_fat_pct', 'muscle_kg', 'visceral_fat', 'water_pct']

type Input = Exclude<CompMetric, 'bmi'>
// IMC nunca é digitado: é calculado do peso e da altura.
const METRICS: { id: Input; label: string }[] = [
  { id: 'body_fat_pct', label: '% de gordura' },
  { id: 'muscle_kg', label: 'Massa muscular (kg)' },
  { id: 'visceral_fat', label: 'Gordura visceral' },
  { id: 'water_pct', label: 'Água corporal (%)' },
  { id: 'weight_kg', label: 'Peso (kg)' },
]
const METHODS = ['Balança de bioimpedância', 'Adipômetro', 'DEXA', 'Outro'] as const
type Method = (typeof METHODS)[number]

const value = (m: CompMetric, v: number) => `${num1(v)}${COMP_LABEL[m].unit === '%' ? '%' : ` ${COMP_LABEL[m].unit}`}`

function CompositionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [metric, setMetric] = useState<Input>('body_fat_pct')
  const [val, setVal] = useState('')
  const [method, setMethod] = useState<Method | null>(null)
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState(false)

  const methodText = method === 'Outro' ? other.trim() : (method ?? '')
  const ready = val.trim() !== '' && methodText !== '' && !busy

  const reset = () => {
    setVal('')
    setMethod(null)
    setOther('')
    setInvalid(false)
  }

  const save = async () => {
    setBusy(true)
    try {
      await saveComposition({ metric, valueStr: val, method: methodText })
      toast('Medição registrada.')
      reset()
      onClose()
    } catch (e) {
      setInvalid(true)
      if (e instanceof ValidationError) toast(e.message, 'erro')
      else {
        console.error(e)
        toast('Não deu para salvar a medição.', 'erro')
      }
    } finally {
      setBusy(false)
    }
  }

  const unit = COMP_LABEL[metric].unit
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Registrar medição">
      <h2 className="mb-1 text-[19px] font-semibold tracking-[-0.01em]">Registrar medição</h2>
      <p className="mb-4 text-[14px] leading-snug text-[var(--muted)]">
        Um valor medido por você ou por um profissional. Fica salvo como “medido”.
      </p>
      <span className={fieldLabel}>O que foi medido</span>
      <ChoiceChips label="O que foi medido" options={METRICS} value={metric} onChange={(m) => { setMetric(m); setInvalid(false) }} />
      <div className="mt-4">
        <NumberField
          label="Valor"
          value={val}
          onChange={setVal}
          unit={unit}
          decimals={metric === 'visceral_fat' ? 0 : 1}
          invalid={invalid}
        />
      </div>
      <div className="mt-4">
        <span className={fieldLabel}>Como foi medido</span>
        <ChoiceChips label="Como foi medido" options={METHODS.map((m) => ({ id: m, label: m }))} value={method} onChange={setMethod} />
        {method === 'Outro' && (
          <input
            type="text"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Qual método?"
            aria-label="Qual método?"
            maxLength={60}
            autoFocus
            className="mt-3 h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-[16px] outline-none transition-[border-color] duration-150 placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)]"
          />
        )}
      </div>
      {metric === 'weight_kg' && (
        <p className="mt-3 text-[13px] leading-snug text-[var(--muted)]">O peso entra no seu histórico de peso.</p>
      )}
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className={btnGhost}>
          Cancelar
        </button>
        <button type="button" onClick={() => void save()} disabled={!ready} className={`${btnPrimary} flex-1`}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Sheet>
  )
}

/** Composição corporal atual com a origem de cada valor, e os registros feitos à mão (apagáveis). */
export function CompositionCard({ entries, records }: { entries: CompositionEntry[]; records: CompositionRecord[] }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const sorted = ORDER.flatMap((m) => entries.filter((e) => e.metric === m))
  const hasFat = entries.some((e) => e.metric === 'body_fat_pct')

  const remove = async (id: string) => {
    setConfirm(null)
    try {
      await deleteComposition(id)
      toast('Registro apagado.')
    } catch (e) {
      console.error(e)
      toast('Não deu para apagar.', 'erro')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className={card} aria-label="Composição corporal">
        {sorted.length === 0 ? (
          <p className="text-[15px] text-[var(--muted)]">Registre seu peso ou uma medição para ver sua composição.</p>
        ) : (
          <ul className="flex flex-col">
            {sorted.map((e) => (
              <li key={e.metric} className="flex items-center gap-3 border-b border-[var(--line)]/70 py-2.5 first:pt-0 last:border-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium">{COMP_LABEL[e.metric].name}</p>
                  <p className="truncate text-[12px] text-[var(--muted)]">
                    {[e.method, dateOnly(e.at)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[17px] font-semibold tabular-nums">{value(e.metric, e.value)}</span>
                  <SourceBadge source={e.source} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] leading-snug text-[var(--muted)]">Estimado = calculado por fórmula, não é medição.</p>
        {!hasFat && (
          <p className="mt-1 text-[12px] leading-snug text-[var(--muted)]">
            Meça pescoço, cintura e quadril para estimar o % de gordura.
          </p>
        )}
        <button type="button" onClick={() => setOpen(true)} className={`${btnPrimary} mt-4 flex w-full items-center justify-center gap-2`}>
          <Plus aria-hidden size={18} /> Registrar medição
        </button>
      </section>

      {records.length > 0 && (
        <section className={card} aria-label="Medições registradas">
          <h3 className="mb-1 text-[13px] font-medium text-[var(--muted)]">Medições registradas</h3>
          <ul className="flex flex-col">
            {records.map((r) => (
              <li key={r.id} className="border-b border-[var(--line)]/70 last:border-0">
                {confirm === r.id ? (
                  <div className="py-1.5">
                    <ConfirmRow
                      text={`Apagar ${COMP_LABEL[r.metric].name.toLowerCase()}?`}
                      onCancel={() => setConfirm(null)}
                      onConfirm={() => void remove(r.id)}
                    />
                  </div>
                ) : (
                  <div className="flex min-h-12 items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px]">
                        {COMP_LABEL[r.metric].name} <span className="font-semibold tabular-nums">{value(r.metric, r.value)}</span>
                      </p>
                      <p className="truncate text-[12px] text-[var(--muted)]">
                        {[dateTime(r.at), r.method].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Apagar ${COMP_LABEL[r.metric].name} de ${dateTime(r.at)}`}
                      onClick={() => setConfirm(r.id)}
                      className="-mr-2 grid size-11 place-items-center rounded-xl text-[var(--muted)] transition-transform duration-150 active:scale-[0.92]"
                    >
                      <Trash2 aria-hidden size={17} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <CompositionSheet open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
