'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteWeightApi, loadWeightHistory, saveWeight, subscribe } from '@/lib/api'
import { ValidationError, round1 } from '@/lib/validate'
import { ConfirmRow } from './ConfirmRow'
import { NumberField } from './NumberField'
import { Sheet, btnGhost, btnPrimary } from './Sheet'
import { toast } from './Toast'
import { dateTime, deltaTone, num1, signed } from './format'

type Row = { id: string; kg: number; at: string }

/** Pesos registrados, cada um com a diferença para o anterior; apagar (peso errado) com confirmação. */
function History() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await loadWeightHistory())
    } catch (e) {
      console.error(e)
      setRows([])
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga do banco local
    void load()
    return subscribe(load)
  }, [load])

  const remove = async (id: string) => {
    setConfirm(null)
    try {
      await deleteWeightApi(id)
      toast('Peso apagado.')
    } catch (e) {
      console.error(e)
      toast('Não deu para apagar.', 'erro')
    }
  }

  if (!rows) return null
  if (rows.length === 0) return <p className="text-[14px] text-[var(--muted)]">Nenhum peso registrado ainda.</p>

  return (
    <ul className="flex flex-col">
      {rows.map((r, i) => {
        const prev = rows[i + 1]
        const delta = prev ? round1(r.kg - prev.kg) : null
        return (
          <li key={r.id} className="border-b border-[var(--line)]/70 last:border-0">
            {confirm === r.id ? (
              <div className="py-1.5">
                <ConfirmRow text={`Apagar ${num1(r.kg)} kg?`} onCancel={() => setConfirm(null)} onConfirm={() => void remove(r.id)} />
              </div>
            ) : (
              <div className="flex min-h-12 items-center gap-3">
                <span className="min-w-0 flex-1 text-[14px] text-[var(--muted)] tabular-nums">{dateTime(r.at)}</span>
                <span className="text-[15px] font-semibold tabular-nums">{num1(r.kg)} kg</span>
                <span className={`w-12 text-right text-[13px] tabular-nums ${deltaTone(delta)}`}>{delta ? signed(delta) : ''}</span>
                <button
                  type="button"
                  aria-label={`Apagar ${num1(r.kg)} kg de ${dateTime(r.at)}`}
                  onClick={() => setConfirm(r.id)}
                  className="-mr-2 grid size-11 place-items-center rounded-xl text-[var(--muted)] transition-transform duration-150 active:scale-[0.92]"
                >
                  <Trash2 aria-hidden size={17} />
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Folha "Registrar peso" (Início e Corpo). Sempre um registro novo; nunca edita o anterior. Errou? Apague no histórico. */
export function WeightSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      await saveWeight(value)
      toast('Peso registrado.')
      setValue('')
      setInvalid(false)
      onClose()
    } catch (e) {
      setInvalid(true)
      if (e instanceof ValidationError) toast(e.message, 'erro')
      else {
        console.error(e)
        toast('Não deu para salvar o peso.', 'erro')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Registrar peso">
      <h2 className="mb-4 text-[19px] font-semibold tracking-[-0.01em]">Registrar peso</h2>
      <NumberField label="Peso de hoje" value={value} onChange={setValue} unit="kg" placeholder="ex.: 82,4" invalid={invalid} autoFocus />
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className={btnGhost}>
          Cancelar
        </button>
        <button type="button" onClick={() => void save()} disabled={!value.trim() || busy} className={`${btnPrimary} flex-1`}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
      <h3 className="mt-6 mb-1 text-[13px] font-medium text-[var(--muted)]">Histórico</h3>
      <History />
    </Sheet>
  )
}
