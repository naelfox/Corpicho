import { describe, expect, it, vi } from 'vitest'
import { UNLOCK_MS, createLock } from './lock'

describe('bloqueio das fotos', () => {
  it('desbloqueia com a autenticação, expira em 5 minutos e não pede de novo enquanto vale', async () => {
    let t = 1000
    const authenticate = vi.fn(async () => true)
    const lock = createLock({ authenticate, now: () => t })
    expect(lock.isUnlocked()).toBe(false)
    expect(await lock.unlock()).toBe(true)
    expect(await lock.unlock()).toBe(true)
    expect(authenticate).toHaveBeenCalledTimes(1)
    t += UNLOCK_MS
    expect(lock.isUnlocked()).toBe(false)
    lock.lock()
  })

  it('autenticação recusada mantém bloqueado; lock() bloqueia e avisa', async () => {
    let ok = false
    const lock = createLock({ authenticate: async () => ok })
    expect(await lock.unlock()).toBe(false)
    ok = true
    const seen: boolean[] = []
    lock.subscribe((u) => seen.push(u))
    await lock.unlock()
    lock.lock()
    expect(lock.isUnlocked()).toBe(false)
    expect(seen).toEqual([true, false])
  })

  it('segundo plano bloqueia, exceto com a câmera aberta (whilePaused)', async () => {
    const lock = createLock({ authenticate: async () => true })
    await lock.unlock()
    await lock.whilePaused(async () => lock.background())
    expect(lock.isUnlocked()).toBe(true)
    lock.background()
    expect(lock.isUnlocked()).toBe(false)
  })

  it('o prazo de 5 minutos fica parado durante a sessão/câmera (hold) e volta a contar ao soltar', async () => {
    vi.useFakeTimers()
    try {
      let t = 0
      const lock = createLock({ authenticate: async () => true, now: () => t })
      await lock.unlock()
      t += 4 * 60_000
      vi.advanceTimersByTime(4 * 60_000)
      const release = lock.hold()
      t += 10 * 60_000
      vi.advanceTimersByTime(10 * 60_000)
      expect(lock.isUnlocked()).toBe(true)
      lock.background()
      expect(lock.isUnlocked()).toBe(true)
      release()
      expect(lock.isUnlocked()).toBe(true)
      t += 59_000
      vi.advanceTimersByTime(59_000)
      expect(lock.isUnlocked()).toBe(true)
      t += 2_000
      vi.advanceTimersByTime(2_000)
      expect(lock.isUnlocked()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('timer expirado bloqueia e avisa', async () => {
    vi.useFakeTimers()
    try {
      let t = 0
      const lock = createLock({ authenticate: async () => true, now: () => t })
      const seen: boolean[] = []
      lock.subscribe((u) => seen.push(u))
      await lock.unlock()
      t += UNLOCK_MS
      vi.advanceTimersByTime(UNLOCK_MS)
      expect(seen).toEqual([true, false])
    } finally {
      vi.useRealTimers()
    }
  })
})
