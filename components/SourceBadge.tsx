import type { CompSource } from '@/lib/body'

const TEXT: Record<CompSource, string> = { measured: 'medido', calculated: 'calculado', estimated: 'estimado' }
const COLOR: Record<CompSource, string> = {
  measured: 'var(--src-measured)',
  calculated: 'var(--src-calculated)',
  estimated: 'var(--src-estimated)',
}

/** Selo da origem de um valor de composição: medido / calculado / estimado. */
export function SourceBadge({ source }: { source: CompSource }) {
  const c = COLOR[source]
  return (
    <span
      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium"
      style={{ color: `color-mix(in oklab, ${c} 72%, var(--ink))`, backgroundColor: `color-mix(in oklab, ${c} 14%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: c, opacity: source === 'measured' ? 1 : 0.6 }} />
      {TEXT[source]}
    </span>
  )
}
