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
  /** Fim do desbloqueio (ms). 0 = bloqueado. */
  let until = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<Listener>()
  /**
   * Sessão guiada ou câmera aberta: o prazo fica parado (`remaining` guarda o que faltava) e
   * ir para segundo plano não bloqueia. Ao soltar o último hold, o prazo volta a contar.
   */
  let holds = 0
  let remaining: number | null = null
  let last = false

  const isUnlocked = () => (holds > 0 ? remaining !== null : until > now())
  const emit = () => {
    const u = isUnlocked()
    if (u === last) return
    last = u
    listeners.forEach((fn) => fn(u))
  }
  const clearTimer = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  const start = (ms: number) => {
    clearTimer()
    until = now() + ms
    timer = setTimeout(() => {
      timer = null
      if (holds === 0) lock()
    }, ms)
  }

  function lock() {
    clearTimer()
    until = 0
    remaining = null
    emit()
  }

  function hold(): () => void {
    if (holds === 0) {
      remaining = until > now() ? until - now() : null
      clearTimer()
    }
    holds++
    let released = false
    return () => {
      if (released) return
      released = true
      holds--
      if (holds > 0) return
      if (remaining !== null) start(remaining)
      else until = 0
      remaining = null
      emit()
    }
  }

  return {
    isUnlocked,
    lock,
    hold,
    /** O app foi para segundo plano: bloqueia, exceto durante um hold (sessão/câmera). */
    background() {
      if (holds === 0) lock()
    },
    async whilePaused<T>(fn: () => Promise<T>): Promise<T> {
      const release = hold()
      try {
        return await fn()
      } finally {
        release()
      }
    },
    async unlock(): Promise<boolean> {
      if (isUnlocked()) return true
      const ok = await deps.authenticate()
      if (!ok) return false
      if (holds > 0) remaining = UNLOCK_MS
      else start(UNLOCK_MS)
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

/** false só no app, quando o celular não tem nenhum bloqueio de tela (nem biometria nem senha). */
export async function deviceHasScreenLock(): Promise<boolean> {
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) return true
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
  const check = await BiometricAuth.checkBiometry()
  return check.isAvailable || check.deviceIsSecure
}

async function authenticate(): Promise<boolean> {
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) return true
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
  // Celular sem nenhum bloqueio: não há com o que confirmar (a tela avisa e sugere configurar um).
  if (!(await deviceHasScreenLock())) return true
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
/** Segura o desbloqueio (prazo parado) enquanto a sessão guiada está aberta. Devolve a função que solta. */
export const holdPhotoLock = (): (() => void) => photoLock.hold()
export const lockPhotos = (): void => photoLock.lock()
export const photosUnlocked = (): boolean => photoLock.isUnlocked()
export const onPhotoLockChange = (fn: Listener): (() => void) => photoLock.subscribe(fn)
