'use client'

import { initDb, wrap, type Db } from './db'
import { seedTaco } from './foods'

/**
 * O banco do app: PGlite (Postgres em WebAssembly) guardado no IndexedDB do WebView.
 * Os dados ficam só no aparelho e somem se o app for desinstalado ou os dados limpos.
 */
let ready: Promise<Db> | null = null

export function getDb(): Promise<Db> {
  ready ??= open().catch((e) => {
    ready = null
    throw e
  })
  return ready
}

async function open(): Promise<Db> {
  const [{ PGlite }, pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([
    import('@electric-sql/pglite'),
    compile('/pglite/pglite.wasm'),
    compile('/pglite/initdb.wasm'),
    fetch('/pglite/pglite.data').then((r) => r.blob()),
  ])
  const pg = await PGlite.create('idb://corpicho', {
    pgliteWasmModule,
    initdbWasmModule,
    fsBundle,
  })
  await initDb(pg)
  const db = wrap(pg)
  await seedTaco(db)
  return db
}

// arrayBuffer + compile em vez de compileStreaming: o servidor local do Capacitor
// nem sempre manda o tipo application/wasm.
async function compile(url: string) {
  return WebAssembly.compile(await (await fetch(url)).arrayBuffer())
}
