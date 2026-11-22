import type { Db } from './db'
import { todayIn, type Day } from './dates'
import { ValidationError } from './validate'

export type Angle = 'frente' | 'lado' | 'costas'

export const ANGLES: { id: Angle; label: string }[] = [
  { id: 'frente', label: 'Frente' },
  { id: 'lado', label: 'Lado' },
  { id: 'costas', label: 'Costas' },
]

export type PhotoRef = { id: string; path: string; thumbPath: string | null }
export type PhotoSession = { day: Day; photos: Record<Angle, PhotoRef | undefined> }

const isAngle = (a: unknown): a is Angle => ANGLES.some((x) => x.id === a)

export async function addBodyPhoto(
  db: Db,
  input: { angle: Angle; path: string; thumbPath?: string | null; at?: Date },
): Promise<string> {
  if (!isAngle(input.angle)) throw new ValidationError('Ângulo inválido.')
  if (!input.path?.trim()) throw new ValidationError('Foto sem arquivo.')
  const [r] = await db.query<{ id: string }>(
    `insert into body_photos (taken_at, angle, path, thumb_path) values ($1, $2, $3, $4) returning id`,
    [(input.at ?? new Date()).toISOString(), input.angle, input.path, input.thumbPath ?? null],
  )
  return r.id
}

export type StoreDeps = {
  resize: (dataUrl: string, max: number, quality: number) => Promise<string>
  save: (dataUrl: string) => Promise<string>
  remove: (path: string) => Promise<void>
}

/**
 * Guarda a foto (≤1600 px JPEG 0.85) e uma miniatura (≤320 px JPEG 0.7) e registra no banco.
 * Falha da miniatura não perde a foto: segue com `thumbPath` null (a grade usa a foto inteira).
 * Falha ao guardar a foto ou ao registrar apaga o que foi gravado e relança.
 */
export async function storeBodyPhoto(
  db: Db,
  input: { angle: Angle; original: string; at?: Date },
  deps: StoreDeps,
): Promise<string> {
  const path = await deps.save(await deps.resize(input.original, 1600, 0.85))
  let thumbPath: string | null = null
  try {
    thumbPath = await deps.save(await deps.resize(input.original, 320, 0.7))
  } catch (e) {
    console.error(e)
  }
  try {
    return await addBodyPhoto(db, { angle: input.angle, path, thumbPath, at: input.at })
  } catch (e) {
    await Promise.all([path, thumbPath].map((p) => (p ? deps.remove(p).catch(() => {}) : undefined)))
    throw e
  }
}

type Row = { id: string; taken_at: string | Date; angle: Angle; path: string; thumb_path: string | null }

/**
 * Sessões por dia (fuso de São Paulo), da mais recente para a mais antiga.
 * Se houver duas fotos do mesmo ângulo no dia, a sessão mostra a mais recente (a outra continua no banco).
 */
export async function photoSessions(db: Db): Promise<PhotoSession[]> {
  const rows = await db.query<Row>(
    `select id, taken_at, angle, path, thumb_path from body_photos order by taken_at desc, created_at desc`,
  )
  const byDay = new Map<Day, PhotoSession>()
  for (const r of rows) {
    const day = todayIn(new Date(r.taken_at))
    let s = byDay.get(day)
    if (!s) {
      s = { day, photos: { frente: undefined, lado: undefined, costas: undefined } }
      byDay.set(day, s)
    }
    s.photos[r.angle] ??= { id: r.id, path: r.path, thumbPath: r.thumb_path }
  }
  return [...byDay.values()]
}

/** As fotos pedidas, na ordem dos ids, com dia e ângulo (para rotular a comparação). */
export async function getBodyPhotos(db: Db, ids: string[]): Promise<{ id: string; angle: Angle; path: string; day: Day }[]> {
  if (ids.length === 0) return []
  const rows = await db.query<Row>(`select id, taken_at, angle, path from body_photos where id = any($1::uuid[])`, [ids])
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.flatMap((id) => {
    const r = byId.get(id)
    return r ? [{ id: r.id, angle: r.angle, path: r.path, day: todayIn(new Date(r.taken_at)) }] : []
  })
}

const missing = (e: unknown) => /does not exist|not found|no such file|ENOENT/i.test(String((e as Error)?.message ?? e))

/**
 * Apaga o registro, a foto e a miniatura. Arquivo que já sumiu conta como apagado;
 * outro erro ao apagar o arquivo não impede apagar o registro, mas volta `fileRemoved: false`.
 */
export async function deleteBodyPhoto(
  db: Db,
  id: string,
  deps: { removeFile?: (path: string) => Promise<void> } = {},
): Promise<{ fileRemoved: boolean }> {
  const [r] = await db.query<{ path: string; thumb_path: string | null }>(
    `delete from body_photos where id = $1 returning path, thumb_path`,
    [id],
  )
  if (!r) return { fileRemoved: true }
  const removeFile = deps.removeFile ?? (async (p: string) => (await import('./photos')).deletePrivate(p))
  let fileRemoved = true
  for (const p of [r.path, r.thumb_path]) {
    if (!p) continue
    try {
      await removeFile(p)
    } catch (e) {
      if (!missing(e)) {
        console.error(e)
        fileRemoved = false
      }
    }
  }
  return { fileRemoved }
}
