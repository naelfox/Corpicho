import type { Db } from '@/lib/db'
import { addDays, todayIn, weekdayOf } from '@/lib/dates'
import { dailyTotals } from '@/lib/meals'
import { ageOn } from '@/lib/nutrition'
import { getGoal, getProfile } from '@/lib/profile'
import { currentComposition, latestByRegion, REGIONS, type CompMetric } from '@/lib/body'
import { getSeries } from '@/lib/series'
import { trainingStats } from '@/lib/training'
import { round1 } from '@/lib/validate'

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const SOURCE_LABEL = { measured: 'medido', calculated: 'calculado', estimated: 'estimado' }
const METRIC_LABEL: Record<CompMetric, string> = {
  body_fat_pct: 'Gordura corporal', muscle_kg: 'Massa muscular', visceral_fat: 'Gordura visceral',
  water_pct: 'Água corporal', bmi: 'IMC', weight_kg: 'Peso',
}
const METRIC_UNIT: Record<CompMetric, string> = {
  body_fat_pct: '%', muscle_kg: 'kg', visceral_fat: '', water_pct: '%', bmi: '', weight_kg: 'kg',
}
const FITNESS = { baixo: 'baixo', medio: 'médio', alto: 'alto' }

const num = (n: number, unit = '') => `${String(round1(n)).replace('.', ',')}${unit ? ` ${unit}` : ''}`
const int = (n: number, unit = '') => `${Math.round(n)}${unit ? ` ${unit}` : ''}`
const dayBr = (iso: string) => {
  const d = todayIn(new Date(iso))
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`
}
const NONE = 'sem registros'

async function nutritionBlock(db: Db, title: string, days: number, today: string): Promise<string> {
  const rows = await dailyTotals(db, addDays(today, -(days - 1)), today)
  if (!rows.length) return `## ${title}\n${NONE}`
  const n = rows.length
  const avg = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => rows.reduce((s, r) => s + r.totals[k], 0) / n
  return (
    `## ${title}\n` +
    `${n} ${n === 1 ? 'dia com registro' : 'dias com registro'} de ${days}; média só dos dias com registro: ` +
    `${int(avg('kcal'), 'kcal')}, proteína ${num(avg('protein'), 'g')}, carboidratos ${num(avg('carbs'), 'g')}, gordura ${num(avg('fat'), 'g')} por dia.`
  )
}

/** Texto em pt-BR com os dados da pessoa, para o coach responder. Não inventa nada: sem dado, diz "sem registros". */
export async function buildContext(db: Db, now: Date = new Date()): Promise<string> {
  const today = todayIn(now)
  const [profile, goal] = await Promise.all([getProfile(db), getGoal(db)])
  const blocks: string[] = [`Hoje: ${today} (${WEEKDAYS[weekdayOf(today)]}), fuso America/Sao_Paulo.`]

  blocks.push(
    profile
      ? `## Perfil\n${ageOn(profile.birthDate, today)} anos, sexo ${profile.sex === 'm' ? 'masculino' : 'feminino'}, ${int(profile.heightCm, 'cm')}; ` +
          `condicionamento ${FITNESS[profile.fitness]}, experiência ${profile.experience}; treina ${profile.daysPerWeek} dias/semana, ${profile.minutesPerSession} min; ` +
          `equipamentos: ${profile.equipment.join(', ') || 'nenhum'}; restrições/lesões: ${profile.restrictions.trim() || 'nenhuma informada'}.`
      : `## Perfil\n${NONE}`,
  )

  blocks.push(
    goal
      ? `## Meta\nEmagrecer de ${num(goal.startWeightKg, 'kg')} para ${num(goal.targetWeightKg, 'kg')}. Metas diárias: ${int(goal.kcal, 'kcal')}, ` +
          `proteína ${int(goal.proteinG, 'g')}, carboidratos ${int(goal.carbsG, 'g')}, gordura ${int(goal.fatG, 'g')}.`
      : `## Meta\n${NONE}`,
  )

  const [todayRow] = await dailyTotals(db, today, today)
  if (todayRow) {
    const t = todayRow.totals
    const rest = goal ? ` Meta ${int(goal.kcal, 'kcal')}: ${int(Math.abs(goal.kcal - t.kcal), 'kcal')} ${goal.kcal - t.kcal >= 0 ? 'restantes' : 'acima da meta'}.` : ''
    blocks.push(
      `## Hoje\nConsumido: ${int(t.kcal, 'kcal')}, proteína ${num(t.protein, 'g')}, carboidratos ${num(t.carbs, 'g')}, gordura ${num(t.fat, 'g')}.${rest}`,
    )
  } else {
    blocks.push(`## Hoje\nsem registros de alimentação hoje.${goal ? ` Meta do dia: ${int(goal.kcal, 'kcal')} (${int(goal.kcal, 'kcal')} restantes).` : ''}`)
  }

  blocks.push(await nutritionBlock(db, 'Alimentação 7 dias', 7, today))
  blocks.push(await nutritionBlock(db, 'Alimentação 30 dias', 30, today))

  const [w30, wAll] = await Promise.all([getSeries(db, 'peso', '30d', now), getSeries(db, 'peso', 'tudo', now)])
  if (!wAll.points.length) blocks.push(`## Peso\n${NONE}`)
  else {
    const f = w30.points[0]
    const l = wAll.points[wAll.points.length - 1]
    let line = `Último: ${num(l.value, 'kg')} em ${dayBr(l.at)}.`
    if (w30.points.length >= 2 && f) line += ` Nos últimos 30 dias: de ${num(f.value, 'kg')} (${dayBr(f.at)}) para ${num(w30.last!, 'kg')}, variação ${num(w30.delta ?? 0, 'kg')} em ${w30.points.length} pesagens.`
    else line += ' Menos de 2 pesagens nos últimos 30 dias, sem tendência.'
    blocks.push(`## Peso\n${line}`)
  }

  const regions = await latestByRegion(db)
  const mLines = REGIONS.flatMap((r) => {
    const v = regions[r.id]
    return v ? [`${r.label} ${num(v.cm, 'cm')} (${dayBr(v.at)}${v.delta === null ? '' : `, ${v.delta > 0 ? '+' : ''}${num(v.delta)} vs anterior`})`] : []
  })
  blocks.push(`## Medidas\n${mLines.length ? mLines.join('; ') + '.' : NONE}`)

  const comp = profile ? (await currentComposition(db, profile)).filter((c) => c.metric !== 'weight_kg') : []
  blocks.push(
    `## Composição\n${
      comp.length
        ? comp
            .map((c) => `${METRIC_LABEL[c.metric]} ${num(c.value, METRIC_UNIT[c.metric])} (${SOURCE_LABEL[c.source]}${c.method ? `, ${c.method}` : ''}, ${dayBr(c.at)})`)
            .join('; ') + '. Valores estimados não são medições.'
        : NONE
    }`,
  )

  const ts = await trainingStats(db, 14, now)
  if (!ts.sessions) blocks.push(`## Treino 14 dias\n${NONE}`)
  else {
    const ex = ts.byExercise
      .slice(0, 8)
      .map((e) => `${e.name} (${e.sets} séries${e.bestLoad !== null ? `, maior carga ${num(e.bestLoad, 'kg')}` : ''})`)
      .join('; ')
    blocks.push(
      `## Treino 14 dias\n${ts.sessions} treinos concluídos` +
        `${ts.avgRpe !== null ? `, esforço médio (RPE) ${num(ts.avgRpe)}` : ''}` +
        `${ts.restDaysAvg !== null ? `, descanso médio ${num(ts.restDaysAvg)} dias entre treinos` : ''}.${ex ? ` Exercícios: ${ex}.` : ''}`,
    )
  }

  return blocks.join('\n\n')
}
