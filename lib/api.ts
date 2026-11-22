'use client'

import { getDb } from './localDb'
import { withTx } from './db'
import { getGoal, getProfile, saveGoal, saveProfile, type Goal, type Profile } from './profile'
import { addWeight } from './body'
import { getSeries } from './series'
import { getDashboard, type Dashboard } from './dashboard'
import { parseNum } from './validate'
import { monthUsage } from './ai/client'

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
