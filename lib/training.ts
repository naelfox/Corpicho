import type { Db } from './db'
import { withTx } from './db'
import { addDays, todayIn, type Day } from './dates'
import { round1, ValidationError } from './validate'

/** Ids dos músculos que a silhueta destaca (pt-BR, sem acento). A IA e o editor só usam estes. */
export const MUSCLE_IDS = [
  'peitoral', 'ombros', 'biceps', 'triceps', 'antebraco', 'abdomen', 'obliquos',
  'costas', 'lombar', 'gluteos', 'quadriceps', 'posteriores', 'panturrilhas', 'trapezio',
] as const
export type Muscle = (typeof MUSCLE_IDS)[number]

export type ExerciseKind = 'musculacao' | 'cardio' | 'funcional' | 'casa' | 'mobilidade'
export const EXERCISE_KINDS: { id: ExerciseKind; label: string }[] = [
  { id: 'musculacao', label: 'Musculação' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'funcional', label: 'Funcional' },
  { id: 'casa', label: 'Em casa' },
  { id: 'mobilidade', label: 'Mobilidade' },
]
const KIND_IDS = new Set<string>(EXERCISE_KINDS.map((k) => k.id))
export const isKind = (k: unknown): k is ExerciseKind => typeof k === 'string' && KIND_IDS.has(k)

export type NewExercise = { name: string; description: string; kind: ExerciseKind; muscles: string[]; demoUrl?: string }
export type NewPlanItem = {
  weekday: number
  exercise: NewExercise
  sets?: number
  reps?: number
  durationS?: number
  restS?: number
  loadKg?: number
}
export type PlanInput = { name: string; origin: 'ia' | 'manual'; notes?: string; items: NewPlanItem[] }

export type Exercise = { id: string; name: string; description: string; kind: ExerciseKind; muscles: Muscle[]; demoUrl: string }
export type PlanItem = {
  id: string
  weekday: number
  position: number
  exercise: Exercise
  sets: number | null
  reps: number | null
  durationS: number | null
  restS: number | null
  loadKg: number | null
}
export type Plan = { id: string; name: string; origin: 'ia' | 'manual'; notes: string | null; createdAt: string; items: PlanItem[] }

/** Busca de vídeo da execução (abre no navegador do sistema). */
export function demoUrl(name: string): string {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(name + ' execução')
}

const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
const MUSCLE_ALIAS: Record<string, Muscle> = {
  'posteriores de coxa': 'posteriores', posterior: 'posteriores', 'posterior de coxa': 'posteriores',
  panturrilha: 'panturrilhas', gluteo: 'gluteos', ombro: 'ombros', obliquo: 'obliquos', abdominal: 'abdomen', abdominais: 'abdomen',
}
const MUSCLE_SET = new Set<string>(MUSCLE_IDS)

/** Só músculos conhecidos (aceita o id ou o nome em pt-BR), sem repetir, na ordem dada. */
export function cleanMuscles(list: readonly unknown[]): Muscle[] {
  const out: Muscle[] = []
  for (const m of list) {
    if (typeof m !== 'string') continue
    const f = fold(m)
    const id = (MUSCLE_SET.has(f) ? f : MUSCLE_ALIAS[f]) as Muscle | undefined
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

function optInt(v: number | undefined, min: number, max: number, label: string): number | null {
  if (v === undefined || v === null) return null
  if (!Number.isInteger(v) || v < min || v > max) {
    throw new ValidationError(`${label}: informe um número inteiro entre ${min} e ${max}.`)
  }
  return v
}

function checkItem(it: NewPlanItem) {
  if (!Number.isInteger(it.weekday) || it.weekday < 0 || it.weekday > 6) throw new ValidationError('Dia da semana inválido.')
  const name = it.exercise.name.trim()
  if (!name || name.length > 120) throw new ValidationError('Exercício: informe um nome (até 120 letras).')
  if (!isKind(it.exercise.kind)) throw new ValidationError('Tipo de exercício inválido.')
  const load = it.loadKg ?? null
  if (load !== null && (!Number.isFinite(load) || load < 0 || load > 500)) {
    throw new ValidationError('Carga: informe um valor entre 0 e 500 kg.')
  }
  return {
    name,
    description: it.exercise.description.trim().slice(0, 2000),
    kind: it.exercise.kind,
    muscles: cleanMuscles(it.exercise.muscles),
    demoUrl: it.exercise.demoUrl?.trim() || null,
    weekday: it.weekday,
    sets: optInt(it.sets, 1, 10, 'Séries'),
    reps: optInt(it.reps, 1, 50, 'Repetições'),
    durationS: optInt(it.durationS, 1, 7200, 'Duração'),
    restS: optInt(it.restS, 0, 600, 'Descanso'),
    loadKg: load === null ? null : round1(load),
  }
}

/**
 * Exercício com o mesmo nome (sem diferenciar maiúsculas) ou um novo. Com `update`, a descrição, o tipo e os
 * músculos informados substituem os antigos (vazios não apagam). Chamar dentro de uma transação.
 */
async function exerciseId(
  db: Db,
  ex: { name: string; description: string; kind: ExerciseKind; muscles: Muscle[]; demoUrl: string | null },
  update: boolean,
): Promise<string> {
  const [found] = await db.query<{ id: string }>(
    `select id from exercises where lower(name) = lower($1) order by created_at limit 1`,
    [ex.name],
  )
  if (found) {
    if (update) {
      await db.query(
        `update exercises set
           description = coalesce(nullif($2, ''), description),
           kind = $3,
           muscles = case when cardinality($4::text[]) > 0 then $4::text[] else muscles end,
           demo_url = coalesce($5, demo_url)
         where id = $1`,
        [found.id, ex.description, ex.kind, ex.muscles, ex.demoUrl],
      )
    }
    return found.id
  }
  const [r] = await db.query<{ id: string }>(
    `insert into exercises (name, description, kind, muscles, demo_url) values ($1, $2, $3, $4, $5) returning id`,
    [ex.name, ex.description || null, ex.kind, ex.muscles, ex.demoUrl],
  )
  return r.id
}

/** Cria o plano e o deixa ativo (o anterior fica no histórico, inativo). Devolve o id. */
export async function createPlan(db: Db, input: PlanInput): Promise<string> {
  const name = input.name.trim()
  if (!name || name.length > 120) throw new ValidationError('Plano: informe um nome (até 120 letras).')
  if (input.origin !== 'ia' && input.origin !== 'manual') throw new ValidationError('Origem do plano inválida.')
  if (!input.items.length) throw new ValidationError('Plano: adicione pelo menos um exercício.')
  const items = input.items.map(checkItem)
  return withTx(db, async () => {
    await db.query(`update workout_plans set active = false where active`)
    const [plan] = await db.query<{ id: string }>(
      `insert into workout_plans (name, origin, active, notes) values ($1, $2, true, $3) returning id`,
      [name, input.origin, input.notes?.trim() || null],
    )
    const pos = new Map<number, number>()
    for (const it of items) {
      const exId = await exerciseId(db, it, true)
      const p = pos.get(it.weekday) ?? 0
      pos.set(it.weekday, p + 1)
      await db.query(
        `insert into plan_items (plan_id, weekday, exercise_id, position, sets, reps, duration_s, rest_s, load_kg)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [plan.id, it.weekday, exId, p, it.sets, it.reps, it.durationS, it.restS, it.loadKg],
      )
    }
    return plan.id
  })
}

type ItemRow = {
  id: string; weekday: number; position: number; sets: number | null; reps: number | null; duration_s: number | null
  rest_s: number | null; load_kg: string | number | null; ex_id: string; name: string; description: string | null
  kind: ExerciseKind; muscles: string[]; demo_url: string | null
}

const toItem = (r: ItemRow): PlanItem => ({
  id: r.id,
  weekday: r.weekday,
  position: r.position,
  sets: r.sets,
  reps: r.reps,
  durationS: r.duration_s,
  restS: r.rest_s,
  loadKg: r.load_kg === null ? null : Number(r.load_kg),
  exercise: {
    id: r.ex_id,
    name: r.name,
    description: r.description ?? '',
    kind: r.kind,
    muscles: cleanMuscles(r.muscles),
    demoUrl: r.demo_url || demoUrl(r.name),
  },
})

async function planItems(db: Db, planId: string, weekday?: number): Promise<PlanItem[]> {
  const rows = await db.query<ItemRow>(
    `select pi.id, pi.weekday, pi.position, pi.sets, pi.reps, pi.duration_s, pi.rest_s, pi.load_kg,
            e.id as ex_id, e.name, e.description, e.kind, e.muscles, e.demo_url
     from plan_items pi join exercises e on e.id = pi.exercise_id
     where pi.plan_id = $1 and ($2::int is null or pi.weekday = $2)
     order by pi.weekday, pi.position, pi.created_at`,
    [planId, weekday ?? null],
  )
  return rows.map(toItem)
}

/** O plano ativo com todos os itens (por dia da semana e posição), ou null. */
export async function getActivePlan(db: Db): Promise<Plan | null> {
  const [p] = await db.query<{ id: string; name: string; origin: 'ia' | 'manual'; notes: string | null; created_at: string | Date }>(
    `select id, name, origin, notes, created_at from workout_plans where active order by created_at desc limit 1`,
  )
  if (!p) return null
  return {
    id: p.id, name: p.name, origin: p.origin, notes: p.notes,
    createdAt: new Date(p.created_at).toISOString(),
    items: await planItems(db, p.id),
  }
}

/** Itens do plano ativo para o dia da semana (0 = domingo … 6 = sábado, como `weekdayOf`). */
export async function getPlanDay(db: Db, weekday: number): Promise<PlanItem[]> {
  const [p] = await db.query<{ id: string }>(`select id from workout_plans where active order by created_at desc limit 1`)
  return p ? planItems(db, p.id, weekday) : []
}

// ── Sessões ──────────────────────────────────────────────────────────────────

export async function startSession(db: Db, opts: { planId?: string | null; now?: Date } = {}): Promise<string> {
  const now = opts.now ?? new Date()
  const [r] = await db.query<{ id: string }>(
    `insert into workout_sessions (day, plan_id, started_at) values ($1, $2, $3) returning id`,
    [todayIn(now), opts.planId ?? null, now.toISOString()],
  )
  return r.id
}

export type SetInput = { exerciseId: string; setNo: number; reps?: number; loadKg?: number; durationS?: number; rpe?: number }

function checkSet(s: SetInput) {
  const load = s.loadKg ?? null
  if (load !== null && (!Number.isFinite(load) || load < 0 || load > 500)) {
    throw new ValidationError('Carga: informe um valor entre 0 e 500 kg.')
  }
  return {
    setNo: optInt(s.setNo, 1, 100, 'Série')!,
    reps: optInt(s.reps, 0, 500, 'Repetições'),
    loadKg: load === null ? null : round1(load),
    durationS: optInt(s.durationS, 0, 86400, 'Duração'),
    rpe: optInt(s.rpe, 1, 10, 'RPE'),
  }
}

/** Registra uma série feita. Devolve o id (para desmarcar com `deleteSet`). */
export async function logSet(db: Db, sessionId: string, s: SetInput): Promise<string> {
  if (s.setNo === undefined) throw new ValidationError('Série inválida.')
  const v = checkSet(s)
  const [r] = await db.query<{ id: string }>(
    `insert into session_sets (session_id, exercise_id, set_no, reps, load_kg, duration_s, rpe)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [sessionId, s.exerciseId, v.setNo, v.reps, v.loadKg, v.durationS, v.rpe],
  )
  return r.id
}

export async function deleteSet(db: Db, setId: string): Promise<void> {
  await db.query(`delete from session_sets where id = $1`, [setId])
}

function checkFinish(f: { durationMin: number; rpe: number }) {
  if (!Number.isInteger(f.durationMin) || f.durationMin < 1 || f.durationMin > 600) {
    throw new ValidationError('Duração: informe de 1 a 600 minutos.')
  }
  if (!Number.isInteger(f.rpe) || f.rpe < 1 || f.rpe > 10) throw new ValidationError('Esforço (RPE): escolha de 1 a 10.')
}

/** Conclui a sessão com duração, esforço percebido (RPE 1–10) e observações. */
export async function finishSession(
  db: Db,
  sessionId: string,
  f: { durationMin: number; rpe: number; notes?: string },
  now: Date = new Date(),
): Promise<void> {
  checkFinish(f)
  const rows = await db.query(
    `update workout_sessions set finished_at = $2, duration_min = $3, rpe = $4, notes = $5
     where id = $1 and finished_at is null returning id`,
    [sessionId, now.toISOString(), f.durationMin, f.rpe, f.notes?.trim().slice(0, 1000) || null],
  )
  if (!rows.length) throw new ValidationError('Treino não encontrado ou já concluído.')
}

/** Apaga uma sessão ainda não concluída (e as séries dela). */
export async function discardSession(db: Db, sessionId: string): Promise<void> {
  await db.query(`delete from workout_sessions where id = $1 and finished_at is null`, [sessionId])
}

export type OpenSession = {
  id: string
  planId: string | null
  startedAt: string
  sets: { id: string; exerciseId: string; setNo: number; reps: number | null; loadKg: number | null; durationS: number | null }[]
}

/**
 * O treino começado e ainda não concluído (o mais recente), com as séries já marcadas: o de hoje ou um começado
 * nas últimas 18 h (treino da noite que passou da meia-noite não fica perdido).
 */
export async function getOpenSession(db: Db, now: Date = new Date()): Promise<OpenSession | null> {
  const [s] = await db.query<{ id: string; plan_id: string | null; started_at: string | Date | null; created_at: string | Date }>(
    `select id, plan_id, started_at, created_at from workout_sessions
     where finished_at is null
       and (day = $1 or coalesce(started_at, created_at) between $2::timestamptz - interval '18 hours' and $2::timestamptz)
     order by created_at desc limit 1`,
    [todayIn(now), now.toISOString()],
  )
  if (!s) return null
  const sets = await db.query<{ id: string; exercise_id: string; set_no: number; reps: number | null; load_kg: string | number | null; duration_s: number | null }>(
    `select id, exercise_id, set_no, reps, load_kg, duration_s from session_sets where session_id = $1 order by created_at`,
    [s.id],
  )
  return {
    id: s.id,
    planId: s.plan_id,
    startedAt: new Date(s.started_at ?? s.created_at).toISOString(),
    sets: sets.map((r) => ({
      id: r.id, exerciseId: r.exercise_id, setNo: r.set_no, reps: r.reps,
      loadKg: r.load_kg === null ? null : Number(r.load_kg), durationS: r.duration_s,
    })),
  }
}

/** Atividade avulsa (ex.: caminhada de 40 min): uma sessão concluída com uma série de duração. */
export async function logActivity(
  db: Db,
  a: { exerciseName: string; kind: ExerciseKind; durationMin: number; rpe: number; now?: Date },
): Promise<string> {
  const now = a.now ?? new Date()
  const name = a.exerciseName.trim()
  if (!name || name.length > 120) throw new ValidationError('Atividade: informe um nome.')
  if (!isKind(a.kind)) throw new ValidationError('Tipo de atividade inválido.')
  checkFinish(a)
  return withTx(db, async () => {
    const exId = await exerciseId(db, { name, description: '', kind: a.kind, muscles: [], demoUrl: null }, false)
    const [s] = await db.query<{ id: string }>(
      `insert into workout_sessions (day, started_at, finished_at, duration_min, rpe) values ($1, $2, $3, $4, $5) returning id`,
      [todayIn(now), new Date(now.getTime() - a.durationMin * 60000).toISOString(), now.toISOString(), a.durationMin, a.rpe],
    )
    await db.query(
      `insert into session_sets (session_id, exercise_id, set_no, duration_s, rpe) values ($1, $2, 1, $3, $4)`,
      [s.id, exId, a.durationMin * 60, a.rpe],
    )
    return s.id
  })
}

export type RecentSession = { id: string; day: Day; durationMin: number | null; rpe: number | null; planId: string | null; exercises: string[] }

/** Últimos treinos concluídos, do mais recente ao mais antigo, com os nomes dos exercícios feitos. */
export async function recentSessions(db: Db, limit = 5): Promise<RecentSession[]> {
  const rows = await db.query<{ id: string; day: string; duration_min: number | null; rpe: number | null; plan_id: string | null; exercises: string[] | null }>(
    `select s.id, to_char(s.day, 'YYYY-MM-DD') as day, s.duration_min, s.rpe, s.plan_id,
            (select array_agg(e.name order by first_at) from (
               select ss.exercise_id, min(ss.created_at) as first_at from session_sets ss
               where ss.session_id = s.id group by ss.exercise_id
             ) x join exercises e on e.id = x.exercise_id) as exercises
     from workout_sessions s
     where s.finished_at is not null
     order by s.finished_at desc limit $1`,
    [limit],
  )
  return rows.map((r) => ({
    id: r.id, day: r.day, durationMin: r.duration_min, rpe: r.rpe, planId: r.plan_id, exercises: r.exercises ?? [],
  }))
}

export type TrainingStats = {
  sessions: number
  byExercise: { name: string; sets: number; sessions: number; bestLoad: number | null; avgRpe: number | null; lastAt: string }[]
  avgRpe: number | null
  restDaysAvg: number | null
}

/** Resumo dos treinos concluídos nos últimos `days` dias (contando hoje). */
export async function trainingStats(db: Db, days: number, now: Date = new Date()): Promise<TrainingStats> {
  const to = todayIn(now)
  const from = addDays(to, -(days - 1))
  const sessions = await db.query<{ day: string; rpe: number | null }>(
    `select to_char(day, 'YYYY-MM-DD') as day, rpe from workout_sessions
     where finished_at is not null and day >= $1 and day <= $2 order by day`,
    [from, to],
  )
  const ex = await db.query<{ name: string; sets: string | number; sessions: string | number; best: string | number | null; rpe: string | number | null; last_at: string | Date }>(
    `select e.name, count(*) as sets, count(distinct ss.session_id) as sessions, max(ss.load_kg) as best,
            avg(coalesce(ss.rpe, s.rpe)) as rpe, max(s.finished_at) as last_at
     from session_sets ss
     join workout_sessions s on s.id = ss.session_id
     join exercises e on e.id = ss.exercise_id
     where s.finished_at is not null and s.day >= $1 and s.day <= $2
     group by e.id, e.name
     order by max(s.finished_at) desc, e.name`,
    [from, to],
  )
  const rpes = sessions.map((s) => s.rpe).filter((r): r is number => r !== null)
  const daysList = [...new Set(sessions.map((s) => s.day))]
  let restDaysAvg: number | null = null
  if (daysList.length >= 2) {
    const gaps = daysList.slice(1).map((d, i) => (Date.parse(d) - Date.parse(daysList[i])) / 86400000 - 1)
    restDaysAvg = round1(gaps.reduce((a, b) => a + b, 0) / gaps.length)
  }
  return {
    sessions: sessions.length,
    byExercise: ex.map((r) => ({
      name: r.name,
      sets: Number(r.sets),
      sessions: Number(r.sessions),
      bestLoad: r.best === null ? null : Number(r.best),
      avgRpe: r.rpe === null ? null : round1(Number(r.rpe)),
      lastAt: new Date(r.last_at).toISOString(),
    })),
    avgRpe: rpes.length ? round1(rpes.reduce((a, b) => a + b, 0) / rpes.length) : null,
    restDaysAvg,
  }
}
