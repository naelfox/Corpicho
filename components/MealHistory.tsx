'use client'

import { useCallback, useEffect, useState } from 'react'
import { Camera, ChevronDown, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import {
  HISTORY_PAGE, deleteMealApi, deleteMealItemApi, loadHistory, loadPhoto, repeatMealApi, setMealTypeApi, subscribe,
  type MealType, type MealWithItems,
} from '@/lib/api'
import { TZ, addDays, todayIn, type Day } from '@/lib/dates'
import { MEAL_LABEL, mealTypeAt } from '@/lib/meals'
import { sumMacros } from '@/lib/nutrition'
import { ValidationError } from '@/lib/validate'
import { ConfirmRow } from './ConfirmRow'
import { kcalText } from './AddFoodSheet'
import { MealTypePicker } from './MealTypePicker'
import { Sheet, btnGhost, btnPrimary, fieldLabel } from './Sheet'
import { toast } from './Toast'

export const card = 'rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)]'

const dateFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const dateFmtYear = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })

/** "Hoje", "Ontem", "sex., 20 de nov." (com ano se não for o atual). */
export function dayLabel(day: Day, today: Day = todayIn()): string {
  if (day === today) return 'Hoje'
  if (day === addDays(today, -1)) return 'Ontem'
  const d = new Date(`${day}T12:00:00Z`)
  return (day.slice(0, 4) === today.slice(0, 4) ? dateFmt : dateFmtYear).format(d)
}

const g1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

/** Miniatura da foto guardada da refeição (some se não der para ler). */
function MealPhoto({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    loadPhoto(path)
      .then((s) => live && setSrc(s))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [path])
  if (!src) return null
  // eslint-disable-next-line @next/next/no-img-element -- data URL local
  return <img src={src} alt="Foto do prato" className="mb-3 h-28 w-full rounded-xl object-cover" />
}

/**
 * Uma refeição: fechada mostra tipo, hora, total e os nomes dos itens; aberta, as macros (barra) da refeição e
 * de cada item e as ações: repetir, editar e apagar (com confirmação no app).
 * `itemDelete` liga o "x" em cada item (apagar o último item apaga a refeição).
 */
export function MealCard({
  meal,
  onRepeat,
  onEdit,
  itemDelete = false,
}: {
  meal: MealWithItems
  onRepeat: (m: MealWithItems) => void
  onEdit: (m: MealWithItems) => void
  itemDelete?: boolean
}) {
  const [confirm, setConfirm] = useState<'meal' | string | null>(null)
  const [open, setOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)

  const changeType = async (t: MealType) => {
    setTypeOpen(false)
    if (t === meal.type) return
    try {
      await setMealTypeApi(meal.id, t)
      toast(`Agora é ${MEAL_LABEL[t]}.`)
    } catch (e) {
      console.error(e)
      toast('Não deu para trocar o tipo.', 'erro')
    }
  }

  const removeMeal = async () => {
    setConfirm(null)
    try {
      await deleteMealApi(meal.id, meal.photoPath)
      toast('Refeição apagada.')
    } catch (e) {
      console.error(e)
      toast('Não deu para apagar.', 'erro')
    }
  }

  const removeItem = async (id: string) => {
    setConfirm(null)
    try {
      if (meal.items.length <= 1) await deleteMealApi(meal.id, meal.photoPath)
      else await deleteMealItemApi(id)
      toast('Item apagado.')
    } catch (e) {
      console.error(e)
      toast('Não deu para apagar.', 'erro')
    }
  }

  const detailsId = `meal-${meal.id}`

  return (
    <article className={card} aria-label={MEAL_LABEL[meal.type]}>
      {/* Fechado: o essencial (o quê e quanto). O título troca o tipo na hora; o resto abre o detalhe. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={typeOpen}
          aria-label={`${MEAL_LABEL[meal.type]}: trocar o tipo da refeição`}
          onClick={() => setTypeOpen((o) => !o)}
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[16px] font-semibold transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.96] ${
            typeOpen ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--accent-soft)] text-[var(--ink)]'
          }`}
        >
          {MEAL_LABEL[meal.type]}
          <ChevronDown aria-hidden size={15} className={`opacity-60 transition-transform duration-200 motion-reduce:transition-none ${typeOpen ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          aria-label={`${open ? 'Fechar' : 'Ver'} detalhes: ${kcalText(meal.totals.kcal)} kcal`}
          onClick={() => setOpen((o) => !o)}
          className="flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg text-left active:opacity-70"
        >
          <span className="flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
            {timeFmt.format(new Date(meal.createdAt))}
            {meal.photoPath && <Camera aria-label="registrada pela foto" size={14} />}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[15px] font-semibold tabular-nums">
            {kcalText(meal.totals.kcal)} kcal
            <ChevronDown
              aria-hidden
              size={18}
              className={`text-[var(--muted)] transition-transform duration-200 ease-[var(--ease-out)] motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
            />
          </span>
        </button>
        <button
          type="button"
          onClick={() => onEdit(meal)}
          aria-label={`Editar ${MEAL_LABEL[meal.type]}`}
          className="-mr-1.5 grid size-10 shrink-0 place-items-center rounded-full text-[var(--accent-text)] transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.92] active:bg-[var(--accent-soft)]"
        >
          <Pencil aria-hidden size={18} />
        </button>
      </div>

      {typeOpen && (
        <div className="anim-enter-up mt-3 rounded-xl bg-[var(--bg)] p-3">
          <p className="mb-2 text-[13px] font-medium text-[var(--muted)]">Qual refeição foi esta?</p>
          <MealTypePicker value={meal.type} onChange={(t) => void changeType(t)} />
        </div>
      )}

      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={() => setOpen((o) => !o)}
        className="mt-1.5 line-clamp-2 w-full text-left text-[14px] leading-snug text-[var(--muted)]"
      >
        {meal.items.map((it) => it.name).join(' · ')}
      </button>

      <div
        id={detailsId}
        className={`grid transition-[grid-template-rows,opacity] duration-250 ease-[var(--ease-out)] motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        inert={!open}
      >
        <div className="overflow-hidden">
          <div className="pt-4">
            {meal.photoPath && open && <MealPhoto path={meal.photoPath} />}
            <MacroSplit m={meal.totals} legend />
            <ul className="mt-4 flex flex-col gap-3">
              {meal.items.map((it) =>
                confirm === it.id ? (
                  <li key={it.id}>
                    <ConfirmRow text={`Apagar ${it.name}?`} onCancel={() => setConfirm(null)} onConfirm={() => void removeItem(it.id)} />
                  </li>
                ) : (
                  <li key={it.id} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2 text-[14px]">
                        <span className="min-w-0 leading-snug">{it.name}</span>
                        <span className="shrink-0 tabular-nums text-[var(--muted)]">
                          {g1(it.grams)} g · <span className="font-medium text-[var(--ink)]">{kcalText(it.kcal)} kcal</span>
                        </span>
                      </div>
                      <MacroSplit m={it} className="mt-1.5" />
                    </div>
                    {itemDelete && (
                      <button
                        type="button"
                        aria-label={`Apagar ${it.name}`}
                        onClick={() => setConfirm(it.id)}
                        className="-mt-2 -mr-2 grid size-10 shrink-0 place-items-center rounded-lg text-[var(--muted)] active:scale-[0.92]"
                      >
                        <X aria-hidden size={16} />
                      </button>
                    )}
                  </li>
                ),
              )}
            </ul>
            {confirm === 'meal' ? (
              <div className="mt-3">
                <ConfirmRow text="Apagar esta refeição?" onCancel={() => setConfirm(null)} onConfirm={() => void removeMeal()} />
              </div>
            ) : (
              <div className="mt-3 -mb-1 flex gap-1 border-t border-[var(--line)] pt-2">
                <button
                  type="button"
                  onClick={() => onRepeat(meal)}
                  className="flex h-10 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-[var(--accent-text)] active:scale-[0.96]"
                >
                  <RotateCcw aria-hidden size={16} /> Repetir
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(meal)}
                  className="flex h-10 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-[var(--accent-text)] active:scale-[0.96]"
                >
                  <Pencil aria-hidden size={16} /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm('meal')}
                  className="ml-auto flex h-10 items-center gap-1.5 rounded-lg px-2 text-[14px] text-[var(--muted)] active:scale-[0.96]"
                >
                  <Trash2 aria-hidden size={16} /> Apagar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

const MACROS = [
  { key: 'protein', label: 'Proteína', short: 'P', color: 'var(--protein)', kcalPerG: 4 },
  { key: 'carbs', label: 'Carboidrato', short: 'C', color: 'var(--carbs)', kcalPerG: 4 },
  { key: 'fat', label: 'Gordura', short: 'G', color: 'var(--fat)', kcalPerG: 9 },
] as const

/**
 * De onde vêm as calorias: uma barra dividida pela parte de cada macro (proteína e carboidrato 4 kcal/g,
 * gordura 9 kcal/g) e os gramas embaixo. `legend` mostra os nomes completos (uso no total da refeição).
 */
function MacroSplit({ m, legend = false, className = '' }: { m: { protein: number; carbs: number; fat: number }; legend?: boolean; className?: string }) {
  const parts = MACROS.map((x) => ({ ...x, g: m[x.key], kcal: m[x.key] * x.kcalPerG }))
  const total = parts.reduce((a, p) => a + p.kcal, 0)
  return (
    <div className={className}>
      <div
        role="img"
        aria-label={parts.map((p) => `${p.label} ${g1(p.g)} g`).join(', ')}
        className={`flex gap-0.5 overflow-hidden rounded-full bg-[var(--track)] ${legend ? 'h-2.5' : 'h-1.5'}`}
      >
        {total > 0 &&
          parts.map((p) =>
            p.kcal > 0 ? <div key={p.key} className="h-full" style={{ width: `${(p.kcal / total) * 100}%`, background: p.color }} /> : null,
          )}
      </div>
      <p aria-hidden className={`mt-1.5 flex gap-3 tabular-nums text-[var(--muted)] ${legend ? 'text-[13px]' : 'text-[12px]'}`}>
        {parts.map((p) => (
          <span key={p.key} className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {legend ? p.label : p.short} <span className="font-medium text-[var(--ink)]">{g1(p.g)} g</span>
          </span>
        ))}
      </p>
    </div>
  )
}

/**
 * Escolhe a refeição de destino e copia os itens para hoje.
 * Padrão: pela hora; com `keepType` (atalho "repetir de ontem"), o mesmo tipo da refeição copiada.
 */
export function RepeatSheet({ meal, onClose, keepType = false }: { meal: MealWithItems | null; onClose: () => void; keepType?: boolean }) {
  const [shown, setShown] = useState<MealWithItems | null>(meal)
  const [type, setType] = useState<MealType>(() => (keepType && meal ? meal.type : mealTypeAt()))
  const [busy, setBusy] = useState(false)

  // Guarda a última refeição para o conteúdo não sumir durante a animação de fechar.
  if (meal && meal !== shown) {
    setShown(meal)
    setType(keepType ? meal.type : mealTypeAt())
  }

  const repeat = async () => {
    if (!shown) return
    setBusy(true)
    try {
      await repeatMealApi(shown.id, type)
      toast(`Adicionado em ${MEAL_LABEL[type]} de hoje.`)
      onClose()
    } catch (e) {
      console.error(e)
      toast(e instanceof ValidationError ? e.message : 'Não deu para repetir.', 'erro')
    } finally {
      setBusy(false)
    }
  }

  const n = shown?.items.length ?? 0
  return (
    <Sheet open={meal !== null} onOpenChange={(o) => !o && onClose()} title="Repetir refeição">
      <h2 className="text-[19px] font-semibold tracking-[-0.01em]">Repetir refeição</h2>
      {shown && (
        <p className="mt-1 text-[14px] text-[var(--muted)]">
          Copia {n} {n === 1 ? 'item' : 'itens'} ({kcalText(shown.totals.kcal)} kcal) para hoje.
        </p>
      )}
      <div className="mt-4">
        <span className={fieldLabel}>Refeição</span>
        <MealTypePicker value={type} onChange={setType} />
      </div>
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className={btnGhost}>
          Cancelar
        </button>
        <button type="button" onClick={() => void repeat()} disabled={busy} className={`${btnPrimary} flex-1`}>
          {busy ? 'Repetindo…' : 'Repetir'}
        </button>
      </div>
    </Sheet>
  )
}

type HistoryDay = { day: Day; meals: MealWithItems[] }

/** Histórico por dia, do mais recente para o mais antigo, em páginas. */
export function MealHistory({ onRepeat, onEdit }: { onRepeat: (m: MealWithItems) => void; onEdit: (m: MealWithItems) => void }) {
  const [days, setDays] = useState<HistoryDay[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [count, setCount] = useState(HISTORY_PAGE)

  // Recarrega tudo o que já estava aberto (após apagar/repetir).
  const load = useCallback(async () => {
    try {
      const r = await loadHistory(undefined, count)
      setDays(r)
      setHasMore(r.length === count)
    } catch (e) {
      console.error(e)
      toast('Não deu para carregar o histórico.', 'erro')
      setDays((d) => d ?? [])
    } finally {
      setLoadingMore(false)
    }
  }, [count])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga do banco local
    void load()
    return subscribe(load)
  }, [load])

  const more = () => {
    setLoadingMore(true)
    setCount((c) => c + HISTORY_PAGE)
  }

  if (!days) {
    return (
      <div role="status" className="grid min-h-[40dvh] place-items-center">
        <span aria-hidden className="size-6 animate-spin rounded-full border-[3px] border-[var(--accent-soft)] border-t-[var(--accent)]" />
        <span className="sr-only">Carregando…</span>
      </div>
    )
  }

  if (days.length === 0) {
    return <p className="py-16 text-center text-[15px] text-[var(--muted)]">Nenhuma refeição registrada ainda.</p>
  }

  const today = todayIn()
  return (
    <div className="flex flex-col gap-5">
      {days.map(({ day, meals }) => (
        <section key={day} aria-label={dayLabel(day, today)}>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="text-[15px] font-semibold">{dayLabel(day, today)}</h2>
            <span className="text-[13px] tabular-nums text-[var(--muted)]">
              {kcalText(sumMacros(meals.map((m) => m.totals)).kcal)} kcal
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {meals.map((m) => (
              <MealCard key={m.id} meal={m} onRepeat={onRepeat} onEdit={onEdit} />
            ))}
          </div>
        </section>
      ))}
      {hasMore && (
        <button type="button" onClick={more} disabled={loadingMore} className={`${btnGhost} w-full border border-[var(--line)]`}>
          {loadingMore ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}
    </div>
  )
}
