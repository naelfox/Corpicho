/** Máscara DD/MM/AAAA: mantém só dígitos (até 8) e insere as barras. */
export function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/** "13/02/1998" → "1998-02-13"; '' se incompleta ou inexistente (ex.: 31/02). */
export function toIso(masked: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(masked)
  if (!m) return ''
  const iso = `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : ''
}

/** "1998-02-13" → "13/02/1998". */
export function fromIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
