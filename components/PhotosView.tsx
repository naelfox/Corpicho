'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera, ChevronLeft, Columns2, Lock, Plus, Trash2, X } from 'lucide-react'
import {
  deleteBodyPhotoApi, hasNativeCamera, loadPhotoSessions, subscribe, takeBodyPhoto,
  type Angle, type PhotoSession,
} from '@/lib/api'
import { ANGLES } from '@/lib/bodyPhotos'
import { todayIn, type Day } from '@/lib/dates'
import { onPhotoLockChange, photosUnlocked, unlockPhotos, withPhotoLockPaused } from '@/lib/lock'
import { ConfirmRow } from './ConfirmRow'
import { angleLabel, dayLabelBr, usePhoto, usePhotoCache, type PhotoCache } from './photoCache'
import { PhotoCompare } from './PhotoCompare'
import { btnGhost, btnPrimary } from './Sheet'
import { toast } from './Toast'

const card = 'rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)]'

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}

function Thumb({ path, alt, cache }: { path: string; alt: string; cache: PhotoCache }) {
  const url = usePhoto(cache, path)
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- data URL local
    <img src={url} alt={alt} className="size-full object-cover" />
  ) : (
    <span aria-hidden className="block size-full animate-pulse bg-[var(--track)]" />
  )
}

/** Câmera no app; no navegador (dev), o seletor de arquivo. */
function useCapture(onTaken: () => void) {
  const [native, setNative] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const angleRef = useRef<Angle>('frente')

  useEffect(() => {
    hasNativeCamera()
      .then(setNative)
      .catch(() => setNative(false))
  }, [])

  const save = async (angle: Angle, fromDataUrl?: string) => {
    setBusy(true)
    try {
      const id = await withPhotoLockPaused(() => takeBodyPhoto(angle, fromDataUrl))
      if (id) onTaken()
    } catch (e) {
      console.error(e)
      toast('Não deu para salvar a foto.', 'erro')
    } finally {
      setBusy(false)
    }
  }

  const take = (angle: Angle) => {
    angleRef.current = angle
    if (!native) {
      fileRef.current?.click()
      return
    }
    void save(angle)
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await save(angleRef.current, await readFile(file))
    } catch (err) {
      console.error(err)
      toast('Não deu para ler a foto.', 'erro')
    }
  }

  const input = <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e)} />
  return { take, busy, input }
}

/** Sessão guiada: frente → lado → costas. Cada passo: tirar a foto ou pular. */
function NewSession({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const next = () => {
    if (step === ANGLES.length - 1) onDone()
    else setStep((s) => s + 1)
  }
  const { take, busy, input } = useCapture(next)
  const angle = ANGLES[step]

  return (
    <section className={`${card} anim-enter-up flex flex-col gap-4`} aria-label="Nova sessão de fotos">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onDone} aria-label="Voltar" className="-ml-2 grid size-10 place-items-center rounded-xl text-[var(--muted)] active:scale-[0.96]">
          <ChevronLeft aria-hidden size={22} />
        </button>
        <p className="flex-1 text-[17px] font-semibold">Nova sessão</p>
        <span className="text-[13px] text-[var(--muted)] tabular-nums">
          {step + 1} de {ANGLES.length}
        </span>
      </div>

      <ol className="flex gap-1.5" aria-hidden>
        {ANGLES.map((a, i) => (
          <li key={a.id} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-[var(--accent)]' : 'bg-[var(--track)]'}`} />
        ))}
      </ol>

      <div key={angle.id} className="anim-enter-side flex flex-col items-center gap-3 py-4 text-center">
        <span className="grid size-16 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
          <Camera aria-hidden size={28} strokeWidth={1.75} />
        </span>
        <p className="text-[20px] font-semibold tracking-[-0.01em]">{angle.label}</p>
        <p className="max-w-xs text-[14px] leading-snug text-[var(--muted)]">
          {angle.id === 'lado' ? 'De perfil, braços relaxados. ' : angle.id === 'costas' ? 'De costas para a câmera. ' : 'De frente, braços relaxados. '}
          Use o mesmo lugar, a mesma luz e a mesma roupa das outras sessões.
        </p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={next} disabled={busy} className={`${btnGhost} flex-1 border border-[var(--line)]`}>
          Pular
        </button>
        <button type="button" onClick={() => take(angle.id)} disabled={busy} className={`${btnPrimary} flex-[2]`}>
          {busy ? 'Salvando…' : 'Tirar foto'}
        </button>
      </div>
      {input}
    </section>
  )
}

/** Foto em tela cheia, com apagar. Sem compartilhar: as fotos não saem do aparelho. */
function Viewer({
  photo,
  cache,
  onClose,
}: {
  photo: { id: string; path: string; day: Day; angle: Angle }
  cache: PhotoCache
  onClose: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const url = usePhoto(cache, photo.path)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const remove = async () => {
    try {
      await deleteBodyPhotoApi(photo.id)
      cache.forget(photo.path)
      toast('Foto apagada.')
      onClose()
    } catch (e) {
      console.error(e)
      toast('Não deu para apagar a foto.', 'erro')
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Foto de ${angleLabel(photo.angle)}`} className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))] pb-2 text-white">
        <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-11 place-items-center rounded-xl active:scale-[0.96]">
          <X aria-hidden size={22} />
        </button>
        <p className="flex-1 text-[15px] font-medium">
          {angleLabel(photo.angle)} · {dayLabelBr(photo.day)}
        </p>
        <button type="button" onClick={() => setConfirm(true)} aria-label="Apagar foto" className="grid size-11 place-items-center rounded-xl active:scale-[0.96]">
          <Trash2 aria-hidden size={20} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL local
          <img src={url} alt={`${angleLabel(photo.angle)} em ${dayLabelBr(photo.day)}`} className="absolute inset-0 size-full object-contain" />
        ) : (
          <span aria-hidden className="absolute inset-0 m-auto size-7 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
        )}
      </div>
      <div className="px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
        {confirm && <ConfirmRow text="Apagar esta foto?" onCancel={() => setConfirm(false)} onConfirm={() => void remove()} />}
      </div>
    </div>
  )
}

function Unlocked() {
  const [sessions, setSessions] = useState<PhotoSession[] | null>(null)
  const [mode, setMode] = useState<'lista' | 'nova' | 'comparar'>('lista')
  const [open, setOpen] = useState<{ id: string; path: string; day: Day; angle: Angle } | null>(null)
  const cache = usePhotoCache()
  const today = todayIn()
  const { take, busy, input } = useCapture(() => toast('Foto salva.'))

  const load = useCallback(async () => {
    try {
      setSessions(await loadPhotoSessions())
    } catch (e) {
      console.error(e)
      toast('Não deu para carregar as fotos.', 'erro')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga do banco local
    void load()
    return subscribe(load)
  }, [load])

  if (mode === 'nova')
    return (
      <NewSession
        onDone={() => {
          setMode('lista')
          window.scrollTo(0, 0)
        }}
      />
    )
  if (mode === 'comparar' && sessions)
    return <PhotoCompare sessions={sessions} cache={cache} onBack={() => setMode('lista')} />

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode('nova')} className={`${btnPrimary} flex flex-1 items-center justify-center gap-1.5`}>
          <Plus aria-hidden size={18} /> Nova sessão
        </button>
        <button
          type="button"
          onClick={() => setMode('comparar')}
          disabled={!sessions || sessions.length < 2}
          className={`${btnGhost} flex flex-1 items-center justify-center gap-1.5 border border-[var(--line)] disabled:opacity-50`}
        >
          <Columns2 aria-hidden size={18} /> Comparar
        </button>
      </div>

      {sessions && sessions.length === 0 && (
        <section className={`${card} flex flex-col items-center gap-2 py-8 text-center`}>
          <p className="text-[15px] font-medium">Nenhuma foto ainda</p>
          <p className="max-w-xs text-[14px] leading-snug text-[var(--muted)]">
            Tire fotos de frente, lado e costas para comparar a evolução. Elas ficam só neste aparelho.
          </p>
        </section>
      )}

      {sessions?.map((s) => (
        <section key={s.day} className={card} aria-label={`Sessão de ${dayLabelBr(s.day)}`}>
          <p className="mb-2.5 text-[14px] font-semibold">
            {s.day === today ? 'Hoje' : dayLabelBr(s.day)}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {ANGLES.map((a) => {
              const p = s.photos[a.id]
              return (
                <div key={a.id} className="flex flex-col gap-1">
                  {p ? (
                    <button
                      type="button"
                      onClick={() => setOpen({ ...p, day: s.day, angle: a.id })}
                      aria-label={`Ver ${a.label}`}
                      className="aspect-[3/4] overflow-hidden rounded-xl bg-[var(--track)] active:scale-[0.97]"
                    >
                      <Thumb path={p.path} alt={a.label} cache={cache} />
                    </button>
                  ) : s.day === today ? (
                    <button
                      type="button"
                      onClick={() => take(a.id)}
                      disabled={busy}
                      aria-label={`Tirar foto de ${a.label}`}
                      className="grid aspect-[3/4] place-items-center rounded-xl border-2 border-dashed border-[var(--line)] text-[var(--muted)] active:scale-[0.97]"
                    >
                      <Plus aria-hidden size={22} />
                    </button>
                  ) : (
                    <span className="grid aspect-[3/4] place-items-center rounded-xl border-2 border-dashed border-[var(--line)] text-[13px] text-[var(--muted)]">
                      —
                    </span>
                  )}
                  <span className="text-center text-[12px] text-[var(--muted)]">{a.label}</span>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {input}
      {open && <Viewer photo={open} cache={cache} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** Seção Fotos da aba Corpo: pede desbloqueio (biometria ou senha do aparelho) antes de mostrar qualquer foto. */
export function PhotosView() {
  const [unlocked, setUnlocked] = useState(() => photosUnlocked())
  const [asking, setAsking] = useState(false)

  useEffect(() => onPhotoLockChange(setUnlocked), [])

  const unlock = async () => {
    setAsking(true)
    try {
      const ok = await unlockPhotos()
      setUnlocked(ok)
      if (!ok) toast('Não foi possível desbloquear.', 'erro')
    } catch (e) {
      console.error(e)
      toast('Não foi possível desbloquear.', 'erro')
    } finally {
      setAsking(false)
    }
  }

  if (unlocked) return <Unlocked />

  return (
    <section className={`${card} flex flex-col items-center gap-3 py-10 text-center`}>
      <span className="grid size-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
        <Lock aria-hidden size={26} strokeWidth={1.75} />
      </span>
      <p className="text-[17px] font-semibold">Fotos protegidas</p>
      <p className="max-w-xs text-[14px] leading-snug text-[var(--muted)]">
        Suas fotos do corpo ficam só neste aparelho. Desbloqueie com a digital, o rosto ou a senha do celular.
      </p>
      <button type="button" onClick={() => void unlock()} disabled={asking} className={`${btnPrimary} mt-1`}>
        Desbloquear
      </button>
    </section>
  )
}
