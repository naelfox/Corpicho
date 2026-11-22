'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteMeasurement, loadRegionHistory, saveMeasurement, subscribe, type Region } from '@/lib/api'
import { REGIONS } from '@/lib/body'
import { ValidationError, round1 } from '@/lib/validate'
import { ConfirmRow } from './ConfirmRow'
import { NumberField } from './NumberField'
import { Sheet, btnGhost, btnPrimary } from './Sheet'
import { toast } from './Toast'
import { dateTime, deltaTone, num1, signed } from './format'

type Row = { id: string; cm: number; at: string }

/** Histórico de uma região: cada registro com a diferença para o anterior; apagar com confirmação. */
function History({ region }: { region: Region }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await loadRegionHistory(region))
    } catch (e) {
      console.error(e)
      setRows([])
    }
  }, [region])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga do banco local
    void load()
    return subscribe(load)
  }, [load])

  const remove = async (id: string) => {
    setConfirm(null)
    try {
      await deleteMeasurement(id)
      toast('Registro apagado.')
    } catch (e) {
      console.error(e)
      toast('Não deu para apagar.', 'erro')
    }
  }

  if (!rows) return null
  if (rows.length === 0) return <p className="text-[14px] text-[var(--muted)]">Nenhuma medida registrada ainda.</p>

  return (
    <ul className="flex flex-col">
      {rows.map((r, i) => {
        const prev = rows[i + 1]
        const delta = prev ? round1(r.cm - prev.cm) : null
        return (
          <li key={r.id} className="border-b border-[var(--line)]/70 last:border-0">
            {confirm === r.id ? (
              <div className="py-1.5">
                <ConfirmRow text={`Apagar ${num1(r.cm)} cm?`} onCancel={() => setConfirm(null)} onConfirm={() => void remove(r.id)} />
              </div>
            ) : (
              <div className="flex min-h-12 items-center gap-3">
                <span className="min-w-0 flex-1 text-[14px] text-[var(--muted)] tabular-nums">{dateTime(r.at)}</span>
                <span className="text-[15px] font-semibold tabular-nums">{num1(r.cm)} cm</span>
                <span className={`w-12 text-right text-[13px] tabular-nums ${deltaTone(delta)}`}>{delta ? signed(delta) : ''}</span>
                <button
                  type="button"
                  aria-label={`Apagar ${num1(r.cm)} cm de ${dateTime(r.at)}`}
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

/** Folha de uma região: nova medida (cm) com a última ao lado, e o histórico. Registros nunca são editados. */
export function MeasureSheet({
  region,
  latest,
  onClose,
}: {
  region: Region | null
  /** Última medida de cada região (para mostrar ao lado do campo). */
  latest: Partial<Record<Region, { cm: number } | null | undefined>>
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [shown, setShown] = useState<Region | null>(region)
  if (region && region !== shown) {
    // Troca de região: limpa o campo (mantém a última região durante a animação de fechar).
    setShown(region)
    setValue('')
    setInvalid(false)
  }
  const label = REGIONS.find((r) => r.id === shown)?.label ?? ''
  const last = shown ? (latest[shown]?.cm ?? null) : null

  const save = async () => {
    if (!shown) return
    setBusy(true)
    try {
      await saveMeasurement(shown, value)
      toast(`${label}: medida registrada.`)
      setValue('')
      setInvalid(false)
      onClose()
    } catch (e) {
      setInvalid(true)
      if (e instanceof ValidationError) toast(e.message, 'erro')
      else {
        console.error(e)
        toast('Não deu para salvar a medida.', 'erro')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={region !== null} onOpenChange={(o) => !o && onClose()} title={label}>
      <h2 className="mb-4 text-[19px] font-semibold tracking-[-0.01em]">{label}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim() && !busy) void save()
        }}
      >
        <NumberField
          label={
            <span className="flex justify-between gap-2">
              <span>Nova medida</span>
              <span className="tabular-nums">{last === null ? 'primeira medida' : `última: ${num1(last)} cm`}</span>
            </span>
          }
          value={value}
          onChange={setValue}
          unit="cm"
          placeholder={last === null ? 'ex.: 90' : num1(last)}
          invalid={invalid}
        />
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancelar
          </button>
          <button type="submit" disabled={!value.trim() || busy} className={`${btnPrimary} flex-1`}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
      <h3 className="mt-6 mb-1 text-[13px] font-medium text-[var(--muted)]">Histórico</h3>
      {shown && <History region={shown} />}
    </Sheet>
  )
}
