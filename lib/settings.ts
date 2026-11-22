'use client'

import { Preferences } from '@capacitor/preferences'

/**
 * Ajustes guardados no aparelho (no Android: SharedPreferences do app; no navegador: localStorage).
 * A chave da OpenAI nunca sai do celular, exceto na chamada direta para a OpenAI.
 */
const OPENAI_KEY = 'openai_api_key'
const MODEL_VISION = 'model_vision'
const MODEL_TEXT = 'model_text'
const LIMIT = 'monthly_limit_usd'
const THEME = 'theme'

export const DEFAULT_MODELS = { vision: 'gpt-5.4-mini', text: 'gpt-5.4-nano' }
export const DEFAULT_LIMIT_USD = 5
export type Theme = 'system' | 'light' | 'dark'

async function get(key: string): Promise<string | null> {
  const { value } = await Preferences.get({ key })
  return value?.trim() || null
}

export async function getOpenAiKey(): Promise<string | null> {
  return get(OPENAI_KEY)
}

export async function setOpenAiKey(key: string | null): Promise<void> {
  const v = key?.trim()
  if (v) await Preferences.set({ key: OPENAI_KEY, value: v })
  else await Preferences.remove({ key: OPENAI_KEY })
}

export async function getModels(): Promise<{ vision: string; text: string }> {
  return {
    vision: (await get(MODEL_VISION)) ?? DEFAULT_MODELS.vision,
    text: (await get(MODEL_TEXT)) ?? DEFAULT_MODELS.text,
  }
}

export async function setModels(m: { vision: string; text: string }): Promise<void> {
  await Preferences.set({ key: MODEL_VISION, value: m.vision })
  await Preferences.set({ key: MODEL_TEXT, value: m.text })
}

export async function getMonthlyLimitUsd(): Promise<number> {
  const n = Number(await get(LIMIT))
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT_USD
}

export async function setMonthlyLimitUsd(n: number): Promise<void> {
  await Preferences.set({ key: LIMIT, value: String(n > 0 ? n : DEFAULT_LIMIT_USD) })
}

export async function getTheme(): Promise<Theme> {
  const v = await get(THEME)
  return v === 'light' || v === 'dark' ? v : 'system'
}

export async function setTheme(t: Theme): Promise<void> {
  await Preferences.set({ key: THEME, value: t })
}
