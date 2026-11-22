import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { initDb, wrap } from '@/lib/db'

describe('initDb', () => {
  it('roda duas vezes sem erro e grava schema_version 0', async () => {
    const pg = new PGlite()
    await initDb(pg)
    await initDb(pg)
    expect(await wrap(pg).query(`select value from app_meta where key = 'schema_version'`)).toEqual([{ value: '0' }])
  })
})
