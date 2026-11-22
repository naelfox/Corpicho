import { describe, it, expect } from 'vitest'
import { createTestDb } from '@/test/db'
import { ValidationError } from '@/lib/validate'
import { saveGoal } from '@/lib/profile'
import { getDashboard } from '@/lib/dashboard'
import {
  cleanMuscles, createPlan, deleteSet, demoUrl, discardSession, finishSession, getActivePlan, getOpenSession, getPlanDay,
  logActivity, logSet, recentSessions, startSession, trainingStats,
} from '@/lib/training'

// domingo 22/11/2026, 12:00 em São Paulo
const now = new Date('2026-11-22T15:00:00Z')
const supino = { name: 'Supino com halteres', description: 'Deite no banco.', kind: 'musculacao' as const, muscles: ['peitoral', 'triceps'] }
const agach = { name: 'Agachamento livre', description: 'Pés na largura dos ombros.', kind: 'musculacao' as const, muscles: ['quadriceps', 'gluteos'] }

describe('treino: planos', () => {
  it('demoUrl busca o vídeo de execução', () => {
    expect(demoUrl('Supino reto')).toBe('https://www.youtube.com/results?search_query=Supino%20reto%20execu%C3%A7%C3%A3o')
  })

  it('cleanMuscles aceita ids e nomes em pt-BR, descarta desconhecidos e repetidos', () => {
    expect(cleanMuscles(['peitoral', 'Quadríceps', 'Posteriores de coxa', 'pescoço', 'peitoral', 3])).toEqual([
      'peitoral', 'quadriceps', 'posteriores',
    ])
  })

  it('createPlan duas vezes: só o segundo fica ativo; o antigo continua no histórico', async () => {
    const db = await createTestDb()
    const a = await createPlan(db, { name: 'A', origin: 'manual', items: [{ weekday: 1, exercise: supino, sets: 3, reps: 10 }] })
    const b = await createPlan(db, { name: 'B', origin: 'ia', items: [{ weekday: 2, exercise: agach, sets: 4, reps: 8 }] })
    expect(a).not.toBe(b)
    const active = await getActivePlan(db)
    expect(active?.id).toBe(b)
    expect(active?.origin).toBe('ia')
    const rows = await db.query<{ n: string }>(`select count(*) as n from workout_plans`)
    expect(Number(rows[0].n)).toBe(2)
    const on = await db.query<{ n: string }>(`select count(*) as n from workout_plans where active`)
    expect(Number(on[0].n)).toBe(1)
  })

  it('reaproveita o exercício com o mesmo nome (sem diferenciar maiúsculas) e atualiza descrição/músculos', async () => {
    const db = await createTestDb()
    await createPlan(db, { name: 'A', origin: 'manual', items: [{ weekday: 1, exercise: supino }] })
    await createPlan(db, {
      name: 'B', origin: 'manual',
      items: [{ weekday: 3, exercise: { ...supino, name: 'SUPINO com halteres', description: 'Nova', muscles: ['peitoral', 'xyz'] } }],
    })
    const ex = await db.query<{ name: string; description: string; muscles: string[] }>(`select name, description, muscles from exercises`)
    expect(ex).toHaveLength(1)
    expect(ex[0].description).toBe('Nova')
    expect(ex[0].muscles).toEqual(['peitoral'])
  })

  it('getPlanDay devolve os itens do dia na ordem, com o exercício', async () => {
    const db = await createTestDb()
    await createPlan(db, {
      name: 'A', origin: 'manual',
      items: [
        { weekday: 0, exercise: agach, sets: 4, reps: 8, restS: 90, loadKg: 20 },
        { weekday: 1, exercise: supino, sets: 3, reps: 10 },
        { weekday: 0, exercise: supino, sets: 3, reps: 12, loadKg: 12.5 },
      ],
    })
    const day = await getPlanDay(db, 0)
    expect(day.map((i) => i.exercise.name)).toEqual(['Agachamento livre', 'Supino com halteres'])
    expect(day[0]).toMatchObject({ sets: 4, reps: 8, restS: 90, loadKg: 20, durationS: null })
    expect(day[0].exercise.muscles).toEqual(['quadriceps', 'gluteos'])
    expect(day[1].loadKg).toBe(12.5)
    expect(await getPlanDay(db, 5)).toEqual([])
  })

  it('valida entrada', async () => {
    const db = await createTestDb()
    await expect(createPlan(db, { name: ' ', origin: 'manual', items: [{ weekday: 1, exercise: supino }] })).rejects.toBeInstanceOf(ValidationError)
    await expect(createPlan(db, { name: 'A', origin: 'manual', items: [] })).rejects.toBeInstanceOf(ValidationError)
    await expect(createPlan(db, { name: 'A', origin: 'manual', items: [{ weekday: 7, exercise: supino }] })).rejects.toBeInstanceOf(ValidationError)
    await expect(createPlan(db, { name: 'A', origin: 'manual', items: [{ weekday: 1, exercise: supino, sets: 0 }] })).rejects.toBeInstanceOf(ValidationError)
    expect(await getActivePlan(db)).toBeNull()
  })
})

describe('treino: sessões', () => {
  it('logSet + finishSession → trainingStats(7) conta 1 sessão e a melhor carga', async () => {
    const db = await createTestDb()
    const planId = await createPlan(db, { name: 'A', origin: 'manual', items: [{ weekday: 0, exercise: supino, sets: 3, reps: 10 }] })
    const [item] = await getPlanDay(db, 0)
    const s = await startSession(db, { planId, now })
    await logSet(db, s, { exerciseId: item.exercise.id, setNo: 1, reps: 10, loadKg: 12, rpe: 7 })
    await logSet(db, s, { exerciseId: item.exercise.id, setNo: 2, reps: 9, loadKg: 14, rpe: 8 })
    const stray = await logSet(db, s, { exerciseId: item.exercise.id, setNo: 3, reps: 5, loadKg: 99 })
    await deleteSet(db, stray)
    expect((await getOpenSession(db, now))?.sets).toHaveLength(2)
    await finishSession(db, s, { durationMin: 45, rpe: 8, notes: 'ok' })
    expect(await getOpenSession(db, now)).toBeNull()

    const st = await trainingStats(db, 7, now)
    expect(st.sessions).toBe(1)
    expect(st.avgRpe).toBe(8)
    expect(st.restDaysAvg).toBeNull()
    expect(st.byExercise).toEqual([
      { name: 'Supino com halteres', sets: 2, sessions: 1, bestLoad: 14, avgRpe: 7.5, lastAt: expect.any(String) },
    ])
    const [r] = await recentSessions(db)
    expect(r).toMatchObject({ day: '2026-11-22', durationMin: 45, rpe: 8, exercises: ['Supino com halteres'] })
  })

  it('trainingStats: sem RPE nas séries, avgRpe usa o RPE da sessão', async () => {
    const db = await createTestDb()
    await createPlan(db, { name: 'A', origin: 'manual', items: [{ weekday: 0, exercise: supino, sets: 3, reps: 10 }] })
    const [item] = await getPlanDay(db, 0)
    const s = await startSession(db, { now })
    await logSet(db, s, { exerciseId: item.exercise.id, setNo: 1, reps: 10, loadKg: 12 })
    await logSet(db, s, { exerciseId: item.exercise.id, setNo: 2, reps: 10, loadKg: 12 })
    await finishSession(db, s, { durationMin: 30, rpe: 9 })
    expect((await trainingStats(db, 7, now)).byExercise[0].avgRpe).toBe(9)
  })

  it('sessão não finalizada não conta; descartar apaga', async () => {
    const db = await createTestDb()
    const s = await startSession(db, { now })
    expect((await getOpenSession(db, now))?.id).toBe(s)
    expect((await trainingStats(db, 7, now)).sessions).toBe(0)
    await discardSession(db, s)
    expect(await getOpenSession(db, now)).toBeNull()
  })

  it('finishSession valida RPE e duração', async () => {
    const db = await createTestDb()
    const s = await startSession(db, { now })
    await expect(finishSession(db, s, { durationMin: 30, rpe: 11 })).rejects.toBeInstanceOf(ValidationError)
    await expect(finishSession(db, s, { durationMin: 0, rpe: 5 })).rejects.toBeInstanceOf(ValidationError)
  })

  it('logActivity: caminhada de 40 min entra em workoutsThisWeek', async () => {
    const db = await createTestDb()
    await saveGoal(db, { startWeightKg: 100, targetWeightKg: 80, kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 })
    await logActivity(db, { exerciseName: 'Caminhada', kind: 'cardio', durationMin: 40, rpe: 4, now })
    expect((await getDashboard(db, now)).workoutsThisWeek).toBe(1)
    const sets = await db.query<{ duration_s: number }>(`select duration_s from session_sets`)
    expect(sets).toEqual([{ duration_s: 2400 }])
    const [r] = await recentSessions(db)
    expect(r).toMatchObject({ durationMin: 40, rpe: 4, exercises: ['Caminhada'], planId: null })
  })

  it('trainingStats: janela de dias, descanso médio entre treinos e carga nula', async () => {
    const db = await createTestDb()
    // 16/11, 18/11 e 22/11 → intervalos de 1 e 3 dias de descanso → média 2
    for (const [d, rpe] of [['2026-11-16', 6], ['2026-11-18', 7], ['2026-11-22', 9]] as const) {
      await logActivity(db, { exerciseName: 'Caminhada', kind: 'cardio', durationMin: 30, rpe, now: new Date(`${d}T15:00:00Z`) })
    }
    await logActivity(db, { exerciseName: 'Caminhada', kind: 'cardio', durationMin: 30, rpe: 5, now: new Date('2026-11-01T15:00:00Z') })
    const st = await trainingStats(db, 7, now)
    expect(st.sessions).toBe(3)
    expect(st.avgRpe).toBe(7.3)
    expect(st.restDaysAvg).toBe(2)
    expect(st.byExercise).toEqual([{ name: 'Caminhada', sets: 3, sessions: 3, bestLoad: null, avgRpe: 7.3, lastAt: expect.any(String) }])
    expect((await trainingStats(db, 28, now)).sessions).toBe(4)
  })
})
