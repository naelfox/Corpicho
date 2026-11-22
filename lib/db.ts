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

/** Executa `fn` numa transação (o PGlite tem uma só conexão, então begin/commit via query é seguro). */
export async function withTx<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.query('begin')
  try {
    const r = await fn()
    await db.query('commit')
    return r
  } catch (e) {
    await db.query('rollback')
    throw e
  }
}
