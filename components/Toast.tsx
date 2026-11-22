'use client'

import { useEffect, useState } from 'react'
import { Check, CircleAlert } from 'lucide-react'

type Kind = 'ok' | 'erro'
type Item = { id: number; msg: string; kind: Kind }

let seq = 0
let current: Item | null = null
const listeners = new Set<(t: Item | null) => void>()

/** Aviso curto que some sozinho. Um por vez: o novo substitui o anterior. */
export function toast(msg: string, kind: Kind = 'ok') {
  current = { id: ++seq, msg, kind }
  listeners.forEach((fn) => fn(current))
}

const DURATION = { ok: 2600, erro: 4500 }

/** Montado uma vez na página. Fica acima do menu de baixo; lido por leitores de tela (aria-live). */
export function Toaster() {
  const [item, setItem] = useState<Item | null>(current)

  useEffect(() => {
    listeners.add(setItem)
    return () => {
      listeners.delete(setItem)
    }
  }, [])

  useEffect(() => {
    if (!item) return
    const t = setTimeout(() => {
      if (current?.id === item.id) current = null
      setItem((i) => (i?.id === item.id ? null : i))
    }, DURATION[item.kind])
    return () => clearTimeout(t)
  }, [item])

  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4"
    >
      {item && (
        <div
          key={item.id}
          className="anim-enter-up flex max-w-md items-center gap-2 rounded-2xl bg-[var(--ink)] px-4 py-3 text-[14px] leading-snug text-[var(--bg)] shadow-lg"
        >
          {item.kind === 'erro' ? (
            <CircleAlert aria-hidden size={18} className="shrink-0" />
          ) : (
            <Check aria-hidden size={18} className="shrink-0" />
          )}
          <span>{item.msg}</span>
        </div>
      )}
    </div>
  )
}
