'use client'

import { getDb } from './localDb'
import { withTx } from './db'
import { getGoal, getProfile, saveGoal, saveProfile, type Goal, type Profile } from './profile'
import {
  addComposition, addMeasurement, addWeight, compositionHistory, currentComposition, deleteRecord, latestByRegion,
  regionHistory, type CompMetric, type CompositionEntry, type Region,
} from './body'
import { evolutionSummary, getSeries, type Metric, type Period, type Series, type Unit } from './series'
import { getDashboard, type Dashboard } from './dashboard'
import { parseNum } from './validate'
import { monthUsage } from './ai/client'
import { analyzePlate, type PlateItem } from './ai/plate'
import { searchFoods, type Food } from './foods'
import {
  addMeal, deleteMeal, deleteMealItem, getDayMeals, getHistory, repeatMeal,
  type MealType, type MealWithItems, type NewItem,
} from './meals'
import { sumMacros, type Macros } from './nutrition'
import { todayIn, weekdayOf, type Day } from './dates'
import {
  createPlan, deleteSet, discardSession, finishSession, getActivePlan, getOpenSession, logActivity, logSet, recentSessions,
  startSession, type ExerciseKind, type OpenSession, type Plan, type PlanItem, type RecentSession, type SetInput,
} from './training'
import { generatePlan, type PlanDraft } from './ai/workout'
import { addBodyPhoto, deleteBodyPhoto, getBodyPhotos, photoSessions, type Angle, type PhotoSession } from './bodyPhotos'
import { describeChanges } from './ai/photoCompare'
import { getMessages, listConversations, retryLastMessage, sendCoachMessage, type CoachMessage, type Conversation } from './ai/coach'

/**
 * As ações das telas, rodando no próprio aparelho contra o banco local.
 * Funções finas: abrem o banco (getDb) e chamam lib/*. Toda escrita termina com changed(),
 * que avisa quem se inscreveu (subscribe) para recarregar.
 */

type Listener = () => void | Promise<void>
const listeners = new Set<Listener>()

/** As telas se inscrevem aqui para recarregar depois de cada escrita. Devolve a função para sair. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Avisa todas as telas inscritas que os dados mudaram. */
export async function changed(): Promise<void> {
  await Promise.all([...listeners].map((fn) => fn()))
}

type DbT = Awaited<ReturnType<typeof getDb>>

async function write<T>(fn: (db: DbT) => Promise<T>): Promise<T> {
  const result = await fn(await getDb())
  await changed()
  return result
}

// ── Perfil e meta ────────────────────────────────────────────────────────────

export async function loadProfile(): Promise<Profile | null> {
  return getProfile(await getDb())
}

export async function loadGoal(): Promise<Goal | null> {
  return getGoal(await getDb())
}

/** Último peso registrado (kg) ou null. */
export async function loadLatestWeight(): Promise<number | null> {
  return (await getSeries(await getDb(), 'peso', 'tudo')).last
}

/** Tudo o que o formulário de perfil/meta precisa para abrir preenchido. */
export async function loadProfileForm(): Promise<{ profile: Profile | null; goal: Goal | null; weightKg: number | null }> {
  const db = await getDb()
  const [profile, goal, series] = await Promise.all([getProfile(db), getGoal(db), getSeries(db, 'peso', 'tudo')])
  return { profile, goal, weightKg: series.last }
}

/**
 * Salva perfil + nova meta (sempre uma linha nova: o histórico fica) e, se informado, um peso novo.
 * Tudo numa transação: ou entra tudo, ou nada.
 */
export async function saveProfileAndGoal(input: { profile: Profile; goal: Goal; weightKg?: number }): Promise<void> {
  await write((db) =>
    withTx(db, async () => {
      await saveProfile(db, input.profile)
      await saveGoal(db, input.goal)
      if (input.weightKg !== undefined) await addWeight(db, input.weightKg)
    }),
  )
}

// ── Início ───────────────────────────────────────────────────────────────────

export type { Dashboard }

/** Tudo do Início (peso, hoje, macros, treinos, série, resumo). Lança ValidationError se não há meta. */
export async function loadDashboard(): Promise<Dashboard> {
  return getDashboard(await getDb())
}

/** Registra um peso (texto com vírgula ou ponto, 20–400 kg) e avisa as telas. */
export async function saveWeight(kgStr: string): Promise<void> {
  const kg = parseNum(kgStr, { min: 20, max: 400, label: 'Peso' })
  await write((db) => addWeight(db, kg))
}

// ── IA ───────────────────────────────────────────────────────────────────────

/** Gasto estimado e número de chamadas à IA no mês corrente. */
export async function loadMonthUsage(): Promise<{ costUsd: number; calls: number }> {
  return monthUsage(await getDb())
}

// ── Comer ────────────────────────────────────────────────────────────────────

export type { Food, MealType, MealWithItems, NewItem, PlateItem }

/** Refeições do dia, totais e a meta (null se ainda não houver meta). */
export async function loadDay(day: Day): Promise<{ meals: MealWithItems[]; totals: Macros; targets: Macros | null }> {
  const db = await getDb()
  const [meals, goal] = await Promise.all([getDayMeals(db, day), getGoal(db)])
  return {
    meals,
    totals: sumMacros(meals.map((m) => m.totals)),
    targets: goal ? { kcal: goal.kcal, protein: goal.proteinG, carbs: goal.carbsG, fat: goal.fatG } : null,
  }
}

/** Busca alimentos (TACO + do usuário); texto vazio = usados recentemente. */
export async function searchFoodsApi(q: string): Promise<Food[]> {
  return searchFoods(await getDb(), q, 30)
}

export async function addMealApi(input: {
  type: MealType
  items: NewItem[]
  source: 'manual' | 'ia_confirmada'
  photoPath?: string
}): Promise<string> {
  return write((db) => addMeal(db, input))
}

/** Apaga a refeição (e a foto dela, se houver). */
export async function deleteMealApi(id: string, photoPath?: string | null): Promise<void> {
  await write((db) => deleteMeal(db, id))
  if (photoPath) await discardPlatePhoto(photoPath)
}

export async function deleteMealItemApi(id: string): Promise<void> {
  await write((db) => deleteMealItem(db, id))
}

/** Copia a refeição para hoje com o tipo escolhido. */
export async function repeatMealApi(id: string, type: MealType): Promise<string> {
  return write((db) => repeatMeal(db, id, type))
}

export const HISTORY_PAGE = 14

/** Dias com registro antes de `before` (exclusivo), do mais recente para o mais antigo. */
export async function loadHistory(before?: Day, limit = HISTORY_PAGE): Promise<{ day: Day; meals: MealWithItems[] }[]> {
  return getHistory(await getDb(), { before, limit })
}

/** Manda a foto (já reduzida) para a IA. Lança AiError (ver AI_ERROR_TEXT). Nada é salvo aqui. */
export async function analyzePlateApi(dataUrl: string): Promise<PlateItem[]> {
  return analyzePlate(await getDb(), dataUrl)
}

// Capacitor só é carregado quando a câmera/arquivos são usados (o build estático e os testes não o tocam).
const photos = () => import('./photos')

/** true no app Android; no navegador (dev) a foto vem de um <input type="file">. */
export async function hasNativeCamera(): Promise<boolean> {
  const { Capacitor } = await import('@capacitor/core')
  return Capacitor.isNativePlatform()
}

/**
 * Foto do prato: abre a câmera (ou usa `fromDataUrl`, vindo do seletor de arquivo), reduz para ≤1024 px
 * e guarda na área privada do app. Cancelado → null. Se guardar falhar, segue sem `path` (a foto só não fica salva).
 */
export async function takeAndStorePlatePhoto(fromDataUrl?: string): Promise<{ dataUrl: string; path: string | null } | null> {
  const { takePhoto, resizeForAi, savePrivate } = await photos()
  const original = fromDataUrl ?? (await takePhoto())?.dataUrl
  if (!original) return null
  const dataUrl = await resizeForAi(original)
  let path: string | null = null
  try {
    path = await savePrivate(dataUrl, 'meals')
  } catch (e) {
    console.error(e)
  }
  return { dataUrl, path }
}

/** Apaga uma foto de refeição guardada (revisão cancelada ou refeição apagada). Falha é ignorada. */
export async function discardPlatePhoto(path: string): Promise<void> {
  try {
    await (await photos()).deletePrivate(path)
  } catch (e) {
    console.error(e)
  }
}

/** Lê uma foto guardada como data URL (para miniaturas). */
export async function loadPhoto(path: string): Promise<string> {
  return (await photos()).loadPrivate(path)
}

// ── Corpo ────────────────────────────────────────────────────────────────────

export type { CompMetric, CompositionEntry, Metric, Period, Region, Series, Unit }

export type CompositionRecord = Awaited<ReturnType<typeof compositionHistory>>[number]

export type BodyData = {
  latest: Awaited<ReturnType<typeof latestByRegion>>
  weight: { kg: number; at: string } | null
  composition: CompositionEntry[]
  records: CompositionRecord[]
}

/** Tudo da aba Corpo: última medida de cada região (com delta), último peso, composição atual e registros. */
export async function loadBody(): Promise<BodyData> {
  const db = await getDb()
  const [latest, peso, profile, records] = await Promise.all([
    latestByRegion(db), getSeries(db, 'peso', 'tudo'), getProfile(db), compositionHistory(db),
  ])
  const last = peso.points[peso.points.length - 1]
  return {
    latest,
    weight: last ? { kg: last.value, at: last.at } : null,
    composition: profile ? await currentComposition(db, profile) : [],
    records,
  }
}

/** Registra a medida de uma região (texto com vírgula ou ponto, 5–300 cm). Nunca edita: sempre um registro novo. */
export async function saveMeasurement(region: Region, cmStr: string): Promise<void> {
  const cm = parseNum(cmStr, { min: 5, max: 300, label: 'Medida' })
  await write((db) => addMeasurement(db, region, cm))
}

export async function deleteMeasurement(id: string): Promise<void> {
  await write((db) => deleteRecord(db, 'body_measurements', id))
}

/** Histórico da região, do mais recente ao mais antigo. */
export async function loadRegionHistory(region: Region): Promise<{ id: string; cm: number; at: string }[]> {
  return regionHistory(await getDb(), region)
}

/**
 * Registra uma medição de composição (origem "medido", método obrigatório).
 * Peso não entra aqui: vai pela folha de peso (saveWeight), que é de onde o app lê o peso (e o IMC).
 */
export async function saveComposition(input: {
  metric: Exclude<CompMetric, 'bmi' | 'weight_kg'>
  valueStr: string
  method: string
}): Promise<void> {
  await write((db) => addComposition(db, { metric: input.metric, value: input.valueStr, source: 'measured', method: input.method }))
}

export async function deleteComposition(id: string): Promise<void> {
  await write((db) => deleteRecord(db, 'body_composition', id))
}

export async function loadSeries(metric: Metric, period: Period): Promise<Series> {
  return getSeries(await getDb(), metric, period)
}

/** Variação dos últimos 30 dias de cada métrica com 2+ registros. */
export async function loadEvolutionSummary(): Promise<{ metric: Metric; delta: number; unit: Unit }[]> {
  return evolutionSummary(await getDb())
}

// ── Treino ───────────────────────────────────────────────────────────────────

export type { ExerciseKind, OpenSession, Plan, PlanDraft, PlanItem, RecentSession }

export type TrainingData = {
  plan: Plan | null
  /** Dia da semana de hoje (0 = domingo). */
  weekday: number
  open: OpenSession | null
  recent: RecentSession[]
}

/** Tudo da aba Treino: plano ativo, dia de hoje, treino em andamento e os 5 últimos concluídos. */
export async function loadTraining(): Promise<TrainingData> {
  const db = await getDb()
  const [plan, open, recent] = await Promise.all([getActivePlan(db), getOpenSession(db), recentSessions(db, 5)])
  return { plan, weekday: weekdayOf(todayIn()), open, recent }
}

/** Pede um plano à IA a partir do perfil (lança AiError/ValidationError). Nada é salvo. */
export async function generatePlanDraft(): Promise<PlanDraft> {
  return generatePlan(await getDb())
}

/** Salva o plano (vira o ativo; o anterior fica no histórico). */
export async function savePlan(draft: PlanDraft, origin: 'ia' | 'manual'): Promise<string> {
  return write((db) => createPlan(db, { ...draft, origin }))
}

export async function startSessionApi(planId?: string | null): Promise<string> {
  return write((db) => startSession(db, { planId }))
}

export async function logSetApi(sessionId: string, set: SetInput): Promise<string> {
  return write((db) => logSet(db, sessionId, set))
}

export async function deleteSetApi(setId: string): Promise<void> {
  await write((db) => deleteSet(db, setId))
}

/** Conclui o treino. `durationStr` em minutos (texto); RPE 1–10. */
export async function finishSessionApi(sessionId: string, input: { durationStr: string; rpe: number; notes?: string }): Promise<void> {
  const durationMin = Math.round(parseNum(input.durationStr, { min: 1, max: 600, label: 'Duração (min)' }))
  await write((db) => finishSession(db, sessionId, { durationMin, rpe: input.rpe, notes: input.notes }))
}

export async function discardSessionApi(sessionId: string): Promise<void> {
  await write((db) => discardSession(db, sessionId))
}

/** Atividade avulsa (ex.: Caminhada, 40 min). */
export async function logActivityApi(input: { name: string; kind: ExerciseKind; durationStr: string; rpe: number }): Promise<void> {
  const durationMin = Math.round(parseNum(input.durationStr, { min: 1, max: 600, label: 'Duração (min)' }))
  await write((db) => logActivity(db, { exerciseName: input.name, kind: input.kind, durationMin, rpe: input.rpe }))
}

// ── Coach IA ─────────────────────────────────────────────────────────────────

export type { CoachMessage, Conversation }

export async function loadConversations(): Promise<Conversation[]> {
  return listConversations(await getDb())
}

export async function loadMessages(conversationId: string): Promise<CoachMessage[]> {
  return getMessages(await getDb(), conversationId)
}

/** Salva a pergunta, chama a IA e salva a resposta (lança AiError; a pergunta fica salva). */
export async function sendCoachApi(input: { conversationId?: string; text: string }): Promise<{ conversationId: string; reply: string }> {
  return write((db) => sendCoachMessage(db, input))
}

/** Reenvia a última pergunta sem resposta, sem duplicá-la. */
export async function retryCoachApi(conversationId: string): Promise<{ conversationId: string; reply: string }> {
  return write((db) => retryLastMessage(db, conversationId))
}

// ── Fotos do corpo ───────────────────────────────────────────────────────────
// Ficam só em Directory.Data (área privada do app). Nada de galeria, nuvem ou compartilhar.

export type { Angle, PhotoSession }

export async function loadPhotoSessions(): Promise<PhotoSession[]> {
  return photoSessions(await getDb())
}

/**
 * Foto do corpo de um ângulo: câmera (ou `fromDataUrl`, do seletor de arquivo no navegador), reduzida para
 * ≤1600 px JPEG 0.85 e guardada na área privada. Cancelado → null.
 */
export async function takeBodyPhoto(angle: Angle, fromDataUrl?: string): Promise<string | null> {
  const { takePhoto, resizeForAi, savePrivate, deletePrivate } = await photos()
  const original = fromDataUrl ?? (await takePhoto())?.dataUrl
  if (!original) return null
  const path = await savePrivate(await resizeForAi(original, 1600, 0.85), 'body')
  try {
    return await write((db) => addBodyPhoto(db, { angle, path }))
  } catch (e) {
    await deletePrivate(path).catch(() => {})
    throw e
  }
}

/** Apaga a foto (registro e arquivo). */
export async function deleteBodyPhotoApi(id: string): Promise<void> {
  await write((db) => deleteBodyPhoto(db, id))
}

const ddmmyyyy = (day: Day) => day.split('-').reverse().join('/')

/** Descreve as mudanças visuais entre as fotos de antes e de depois (cópias ≤1024 px). Lança AiError. */
export async function describeChangesApi(input: { beforeIds: string[]; afterIds: string[] }): Promise<string> {
  const db = await getDb()
  const { loadPrivate, resizeForAi } = await photos()
  const load = async (ids: string[], tag: 'Antes' | 'Depois') => {
    const rows = await getBodyPhotos(db, ids)
    const images = await Promise.all(rows.map(async (r) => resizeForAi(await loadPrivate(r.path))))
    return { images, labels: rows.map((r) => `${tag} – ${r.angle} (${ddmmyyyy(r.day)})`) }
  }
  const [before, after] = await Promise.all([load(input.beforeIds, 'Antes'), load(input.afterIds, 'Depois')])
  return describeChanges(db, {
    before: before.images,
    after: after.images,
    beforeLabels: before.labels,
    afterLabels: after.labels,
  })
}
