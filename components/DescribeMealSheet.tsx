'use client'

import { useState } from 'react'
import { Mic } from 'lucide-react'
import { Sheet, btnGhost, btnPrimary } from './Sheet'

/**
 * Descrever a refeição com as próprias palavras. A voz vem do microfone do teclado (ditado do Android):
 * sem plugin, sem custo extra. "Analisar" entrega o texto para a conferência (a IA roda lá).
 */
export function DescribeMealSheet({ open, onClose, onAnalyze }: { open: boolean; onClose: () => void; onAnalyze: (text: string) => void }) {
  const [text, setText] = useState('')
  const t = text.trim()

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Descrever o que comi">
      <h2 className="text-[19px] font-semibold tracking-[-0.01em]">Descrever o que comi</h2>
      <p className="mt-1 text-[14px] leading-snug text-[var(--muted)]">
        Escreva do seu jeito, com as quantidades se souber. A IA separa os itens e você confere antes de salvar.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={2000}
        autoFocus
        aria-label="O que você comeu"
        placeholder="Ex.: 2 ovos mexidos, 1 pão francês com manteiga e um copo de café com leite"
        className="mt-4 w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-[16px] leading-snug outline-none transition-[border-color] duration-150 placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)]"
      />
      <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-snug text-[var(--muted)]">
        <Mic aria-hidden size={15} className="mt-px shrink-0" />
        Prefere falar? Toque no microfone do teclado e dite.
      </p>
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className={btnGhost}>
          Cancelar
        </button>
        <button type="button" onClick={() => onAnalyze(t)} disabled={!t} className={`${btnPrimary} flex-1`}>
          Analisar
        </button>
      </div>
    </Sheet>
  )
}
