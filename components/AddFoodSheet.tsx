'use client'

import { useEffect, useId, useState } from 'react'
import { ChevronLeft, Plus, Search, X } from 'lucide-react'
import { addMealApi, searchFoodsApi, type Food, type MealType, type NewItem } from '@/lib/api'
import { mealTypeAt } from '@/lib/meals'
import { scaleFood, sumMacros, type Macros, type Per100 } from '@/lib/nutrition'
import { ValidationError, parseNum } from '@/lib/validate'
import { Segmented } from './Chips'
import { MealTypePicker } from './MealTypePicker'
import { MeasurePicker } from './MeasurePicker'
import { NumberField } from './NumberField'
import { Sheet, btnGhost, btnPrimary, fieldLabel } from './Sheet'
import { toast } from './Toast'

export const textInput =
  'h-12 w-full min-w-0 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-[16px] outline-none transition-[border-color] duration-150 placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)]'

export const per100Of = (f: Food): Per100 => ({
  kcal100: f.kcal100,
  protein100: f.protein100,
  carbs100: f.carbs100,
  fat100: f.fat100,
})

const n1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
export const kcalText = (n: number) => Math.round(n).toLocaleString('pt-BR')

/** "192 kcal · P 3,8 · C 39,3 · G 0,3 g" */
export function MacroLine({ m, className = '' }: { m: Macros; className?: string }) {
  return (
    <p className={`text-[13px] tabular-nums text-[var(--muted)] ${className}`}>
      <span className="font-medium text-[var(--ink)]">{kcalText(m.kcal)} kcal</span>
      {' · '}P {n1(m.protein)} · C {n1(m.carbs)} · G {n1(m.fat)} g
    </p>
  )
}

/** Texto digitado → número para a prévia ao vivo (inválido conta como 0; a validação é no salvar). */
export const loose = (s: string) => {
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Busca de alimentos: vazio mostra os usados recentemente. */
export function FoodSearch({ onPick, onNew }: { onPick: (f: Food) => void; onNew?: (name: string) => void }) {
  const id = useId()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Food[] | null>(null)

  useEffect(() => {
    let live = true
    const t = setTimeout(
      () => {
        searchFoodsApi(q)
          .then((r) => live && setResults(r))
          .catch((e) => {
            console.error(e)
            if (live) setResults([])
          })
      },
      q ? 150 : 0,
    )
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q])

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        Buscar alimento
      </label>
      <div className="relative">
        <Search aria-hidden size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--muted)]" />
        <input
          id={id}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar (ex.: arroz cozido)"
          className={`${textInput} pl-10`}
        />
      </div>
      {!q && results && results.length > 0 && <p className="mt-3 text-[12px] font-medium text-[var(--muted)]">Recentes e sugestões</p>}
      <ul className="mt-2 flex flex-col">
        {results?.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onPick(f)}
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.98] active:bg-[var(--track)]"
            >
              <span className="min-w-0 flex-1 text-[15px] leading-snug">{f.name}</span>
              <span className="shrink-0 text-[13px] tabular-nums text-[var(--muted)]">{kcalText(f.kcal100)} kcal/100 g</span>
            </button>
          </li>
        ))}
      </ul>
      {results && results.length === 0 && q && (
        <p className="px-2 py-3 text-[14px] text-[var(--muted)]">Nada encontrado para “{q}”.</p>
      )}
      {onNew && (
        <button
          type="button"
          onClick={() => onNew(q.trim())}
          className="mt-1 flex min-h-12 w-full items-center gap-2 rounded-xl px-2 text-[15px] font-medium text-[var(--accent-text)] active:scale-[0.98]"
        >
          <Plus aria-hidden size={18} />
          {q.trim() ? `Criar “${q.trim()}”` : 'Alimento novo'}
        </button>
      )}
    </div>
  )
}

type CartItem = { key: number; name: string; grams: number; macros: Macros; item: NewItem }
type Step = { kind: 'search' } | { kind: 'grams'; food: Food } | { kind: 'new'; name: string }

let seq = 0

/**
 * Registro manual: busca → gramas (macros ao vivo) → salvar. "Mais um alimento" junta itens na mesma refeição.
 * Monte com `key` novo a cada abertura para começar limpo.
 */
export function AddFoodSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'search' })
  const [cart, setCart] = useState<CartItem[]>([])
  const [type, setType] = useState<MealType>(() => mealTypeAt())
  const [grams, setGrams] = useState('')
  const [busy, setBusy] = useState(false)
  // Alimento novo
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'per100' | 'portion'>('per100')
  const [vals, setVals] = useState({ kcal: '', protein: '', carbs: '', fat: '' })
  const [invalid, setInvalid] = useState(false)

  const pick = (food: Food) => {
    setGrams('')
    setInvalid(false)
    setStep({ kind: 'grams', food })
  }

  const startNew = (q: string) => {
    setName(q)
    setGrams('')
    setVals({ kcal: '', protein: '', carbs: '', fat: '' })
    setInvalid(false)
    setStep({ kind: 'new', name: q })
  }

  // Prévia ao vivo do item em edição.
  let preview: Macros | null = null
  if (step.kind === 'grams') preview = scaleFood(per100Of(step.food), loose(grams))
  else if (step.kind === 'new') {
    const v = { kcal: loose(vals.kcal), protein: loose(vals.protein), carbs: loose(vals.carbs), fat: loose(vals.fat) }
    preview =
      mode === 'portion'
        ? sumMacros([v])
        : scaleFood({ kcal100: v.kcal, protein100: v.protein, carbs100: v.carbs, fat100: v.fat }, loose(grams))
  }

  /** Valida o item em edição e devolve-o pronto para o carrinho (lança ValidationError). */
  const current = (): CartItem | null => {
    if (step.kind === 'search') return null
    const g = parseNum(grams, { min: 0.1, max: 5000, label: 'Quantidade (g)' })
    if (step.kind === 'grams') {
      const per100 = per100Of(step.food)
      return {
        key: ++seq,
        name: step.food.name,
        grams: g,
        macros: scaleFood(per100, g),
        item: { foodId: step.food.id, name: step.food.name, grams: g, per100 },
      }
    }
    const nm = name.trim()
    if (!nm) throw new ValidationError('Dê um nome ao alimento.')
    const max = mode === 'per100' ? { kcal: 900, g: 100 } : { kcal: 20000, g: 1000 }
    const kcal = parseNum(vals.kcal, { min: 0, max: max.kcal, label: 'Calorias' })
    const protein = parseNum(vals.protein || '0', { min: 0, max: max.g, label: 'Proteína' })
    const carbs = parseNum(vals.carbs || '0', { min: 0, max: max.g, label: 'Carboidratos' })
    const fat = parseNum(vals.fat || '0', { min: 0, max: max.g, label: 'Gordura' })
    if (mode === 'per100') {
      const per100 = { kcal100: kcal, protein100: protein, carbs100: carbs, fat100: fat }
      return { key: ++seq, name: nm, grams: g, macros: scaleFood(per100, g), item: { name: nm, grams: g, per100 } }
    }
    const macros = { kcal: Math.round(kcal), protein, carbs, fat }
    return { key: ++seq, name: nm, grams: g, macros, item: { name: nm, grams: g, macros } }
  }

  const fail = (e: unknown) => {
    setInvalid(true)
    if (e instanceof ValidationError) toast(e.message, 'erro')
    else {
      console.error(e)
      toast('Não deu para salvar a refeição.', 'erro')
    }
  }

  const addAnother = () => {
    try {
      const c = current()
      if (c) setCart((x) => [...x, c])
      setStep({ kind: 'search' })
    } catch (e) {
      fail(e)
    }
  }

  const save = async () => {
    setBusy(true)
    try {
      const c = current()
      const items = [...cart, ...(c ? [c] : [])]
      await addMealApi({ type, source: 'manual', items: items.map((i) => i.item) })
      toast('Refeição registrada.')
      onClose()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const back = () => {
    setInvalid(false)
    setStep({ kind: 'search' })
  }

  const cartList = cart.length > 0 && (
    <div className="mb-4 rounded-2xl bg-[var(--bg)] p-3">
      <p className="mb-1 text-[12px] font-medium text-[var(--muted)]">Nesta refeição</p>
      <ul className="flex flex-col">
        {cart.map((c) => (
          <li key={c.key} className="flex items-center gap-2 text-[14px]">
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            <span className="shrink-0 tabular-nums text-[var(--muted)]">
              {n1(c.grams)} g · {kcalText(c.macros.kcal)} kcal
            </span>
            <button
              type="button"
              aria-label={`Tirar ${c.name}`}
              onClick={() => setCart((x) => x.filter((y) => y.key !== c.key))}
              className="-mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-[var(--muted)] active:scale-[0.92]"
            >
              <X aria-hidden size={16} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  const footer = (
    <>
      <div className="mt-5">
        <span className={fieldLabel}>Refeição</span>
        <MealTypePicker value={type} onChange={setType} />
      </div>
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={addAnother} className={`${btnGhost} border border-[var(--line)]`}>
          Mais um
        </button>
        <button type="button" onClick={() => void save()} disabled={busy || !grams.trim()} className={`${btnPrimary} flex-1`}>
          {busy ? 'Salvando…' : 'Salvar refeição'}
        </button>
      </div>
    </>
  )

  const header = (title: string) => (
    <div className="mb-4 flex items-center gap-1">
      <button
        type="button"
        onClick={back}
        aria-label="Voltar para a busca"
        className="-ml-2 grid size-10 shrink-0 place-items-center rounded-xl text-[var(--muted)] active:scale-[0.92]"
      >
        <ChevronLeft aria-hidden size={22} />
      </button>
      <h2 className="min-w-0 flex-1 text-[19px] leading-tight font-semibold tracking-[-0.01em]">{title}</h2>
    </div>
  )

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Adicionar alimento">
      {step.kind === 'search' && (
        <div key="search" className="anim-enter-side">
          <h2 className="mb-4 text-[19px] font-semibold tracking-[-0.01em]">Adicionar alimento</h2>
          {cartList}
          {cart.length > 0 && (
            <div className="mb-5">
              <span className={fieldLabel}>Refeição</span>
              <MealTypePicker value={type} onChange={setType} />
              <button type="button" onClick={() => void save()} disabled={busy} className={`${btnPrimary} mt-3 w-full`}>
                {busy ? 'Salvando…' : `Salvar refeição (${cart.length} ${cart.length === 1 ? 'item' : 'itens'})`}
              </button>
            </div>
          )}
          <FoodSearch onPick={pick} onNew={startNew} />
        </div>
      )}

      {step.kind === 'grams' && (
        <div key="grams" className="anim-enter-side">
          {header(step.food.name)}
          {cartList}
          <NumberField
            label="Quantidade"
            value={grams}
            onChange={(v) => {
              setGrams(v)
              setInvalid(false)
            }}
            unit="g"
            decimals={0}
            placeholder="ex.: 150"
            invalid={invalid}
            autoFocus
          />
          <MeasurePicker
            foodName={step.food.name}
            grams={grams}
            onGrams={(g) => {
              setGrams(String(g))
              setInvalid(false)
            }}
          />
          {preview && <MacroLine m={preview} className="mt-2" />}
          {footer}
        </div>
      )}

      {step.kind === 'new' && (
        <div key="new" className="anim-enter-side">
          {header('Alimento novo')}
          {cartList}
          <label htmlFor="new-food-name" className={fieldLabel}>
            Nome
          </label>
          <input
            id="new-food-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="ex.: Bolo de cenoura"
            autoFocus={!name}
            className={textInput}
          />
          <div className="mt-4">
            <Segmented
              label="Como informar"
              options={[
                { id: 'per100', label: 'Por 100 g' },
                { id: 'portion', label: 'Na porção' },
              ]}
              value={mode}
              onChange={setMode}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <NumberField label="Calorias" value={vals.kcal} onChange={(v) => setVals((x) => ({ ...x, kcal: v }))} unit="kcal" decimals={0} />
            <NumberField label="Proteína" value={vals.protein} onChange={(v) => setVals((x) => ({ ...x, protein: v }))} unit="g" />
            <NumberField label="Carboidrato" value={vals.carbs} onChange={(v) => setVals((x) => ({ ...x, carbs: v }))} unit="g" />
            <NumberField label="Gordura" value={vals.fat} onChange={(v) => setVals((x) => ({ ...x, fat: v }))} unit="g" />
          </div>
          <div className="mt-4">
            <NumberField
              label="Quanto você comeu"
              value={grams}
              onChange={(v) => {
                setGrams(v)
                setInvalid(false)
              }}
              unit="g"
              decimals={0}
              placeholder="ex.: 80"
              invalid={invalid}
              autoFocus={!!name}
            />
            <MeasurePicker
              foodName={name}
              grams={grams}
              onGrams={(g) => {
                setGrams(String(g))
                setInvalid(false)
              }}
            />
          </div>
          {preview && <MacroLine m={preview} className="mt-2" />}
          {footer}
        </div>
      )}
    </Sheet>
  )
}
