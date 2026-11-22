import type { Db } from './db'
import type { Sex } from './nutrition'
import { ValidationError, parseNum } from './validate'

export type Profile = {
  birthDate: string
  sex: Sex
  heightCm: number
  activityLevel: number
  fitness: 'baixo' | 'medio' | 'alto'
  experience: 'nenhuma' | 'iniciante' | 'intermediario' | 'avancado'
  daysPerWeek: number
  minutesPerSession: number
  equipment: string[]
  restrictions: string
}

export type Goal = {
  startWeightKg: number
  targetWeightKg: number
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

type ProfileRow = {
  birth_date: string
  sex: Sex
  height_cm: string | number
  activity_level: string | number
  fitness: Profile['fitness']
  experience: Profile['experience']
  days_per_week: number
  minutes_per_session: number
  equipment: string[]
  restrictions: string
}

type GoalRow = {
  start_weight_kg: string | number
  target_weight_kg: string | number
  kcal: string | number
  protein_g: string | number
  carbs_g: string | number
  fat_g: string | number
}

export async function getProfile(db: Db): Promise<Profile | null> {
  const [r] = await db.query<ProfileRow>(
    `select to_char(birth_date, 'YYYY-MM-DD') as birth_date, sex, height_cm, activity_level, fitness, experience,
            days_per_week, minutes_per_session, equipment, restrictions
     from profile where id = 1`,
  )
  if (!r) return null
  return {
    birthDate: r.birth_date,
    sex: r.sex,
    heightCm: Number(r.height_cm),
    activityLevel: Number(r.activity_level),
    fitness: r.fitness,
    experience: r.experience,
    daysPerWeek: r.days_per_week,
    minutesPerSession: r.minutes_per_session,
    equipment: r.equipment,
    restrictions: r.restrictions,
  }
}

export async function saveProfile(db: Db, p: Profile): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate) || Number.isNaN(Date.parse(p.birthDate))) {
    throw new ValidationError('Nascimento: informe uma data válida.')
  }
  if (p.sex !== 'm' && p.sex !== 'f') throw new ValidationError('Sexo: escolha uma opção válida.')
  if (!['baixo', 'medio', 'alto'].includes(p.fitness)) throw new ValidationError('Condicionamento: opção inválida.')
  if (!['nenhuma', 'iniciante', 'intermediario', 'avancado'].includes(p.experience)) {
    throw new ValidationError('Experiência: opção inválida.')
  }
  const height = parseNum(p.heightCm, { min: 100, max: 250, label: 'Altura (cm)' })
  const activity = parseNum(p.activityLevel, { min: 1.2, max: 1.9, label: 'Nível de atividade' })
  const days = parseNum(p.daysPerWeek, { min: 1, max: 7, label: 'Dias por semana' })
  const minutes = parseNum(p.minutesPerSession, { min: 10, max: 240, label: 'Minutos por treino' })
  if (!Number.isInteger(days) || !Number.isInteger(minutes)) {
    throw new ValidationError('Dias e minutos devem ser números inteiros.')
  }
  if (p.restrictions.length > 2000) throw new ValidationError('Restrições: use no máximo 2000 caracteres.')
  await db.query(
    `insert into profile (id, birth_date, sex, height_cm, activity_level, fitness, experience,
                          days_per_week, minutes_per_session, equipment, restrictions)
     values (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (id) do update set
       birth_date = excluded.birth_date, sex = excluded.sex, height_cm = excluded.height_cm,
       activity_level = excluded.activity_level, fitness = excluded.fitness, experience = excluded.experience,
       days_per_week = excluded.days_per_week, minutes_per_session = excluded.minutes_per_session,
       equipment = excluded.equipment, restrictions = excluded.restrictions`,
    [p.birthDate, p.sex, height, activity, p.fitness, p.experience, days, minutes, p.equipment, p.restrictions],
  )
}

/** A meta mais recente (desempate pela ordem de inserção). */
export async function getGoal(db: Db): Promise<Goal | null> {
  const [r] = await db.query<GoalRow>(
    `select start_weight_kg, target_weight_kg, kcal, protein_g, carbs_g, fat_g
     from goals order by created_at desc, ctid desc limit 1`,
  )
  if (!r) return null
  return {
    startWeightKg: Number(r.start_weight_kg),
    targetWeightKg: Number(r.target_weight_kg),
    kcal: Number(r.kcal),
    proteinG: Number(r.protein_g),
    carbsG: Number(r.carbs_g),
    fatG: Number(r.fat_g),
  }
}

/** Sempre insere (o histórico de metas é mantido). */
export async function saveGoal(db: Db, g: Goal): Promise<void> {
  const start = parseNum(g.startWeightKg, { min: 20, max: 400, label: 'Peso inicial' })
  const target = parseNum(g.targetWeightKg, { min: 20, max: 400, label: 'Peso alvo' })
  const kcal = parseNum(g.kcal, { min: 800, max: 6000, label: 'Calorias' })
  const protein = parseNum(g.proteinG, { min: 0, max: 1000, label: 'Proteína' })
  const carbs = parseNum(g.carbsG, { min: 0, max: 1000, label: 'Carboidratos' })
  const fat = parseNum(g.fatG, { min: 0, max: 1000, label: 'Gordura' })
  await db.query(
    `insert into goals (start_weight_kg, target_weight_kg, kcal, protein_g, carbs_g, fat_g)
     values ($1, $2, $3, $4, $5, $6)`,
    [start, target, kcal, protein, carbs, fat],
  )
}
