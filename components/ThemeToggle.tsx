'use client'

import { useEffect, useState } from 'react'
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { getTheme, setTheme, type Theme } from '@/lib/settings'
import { Segmented } from './Chips'

/** Espelho síncrono da escolha, lido pelo script em app/layout.tsx antes da primeira pintura. */
export const THEME_KEY = 'theme'
export const THEME_COLORS = { light: '#f4f6f2', dark: '#111613' } as const

const OPTIONS: { id: Theme; label: string }[] = [
  { id: 'system', label: 'Sistema' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Escuro' },
]

/** Cor da barra de status/navegação: no Android, segue o tema escolhido no app. */
function syncSystemBars(theme: Theme) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const scheme = theme === 'system' ? (m.getAttribute('media')?.includes('dark') ? 'dark' : 'light') : theme
    m.setAttribute('content', THEME_COLORS[scheme])
  })
  if (Capacitor.isNativePlatform()) {
    const style =
      theme === 'dark' ? SystemBarsStyle.Dark : theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Default
    void SystemBars.setStyle({ style }).catch(() => {})
  }
}

/** Aplica o tema na página (sem gravar nas Preferences). */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, theme)
  } catch {}
  syncSystemBars(theme)
}

/** Na abertura: confere a escolha guardada nas Preferences (fonte da verdade) e reaplica. */
export async function restoreTheme(): Promise<void> {
  try {
    applyTheme(await getTheme())
  } catch {}
}

/** Escolha Sistema / Claro / Escuro (usada nos Ajustes). */
export function ThemeToggle() {
  const [theme, setLocal] = useState<Theme | null>(null)

  useEffect(() => {
    let alive = true
    void getTheme().then((t) => alive && setLocal(t))
    return () => {
      alive = false
    }
  }, [])

  const choose = (t: Theme) => {
    setLocal(t)
    applyTheme(t)
    void setTheme(t)
  }

  return <Segmented label="Tema" options={OPTIONS} value={theme} onChange={choose} />
}
