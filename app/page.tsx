'use client'

import { useCallback, useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { loadProfile, loadProfileForm, subscribe } from '@/lib/api'
import { BottomNav, NAV_PAD, TABS, type Tab } from '@/components/BottomNav'
import { Onboarding, type ProfileFormInitial } from '@/components/Onboarding'
import { SettingsSheet } from '@/components/SettingsSheet'
import { restoreTheme } from '@/components/ThemeToggle'
import { Toaster, toast } from '@/components/Toast'
import { Dashboard } from '@/components/Dashboard'
import { FoodView } from '@/components/FoodView'
import { BodyView } from '@/components/BodyView'
import { TrainingView } from '@/components/TrainingView'
import { CoachView } from '@/components/CoachView'

/** Enquanto o banco local abre: marca do app + spinner. */
function Loading() {
  return (
    <div role="status" className="flex min-h-[80dvh] flex-col items-center justify-center gap-5">
      {/* eslint-disable-next-line @next/next/no-img-element -- export estático, ícone local */}
      <img src="/icon-192.png" alt="" width={72} height={72} className="size-18 rounded-[22px] shadow-[var(--shadow-card)]" />
      <span
        aria-hidden
        className="size-7 animate-spin rounded-full border-[3px] border-[var(--accent-soft)] border-t-[var(--accent)]"
      />
      <span className="sr-only">Abrindo…</span>
    </div>
  )
}

function TabBody({ tab }: { tab: Tab }) {
  if (tab === 'inicio') return <Dashboard />
  if (tab === 'comer') return <FoodView />
  if (tab === 'corpo') return <BodyView />
  if (tab === 'treino') return <TrainingView />
  return <CoachView />
}

type Status = 'loading' | 'error' | 'onboarding' | 'ready'

export default function Home() {
  const [status, setStatus] = useState<Status>('loading')
  const [tab, setTab] = useState<Tab>('inicio')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState<ProfileFormInitial | null>(null)

  const reload = useCallback(async () => {
    try {
      const profile = await loadProfile()
      setStatus(profile ? 'ready' : 'onboarding')
    } catch (e) {
      console.error(e)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void restoreTheme()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial do banco local
    void reload()
    return subscribe(reload)
  }, [reload])

  // Abas além do Início entram no histórico: o "voltar" do Android (e do navegador) volta para o Início.
  const go = useCallback((to: Tab) => {
    const current: Tab = window.history.state?.tab ?? 'inicio'
    if (to !== current) {
      if (to === 'inicio') window.history.back()
      else if (current === 'inicio') window.history.pushState({ tab: to }, '')
      else window.history.replaceState({ tab: to }, '')
    }
    setTab(to)
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const t = e.state?.tab
      setTab(TABS.some((x) => x.id === t) ? (t as Tab) : 'inicio')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const openEditor = async () => {
    try {
      const data = await loadProfileForm()
      setSettingsOpen(false)
      setEditing(data)
      window.scrollTo(0, 0)
    } catch (e) {
      console.error(e)
      toast('Não deu para abrir seu perfil.', 'erro')
    }
  }

  if (status === 'onboarding') {
    return (
      <>
        <Onboarding mode="new" onDone={() => go('inicio')} />
        <Toaster />
      </>
    )
  }

  if (editing) {
    return (
      <>
        <Onboarding mode="edit" initial={editing} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
        <Toaster />
      </>
    )
  }

  const title = TABS.find((x) => x.id === tab)!.label

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-[var(--line)]/60 bg-[var(--bg)]/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-lg items-center justify-between px-4">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">{status === 'ready' ? title : 'Corpicho'}</h1>
          {status === 'ready' && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Ajustes"
              className="-mr-2 grid size-11 place-items-center rounded-xl text-[var(--muted)] transition-[transform,background-color,color] duration-150 ease-[var(--ease-out)] active:scale-[0.92] [@media(hover:hover)]:hover:bg-[var(--track)] [@media(hover:hover)]:hover:text-[var(--ink)]"
            >
              <Settings aria-hidden size={22} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </header>
      <main className={`mx-auto w-full max-w-lg flex-1 px-4 ${NAV_PAD}`}>
        {status === 'ready' ? (
          <TabBody tab={tab} />
        ) : status === 'error' ? (
          <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center">
            <p className="text-[15px] text-[var(--muted)]">Não deu para abrir seus dados.</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="h-11 rounded-xl bg-[var(--accent)] px-5 text-[15px] font-medium text-[var(--accent-ink)] active:scale-[0.97]"
            >
              Tentar de novo
            </button>
          </div>
        ) : (
          <Loading />
        )}
      </main>
      {status === 'ready' && <BottomNav tab={tab} onChange={go} />}
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} onEditProfile={() => void openEditor()} />
      <Toaster />
    </>
  )
}
