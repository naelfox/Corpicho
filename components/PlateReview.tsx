'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, Plus, X } from 'lucide-react'
import { addMealApi, analyzePlateApi, type Food, type MealType, type PlateItem } from '@/lib/api'
import { AI_ERROR_TEXT, AiError } from '@/lib/ai/client'
import { pushBackHandler } from './back'
import { mealTypeAt } from '@/lib/meals'
import { scaleFood, sumMacros, type Per100 } from '@/lib/nutrition'
import { ValidationError, parseNum } from '@/lib/validate'
import { FoodSearch, MacroLine, loose, per100Of } from './AddFoodSheet'
import { card } from './MealHistory'
import { MealTypePicker } from './MealTypePicker'
import { MeasurePicker } from './MeasurePicker'
import { NumberField } from './NumberField'
import { Sheet, btnGhost, btnPrimary, fieldLabel } from './Sheet'
import { toast } from './Toast'

export type PlatePhoto = { dataUrl: string; path: string | null }

type Row = {
  key: number
  name: string
  foodId?: string
  per100: Per100
  grams: string
  /** Peso ainda é o estimado pela foto (some ao editar). */
  estimated: boolean
  lowConfidence: boolean
}

let seq = 0

const fromPlate = (it: PlateItem): Row => ({
  key: ++seq,
  name: it.name,
  foodId: it.foodId,
  per100: it.per100,
  grams: String(it.estimatedGrams),
  estimated: true,
  lowConfidence: it.confidence === 'baixa',
})

/**
 * Revisão da foto do prato. A IA só sugere: cada peso começa no estimado (selo "estimado")
 * e nada é salvo até "Salvar refeição". Erro de IA → aviso e lista vazia para preencher à mão.
 */
export function PlateReview({ photo, onDone, onCancel }: { photo: PlatePhoto; onDone: () => void; onCancel: () => void }) {
  const [analyzing, setAnalyzing] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [type, setType] = useState<MealType>(() => mealTypeAt())
  const [picker, setPicker] = useState<{ swap: number | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState<Set<number>>(new Set())
  /** Por que a lista veio vazia (erro da IA ou nada reconhecido); fica visível enquanto não houver itens. */
  const [note, setNote] = useState<string | null>(null)

  // Uma chamada por foto, mesmo com o efeito rodando duas vezes (StrictMode no dev): cada chamada custa.
  const request = useRef<Promise<PlateItem[]> | null>(null)
  // Trava síncrona: dois toques antes do React re-renderizar com `busy` não salvam duas refeições.
  const saving = useRef(false)

  useEffect(() => {
    let live = true
    request.current ??= analyzePlateApi(photo.dataUrl)
    request.current
      .then((items) => {
        if (!live) return
        setRows(items.map(fromPlate))
        if (items.length === 0) {
          setNote('Não reconheci alimentos na foto.')
          toast('Não reconheci alimentos na foto. Adicione à mão.', 'erro')
        }
      })
      .catch((e) => {
        if (!live) return
        if (!(e instanceof AiError)) console.error(e)
        const msg = e instanceof AiError ? AI_ERROR_TEXT[e.code] : AI_ERROR_TEXT.failed
        setNote(msg)
        toast(msg, 'erro')
      })
      .finally(() => live && setAnalyzing(false))
    return () => {
      live = false
    }
  }, [photo.dataUrl])

  // "Voltar" do Android = Descartar (apaga a foto guardada); a folha de trocar item, se aberta, fecha antes.
  const cancel = useRef(onCancel)
  useEffect(() => {
    cancel.current = onCancel
  })
  useEffect(() => pushBackHandler(() => !saving.current && cancel.current()), [])

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const picked = (f: Food) => {
    const swap = picker?.swap ?? null
    if (swap !== null) {
      // Troca o alimento, mantém o peso.
      update(swap, { name: f.name, foodId: f.id, per100: per100Of(f), lowConfidence: false })
    } else {
      setRows((rs) => [...rs, { key: ++seq, name: f.name, foodId: f.id, per100: per100Of(f), grams: '', estimated: false, lowConfidence: false }])
    }
    setPicker(null)
  }

  const total = sumMacros(rows.map((r) => scaleFood(r.per100, loose(r.grams))))

  const confirm = async () => {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    const bad = new Set<number>()
    try {
      const items = []
      let firstError: ValidationError | null = null
      for (const r of rows) {
        try {
          const grams = parseNum(r.grams, { min: 0.1, max: 5000, label: `Peso de ${r.name}` })
          // Sem alimento da tabela: o item é estimativa da IA (origem 'ia'), nunca sobrescreve um alimento seu.
          items.push(r.foodId ? { foodId: r.foodId, name: r.name, grams, per100: r.per100 } : { name: r.name, grams, per100: r.per100, origin: 'ia' as const })
        } catch (e) {
          bad.add(r.key)
          if (e instanceof ValidationError) firstError ??= e
          else throw e
        }
      }
      setInvalid(bad)
      if (firstError) throw firstError
      await addMealApi({ type, source: 'ia_confirmada', items, ...(photo.path ? { photoPath: photo.path } : {}) })
      toast('Refeição registrada.')
      onDone()
    } catch (e) {
      if (e instanceof ValidationError) toast(e.message, 'erro')
      else {
        console.error(e)
        toast('Não deu para salvar a refeição.', 'erro')
      }
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <div className="anim-enter-up flex flex-col gap-3 pt-3">
      <div className="relative overflow-hidden rounded-2xl bg-[var(--track)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL local */}
        <img src={photo.dataUrl} alt="Foto do prato" className="max-h-60 w-full object-cover" />
        {analyzing && (
          <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 text-white">
            <span aria-hidden className="size-7 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
            <span className="text-[15px] font-medium">Analisando…</span>
          </div>
        )}
      </div>

      {analyzing ? (
        <button type="button" onClick={onCancel} className={`${btnGhost} w-full border border-[var(--line)]`}>
          Cancelar
        </button>
      ) : (
        <>
          <div className="px-1">
            <h2 className="text-[19px] font-semibold tracking-[-0.01em]">Confira o prato</h2>
            <p className="mt-0.5 text-[14px] leading-snug text-[var(--muted)]">
              Ajuste o peso de cada item. O peso que veio da foto fica marcado como estimado até você mudar.
            </p>
          </div>

          {rows.length === 0 && note && (
            <p role="status" className="rounded-2xl bg-[var(--track)] px-4 py-3 text-[14px] leading-snug">
              {note} <span className="text-[var(--muted)]">Adicione os itens à mão.</span>
            </p>
          )}

          {rows.map((r) => (
            <section key={r.key} className={`${card} anim-enter-up`} aria-label={r.name}>
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => setPicker({ swap: r.key })}
                  className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg text-left active:scale-[0.98]"
                  aria-label={`Trocar ${r.name}`}
                >
                  <span className="min-w-0 text-[16px] leading-snug font-medium">{r.name}</span>
                  <ArrowLeftRight aria-hidden size={15} className="shrink-0 text-[var(--muted)]" />
                </button>
                <button
                  type="button"
                  aria-label={`Tirar ${r.name}`}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className="-mt-1 -mr-2 grid size-10 shrink-0 place-items-center rounded-lg text-[var(--muted)] active:scale-[0.92]"
                >
                  <X aria-hidden size={18} />
                </button>
              </div>
              {r.lowConfidence && <p className="text-[12px] text-[var(--muted)]">A IA não tem certeza deste item. Confira ou troque.</p>}
              <div className="mt-2">
                <NumberField
                  label={
                    <span className="flex items-center gap-2">
                      Peso
                      {r.estimated && (
                        <span className="rounded-full bg-[var(--src-estimated)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--src-estimated)]">
                          estimado
                        </span>
                      )}
                    </span>
                  }
                  value={r.grams}
                  onChange={(v) => {
                    update(r.key, { grams: v, estimated: false })
                    setInvalid((s) => (s.has(r.key) ? new Set([...s].filter((k) => k !== r.key)) : s))
                  }}
                  unit="g"
                  decimals={0}
                  placeholder="ex.: 120"
                  invalid={invalid.has(r.key)}
                  autoFocus={!r.estimated && !r.grams}
                />
                <MeasurePicker
                  key={r.name}
                  foodName={r.name}
                  grams={r.grams}
                  onGrams={(g) => {
                    update(r.key, { grams: String(g), estimated: false })
                    setInvalid((s) => (s.has(r.key) ? new Set([...s].filter((k) => k !== r.key)) : s))
                  }}
                />
              </div>
              <MacroLine m={scaleFood(r.per100, loose(r.grams))} className="mt-2" />
            </section>
          ))}

          <button
            type="button"
            onClick={() => setPicker({ swap: null })}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--line)] text-[15px] font-medium text-[var(--accent-text)] active:scale-[0.98]"
          >
            <Plus aria-hidden size={18} /> Adicionar item
          </button>

          <section className={card} aria-label="Total do prato">
            <p className="text-[13px] text-[var(--muted)]">Total</p>
            <MacroLine m={total} className="mt-0.5 text-[15px]" />
            <div className="mt-4">
              <span className={fieldLabel}>Refeição</span>
              <MealTypePicker value={type} onChange={setType} />
            </div>
          </section>

          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className={btnGhost}>
              Descartar
            </button>
            <button type="button" onClick={() => void confirm()} disabled={busy || rows.length === 0} className={`${btnPrimary} flex-1`}>
              {busy ? 'Salvando…' : 'Salvar refeição'}
            </button>
          </div>
        </>
      )}

      <Sheet open={picker !== null} onOpenChange={(o) => !o && setPicker(null)} title={picker?.swap != null ? 'Trocar alimento' : 'Adicionar item'}>
        <h2 className="mb-4 text-[19px] font-semibold tracking-[-0.01em]">{picker?.swap != null ? 'Trocar alimento' : 'Adicionar item'}</h2>
        <FoodSearch onPick={picked} />
      </Sheet>
    </div>
  )
}
