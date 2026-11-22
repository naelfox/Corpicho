import { MIGRATIONS, SCHEMA } from './schema'

export type Db = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>
}

/** O pedaço do PGlite que usamos (facilita testar e trocar a origem do banco). */
export type Pg = {
  exec(sql: string): Promise<unknown>
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

export function wrap(pg: Pg): Db {
  return {
    query: async <T,>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
  }
}

/** Cria o schema na primeira vez e roda as migrações pendentes. Pode rodar a cada abertura. */
export async function initDb(pg: Pg): Promise<void> {
  const [{ exists }] = (
    await pg.query<{ exists: boolean }>(`select to_regclass('public.profile') is not null as exists`)
  ).rows
  if (!exists) {
    await pg.exec(`begin; ${SCHEMA}; commit;`)
  }
  await pg.exec(`create table if not exists app_meta (key text primary key, value text not null)`)
  const rows = (await pg.query<{ value: string }>(`select value from app_meta where key = 'schema_version'`)).rows
  // Banco recém-criado já nasce com todas as migrações embutidas no SCHEMA.
  let version = rows.length ? Number(rows[0].value) : exists ? 0 : MIGRATIONS.length
  for (; version < MIGRATIONS.length; version++) {
    await pg.exec(`begin; ${MIGRATIONS[version]}; commit;`)
  }
  await pg.query(
    `insert into app_meta (key, value) values ('schema_version', $1)
     on conflict (key) do update set value = excluded.value`,
    [String(version)],
  )
}

const queues = new WeakMap<Db, Promise<unknown>>()

/**
 * Executa `fn` numa transação. Chamadas sobrepostas no mesmo banco são serializadas (uma só conexão).
 * Não aninhar: um withTx dentro de outro espera a fila do pai e trava (deadlock).
 */
export function withTx<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    await db.query('begin')
    try {
      const r = await fn()
      await db.query('commit')
      return r
    } catch (e) {
      try {
        await db.query('rollback')
      } catch {
        // mantém o erro original
      }
      throw e
    }
  }
  const prev = queues.get(db) ?? Promise.resolve()
  const next = prev.then(run, run)
  queues.set(db, next.catch(() => undefined))
  return next
}
