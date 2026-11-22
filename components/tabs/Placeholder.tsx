'use client'

import type { LucideIcon } from 'lucide-react'

/** Conteúdo provisório de uma aba (as próximas tarefas trocam por telas de verdade). */
export function Placeholder({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="anim-enter-up flex min-h-[55dvh] flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
        <Icon aria-hidden size={28} strokeWidth={1.75} />
      </span>
      <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="max-w-xs text-[15px] leading-snug text-[var(--muted)]">{text}</p>
    </div>
  )
}
