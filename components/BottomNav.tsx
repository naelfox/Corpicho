'use client'

import { Dumbbell, House, MessageCircle, PersonStanding, Utensils } from 'lucide-react'

export type Tab = 'inicio' | 'comer' | 'corpo' | 'treino' | 'coach'

export const TABS: { id: Tab; label: string; icon: typeof House }[] = [
  { id: 'inicio', label: 'Início', icon: House },
  { id: 'comer', label: 'Comer', icon: Utensils },
  { id: 'corpo', label: 'Corpo', icon: PersonStanding },
  { id: 'treino', label: 'Treino', icon: Dumbbell },
  { id: 'coach', label: 'Coach', icon: MessageCircle },
]

/** Menu fixo embaixo da tela, como nos apps do celular. */
export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      aria-label="Menu"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--card)]/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onChange(id)}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[12px] transition-[color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.94] ${
                active ? 'font-semibold text-[var(--accent-text)]' : 'text-[var(--muted)]'
              }`}
            >
              <span
                className={`grid h-7 w-12 place-items-center rounded-full transition-[background-color] duration-200 ${
                  active ? 'bg-[var(--accent-soft)]' : ''
                }`}
              >
                <Icon aria-hidden size={20} strokeWidth={active ? 2.25 : 1.75} />
              </span>
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/** Espaço no fim da página para o conteúdo não ficar atrás do menu. */
export const NAV_PAD = 'pb-[calc(88px+env(safe-area-inset-bottom))]'
