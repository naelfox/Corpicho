'use client'

/** Linha de confirmação dentro do app (substitui o confirm() do navegador). */
export function ConfirmRow({ text, onCancel, onConfirm }: { text: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div role="alert" className="anim-enter-up flex items-center gap-2 rounded-xl bg-[var(--danger-soft)] py-1.5 pr-1.5 pl-3">
      <span className="min-w-0 flex-1 text-[14px] font-medium">{text}</span>
      <button type="button" onClick={onCancel} className="h-10 rounded-lg px-3 text-[14px] text-[var(--muted)] active:scale-[0.96]">
        Cancelar
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="h-10 rounded-lg bg-[var(--danger)] px-3 text-[14px] font-medium text-[var(--card)] active:scale-[0.96]"
      >
        Apagar
      </button>
    </div>
  )
}
