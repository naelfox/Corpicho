import { describe, expect, it } from 'vitest'
import { createTestDb } from '@/test/db'
import { ValidationError } from '@/lib/validate'
import { ANGLES, addBodyPhoto, deleteBodyPhoto, getBodyPhotos, photoSessions } from '@/lib/bodyPhotos'

const d = (s: string) => new Date(s)

describe('fotos do corpo', () => {
  it('ângulos na ordem frente, lado, costas', () => {
    expect(ANGLES.map((a) => a.id)).toEqual(['frente', 'lado', 'costas'])
  })

  it('photoSessions agrupa os 3 ângulos do mesmo dia (fuso de São Paulo), mais recente primeiro', async () => {
    const db = await createTestDb()
    const f = await addBodyPhoto(db, { angle: 'frente', path: 'body/f.jpg', at: d('2026-11-10T12:00:00Z') })
    const l = await addBodyPhoto(db, { angle: 'lado', path: 'body/l.jpg', at: d('2026-11-10T12:01:00Z') })
    // 01:00 UTC do dia 11 ainda é dia 10 em São Paulo
    const c = await addBodyPhoto(db, { angle: 'costas', path: 'body/c.jpg', at: d('2026-11-11T01:00:00Z') })
    const n = await addBodyPhoto(db, { angle: 'frente', path: 'body/n.jpg', at: d('2026-11-20T12:00:00Z') })

    const s = await photoSessions(db)
    expect(s.map((x) => x.day)).toEqual(['2026-11-20', '2026-11-10'])
    expect(s[1].photos).toEqual({
      frente: { id: f, path: 'body/f.jpg' },
      lado: { id: l, path: 'body/l.jpg' },
      costas: { id: c, path: 'body/c.jpg' },
    })
    expect(s[0].photos.frente).toEqual({ id: n, path: 'body/n.jpg' })
    expect(s[0].photos.lado).toBeUndefined()
    expect(s[0].photos.costas).toBeUndefined()
  })

  it('mesmo ângulo duas vezes no dia: a sessão mostra a mais recente', async () => {
    const db = await createTestDb()
    await addBodyPhoto(db, { angle: 'frente', path: 'body/a.jpg', at: d('2026-11-10T12:00:00Z') })
    const b = await addBodyPhoto(db, { angle: 'frente', path: 'body/b.jpg', at: d('2026-11-10T13:00:00Z') })
    const s = await photoSessions(db)
    expect(s).toHaveLength(1)
    expect(s[0].photos.frente).toEqual({ id: b, path: 'body/b.jpg' })
  })

  it('ângulo inválido e path vazio são recusados', async () => {
    const db = await createTestDb()
    await expect(addBodyPhoto(db, { angle: 'cima' as never, path: 'body/x.jpg' })).rejects.toThrow(ValidationError)
    await expect(addBodyPhoto(db, { angle: 'frente', path: '' })).rejects.toThrow(ValidationError)
  })

  it('getBodyPhotos devolve dia, ângulo e path dos ids pedidos', async () => {
    const db = await createTestDb()
    const f = await addBodyPhoto(db, { angle: 'frente', path: 'body/f.jpg', at: d('2026-11-10T12:00:00Z') })
    expect(await getBodyPhotos(db, [f])).toEqual([{ id: f, angle: 'frente', path: 'body/f.jpg', day: '2026-11-10' }])
    expect(await getBodyPhotos(db, [])).toEqual([])
  })

  it('deleteBodyPhoto apaga o registro e o arquivo', async () => {
    const db = await createTestDb()
    const id = await addBodyPhoto(db, { angle: 'lado', path: 'body/l.jpg' })
    const removed: string[] = []
    await deleteBodyPhoto(db, id, { removeFile: async (p) => void removed.push(p) })
    expect(removed).toEqual(['body/l.jpg'])
    expect(await photoSessions(db)).toEqual([])
  })

  it('deleteBodyPhoto apaga o registro mesmo se o arquivo já não existir', async () => {
    const db = await createTestDb()
    const id = await addBodyPhoto(db, { angle: 'lado', path: 'body/l.jpg' })
    await deleteBodyPhoto(db, id, {
      removeFile: async () => {
        throw new Error('File does not exist')
      },
    })
    expect(await photoSessions(db)).toEqual([])
  })
})
