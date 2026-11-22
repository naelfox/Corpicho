import { describe, expect, it } from 'vitest'
import { createTestDb } from '@/test/db'
import { ValidationError } from '@/lib/validate'
import { ANGLES, addBodyPhoto, deleteBodyPhoto, getBodyPhotos, photoSessions, storeBodyPhoto, type StoreDeps } from '@/lib/bodyPhotos'

const d = (s: string) => new Date(s)

describe('fotos do corpo', () => {
  it('ângulos na ordem frente, lado, costas', () => {
    expect(ANGLES.map((a) => a.id)).toEqual(['frente', 'lado', 'costas'])
  })

  it('photoSessions agrupa os 3 ângulos do mesmo dia (fuso de São Paulo), mais recente primeiro', async () => {
    const db = await createTestDb()
    const f = await addBodyPhoto(db, { angle: 'frente', path: 'body/f.jpg', thumbPath: 'body/f-t.jpg', at: d('2026-11-10T12:00:00Z') })
    const l = await addBodyPhoto(db, { angle: 'lado', path: 'body/l.jpg', at: d('2026-11-10T12:01:00Z') })
    // 01:00 UTC do dia 11 ainda é dia 10 em São Paulo
    const c = await addBodyPhoto(db, { angle: 'costas', path: 'body/c.jpg', at: d('2026-11-11T01:00:00Z') })
    const n = await addBodyPhoto(db, { angle: 'frente', path: 'body/n.jpg', at: d('2026-11-20T12:00:00Z') })

    const s = await photoSessions(db)
    expect(s.map((x) => x.day)).toEqual(['2026-11-20', '2026-11-10'])
    expect(s[1].photos).toEqual({
      frente: { id: f, path: 'body/f.jpg', thumbPath: 'body/f-t.jpg' },
      lado: { id: l, path: 'body/l.jpg', thumbPath: null },
      costas: { id: c, path: 'body/c.jpg', thumbPath: null },
    })
    expect(s[0].photos.frente).toEqual({ id: n, path: 'body/n.jpg', thumbPath: null })
    expect(s[0].photos.lado).toBeUndefined()
    expect(s[0].photos.costas).toBeUndefined()
  })

  it('mesmo ângulo duas vezes no dia: a sessão mostra a mais recente', async () => {
    const db = await createTestDb()
    await addBodyPhoto(db, { angle: 'frente', path: 'body/a.jpg', at: d('2026-11-10T12:00:00Z') })
    const b = await addBodyPhoto(db, { angle: 'frente', path: 'body/b.jpg', at: d('2026-11-10T13:00:00Z') })
    const s = await photoSessions(db)
    expect(s).toHaveLength(1)
    expect(s[0].photos.frente).toEqual({ id: b, path: 'body/b.jpg', thumbPath: null })
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

  it('deleteBodyPhoto apaga o registro, a foto e a miniatura', async () => {
    const db = await createTestDb()
    const id = await addBodyPhoto(db, { angle: 'lado', path: 'body/l.jpg', thumbPath: 'body/l-t.jpg' })
    const removed: string[] = []
    const r = await deleteBodyPhoto(db, id, { removeFile: async (p) => void removed.push(p) })
    expect(r).toEqual({ fileRemoved: true })
    expect(removed).toEqual(['body/l.jpg', 'body/l-t.jpg'])
    expect(await photoSessions(db)).toEqual([])
  })

  it('deleteBodyPhoto avisa quando o arquivo não pôde ser apagado (erro real)', async () => {
    const db = await createTestDb()
    const id = await addBodyPhoto(db, { angle: 'lado', path: 'body/l.jpg', thumbPath: 'body/l-t.jpg' })
    const r = await deleteBodyPhoto(db, id, {
      removeFile: async () => {
        throw new Error('Permission denied')
      },
    })
    expect(r).toEqual({ fileRemoved: false })
    expect(await photoSessions(db)).toEqual([])
  })

  it('deleteBodyPhoto apaga o registro mesmo se o arquivo já não existir', async () => {
    const db = await createTestDb()
    const id = await addBodyPhoto(db, { angle: 'lado', path: 'body/l.jpg' })
    const r = await deleteBodyPhoto(db, id, {
      removeFile: async () => {
        throw new Error('File does not exist')
      },
    })
    expect(r).toEqual({ fileRemoved: true })
    expect(await photoSessions(db)).toEqual([])
  })

  describe('storeBodyPhoto', () => {
    const fakeDeps = (opts: { failThumb?: boolean; failSave?: boolean } = {}) => {
      const files = new Set<string>()
      let n = 0
      const deps: StoreDeps = {
        resize: async (d, max, q) => `${d}@${max}/${q}`,
        save: async (d) => {
          if (opts.failSave || (opts.failThumb && d.includes('@320'))) throw new Error('disco cheio')
          const p = `body/${++n}${d.includes('@320') ? '-t' : ''}.jpg`
          files.add(p)
          return p
        },
        remove: async (p) => void files.delete(p),
      }
      return { deps, files }
    }

    it('guarda foto (1600/0.85) e miniatura (320/0.7)', async () => {
      const db = await createTestDb()
      const { deps, files } = fakeDeps()
      await storeBodyPhoto(db, { angle: 'frente', original: 'img' }, deps)
      expect([...files]).toEqual(['body/1.jpg', 'body/2-t.jpg'])
      expect((await photoSessions(db))[0].photos.frente).toMatchObject({ path: 'body/1.jpg', thumbPath: 'body/2-t.jpg' })
    })

    it('falha da miniatura não perde a foto: thumbPath fica null', async () => {
      const db = await createTestDb()
      const { deps, files } = fakeDeps({ failThumb: true })
      const id = await storeBodyPhoto(db, { angle: 'lado', original: 'img' }, deps)
      expect(id).toBeTruthy()
      expect([...files]).toEqual(['body/1.jpg'])
      expect((await photoSessions(db))[0].photos.lado).toEqual({ id, path: 'body/1.jpg', thumbPath: null })
    })

    it('falha ao registrar no banco apaga os arquivos gravados', async () => {
      const db = await createTestDb()
      const { deps, files } = fakeDeps()
      await expect(storeBodyPhoto(db, { angle: 'cima' as never, original: 'img' }, deps)).rejects.toThrow(ValidationError)
      expect(files.size).toBe(0)
    })

    it('falha ao guardar a foto relança e não registra nada', async () => {
      const db = await createTestDb()
      const { deps } = fakeDeps({ failSave: true })
      await expect(storeBodyPhoto(db, { angle: 'frente', original: 'img' }, deps)).rejects.toThrow('disco cheio')
      expect(await photoSessions(db)).toEqual([])
    })
  })
})
