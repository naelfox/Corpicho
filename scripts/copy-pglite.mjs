// Copia os binários do PGlite para public/pglite, de onde o app os carrega (sem depender do bundler).
import { copyFileSync, mkdirSync } from 'node:fs'
const src = 'node_modules/@electric-sql/pglite/dist'
mkdirSync('public/pglite', { recursive: true })
for (const f of ['pglite.wasm', 'initdb.wasm', 'pglite.data']) copyFileSync(`${src}/${f}`, `public/pglite/${f}`)
