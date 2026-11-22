'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPhoto, type Angle } from '@/lib/api'
import { ANGLES } from '@/lib/bodyPhotos'
import type { Day } from '@/lib/dates'

export const dayLabelBr = (day: Day) => day.split('-').reverse().join('/')
export const angleLabel = (a: Angle) => ANGLES.find((x) => x.id === a)?.label ?? a

/**
 * Cache em memória das fotos lidas da área privada (data URLs), só enquanto a tela está montada.
 * Some ao desmontar (bloqueio, troca de aba).
 */
export function usePhotoCache() {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const pending = useRef(new Set<string>())
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    const p = pending.current
    return () => {
      live.current = false
      p.clear()
    }
  }, [])

  /** Pede a foto ao disco (uma vez por path). Chamar em efeito. */
  const request = useCallback((path: string) => {
    if (pending.current.has(path)) return
    pending.current.add(path)
    loadPhoto(path)
      .then((u) => live.current && setUrls((m) => ({ ...m, [path]: u })))
      .catch((e) => {
        pending.current.delete(path)
        console.error(e)
      })
  }, [])

  const get = useCallback((path: string): string | undefined => urls[path], [urls])

  const forget = useCallback((path: string) => {
    pending.current.delete(path)
    setUrls((m) => {
      const { [path]: _gone, ...rest } = m
      void _gone
      return rest
    })
  }, [])

  return { get, request, forget }
}

export type PhotoCache = ReturnType<typeof usePhotoCache>

/** Foto guardada, lida sob demanda. */
export function usePhoto(cache: PhotoCache, path: string | undefined): string | undefined {
  const { request, get } = cache
  useEffect(() => {
    if (path) request(path)
  }, [path, request])
  return path ? get(path) : undefined
}

