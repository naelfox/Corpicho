import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { Db } from '@/lib/db'
import { todayIn } from '@/lib/dates'
import { ageOn } from '@/lib/nutrition'
import { getGoal, getProfile } from '@/lib/profile'
import { getSeries } from '@/lib/series'
import {
  cleanMuscles, createPlan, getActivePlan, isKind, MUSCLE_IDS, trainingStats,
  type ExerciseKind, type NewPlanItem, type Plan, type TrainingStats,
} from '@/lib/training'
import { round1, ValidationError } from '@/lib/validate'
import { runAi, type RunAiOptions } from './client'

/** Plano sugerido pela IA, ainda não salvo: a tela mostra e o usuário aceita (createPlan origem 'ia'). */
export type PlanDraft = { name: string; notes: string; items: NewPlanItem[] }

const KINDS = ['musculacao', 'cardio', 'funcional', 'casa', 'mobilidade'] as const satisfies readonly ExerciseKind[]

// Campos opcionais como nullable: a saída estruturada da OpenAI exige todos os campos presentes.
const itemSchema = z.object({
  name: z.string(),
  description: z.string(),
  kind: z.enum(KINDS),
  muscles: z.array(z.string()),
  sets: z.number().nullable(),
  reps: z.number().nullable(),
  durationS: z.number().nullable(),
  restS: z.number().nullable(),
  loadKg: z.number().nullable(),
})
const schema = z.object({
  name: z.string(),
  notes: z.string(),
  days: z.array(z.object({ weekday: z.number(), items: z.array(itemSchema) })),
})

const INSTRUCTIONS = `Você monta a rotina semanal de treino de uma pessoa que quer emagrecer. Responda em português do Brasil.
Use apenas os dados enviados (perfil, meta, peso e histórico de treinos dos últimos 28 dias). Não invente dados.
Regras:
- Monte exatamente "diasPorSemana" dias, em dias da semana distintos (weekday: 0 = domingo, 1 = segunda … 6 = sábado), com descanso entre eles quando possível.
- Progressão segura para o nível de condicionamento e experiência. Iniciante: poucos exercícios, cargas leves, técnica primeiro.
- Respeite as restrições e lesões informadas: não inclua exercícios que sobrecarreguem a região lesionada; na dúvida, prefira baixo impacto.
- Use só os equipamentos disponíveis. Sem equipamento: peso do corpo, caminhada ou exercícios em casa.
- O tempo total de cada dia não pode passar de "minutosPorTreino". Estime: séries × (repetições × 3 s + descanso), ou a duração para exercícios por tempo.
- Caminhada e bicicleta (se houver) são boas opções de cardio.
- Se o histórico mostrar esforço alto (RPE médio ≥ 8) ou pouco descanso entre treinos, mantenha ou reduza o volume e a intensidade. Nunca aumente a intensidade por conta própria.
- Para cada exercício: name (nome comum em pt-BR); description (como executar em 1 a 3 frases, incluindo orientação de aquecimento quando for o primeiro do dia); kind (musculacao, cardio, funcional, casa ou mobilidade); muscles (somente ids desta lista: ${MUSCLE_IDS.join(', ')}); sets e reps OU durationS (segundos); restS (descanso em segundos); loadKg (carga sugerida em kg ou null para peso do corpo).
- name do plano curto; notes com 1 a 3 frases de orientação geral. Não faça afirmações médicas; lembre que o plano não substitui um profissional de educação física ou médico.`

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const clampInt = (v: unknown, min: number, max: number): number | undefined =>
  isNum(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined

/** Segundos estimados de um exercício: séries × (reps × 3 s + descanso), ou a duração (× séries, com descanso). */
export function estimateSeconds(i: { sets?: number; reps?: number; durationS?: number; restS?: number }): number {
  const rest = i.restS ?? 0
  if (i.durationS) return i.sets ? i.sets * (i.durationS + rest) : i.durationS
  const sets = i.sets ?? 1
  return sets * ((i.reps ?? 10) * 3 + rest)
}

type Limits = { daysPerWeek: number; minutesPerSession: number }

/** Limpa a resposta da IA e aplica as regras no código: dias ≤ diasPorSemana, limites de séries etc. e tempo do treino. */
export function normalizeWorkoutPlan(raw: unknown, limits: Limits): PlanDraft {
  const r = (raw ?? {}) as { name?: unknown; notes?: unknown; days?: unknown }
  const maxS = limits.minutesPerSession * 60
  const seen = new Set<number>()
  const items: NewPlanItem[] = []
  for (const d of Array.isArray(r.days) ? r.days : []) {
    if (seen.size >= limits.daysPerWeek) break
    const wd = (d as { weekday?: unknown })?.weekday
    if (!isNum(wd) || !Number.isInteger(wd) || wd < 0 || wd > 6 || seen.has(wd)) continue
    const dayItems: NewPlanItem[] = []
    const names = new Set<string>()
    for (const x of Array.isArray((d as { items?: unknown }).items) ? (d as { items: unknown[] }).items : []) {
      const it = (x ?? {}) as Record<string, unknown>
      const name = typeof it.name === 'string' ? it.name.trim().slice(0, 120) : ''
      if (!name || names.has(name.toLowerCase())) continue
      names.add(name.toLowerCase())
      const load = isNum(it.loadKg) && it.loadKg > 0 ? round1(Math.min(500, it.loadKg)) : undefined
      const durationS = clampInt(it.durationS, 0, 7200) || undefined
      const item: NewPlanItem = {
        weekday: wd,
        exercise: {
          name,
          description: typeof it.description === 'string' ? it.description.trim().slice(0, 1000) : '',
          kind: isKind(it.kind) ? it.kind : 'funcional',
          muscles: cleanMuscles(Array.isArray(it.muscles) ? it.muscles : []),
        },
        sets: clampInt(it.sets, 1, 10),
        reps: durationS ? undefined : clampInt(it.reps, 1, 50),
        durationS,
        restS: clampInt(it.restS, 0, 600),
        loadKg: load,
      }
      for (const k of ['sets', 'reps', 'durationS', 'restS', 'loadKg'] as const) if (item[k] === undefined) delete item[k]
      dayItems.push(item)
    }
    // Nunca passar do tempo do treino: corta do fim; se um só já passa, encurta a duração dele.
    while (dayItems.length > 1 && dayItems.reduce((s, i) => s + estimateSeconds(i), 0) > maxS) dayItems.pop()
    const only = dayItems[0]
    if (dayItems.length === 1 && only.durationS && estimateSeconds(only) > maxS) {
      const sets = only.sets ?? 1
      only.durationS = Math.max(1, Math.floor(only.sets ? maxS / sets - (only.restS ?? 0) : maxS))
    }
    if (!dayItems.length) continue
    seen.add(wd)
    items.push(...dayItems)
  }
  return {
    name: (typeof r.name === 'string' && r.name.trim().slice(0, 120)) || 'Plano da IA',
    notes: typeof r.notes === 'string' ? r.notes.trim().slice(0, 2000) : '',
    items,
  }
}

/** Pede à IA um plano semanal a partir do perfil, da meta e dos treinos dos últimos 28 dias. Não salva nada. */
export async function generatePlan(db: Db, deps?: RunAiOptions<unknown>['deps']): Promise<PlanDraft> {
  const now = deps?.now ?? new Date()
  const profile = await getProfile(db)
  if (!profile) throw new ValidationError('Complete seu perfil para gerar o plano.')
  const [goal, weight, stats] = await Promise.all([getGoal(db), getSeries(db, 'peso', 'tudo', now), trainingStats(db, 28, now)])
  const context = {
    perfil: {
      idade: ageOn(profile.birthDate, todayIn(now)),
      sexo: profile.sex === 'm' ? 'masculino' : 'feminino',
      alturaCm: profile.heightCm,
      pesoAtualKg: weight.last,
      condicionamento: profile.fitness,
      experiencia: profile.experience,
      diasPorSemana: profile.daysPerWeek,
      minutosPorTreino: profile.minutesPerSession,
      equipamentos: profile.equipment.length ? profile.equipment : ['Nenhum'],
      restricoesELesoes: profile.restrictions.trim() || 'nenhuma informada',
    },
    meta: goal ? { objetivo: 'emagrecer', pesoInicialKg: goal.startWeightKg, pesoAlvoKg: goal.targetWeightKg } : { objetivo: 'emagrecer' },
    treinosUltimos28Dias: stats,
  }
  const raw = await runAi(db, {
    feature: 'workout_plan',
    kind: 'text',
    deps,
    call: async (model: LanguageModel, signal: AbortSignal) => {
      const r = await generateText({
        model,
        instructions: INSTRUCTIONS,
        prompt: `Dados da pessoa (JSON):\n${JSON.stringify(context)}`,
        output: Output.object({ schema }),
        maxRetries: 1,
        abortSignal: signal,
      })
      return { value: r.output, usage: r.usage }
    },
  })
  return normalizeWorkoutPlan(raw, profile)
}

// ── Ajustes progressivos sugeridos pela IA ──────────────────────────────────

export const ADJUST_FIELDS = ['sets', 'reps', 'loadKg', 'durationS', 'restS'] as const
export type AdjustField = (typeof ADJUST_FIELDS)[number]
export type Adjustment = { planItemId: string; field: AdjustField; from: number; to: number; reason: string }
export type AdjustmentSuggestion = { summary: string; changes: Adjustment[] }

const adjustSchema = z.object({
  summary: z.string(),
  changes: z.array(z.object({
    planItemId: z.string(),
    field: z.string(), // campos desconhecidos são descartados pelo código, não derrubam a resposta
    from: z.number(),
    to: z.number(),
    reason: z.string(),
  })),
})

const ADJUST_INSTRUCTIONS = `Você sugere ajustes progressivos pequenos na rotina de treino de uma pessoa que quer emagrecer. Responda em português do Brasil.
Use apenas os dados enviados (itens do plano ativo com seus ids, resumo dos últimos 28 dias, restrições). Não invente dados.
Regras de segurança (também verificadas pelo aplicativo; sugestões fora delas são descartadas):
- Nunca aumente a intensidade sem considerar segurança e recuperação. Sugira só o que o histórico sustenta; é melhor sugerir poucos ajustes ou nenhum.
- Aumento de no máximo 10% por item e por campo (carga em kg, repetições, duração). Séries só aumentam em planos com 10 séries ou mais (na prática, não aumente séries).
- Não aumente nada em exercício com RPE médio ≥ 8, com menos de 2 sessões registradas nos últimos 28 dias, ou quando o descanso médio entre treinos (restDaysAvg) for menor que 1 dia. Nesses casos, só reduza (carga, repetições, séries) ou mantenha.
- Mais descanso entre séries (restS) é sempre seguro; reduzir descanso é aumento de intensidade (no máximo 10%, e sujeito às mesmas travas).
- Respeite as restrições e lesões informadas.
- Cada mudança: planItemId (exatamente um id enviado), field (sets, reps, loadKg, durationS ou restS), from (valor atual exato enviado), to (novo valor), reason (1 frase em pt-BR com o motivo, baseada nos dados).
- summary: 1 a 3 frases sobre o que foi observado. Se nada deve mudar, devolva changes vazio e explique no summary.
- Não faça afirmações médicas; as sugestões não substituem um profissional de educação física ou médico.`

const sameNum = (a: number, b: number) => Math.abs(a - b) < 1e-6
const cur = (it: Plan['items'][number], f: AdjustField): number | null => it[f]

/** Maior valor permitido ao aumentar `field` a partir de `from` (≤ 10 %). */
function maxIncrease(field: AdjustField, from: number): number {
  switch (field) {
    case 'loadKg': return Math.floor(from * 1.1 * 2 + 1e-9) / 2
    case 'sets': return from >= 10 ? from + 1 : from
    case 'reps': return from + Math.max(1, Math.floor(from * 0.1))
    case 'durationS': return Math.floor(from * 1.1 + 1e-9)
    case 'restS': return Infinity
  }
}

const BOUNDS: Record<AdjustField, [number, number, boolean]> = {
  sets: [1, 10, true], reps: [1, 50, true], loadKg: [0, 500, false], durationS: [1, 7200, true], restS: [0, 600, true],
}

/**
 * Regras de segurança no código: mantém só as mudanças válidas (id e campo existentes, `from` igual ao valor atual,
 * limites, aumento ≤ 10 %, sem aumento com RPE médio ≥ 8, < 2 sessões ou pouco descanso). Descarta, não corrige.
 */
export function validateAdjustments(plan: Plan, stats: TrainingStats, raw: unknown): Adjustment[] {
  const items = new Map(plan.items.map((i) => [i.id, i]))
  const byName = new Map(stats.byExercise.map((e) => [e.name.toLowerCase(), e]))
  const lowRest = stats.restDaysAvg !== null && stats.restDaysAvg < 1
  const seen = new Set<string>()
  const out: Adjustment[] = []
  for (const x of Array.isArray(raw) ? raw : []) {
    const c = (x ?? {}) as Record<string, unknown>
    const item = typeof c.planItemId === 'string' ? items.get(c.planItemId) : undefined
    const field = c.field as AdjustField
    if (!item || !ADJUST_FIELDS.includes(field)) continue
    const { from, to } = c
    if (!isNum(from) || !isNum(to)) continue
    const current = cur(item, field)
    if (current === null || !sameNum(current, from) || sameNum(from, to)) continue
    const [min, max, int] = BOUNDS[field]
    if (to < min || to > max || (int && !Number.isInteger(to))) continue
    if (field === 'loadKg' && !sameNum(to * 2, Math.round(to * 2))) continue
    const key = `${item.id}:${field}`
    if (seen.has(key)) continue
    const st = byName.get(item.exercise.name.toLowerCase())
    const blocked = lowRest || (st?.sessions ?? 0) < 2 || (st?.avgRpe ?? 0) >= 8
    if (field === 'restS') {
      if (to < from && (blocked || to < Math.ceil(from * 0.9))) continue
    } else if (to > from && (blocked || to > maxIncrease(field, from))) continue
    seen.add(key)
    out.push({
      planItemId: item.id, field, from, to,
      reason: typeof c.reason === 'string' ? c.reason.trim().slice(0, 300) : '',
    })
  }
  return out
}

/** Pede à IA ajustes pequenos no plano ativo, com base nos últimos 28 dias. Não salva nada. */
export async function suggestAdjustments(db: Db, deps?: RunAiOptions<unknown>['deps']): Promise<AdjustmentSuggestion> {
  const now = deps?.now ?? new Date()
  const plan = await getActivePlan(db)
  if (!plan) throw new ValidationError('Crie um plano primeiro')
  const [profile, stats] = await Promise.all([getProfile(db), trainingStats(db, 28, now)])
  const context = {
    restricoesELesoes: profile?.restrictions.trim() || 'nenhuma informada',
    planoAtivo: plan.items.map((i) => ({
      planItemId: i.id, diaDaSemana: i.weekday, exercicio: i.exercise.name,
      sets: i.sets, reps: i.reps, loadKg: i.loadKg, durationS: i.durationS, restS: i.restS,
    })),
    treinosUltimos28Dias: stats,
  }
  const raw = await runAi(db, {
    feature: 'workout_adjust',
    kind: 'text',
    deps,
    call: async (model: LanguageModel, signal: AbortSignal) => {
      const r = await generateText({
        model,
        instructions: ADJUST_INSTRUCTIONS,
        prompt: `Dados (JSON):\n${JSON.stringify(context)}`,
        output: Output.object({ schema: adjustSchema }),
        maxRetries: 1,
        abortSignal: signal,
      })
      return { value: r.output, usage: r.usage }
    },
  })
  return {
    summary: typeof raw?.summary === 'string' ? raw.summary.trim().slice(0, 1000) : '',
    changes: validateAdjustments(plan, stats, raw?.changes),
  }
}

const ddmm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`

/** Aplica as mudanças aceitas (revalidadas contra o plano atual) como uma nova versão do plano. Devolve o id novo. */
export async function applyAdjustments(db: Db, changes: Adjustment[], now: Date = new Date()): Promise<string> {
  const plan = await getActivePlan(db)
  if (!plan) throw new ValidationError('Crie um plano primeiro')
  const valid = validateAdjustments(plan, await trainingStats(db, 28, now), changes)
  if (!valid.length) throw new ValidationError('Nenhum ajuste válido para aplicar.')
  const items: NewPlanItem[] = plan.items.map((i) => {
    const it: NewPlanItem = {
      weekday: i.weekday,
      exercise: { name: i.exercise.name, description: i.exercise.description, kind: i.exercise.kind, muscles: i.exercise.muscles },
    }
    for (const f of ADJUST_FIELDS) {
      const ch = valid.find((c) => c.planItemId === i.id && c.field === f)
      const v = ch ? ch.to : i[f]
      if (v !== null) it[f] = v
    }
    return it
  })
  const base = plan.name.replace(/ \(ajustado \d{2}\/\d{2}\)$/, '').slice(0, 100)
  return createPlan(db, {
    name: `${base} (ajustado ${ddmm(todayIn(now))})`,
    origin: plan.origin,
    notes: plan.notes ?? undefined,
    items,
  })
}
