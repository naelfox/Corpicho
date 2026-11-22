export type Day = string

export const TZ = 'America/Sao_Paulo'

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function todayIn(now: Date = new Date()): Day {
  return fmt.format(now)
}

function parse(day: Day): Date {
  return new Date(`${day}T00:00:00Z`)
}

export function addDays(day: Day, n: number): Day {
  const d = parse(day)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function weekdayOf(day: Day): number {
  return parse(day).getUTCDay()
}
