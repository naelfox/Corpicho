'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera, ChevronLeft, ChevronRight, MessageSquareText, Plus, RotateCcw } from 'lucide-react'
import {
  discardPlatePhoto, hasNativeCamera, loadDay, subscribe, takeAndStorePlatePhoto, type MealWithItems,
} from '@/lib/api'
import { addDays, todayIn, type Day } from '@/lib/dates'
import type { Macros } from '@/lib/nutrition'
import { AddFoodSheet, kcalText } from './AddFoodSheet'
import { Segmented } from './Chips'
import { MacroBars } from './MacroBars'
import { MEAL_SHORT } from './MealTypePicker'
import { MealCard, MealHistory, RepeatSheet, card, dayLabel } from './MealHistory'
import { DescribeMealSheet } from './DescribeMealSheet'
import { MealReview, type ReviewInput } from './MealReview'
import { btnPrimary } from './Sheet'
import { toast } from './Toast'

type DayData = { meals: MealWithItems[]; totals: Macros; targets: Macros | null }

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}

/** Aba Comer: o dia (com setas), totais x meta, refeições; foto do prato, descrição (texto/voz), registro manual, edição e histórico. */
export function FoodView() {
  const [view, setView] = useState<'dia' | 'historico'>('dia')
  const [day, setDay] = useState<Day>(() => todayIn())
  const [data, setData] = useState<DayData | null>(null)
  const [yesterday, setYesterday] = useState<MealWithItems[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [addKey, setAddKey] = useState(0)
  const [repeat, setRepeat] = useState<MealWithItems | null>(null)
  const [repeatKeepType, setRepeatKeepType] = useState(false)
  const [review, setReview] = useState<ReviewInput | null>(null)
  const [reviewKey, setReviewKey] = useState(0)
  const [describeOpen, setDescribeOpen] = useState(false)
  const [describeKey, setDescribeKey] = useState(0)
  const [capturing, setCapturing] = useState(false)
  const [native, setNative] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const today = todayIn()
  const isToday = day === today

  const load = useCallback(async () => {
    try {
      const isToday = day === todayIn()
      const [d, y] = await Promise.all([loadDay(day), isToday ? loadDay(addDays(day, -1)) : null])
      setData(d)
      setYesterday(y?.meals ?? [])
    } catch (e) {
      console.error(e)
      toast('Não deu para carregar as refeições.', 'erro')
    }
  }, [day])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga do banco local
    void load()
    return subscribe(load)
  }, [load])

  useEffect(() => {
    hasNativeCamera()
      .then(setNative)
      .catch(() => setNative(false))
  }, [])

  const openRepeat = (m: MealWithItems, keepType = false) => {
    setRepeatKeepType(keepType)
    setRepeat(m)
  }

  const openAdd = () => {
    setAddKey((k) => k + 1)
    setAddOpen(true)
  }

  const openReview = (r: ReviewInput) => {
    setReviewKey((k) => k + 1)
    setReview(r)
    window.scrollTo(0, 0)
  }

  const startReview = (p: { dataUrl: string; path: string | null } | null) => {
    if (p) openReview({ kind: 'photo', photo: p })
  }

  const openDescribe = () => {
    setDescribeKey((k) => k + 1)
    setDescribeOpen(true)
  }

  const describe = (text: string) => {
    setDescribeOpen(false)
    openReview({ kind: 'text', text })
  }

  const editMeal = (meal: MealWithItems) => openReview({ kind: 'edit', meal })

  const takePhoto = async () => {
    // No navegador (dev) não há câmera do Capacitor: usa o seletor de arquivo (precisa do toque direto).
    if (!native) {
      fileRef.current?.click()
      return
    }
    setCapturing(true)
    try {
      startReview(await takeAndStorePlatePhoto())
    } catch (e) {
      console.error(e)
      toast('Não deu para abrir a câmera.', 'erro')
    } finally {
      setCapturing(false)
    }
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCapturing(true)
    try {
      startReview(await takeAndStorePlatePhoto(await readFile(file)))
    } catch (err) {
      console.error(err)
      toast('Não deu para ler a foto.', 'erro')
    } finally {
      setCapturing(false)
    }
  }

  const closeReview = (saved: boolean) => {
    if (!saved && review?.kind === 'photo' && review.photo.path) void discardPlatePhoto(review.photo.path)
    // Edição volta para onde estava (dia ou histórico); registro novo vai para hoje.
    if (review?.kind !== 'edit') {
      setDay(todayIn())
      setView('dia')
    }
    setReview(null)
    window.scrollTo(0, 0)
  }

  if (review) {
    return <MealReview key={reviewKey} input={review} onDone={() => closeReview(true)} onCancel={() => closeReview(false)} />
  }

  // Já vem na ordem café → outras (lib/meals).
  const meals = data?.meals ?? []
  // Atalho: refeições de ontem de um tipo que ainda não tem hoje (um toque → folha de repetir).
  const repeatable = isToday && data ? yesterday.filter((y) => !meals.some((m) => m.type === y.type)) : []

  return (
    <div className="anim-enter-up flex flex-col gap-3 pt-3">
      <Segmented
        label="Ver"
        options={[
          { id: 'dia', label: 'Dia' },
          { id: 'historico', label: 'Histórico' },
        ]}
        value={view}
        onChange={setView}
      />

      {view === 'historico' ? (
        <MealHistory onRepeat={openRepeat} onEdit={editMeal} />
      ) : (
        <>
          <nav aria-label="Dia" className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setDay((d) => addDays(d, -1))}
              aria-label="Dia anterior"
              className="grid size-11 place-items-center rounded-xl text-[var(--muted)] active:scale-[0.92] [@media(hover:hover)]:hover:bg-[var(--track)]"
            >
              <ChevronLeft aria-hidden size={22} />
            </button>
            <button
              type="button"
              onClick={() => setDay(today)}
              disabled={isToday}
              className="h-11 rounded-xl px-3 text-[16px] font-semibold disabled:opacity-100"
            >
              {dayLabel(day, today)}
            </button>
            <button
              type="button"
              onClick={() => setDay((d) => (d < today ? addDays(d, 1) : d))}
              disabled={isToday}
              aria-label="Próximo dia"
              className="grid size-11 place-items-center rounded-xl text-[var(--muted)] active:scale-[0.92] disabled:opacity-30 [@media(hover:hover)]:hover:bg-[var(--track)]"
            >
              <ChevronRight aria-hidden size={22} />
            </button>
          </nav>

          {repeatable.length > 0 && (
            <section aria-label="Repetir refeição de ontem" className="anim-enter-up">
              <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-[var(--muted)]">
                <RotateCcw aria-hidden size={14} /> Repetir de ontem
              </p>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {repeatable.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => openRepeat(m, true)}
                    aria-label={`Repetir ${MEAL_SHORT[m.type]} de ontem, ${kcalText(m.totals.kcal)} kcal`}
                    className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--card)] px-4 text-[15px] font-medium transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.96]"
                  >
                    {MEAL_SHORT[m.type]}
                    <span className="font-normal tabular-nums text-[var(--muted)]">{kcalText(m.totals.kcal)} kcal</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {data && (
            <section className={card} aria-label="Totais do dia">
              <div className="mb-3 flex items-baseline justify-between">
                <p className="text-[26px] leading-tight font-semibold tabular-nums tracking-[-0.02em]">
                  {kcalText(data.totals.kcal)}
                  {data.targets && (
                    <span className="ml-1 text-[15px] font-normal text-[var(--muted)]">/ {kcalText(data.targets.kcal)} kcal</span>
                  )}
                </p>
                {data.targets && (
                  <p className="text-[13px] tabular-nums text-[var(--muted)]">
                    {data.totals.kcal <= data.targets.kcal
                      ? `faltam ${kcalText(data.targets.kcal - data.totals.kcal)}`
                      : `passou ${kcalText(data.totals.kcal - data.targets.kcal)}`}
                  </p>
                )}
              </div>
              {data.targets && <MacroBars consumed={data.totals} target={data.targets} />}
            </section>
          )}

          {isToday && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void takePhoto()}
                disabled={capturing}
                className={`${btnPrimary} flex items-center justify-center gap-2 px-3! whitespace-nowrap`}
              >
                <Camera aria-hidden size={19} />
                {capturing ? 'Abrindo…' : 'Foto do prato'}
              </button>
              <button
                type="button"
                onClick={openAdd}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--card)] px-3 whitespace-nowrap text-[15px] font-medium shadow-[var(--shadow-card)] transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
              >
                <Plus aria-hidden size={19} />
                Adicionar
              </button>
              <button
                type="button"
                onClick={openDescribe}
                className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--card)] px-3 whitespace-nowrap text-[15px] font-medium shadow-[var(--shadow-card)] transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
              >
                <MessageSquareText aria-hidden size={19} />
                Descrever o que comi
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e)} />
            </div>
          )}

          {data && meals.length === 0 && (
            <p className="py-10 text-center text-[15px] text-[var(--muted)]">
              {isToday ? 'Nada registrado hoje ainda.' : 'Nada registrado neste dia.'}
            </p>
          )}
          {meals.map((m) => (
            <MealCard key={m.id} meal={m} onRepeat={openRepeat} onEdit={editMeal} itemDelete />
          ))}
        </>
      )}

      <AddFoodSheet key={addKey} open={addOpen} onClose={() => setAddOpen(false)} />
      <DescribeMealSheet key={describeKey} open={describeOpen} onClose={() => setDescribeOpen(false)} onAnalyze={describe} />
      <RepeatSheet meal={repeat} keepType={repeatKeepType} onClose={() => setRepeat(null)} />
    </div>
  )
}
