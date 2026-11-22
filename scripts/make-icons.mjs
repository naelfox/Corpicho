// Gera o ícone do app (web + Android) e a tela de abertura do Android a partir de um único desenho.
// Rodar de novo depois de mudar o desenho: node scripts/make-icons.mjs
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const ACCENT = '#16a36a'
const CREAM = '#fbf7ee'

/**
 * O desenho: uma figura arredondada (cabeça + ombros) com um coração no peito e um broto de duas folhas na cabeça.
 * Coordenadas num quadrado de 512, centrado; `scale` encolhe em volta do centro.
 */
function glyph(scale = 1) {
  return `<g transform="translate(256 256) scale(${scale}) translate(-256 -252)">
    <path d="M256 140 L256 112" stroke="${CREAM}" stroke-width="14" stroke-linecap="round"/>
    <path d="M258 116 C258 78 286 56 330 54 C330 94 302 116 258 116 Z" fill="${CREAM}"/>
    <path d="M254 120 C254 94 236 80 204 78 C204 106 222 120 254 120 Z" fill="${CREAM}"/>
    <circle cx="256" cy="194" r="60" fill="${CREAM}"/>
    <path d="M138 410 C138 316 186 276 256 276 C326 276 374 316 374 410 Q374 428 356 428 L156 428 Q138 428 138 410 Z" fill="${CREAM}"/>
    <path d="M256 398 C224 376 204 358 204 336 C204 320 216 310 230 310 C241 310 250 316 256 326 C262 316 271 310 282 310 C296 310 308 320 308 336 C308 358 288 376 256 398 Z" fill="${ACCENT}"/>
  </g>`
}

const svg = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}</svg>`)

const square = svg(`<rect width="512" height="512" fill="${ACCENT}"/>${glyph()}`)
const rounded = svg(`<rect width="512" height="512" rx="112" fill="${ACCENT}"/>${glyph()}`)
const round = svg(`<circle cx="256" cy="256" r="256" fill="${ACCENT}"/>${glyph(0.92)}`)
// Ícone adaptativo do Android: só o desenho (dentro da zona segura de 66%), o fundo vem da cor ic_launcher_background.
const foreground = svg(glyph(0.68))
// Tela de abertura: só o desenho, sobre o verde.
const mark = svg(glyph())

async function png(input, size, out) {
  mkdirSync(dirname(out), { recursive: true })
  await sharp(input, { density: 512 }).resize(size, size).png().toFile(out)
}

const RES = 'android/app/src/main/res'
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

await png(square, 192, 'public/icon-192.png')
await png(square, 512, 'public/icon-512.png')
await png(rounded, 64, 'app/icon.png')
await png(square, 180, 'app/apple-icon.png')

for (const [d, k] of Object.entries(DENSITIES)) {
  await png(rounded, 48 * k, `${RES}/mipmap-${d}/ic_launcher.png`)
  await png(round, 48 * k, `${RES}/mipmap-${d}/ic_launcher_round.png`)
  await png(foreground, 108 * k, `${RES}/mipmap-${d}/ic_launcher_foreground.png`)
}

writeFileSync(
  `${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${ACCENT.toUpperCase()}</color>\n</resources>\n`,
)

// Tela de abertura: fundo verde com o desenho no meio (mesmos tamanhos que o Capacitor gerou).
const SPLASH = {
  drawable: [480, 320],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
}
for (const [dir, [w, h]] of Object.entries(SPLASH)) {
  const size = Math.round(Math.min(w, h) * 0.5)
  const icon = await sharp(mark, { density: 512 }).resize(size, size).png().toBuffer()
  await sharp({ create: { width: w, height: h, channels: 4, background: ACCENT } })
    .composite([{ input: icon, gravity: 'center' }])
    .png()
    .toFile(`${RES}/${dir}/splash.png`)
}

console.log('ícones e splash gerados')
