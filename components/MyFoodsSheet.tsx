'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera, ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { AI_ERROR_TEXT, AiError } from '@/lib/ai/client'
import { deleteMyFoodApi, hasNativeCamera, loadMyFoods, readLabelApi, saveMyFoodApi, type Food, type LabelRead } from '@/lib/api'
import { ValidationError, parseNum } from '@/lib/validate'
import { kcalText, textInput } from './AddFoodSheet'
import { ConfirmRow } from './ConfirmRow'
import { NumberField } from './NumberField'
import { Sheet, btnGhost, btnPrimary, fieldLabel } from './Sheet'
import { toast } from './Toast'

type Form = { id?: string; name: string; kcal: string; protein: string; carbs: string; fat: string; portionLabel: string; portionG: string }

const str = (n: number) => String(n).replace('.', ',')
const EMPTY: Form = { name: '', kcal: '', protein: '', carbs: '', fat: '', portionLabel: '', portionG: '' }
const formOf = (f: Food | LabelRead & { id?: string }): Form => {
  const p = 'per100' in f ? f.per100 : f
  return {
    id: f.id,
    name: f.name,
    kcal: str(p.kcal100),
    protein: str(p.protein100),
    carbs: str(p.carbs100),
    fat: str(p.fat100),
    portionLabel: f.portion?.label ?? '',
    portionG: f.portion ? str(f.portion.grams) : '',
  }
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}

/**
 * Meus alimentos: cadastro pela foto do rótulo (a IA lê, você confere) ou à mão, com a porção
 * ("1 xícara" = 50 g). Eles aparecem primeiro na busca do Adicionar, com a porção como medida.
 * Monte com `key` novo a cada abertura.
 */
export function MyFoodsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [foods, setFoods] = useState<Food[] | null>(null)
  const [form, setForm] = useState<{ v: Form; fromLabel: boolean } | null>(null)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [native, setNative] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () =>
    loadMyFoods()
      .then(setFoods)
      .catch((e) => {
        console.error(e)
        setFoods([])
      })

  useEffect(() => {
    void load()
    hasNativeCamera()
      .then(setNative)
      .catch(() => setNative(false))
  }, [])

  const read = async (fromDataUrl?: string) => {
    setReading(true)
    try {
      const r = await readLabelApi(fromDataUrl)
      if (r) setForm({ v: formOf(r), fromLabel: true })
    } catch (e) {
      if (!(e instanceof AiError)) console.error(e)
      toast(
        e instanceof AiError
          ? e.code === 'bad_output'
            ? 'Não consegui ler a tabela. Tire a foto mais de perto, reta e com boa luz.'
            : AI_ERROR_TEXT[e.code]
          : 'Não deu para abrir a câmera.',
        'erro',
      )
    } finally {
      setReading(false)
    }
  }

  const photo = () => (native ? void read() : fileRef.current?.click())

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await read(await readFile(file))
  }

  const save = async () => {
    if (!form) return
    const v = form.v
    setBusy(true)
    try {
      const hasPortion = v.portionLabel.trim() || v.portionG.trim()
      if (hasPortion && !(v.portionLabel.trim() && v.portionG.trim())) {
        throw new ValidationError('Porção: preencha o nome (ex.: 1 xícara) e o peso, ou deixe os dois vazios.')
      }
      const input = {
        name: v.name,
        kcal100: parseNum(v.kcal, { min: 0, max: 900, label: 'Calorias' }),
        protein100: parseNum(v.protein || '0', { min: 0, max: 100, label: 'Proteína' }),
        carbs100: parseNum(v.carbs || '0', { min: 0, max: 100, label: 'Carboidrato' }),
        fat100: parseNum(v.fat || '0', { min: 0, max: 100, label: 'Gordura' }),
        portion: hasPortion ? { label: v.portionLabel, grams: parseNum(v.portionG, { min: 0.1, max: 5000, label: 'Peso da porção' }) } : null,
      }
      await saveMyFoodApi(input)
      // Trocou o nome de um já salvo: o salvar criou outro, então tira o antigo.
      const old = foods?.find((f) => f.id === v.id)
      if (old && old.name.trim().toLowerCase() !== v.name.trim().toLowerCase()) await deleteMyFoodApi(old.id)
      toast('Alimento salvo.')
      setForm(null)
      await load()
    } catch (e) {
      if (e instanceof ValidationError) toast(e.message, 'erro')
      else {
        console.error(e)
        toast('Não deu para salvar o alimento.', 'erro')
      }
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    setConfirm(null)
    try {
      await deleteMyFoodApi(id)
      await load()
    } catch (e) {
      console.error(e)
      toast('Não deu para apagar.', 'erro')
    }
  }

  const set = (k: keyof Form) => (val: string) => setForm((f) => f && { ...f, v: { ...f.v, [k]: val } })

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Meus alimentos">
      {form ? (
        <div key="form" className="anim-enter-side">
          <div className="mb-4 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setForm(null)}
              aria-label="Voltar para a lista"
              className="-ml-2 grid size-10 shrink-0 place-items-center rounded-xl text-[var(--muted)] active:scale-[0.92]"
            >
              <ChevronLeft aria-hidden size={22} />
            </button>
            <h2 className="min-w-0 flex-1 text-[19px] leading-tight font-semibold tracking-[-0.01em]">
              {form.v.id ? 'Editar alimento' : 'Alimento novo'}
            </h2>
          </div>
          {form.fromLabel && (
            <p className="mb-4 rounded-xl bg-[var(--track)] px-3 py-2 text-[13px] leading-snug text-[var(--muted)]">
              A IA leu o rótulo. Confira os números com a embalagem antes de salvar: ela pode errar um dígito.
            </p>
          )}
          <label htmlFor="my-food-name" className={fieldLabel}>
            Nome
          </label>
          <input
            id="my-food-name"
            type="text"
            value={form.v.name}
            onChange={(e) => set('name')(e.target.value)}
            maxLength={120}
            placeholder="ex.: Biscoito cream cracker"
            className={textInput}
          />
          <p className="mt-4 mb-2 text-[13px] font-medium text-[var(--muted)]">Por 100 g (coluna “100 g” do rótulo)</p>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Calorias" value={form.v.kcal} onChange={set('kcal')} unit="kcal" decimals={0} />
            <NumberField label="Proteína" value={form.v.protein} onChange={set('protein')} unit="g" />
            <NumberField label="Carboidrato" value={form.v.carbs} onChange={set('carbs')} unit="g" />
            <NumberField label="Gordura" value={form.v.fat} onChange={set('fat')} unit="g" />
          </div>
          <p className="mt-4 mb-2 text-[13px] font-medium text-[var(--muted)]">Porção (opcional): vira um botão na hora de anotar</p>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <div>
              <label htmlFor="my-food-portion" className={fieldLabel}>
                Medida
              </label>
              <input
                id="my-food-portion"
                type="text"
                value={form.v.portionLabel}
                onChange={(e) => set('portionLabel')(e.target.value)}
                maxLength={40}
                placeholder="ex.: 1 xícara"
                className={textInput}
              />
            </div>
            <NumberField label="Peso" value={form.v.portionG} onChange={set('portionG')} unit="g" />
          </div>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setForm(null)} className={btnGhost}>
              Cancelar
            </button>
            <button type="button" onClick={() => void save()} disabled={busy || !form.v.name.trim() || !form.v.kcal.trim()} className={`${btnPrimary} flex-1`}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      ) : (
        <div key="list" className="anim-enter-side">
          <h2 className="text-[19px] font-semibold tracking-[-0.01em]">Meus alimentos</h2>
          <p className="mt-1 text-[14px] leading-snug text-[var(--muted)]">
            Fotografe a tabela nutricional da embalagem e salve uma vez. Depois é só buscar em Adicionar.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={photo} disabled={reading} className={`${btnPrimary} flex items-center justify-center gap-2 px-3! whitespace-nowrap`}>
              <Camera aria-hidden size={19} />
              {reading ? 'Lendo…' : 'Ler rótulo'}
            </button>
            <button
              type="button"
              onClick={() => setForm({ v: EMPTY, fromLabel: false })}
              className={`${btnGhost} flex items-center justify-center gap-2 border border-[var(--line)] text-[var(--ink)]!`}
            >
              <Plus aria-hidden size={19} />
              À mão
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e)} />
          </div>
          {foods && foods.length === 0 && (
            <p className="py-8 text-center text-[14px] text-[var(--muted)]">Nenhum alimento salvo ainda.</p>
          )}
          <ul className="mt-3 flex flex-col">
            {foods?.map((f) => (
              <li key={f.id}>
                {confirm === f.id ? (
                  <ConfirmRow text={`Apagar ${f.name}?`} onCancel={() => setConfirm(null)} onConfirm={() => void remove(f.id)} />
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setForm({ v: formOf(f), fromLabel: false })}
                      className="flex min-h-14 min-w-0 flex-1 flex-col justify-center rounded-xl px-2 py-2 text-left active:scale-[0.98] active:bg-[var(--track)]"
                    >
                      <span className="text-[15px] leading-snug">{f.name}</span>
                      <span className="text-[13px] tabular-nums text-[var(--muted)]">
                        {kcalText(f.kcal100)} kcal/100 g
                        {f.portion && ` · ${f.portion.label} = ${str(f.portion.grams)} g (${kcalText((f.kcal100 * f.portion.grams) / 100)} kcal)`}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Apagar ${f.name}`}
                      onClick={() => setConfirm(f.id)}
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-[var(--muted)] active:scale-[0.92]"
                    >
                      <Trash2 aria-hidden size={18} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  )
}
