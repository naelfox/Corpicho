import type { Db } from './db'
import { todayIn, type Day } from './dates'
import { ValidationError } from './validate'

export type Angle = 'frente' | 'lado' | 'costas'

export const ANGLES: { id: Angle; label: string }[] = [
  { id: 'frente', label: 'Frente' },
  { id: 'lado', label: 'Lado' },
  { id: 'costas', label: 'Costas' },
]

export type PhotoRef = { id: string; path: string }
export type PhotoSession = { day: Day; photos: Record<Angle, PhotoRef | undefined> }

const isAngle = (a: unknown): a is Angle => ANGLES.some((x) => x.id === a)

export async function addBodyPhoto(db: Db, input: { angle: Angle; path: string; at?: Date }): Promise<string> {
  if (!isAngle(input.angle)) throw new ValidationError('Ângulo inválido.')
  if (!input.path?.trim()) throw new ValidationError('Foto sem arquivo.')
  const [r] = await db.query<{ id: string }>(
    `insert into body_photos (taken_at, angle, path) values ($1, $2, $3) returning id`,
    [(input.at ?? new Date()).toISOString(), input.angle, input.path],
  )
  return r.id
}

type Row = { id: string; taken_at: string | Date; angle: Angle; path: string }

/**
 * Sessões por dia (fuso de São Paulo), da mais recente para a mais antiga.
 * Se houver duas fotos do mesmo ângulo no dia, a sessão mostra a mais recente (a outra continua no banco).
 */
export async function photoSessions(db: Db): Promise<PhotoSession[]> {
  const rows = await db.query<Row>(
    `select id, taken_at, angle, path from body_photos order by taken_at desc, created_at desc`,
  )
  const byDay = new Map<Day, PhotoSession>()
  for (const r of rows) {
    const day = todayIn(new Date(r.taken_at))
    let s = byDay.get(day)
    if (!s) {
      s = { day, photos: { frente: undefined, lado: undefined, costas: undefined } }
      byDay.set(day, s)
    }
    s.photos[r.angle] ??= { id: r.id, path: r.path }
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

/** Apaga o registro e o arquivo da foto. Arquivo que já sumiu não impede apagar o registro. */
export async function deleteBodyPhoto(
  db: Db,
  id: string,
  deps: { removeFile?: (path: string) => Promise<void> } = {},
): Promise<void> {
  const [r] = await db.query<{ path: string }>(`delete from body_photos where id = $1 returning path`, [id])
  if (!r) return
  const removeFile = deps.removeFile ?? (async (p: string) => (await import('./photos')).deletePrivate(p))
  try {
    await removeFile(r.path)
  } catch (e) {
    console.error(e)
  }
}
