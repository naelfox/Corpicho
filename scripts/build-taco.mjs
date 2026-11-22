// Uso: node scripts/build-taco.mjs <food.csv> <nutrients.csv>
// CSVs da TACO 4ª ed. (NEPA/Unicamp), de github.com/raulfdm/taco-api/references/csv.
// Gera lib/taco.json = [{ name, kcal, protein, carbs, fat }] por 100 g.
import { readFileSync, writeFileSync } from 'node:fs'

function parseCsv(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  const [head, ...body] = rows
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])))
}

const num = (v) => {
  const n = Number(String(v).replace(',', '.'))
  return v === '' || !Number.isFinite(n) ? 0 : n
}

const [foodPath, nutPath] = process.argv.slice(2)
if (!foodPath || !nutPath) {
  console.error('uso: node scripts/build-taco.mjs <food.csv> <nutrients.csv>')
  process.exit(1)
}
const nutrients = new Map(parseCsv(readFileSync(nutPath, 'utf8')).map((r) => [r.foodId, r]))
const seen = new Set()
const out = []
for (const f of parseCsv(readFileSync(foodPath, 'utf8'))) {
  const n = nutrients.get(f.id)
  const name = f.name.trim()
  if (!n || !name || !num(n.kcal)) continue
  const key = name.toLowerCase()
  if (seen.has(key)) continue
  seen.add(key)
  out.push({ name, kcal: num(n.kcal), protein: num(n.protein), carbs: num(n.carbohydrates), fat: num(n.lipids) })
}
writeFileSync(new URL('../lib/taco.json', import.meta.url), JSON.stringify(out, null, 1) + '\n')
console.log(`${out.length} alimentos`)
