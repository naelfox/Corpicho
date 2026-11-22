'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { saveProfileAndGoal } from '@/lib/api'
import { todayIn } from '@/lib/dates'
import { ageOn, suggestTargets, type Macros, type Sex } from '@/lib/nutrition'
import type { Goal, Profile } from '@/lib/profile'
import { ValidationError, parseNum } from '@/lib/validate'
import { fromIso, maskDate, toIso } from './birthDate'
import { Chip, OptionList, Segmented } from './Chips'
import { NumberField } from './NumberField'
import { btnGhost, btnPrimary, fieldLabel } from './Sheet'
import { toast } from './Toast'

export const ACTIVITY_LEVELS: { id: number; title: string; hint: string }[] = [
  { id: 1.2, title: 'Quase parado', hint: 'Trabalho sentado e pouco movimento no dia.' },
  { id: 1.375, title: 'Pouco ativo', hint: 'Caminho um pouco ou treino 1 a 3 vezes por semana.' },
  { id: 1.55, title: 'Ativo', hint: 'Treino 3 a 5 vezes por semana.' },
  { id: 1.725, title: 'Muito ativo', hint: 'Treino pesado 6 ou 7 vezes por semana.' },
  { id: 1.9, title: 'Atleta', hint: 'Treino duas vezes por dia ou trabalho braçal pesado.' },
]

export const FITNESS: { id: Profile['fitness']; title: string; hint: string }[] = [
  { id: 'baixo', title: 'Baixo', hint: 'Canso rápido subindo escada ou caminhando.' },
  { id: 'medio', title: 'Médio', hint: 'Aguento uma caminhada longa ou um treino leve.' },
  { id: 'alto', title: 'Alto', hint: 'Treino com frequência e tenho fôlego.' },
]

export const EXPERIENCE: { id: Profile['experience']; title: string; hint: string }[] = [
  { id: 'nenhuma', title: 'Nunca treinei', hint: 'Vou começar do zero.' },
  { id: 'iniciante', title: 'Iniciante', hint: 'Menos de 6 meses de treino.' },
  { id: 'intermediario', title: 'Intermediário', hint: 'De 6 meses a 2 anos treinando.' },
  { id: 'avancado', title: 'Avançado', hint: 'Mais de 2 anos treinando com regularidade.' },
]

export const EQUIPMENT = ['Nenhum', 'Halteres', 'Barra', 'Academia completa', 'Elástico', 'Bicicleta', 'Esteira']

const SEX_OPTIONS: { id: Sex; label: string }[] = [
  { id: 'f', label: 'Feminino' },
  { id: 'm', label: 'Masculino' },
]
const DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ id: d, label: String(d) }))

type Step = 'intro' | 'dados' | 'peso' | 'meta' | 'treino'
const FORM_STEPS: Step[] = ['dados', 'peso', 'meta', 'treino']

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))

export type ProfileFormInitial = { profile: Profile | null; goal: Goal | null; weightKg: number | null }

/**
 * Primeiro uso (mode "new"): boas-vindas → dados → peso → meta sugerida → treino → salva tudo.
 * Ajustes (mode "edit"): os mesmos passos, preenchidos; salvar grava uma meta nova (o histórico fica).
 */
export function Onboarding({
  mode,
  initial,
  onDone,
  onCancel,
}: {
  mode: 'new' | 'edit'
  initial?: ProfileFormInitial
  onDone: () => void
  onCancel?: () => void
}) {
  const p = initial?.profile ?? null
  const g = initial?.goal ?? null
  const [step, setStep] = useState<Step>(mode === 'new' ? 'intro' : 'dados')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [birthDate, setBirthDate] = useState(p?.birthDate ?? '')
  const [birthText, setBirthText] = useState(fromIso(p?.birthDate ?? ''))
  const [sex, setSex] = useState<Sex | null>(p?.sex ?? null)
  const [height, setHeight] = useState(str(p?.heightCm))
  const [activity, setActivity] = useState<number | null>(p?.activityLevel ?? null)

  const [weight, setWeight] = useState(str(initial?.weightKg ?? g?.startWeightKg))
  const [target, setTarget] = useState(str(g?.targetWeightKg))

  const [kcal, setKcal] = useState(str(g?.kcal))
  const [protein, setProtein] = useState(str(g?.proteinG))
  const [carbs, setCarbs] = useState(str(g?.carbsG))
  const [fat, setFat] = useState(str(g?.fatG))
  // Já mexeu na meta (ou veio preenchida)? Então não sobrescrever com a sugestão ao passar pelo passo.
  const [targetsTouched, setTargetsTouched] = useState(g !== null)

  const [fitness, setFitness] = useState<Profile['fitness'] | null>(p?.fitness ?? null)
  const [experience, setExperience] = useState<Profile['experience'] | null>(p?.experience ?? null)
  const [days, setDays] = useState<number | null>(p?.daysPerWeek ?? null)
  const [minutes, setMinutes] = useState(str(p?.minutesPerSession ?? (mode === 'new' ? 45 : null)))
  const [equipment, setEquipment] = useState<string[]>(p?.equipment ?? ['Nenhum'])
  const [restrictions, setRestrictions] = useState(p?.restrictions ?? '')

  const suggestion = useMemo<Macros | null>(() => {
    try {
      if (!sex || activity === null || !birthDate) return null
      return suggestTargets({
        sex,
        weightKg: parseNum(weight, { min: 20, max: 400, label: 'Peso' }),
        heightCm: parseNum(height, { min: 100, max: 250, label: 'Altura' }),
        age: ageOn(birthDate, todayIn()),
        activityLevel: activity,
      })
    } catch {
      return null
    }
  }, [sex, activity, birthDate, weight, height])

  const applySuggestion = (s: Macros) => {
    setKcal(String(s.kcal))
    setProtein(String(s.protein))
    setCarbs(String(s.carbs))
    setFat(String(s.fat))
  }

  /** Confere o passo atual; lança ValidationError com a mensagem para a tela. */
  const check = (s: Step) => {
    if (s === 'dados') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new ValidationError('Nascimento: informe a data.')
      const today = todayIn()
      if (birthDate > today) throw new ValidationError('Nascimento: a data não pode estar no futuro.')
      const age = ageOn(birthDate, today)
      if (age < 10 || age > 120) throw new ValidationError('Nascimento: confira a data (idade entre 10 e 120 anos).')
      if (!sex) throw new ValidationError('Sexo: escolha uma opção.')
      parseNum(height, { min: 100, max: 250, label: 'Altura (cm)' })
      if (activity === null) throw new ValidationError('Nível de atividade: escolha uma opção.')
    } else if (s === 'peso') {
      parseNum(weight, { min: 20, max: 400, label: 'Peso atual (kg)' })
      parseNum(target, { min: 20, max: 400, label: 'Peso desejado (kg)' })
    } else if (s === 'meta') {
      parseNum(kcal, { min: 800, max: 6000, label: 'Calorias' })
      parseNum(protein, { min: 0, max: 1000, label: 'Proteína' })
      parseNum(carbs, { min: 0, max: 1000, label: 'Carboidratos' })
      parseNum(fat, { min: 0, max: 1000, label: 'Gordura' })
    } else if (s === 'treino') {
      if (!fitness) throw new ValidationError('Condicionamento: escolha uma opção.')
      if (!experience) throw new ValidationError('Experiência: escolha uma opção.')
      if (days === null) throw new ValidationError('Dias por semana: escolha quantos.')
      parseNum(minutes, { min: 10, max: 240, label: 'Minutos por treino' })
    }
  }

  const idx = FORM_STEPS.indexOf(step)

  const go = (to: Step) => {
    setError(null)
    if (to === 'meta' && !targetsTouched && suggestion) applySuggestion(suggestion)
    setStep(to)
    window.scrollTo(0, 0)
  }

  const next = () => {
    try {
      check(step)
    } catch (e) {
      if (e instanceof ValidationError) return setError(e.message)
      throw e
    }
    if (step === 'treino') return void save()
    go(step === 'intro' ? 'dados' : FORM_STEPS[idx + 1])
  }

  const back = () => {
    if (idx > 0) go(FORM_STEPS[idx - 1])
    else if (mode === 'new') go('intro')
    else onCancel?.()
  }

  // "Voltar" do Android: volta um passo (ou fecha o editor) em vez de sair do app.
  // Uma entrada no histórico segura o voltar enquanto há para onde voltar dentro do formulário.
  const guarded = mode === 'edit' || step !== 'intro'
  const nav = useRef({ back, idx })
  useEffect(() => {
    nav.current = { back, idx }
  })
  useEffect(() => {
    if (!guarded) return
    if (!window.history.state?.onboarding) window.history.pushState({ onboarding: true }, '')
    const onPop = () => {
      // Ainda sobra passo para trás depois deste? Então segura o próximo voltar também.
      if (nav.current.idx > 0) window.history.pushState({ onboarding: true }, '')
      nav.current.back()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [guarded])
  /** Saindo pelo botão (salvar/fechar): tira a entrada de guarda do histórico. */
  const leave = (fn?: () => void) => {
    if (window.history.state?.onboarding) window.history.back()
    fn?.()
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const weightKg = parseNum(weight, { min: 20, max: 400, label: 'Peso atual (kg)' })
      const profile: Profile = {
        birthDate,
        sex: sex!,
        heightCm: parseNum(height, { min: 100, max: 250, label: 'Altura (cm)' }),
        activityLevel: activity!,
        fitness: fitness!,
        experience: experience!,
        daysPerWeek: days!,
        minutesPerSession: parseNum(minutes, { min: 10, max: 240, label: 'Minutos por treino' }),
        equipment,
        restrictions: restrictions.trim(),
      }
      const goal: Goal = {
        // Editando, o ponto de partida continua o da meta anterior (a barra de progresso não zera).
        startWeightKg: mode === 'edit' && g ? g.startWeightKg : weightKg,
        targetWeightKg: parseNum(target, { min: 20, max: 400, label: 'Peso desejado (kg)' }),
        kcal: parseNum(kcal, { min: 800, max: 6000, label: 'Calorias' }),
        proteinG: parseNum(protein, { min: 0, max: 1000, label: 'Proteína' }),
        carbsG: parseNum(carbs, { min: 0, max: 1000, label: 'Carboidratos' }),
        fatG: parseNum(fat, { min: 0, max: 1000, label: 'Gordura' }),
      }
      // Peso só vira registro novo se mudou (medições nunca são editadas, só acrescentadas).
      const newWeight = mode === 'new' || initial?.weightKg == null || weightKg !== initial.weightKg ? weightKg : undefined
      await saveProfileAndGoal({ profile, goal, weightKg: newWeight })
      toast(mode === 'new' ? 'Tudo pronto! Bem-vindo ao Corpicho.' : 'Perfil e meta salvos.')
      leave(onDone)
    } catch (e) {
      if (e instanceof ValidationError) setError(e.message)
      else {
        console.error(e)
        setError('Não deu para salvar. Tente de novo.')
      }
      setSaving(false)
    }
  }

  const toggleEquipment = (item: string) =>
    setEquipment((cur) => {
      if (item === 'Nenhum') return ['Nenhum']
      const rest = cur.filter((x) => x !== 'Nenhum')
      const nextList = rest.includes(item) ? rest.filter((x) => x !== item) : [...rest, item]
      return nextList.length ? nextList : ['Nenhum']
    })

  if (step === 'intro') {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className="anim-enter-up flex flex-1 flex-col items-center justify-center gap-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- export estático, ícone local */}
          <img src="/icon-192.png" alt="" width={88} height={88} className="size-22 rounded-[26px] shadow-[var(--shadow-card)]" />
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Oi! Vamos montar seu Corpicho.</h1>
          <p className="max-w-xs text-[16px] leading-relaxed text-[var(--muted)]">
            Umas perguntas rápidas para calcular sua meta de calorias e preparar seus treinos. Leva uns 2 minutos.
          </p>
          <p className="max-w-xs text-[13px] leading-snug text-[var(--muted)]">Seus dados ficam só neste celular.</p>
        </div>
        <button type="button" onClick={next} className={`${btnPrimary} w-full`}>
          Começar
        </button>
      </main>
    )
  }

  const macroKcal = (() => {
    try {
      return Math.round(
        parseNum(protein, { min: 0, max: 1000, label: '' }) * 4 +
          parseNum(carbs, { min: 0, max: 1000, label: '' }) * 4 +
          parseNum(fat, { min: 0, max: 1000, label: '' }) * 9,
      )
    } catch {
      return null
    }
  })()
  const wantsToGain = (() => {
    try {
      return (
        parseNum(target, { min: 20, max: 400, label: '' }) >= parseNum(weight, { min: 20, max: 400, label: '' })
      )
    } catch {
      return false
    }
  })()
  const differsFromSuggestion =
    suggestion &&
    (kcal !== String(suggestion.kcal) ||
      protein !== String(suggestion.protein) ||
      carbs !== String(suggestion.carbs) ||
      fat !== String(suggestion.fat))

  const touchTargets = (set: (v: string) => void) => (v: string) => {
    setTargetsTouched(true)
    set(v)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pt-[max(12px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-2 py-2">
        <button
          type="button"
          onClick={mode === 'edit' ? () => leave(onCancel) : back}
          aria-label={mode === 'edit' ? 'Fechar sem salvar' : 'Voltar'}
          className="-ml-2 grid size-11 shrink-0 place-items-center rounded-xl text-[var(--muted)] transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.92]"
        >
          {mode === 'edit' ? <X size={22} strokeWidth={1.75} /> : <ArrowLeft size={22} strokeWidth={1.75} />}
        </button>
        <div
          className="flex flex-1 gap-1.5"
          role="progressbar"
          aria-label="Progresso"
          aria-valuemin={1}
          aria-valuemax={FORM_STEPS.length}
          aria-valuenow={idx + 1}
          aria-valuetext={`Passo ${idx + 1} de ${FORM_STEPS.length}`}
        >
          {FORM_STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-[background-color] duration-300 ${
                i <= idx ? 'bg-[var(--accent)]' : 'bg-[var(--line)]'
              }`}
            />
          ))}
        </div>
        <span className="w-11 shrink-0 text-right text-[13px] tabular-nums text-[var(--muted)]">
          {idx + 1}/{FORM_STEPS.length}
        </span>
      </header>

      <form
        key={step}
        noValidate
        onChange={() => error && setError(null)}
        onSubmit={(e) => {
          e.preventDefault()
          next()
        }}
        className="anim-enter-side flex flex-1 flex-col"
      >
        <div className="flex flex-1 flex-col gap-6 pt-4 pb-6">
          {step === 'dados' && (
            <>
              <StepTitle
                title={mode === 'edit' ? 'Seus dados' : 'Sobre você'}
                text="Usamos isso para calcular quanto seu corpo gasta por dia."
              />
              <div>
                <label htmlFor="birth" className={fieldLabel}>
                  Data de nascimento
                </label>
                <input
                  id="birth"
                  type="text"
                  inputMode="numeric"
                  autoComplete="bday"
                  placeholder="DD/MM/AAAA"
                  value={birthText}
                  onChange={(e) => {
                    const masked = maskDate(e.target.value)
                    setBirthText(masked)
                    setBirthDate(toIso(masked))
                  }}
                  className="h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-[16px] tabular-nums outline-none transition-[border-color] duration-150 focus:border-[var(--accent)]"
                />
                {birthText.length === 10 && !birthDate && (
                  <p className="mt-2 text-[13px] text-[var(--danger)]">Essa data não existe.</p>
                )}
              </div>
              <div>
                <span className={fieldLabel}>Sexo</span>
                <Segmented label="Sexo" options={SEX_OPTIONS} value={sex} onChange={setSex} />
                <p className="mt-2 text-[13px] text-[var(--muted)]">Usado só na fórmula de calorias.</p>
              </div>
              <NumberField label="Altura" value={height} onChange={setHeight} unit="cm" decimals={0} placeholder="170" />
              <div>
                <span className={fieldLabel}>No dia a dia, você é…</span>
                <OptionList label="Nível de atividade" options={ACTIVITY_LEVELS} value={activity} onChange={setActivity} />
              </div>
            </>
          )}

          {step === 'peso' && (
            <>
              <StepTitle title="Seu peso" text="O peso de hoje vira o primeiro ponto do seu gráfico." />
              <NumberField label="Peso atual" value={weight} onChange={setWeight} unit="kg" placeholder="80,0" />
              <NumberField label="Peso desejado" value={target} onChange={setTarget} unit="kg" placeholder="72,0" />
              {mode === 'edit' && (
                <p className="text-[13px] leading-snug text-[var(--muted)]">
                  Se o peso atual mudar, ele entra como um registro novo; os anteriores ficam no histórico.
                </p>
              )}
            </>
          )}

          {step === 'meta' && (
            <>
              <StepTitle
                title="Sua meta diária"
                text="Sugestão para perder peso aos poucos: o que seu corpo gasta no dia menos 500 kcal. Dá para mudar qualquer número."
              />
              <NumberField label="Calorias" value={kcal} onChange={touchTargets(setKcal)} unit="kcal" decimals={0} />
              <div className="grid grid-cols-3 gap-2">
                <MacroField label="Proteína" color="var(--protein)" value={protein} onChange={touchTargets(setProtein)} />
                <MacroField label="Carbo" color="var(--carbs)" value={carbs} onChange={touchTargets(setCarbs)} />
                <MacroField label="Gordura" color="var(--fat)" value={fat} onChange={touchTargets(setFat)} />
              </div>
              {macroKcal !== null && (
                <p className="text-[13px] text-[var(--muted)]">
                  Os macros somam <span className="tabular-nums">{macroKcal}</span> kcal.
                </p>
              )}
              {suggestion && differsFromSuggestion && (
                <button
                  type="button"
                  onClick={() => {
                    applySuggestion(suggestion)
                    setTargetsTouched(true)
                  }}
                  className="self-start rounded-lg py-1 text-[15px] font-medium text-[var(--accent-text)] transition-transform duration-150 active:scale-[0.97]"
                >
                  Usar sugestão ({suggestion.kcal} kcal)
                </button>
              )}
              {wantsToGain && (
                <p className="rounded-xl bg-[var(--accent-soft)] px-3 py-2.5 text-[13px] leading-snug">
                  Seu peso desejado não é menor que o atual. Se a ideia é ganhar massa, aumente as calorias.
                </p>
              )}
            </>
          )}

          {step === 'treino' && (
            <>
              <StepTitle title="Treino" text="Para montar uma rotina que caiba na sua semana." />
              <div>
                <span className={fieldLabel}>Condicionamento hoje</span>
                <OptionList label="Condicionamento" options={FITNESS} value={fitness} onChange={setFitness} />
              </div>
              <div>
                <span className={fieldLabel}>Experiência com treino</span>
                <OptionList label="Experiência" options={EXPERIENCE} value={experience} onChange={setExperience} />
              </div>
              <div>
                <span className={fieldLabel}>Dias por semana</span>
                <Segmented label="Dias por semana" options={DAYS_OPTIONS} value={days} onChange={setDays} />
              </div>
              <NumberField
                label="Minutos por treino"
                value={minutes}
                onChange={setMinutes}
                unit="min"
                decimals={0}
                placeholder="45"
              />
              <div>
                <span className={fieldLabel}>Equipamentos que você tem</span>
                <div className="flex flex-wrap gap-2">
                  {EQUIPMENT.map((item) => (
                    <Chip key={item} active={equipment.includes(item)} onClick={() => toggleEquipment(item)}>
                      {item}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="restrictions" className={fieldLabel}>
                  Restrições ou lesões (opcional)
                </label>
                <textarea
                  id="restrictions"
                  value={restrictions}
                  onChange={(e) => setRestrictions(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Ex.: dor no joelho direito, hérnia de disco…"
                  className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-[16px] leading-snug outline-none transition-[border-color] duration-150 placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)]"
                />
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 -mx-5 flex flex-col gap-2 bg-[var(--bg)] px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
          {error && (
            <p role="alert" className="rounded-xl bg-[var(--danger-soft)] px-3 py-2.5 text-[14px] leading-snug text-[var(--ink)]">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            {(idx > 0 || mode === 'new') && (
              <button type="button" onClick={back} className={btnGhost} disabled={saving}>
                Voltar
              </button>
            )}
            <button type="submit" disabled={saving} className={`${btnPrimary} flex-1`}>
              {step === 'treino' ? (saving ? 'Salvando…' : mode === 'new' ? 'Salvar e começar' : 'Salvar') : 'Continuar'}
            </button>
          </div>
        </div>
      </form>
    </main>
  )
}

function StepTitle({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="mt-1.5 text-[15px] leading-snug text-[var(--muted)]">{text}</p>
    </div>
  )
}

function MacroField({
  label,
  color,
  value,
  onChange,
}: {
  label: string
  color: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <NumberField
      label={
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
      }
      value={value}
      onChange={onChange}
      unit="g"
      decimals={0}
    />
  )
}
