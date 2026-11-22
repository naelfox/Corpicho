'use client'

import { useCallback, useEffect, useState } from 'react'
import { Camera, Plus } from 'lucide-react'
import { loadBody, subscribe, type BodyData, type Region } from '@/lib/api'
import { BodySilhouette } from './BodySilhouette'
import { Segmented } from './Chips'
import { CompositionCard } from './CompositionCard'
import { EvolutionView } from './EvolutionView'
import { MeasureSheet } from './MeasureSheet'
import { btnPrimary } from './Sheet'
import { WeightSheet } from './WeightSheet'
import { dateOnly, num1 } from './format'

const card = 'rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)]'

type View = 'medidas' | 'composicao' | 'evolucao' | 'fotos'
const VIEWS: { id: View; label: string }[] = [
  { id: 'medidas', label: 'Medidas' },
  { id: 'composicao', label: 'Composição' },
  { id: 'evolucao', label: 'Evolução' },
  { id: 'fotos', label: 'Fotos' },
]

function Measures({ data }: { data: BodyData }) {
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [region, setRegion] = useState<Region | null>(null)
  const [weightOpen, setWeightOpen] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <section className={`${card} flex items-center gap-3`} aria-label="Peso">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-[var(--muted)]">Peso</p>
          <p className="text-[22px] leading-tight font-semibold tabular-nums tracking-[-0.02em]">
            {data.weight ? num1(data.weight.kg) : '—'}
            <span className="ml-1 text-[15px] font-normal text-[var(--muted)]">kg</span>
          </p>
          {data.weight && <p className="text-[12px] text-[var(--muted)]">em {dateOnly(data.weight.at)}</p>}
        </div>
        <button type="button" onClick={() => setWeightOpen(true)} className={`${btnPrimary} flex items-center gap-1.5 px-4`}>
          <Plus aria-hidden size={18} /> Peso
        </button>
      </section>

      <section className={card} aria-label="Medidas do corpo">
        <Segmented
          label="Lado do corpo"
          options={[
            { id: 'front', label: 'Frente' },
            { id: 'back', label: 'Costas' },
          ]}
          value={side}
          onChange={setSide}
        />
        <div className="mt-4">
          <BodySilhouette side={side} values={data.latest} onSelect={setRegion} active={region} />
        </div>
        <p className="mt-3 text-center text-[13px] text-[var(--muted)]">Toque numa região para registrar a medida (cm).</p>
      </section>

      <MeasureSheet region={region} latest={data.latest} onClose={() => setRegion(null)} />
      <WeightSheet open={weightOpen} onClose={() => setWeightOpen(false)} />
    </div>
  )
}

/** Aba Corpo: medidas na silhueta, composição corporal, evolução e (em breve) fotos. */
export function BodyView() {
  const [view, setView] = useState<View>('medidas')
  const [data, setData] = useState<BodyData | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await loadBody())
      setError(false)
    } catch (e) {
      console.error(e)
      setError(true)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial do banco local
    void load()
    return subscribe(load)
  }, [load])

  return (
    <div className="anim-enter-up flex flex-col gap-3 pt-3">
      <Segmented label="Seção" compact options={VIEWS} value={view} onChange={setView} />

      {view === 'evolucao' ? (
        <EvolutionView />
      ) : view === 'fotos' ? (
        <section className={`${card} flex flex-col items-center gap-3 py-10 text-center`}>
          <span className="grid size-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Camera aria-hidden size={26} strokeWidth={1.75} />
          </span>
          <p className="text-[17px] font-semibold">Em breve</p>
          <p className="max-w-xs text-[14px] leading-snug text-[var(--muted)]">
            Fotos de frente, lado e costas, guardadas só no aparelho, para comparar datas.
          </p>
        </section>
      ) : !data ? (
        error ? (
          <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-3 text-center">
            <p className="text-[15px] text-[var(--muted)]">Não deu para carregar suas medidas.</p>
            <button type="button" onClick={() => void load()} className={btnPrimary}>
              Tentar de novo
            </button>
          </div>
        ) : (
          <div role="status" className="grid min-h-[40dvh] place-items-center">
            <span aria-hidden className="size-6 animate-spin rounded-full border-[3px] border-[var(--accent-soft)] border-t-[var(--accent)]" />
            <span className="sr-only">Carregando…</span>
          </div>
        )
      ) : view === 'medidas' ? (
        <Measures data={data} />
      ) : (
        <CompositionCard entries={data.composition} records={data.records} />
      )}
    </div>
  )
}
