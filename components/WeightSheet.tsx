'use client'

import { useState } from 'react'
import { saveWeight } from '@/lib/api'
import { ValidationError } from '@/lib/validate'
import { NumberField } from './NumberField'
import { Sheet, btnGhost, btnPrimary } from './Sheet'
import { toast } from './Toast'

/** Folha "Registrar peso" (Início e Corpo). Sempre um registro novo; nunca edita o anterior. */
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
    </Sheet>
  )
}
