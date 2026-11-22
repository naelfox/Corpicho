'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPhoto, type Angle } from '@/lib/api'
import { ANGLES } from '@/lib/bodyPhotos'
import type { Day } from '@/lib/dates'

export const dayLabelBr = (day: Day) => day.split('-').reverse().join('/')
export const angleLabel = (a: Angle) => ANGLES.find((x) => x.id === a)?.label ?? a

/** Quantas fotos lidas ficam guardadas na memória (as mais usadas por último). */
export const PHOTO_CACHE_MAX = 40

/**
 * Cache LRU das fotos lidas da área privada (data URLs), limitado a PHOTO_CACHE_MAX e só enquanto a tela
 * está montada. Quem exibe guarda a própria cópia: tirar do cache não apaga uma imagem da tela.
 */
export function usePhotoCache() {
  const map = useRef(new Map<string, Promise<string>>())

  useEffect(() => {
    const m = map.current
    return () => m.clear()
  }, [])

  const load = useCallback((path: string): Promise<string> => {
    const m = map.current
    const hit = m.get(path)
    if (hit) {
      m.delete(path)
      m.set(path, hit)
      return hit
    }
    const p = loadPhoto(path)
    p.catch(() => m.get(path) === p && m.delete(path))
    m.set(path, p)
    while (m.size > PHOTO_CACHE_MAX) m.delete(m.keys().next().value as string)
    return p
  }, [])

  const forget = useCallback((...paths: (string | null | undefined)[]) => {
    for (const p of paths) if (p) map.current.delete(p)
  }, [])

  return { load, forget }
}

export type PhotoCache = ReturnType<typeof usePhotoCache>

/** Foto guardada, lida sob demanda. */
export function usePhoto(cache: PhotoCache, path: string | undefined): string | undefined {
  const { load } = cache
  const [state, setState] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    if (!path) return
    let live = true
    load(path)
      .then((url) => live && setState({ path, url }))
      .catch((e) => console.error(e))
    return () => {
      live = false
    }
  }, [path, load])
  return path && state?.path === path ? state.url : undefined
}
