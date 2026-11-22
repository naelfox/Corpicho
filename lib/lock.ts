/**
 * Bloqueio da galeria de fotos do corpo. No app Android pede biometria, com a senha/padrão do aparelho
 * como alternativa. No navegador (dev) libera direto. O desbloqueio vale até o app ir para segundo plano
 * ou por 5 minutos, o que vier primeiro.
 */

export const UNLOCK_MS = 5 * 60_000

type Auth = () => Promise<boolean>
type Listener = (unlocked: boolean) => void

export function createLock(deps: { authenticate: Auth; now?: () => number }) {
  const now = deps.now ?? Date.now
  let until = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<Listener>()
  /** Câmera aberta: o app vai para segundo plano, mas não deve bloquear no meio da sessão de fotos. */
  let paused = 0

  const emit = () => listeners.forEach((fn) => fn(until > now()))

  const lock = () => {
    if (timer) clearTimeout(timer)
    timer = null
    const was = until > now()
    until = 0
    if (was) emit()
  }

  return {
    isUnlocked: () => until > now(),
    lock,
    /** O app foi para segundo plano: bloqueia, exceto durante `whilePaused`. */
    background() {
      if (paused === 0) lock()
    },
    async whilePaused<T>(fn: () => Promise<T>): Promise<T> {
      paused++
      try {
        return await fn()
      } finally {
        paused--
      }
    },
    async unlock(): Promise<boolean> {
      if (until > now()) return true
      const ok = await deps.authenticate()
      if (!ok) return false
      until = now() + UNLOCK_MS
      if (timer) clearTimeout(timer)
      timer = setTimeout(lock, UNLOCK_MS)
      emit()
      return true
    },
    subscribe(fn: Listener): () => void {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
  }
}

async function authenticate(): Promise<boolean> {
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) return true
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
  const check = await BiometricAuth.checkBiometry()
  // Aparelho sem nenhum bloqueio (nem biometria nem senha): não há com o que confirmar.
  if (!check.isAvailable && !check.deviceIsSecure) return true
  try {
    await BiometricAuth.authenticate({
      reason: 'Desbloqueie para ver suas fotos do corpo',
      cancelTitle: 'Cancelar',
      allowDeviceCredential: true,
      androidTitle: 'Fotos do corpo',
      androidSubtitle: 'Use a digital, o rosto ou a senha do aparelho',
    })
    return true
  } catch {
    return false
  }
}

const photoLock = createLock({ authenticate })

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') photoLock.background()
  })
}

export const unlockPhotos = (): Promise<boolean> => photoLock.unlock()
/** Para abrir a câmera sem perder o desbloqueio. */
export const withPhotoLockPaused = <T>(fn: () => Promise<T>): Promise<T> => photoLock.whilePaused(fn)
export const lockPhotos = (): void => photoLock.lock()
export const photosUnlocked = (): boolean => photoLock.isUnlocked()
export const onPhotoLockChange = (fn: Listener): (() => void) => photoLock.subscribe(fn)
