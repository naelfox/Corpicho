'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  discardPlatePhoto, hasNativeCamera, loadDay, subscribe, takeAndStorePlatePhoto, type MealWithItems,
} from '@/lib/api'
import { addDays, todayIn, type Day } from '@/lib/dates'
import type { Macros } from '@/lib/nutrition'
import { AddFoodSheet, kcalText } from './AddFoodSheet'
import { Segmented } from './Chips'
import { MacroBars } from './MacroBars'
import { MealCard, MealHistory, RepeatSheet, card, dayLabel } from './MealHistory'
import { PlateReview, type PlatePhoto } from './PlateReview'
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

/** Aba Comer: o dia (com setas), totais x meta, refeições; foto do prato, registro manual e histórico. */
export function FoodView() {
  const [view, setView] = useState<'dia' | 'historico'>('dia')
  const [day, setDay] = useState<Day>(() => todayIn())
  const [data, setData] = useState<DayData | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addKey, setAddKey] = useState(0)
  const [repeat, setRepeat] = useState<MealWithItems | null>(null)
  const [photo, setPhoto] = useState<PlatePhoto | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [native, setNative] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const today = todayIn()
  const isToday = day === today

  const load = useCallback(async () => {
    try {
      setData(await loadDay(day))
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

  const openAdd = () => {
    setAddKey((k) => k + 1)
    setAddOpen(true)
  }

  const startReview = (p: { dataUrl: string; path: string | null } | null) => {
    if (!p) return
    setPhoto(p)
    window.scrollTo(0, 0)
  }

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
    if (!saved && photo?.path) void discardPlatePhoto(photo.path)
    setPhoto(null)
    setDay(todayIn())
    setView('dia')
    window.scrollTo(0, 0)
  }

  if (photo) {
    return <PlateReview photo={photo} onDone={() => closeReview(true)} onCancel={() => closeReview(false)} />
  }

  // Já vem na ordem café → outras (lib/meals).
  const meals = data?.meals ?? []

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
        <MealHistory onRepeat={setRepeat} />
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
                className={`${btnPrimary} flex items-center justify-center gap-2`}
              >
                <Camera aria-hidden size={19} />
                {capturing ? 'Abrindo…' : 'Foto do prato'}
              </button>
              <button
                type="button"
                onClick={openAdd}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--card)] px-4 text-[15px] font-medium shadow-[var(--shadow-card)] transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
              >
                <Plus aria-hidden size={19} />
                Adicionar
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
            <MealCard key={m.id} meal={m} onRepeat={setRepeat} itemDelete />
          ))}
        </>
      )}

      <AddFoodSheet key={addKey} open={addOpen} onClose={() => setAddOpen(false)} />
      <RepeatSheet meal={repeat} onClose={() => setRepeat(null)} />
    </div>
  )
}
