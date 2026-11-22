import { PGlite } from '@electric-sql/pglite'
import { initDb, wrap, type Db } from '@/lib/db'

export async function createTestDb(): Promise<Db> {
  const pg = new PGlite()
  await initDb(pg)
  return wrap(pg)
}
