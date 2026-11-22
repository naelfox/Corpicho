'use client'

import type { ReactNode } from 'react'
import { Drawer } from 'vaul'

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-[var(--card)] outline-none md:bottom-6 md:rounded-3xl md:shadow-2xl"
        >
          <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-[var(--line)]" />
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          <div className="overflow-y-auto overscroll-contain px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

export const btnPrimary =
  'h-12 rounded-xl bg-[var(--accent)] px-5 text-[15px] font-medium text-[var(--accent-ink)] transition-[transform,opacity] duration-150 ease-[var(--ease-out)] active:scale-[0.97] disabled:opacity-50'
export const btnGhost =
  'h-12 rounded-xl px-4 text-[15px] text-[var(--muted)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.97] [@media(hover:hover)]:hover:bg-[var(--bg)]'
export const fieldLabel = 'mb-2 block text-[13px] font-medium text-[var(--muted)]'
