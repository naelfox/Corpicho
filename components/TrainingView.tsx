'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dumbbell, Footprints, Pencil, Play, Sparkles } from 'lucide-react'
import {
  applyAdjustmentsApi, generatePlanDraft, loadTraining, savePlan, startSessionApi, subscribe, suggestAdjustmentsApi,
  type Adjustment, type AdjustmentSuggestion, type PlanDraft, type TrainingData,
} from '@/lib/api'
import { AI_ERROR_TEXT, AiError } from '@/lib/ai/client'
import { todayIn } from '@/lib/dates'
import { ValidationError } from '@/lib/validate'
import { ExerciseCard } from './ExerciseCard'
import { PlanEditor, WEEK_ORDER, WEEKDAY_NAME, WeekStrip } from './PlanEditor'
import { ActivitySheet, SessionSheet } from './SessionSheet'
import { Sheet, btnGhost, btnPrimary } from './Sheet'
import { toast } from './Toast'
import { dateOnly } from './format'

const card = 'rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-card)]'
const btnOutline =
  'flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 text-[15px] font-medium transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97] disabled:opacity-50'

/** Rascunho da IA: mostra o plano inteiro para aceitar, ajustar ou descartar. */
function DraftSheet({ draft, onClose, onAdjust }: { draft: PlanDraft | null; onClose: () => void; onAdjust: () => void }) {
  const [busy, setBusy] = useState(false)
  const days = WEEK_ORDER.filter((d) => draft?.items.some((i) => i.weekday === d))

  const accept = async () => {
    if (!draft) return
    setBusy(true)
    try {
      await savePlan(draft, 'ia')
      toast('Plano salvo. Bons treinos!')
      onClose()
    } catch (e) {
      if (e instanceof ValidationError) toast(e.message, 'erro')
      else {
        console.error(e)
        toast('Não deu para salvar o plano.', 'erro')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!draft} onOpenChange={(o) => !o && onClose()} title="Plano sugerido">
      {draft && (
        <>
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent-text)]">
            <Sparkles aria-hidden size={15} /> Sugestão da IA
          </p>
          <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.01em]">{draft.name}</h2>
          {draft.notes && <p className="mt-1 text-[14px] leading-snug text-[var(--muted)]">{draft.notes}</p>}
          <div className="mt-4 flex flex-col gap-5">
            {days.map((d) => (
              <section key={d} aria-label={WEEKDAY_NAME[d]}>
                <h3 className="mb-2 text-[13px] font-medium text-[var(--muted)]">{WEEKDAY_NAME[d]}</h3>
                <div className="flex flex-col gap-2">
                  {draft.items.filter((i) => i.weekday === d).map((i, k) => (
                    <ExerciseCard key={k} ex={{ ...i.exercise, ...i }} />
                  ))}
                </div>
              </section>
            ))}
          </div>
          <p className="mt-4 text-[12px] leading-snug text-[var(--muted)]">
            Sugestão automática a partir do seu perfil. Não substitui a orientação de um profissional de educação física ou médico.
          </p>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={onAdjust} className={btnGhost}>
              Ajustar
            </button>
            <button type="button" onClick={() => void accept()} disabled={busy} className={`${btnPrimary} flex-1`}>
              {busy ? 'Salvando…' : 'Usar este plano'}
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}

const FIELD_LABEL: Record<Adjustment['field'], { label: string; unit: string }> = {
  sets: { label: 'séries', unit: '' },
  reps: { label: 'repetições', unit: '' },
  loadKg: { label: 'carga', unit: ' kg' },
  durationS: { label: 'duração', unit: ' s' },
  restS: { label: 'descanso', unit: ' s' },
}

/** Sugestões da IA: cada mudança com o motivo; o usuário aceita ou recusa uma a uma. */
function AdjustSheet({
  result, names, onClose,
}: { result: AdjustmentSuggestion | null; names: Record<string, string>; onClose: () => void }) {
  const [off, setOff] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const changes = result?.changes ?? []
  const chosen = changes.filter((_, i) => !off.has(i))

  const apply = async () => {
    setBusy(true)
    try {
      await applyAdjustmentsApi(chosen)
      toast('Plano ajustado. O anterior ficou no histórico.')
      onClose()
    } catch (e) {
      if (e instanceof ValidationError) toast(e.message, 'erro')
      else {
        console.error(e)
        toast('Não deu para aplicar os ajustes.', 'erro')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!result} onOpenChange={(o) => !o && onClose()} title="Sugestões da IA">
      {result && (
        <>
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent-text)]">
            <Sparkles aria-hidden size={15} /> Sugestões da IA
          </p>
          {changes.length === 0 && <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.01em]">Nenhum ajuste recomendado agora</h2>}
          {result.summary && <p className="mt-1 text-[14px] leading-snug text-[var(--muted)]">{result.summary}</p>}
          {changes.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {changes.map((c, i) => {
                const f = FIELD_LABEL[c.field]
                const id = `adj-${i}`
                return (
                  <li key={id} className="flex items-start gap-3 rounded-xl border border-[var(--line)] p-3">
                    <input
                      id={id}
                      type="checkbox"
                      checked={!off.has(i)}
                      onChange={() =>
                        setOff((o) => {
                          const n = new Set(o)
                          if (n.has(i)) n.delete(i)
                          else n.add(i)
                          return n
                        })
                      }
                      className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
                    />
                    <label htmlFor={id} className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">
                        {names[c.planItemId] ?? 'Exercício'}: {f.label} {c.from} → {c.to}
                        {f.unit}
                      </span>
                      {c.reason && <span className="mt-0.5 block text-[13px] leading-snug text-[var(--muted)]">{c.reason}</span>}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-4 text-[12px] leading-snug text-[var(--muted)]">
            Sugestões automáticas, nada muda sem você aceitar. Não substituem a orientação de um profissional de educação física ou médico.
          </p>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={onClose} className={btnGhost}>
              {changes.length ? 'Fechar' : 'Ok'}
            </button>
            {changes.length > 0 && (
              <button type="button" onClick={() => void apply()} disabled={busy || chosen.length === 0} className={`${btnPrimary} flex-1`}>
                {busy ? 'Aplicando…' : 'Aplicar selecionadas'}
              </button>
            )}
          </div>
        </>
      )}
    </Sheet>
  )
}

/** Aba Treino: o treino de hoje pelo plano ativo, a semana, registrar sessão ou atividade avulsa e o histórico. */
export function TrainingView() {
  const [data, setData] = useState<TrainingData | null>(null)
  const [error, setError] = useState(false)
  const [day, setDay] = useState<number | null>(null)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [editor, setEditor] = useState<{ initial: PlanDraft | null; origin: 'ia' | 'manual'; key: number } | null>(null)
  const [draft, setDraft] = useState<PlanDraft | null>(null)
  const [generating, setGenerating] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [adjust, setAdjust] = useState<AdjustmentSuggestion | null>(null)
  const [starting, setStarting] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await loadTraining())
      setError(false)
    } catch (e) {
      console.error(e)
      setError(true)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial do banco local
    void load()
    return subscribe(load)
  }, [load])

  const generate = async () => {
    setGenerating(true)
    try {
      const d = await generatePlanDraft()
      if (d.items.length) setDraft(d)
      else toast('A IA não gerou exercícios. Tente de novo.', 'erro')
    } catch (e) {
      if (e instanceof ValidationError) toast(e.message, 'erro')
      else {
        if (!(e instanceof AiError)) console.error(e)
        toast(e instanceof AiError ? AI_ERROR_TEXT[e.code] : AI_ERROR_TEXT.failed, 'erro')
      }
    } finally {
      setGenerating(false)
    }
  }

  const suggest = async () => {
    setSuggesting(true)
    try {
      setAdjust(await suggestAdjustmentsApi())
    } catch (e) {
      if (e instanceof ValidationError) toast(e.message, 'erro')
      else {
        if (!(e instanceof AiError)) console.error(e)
        toast(e instanceof AiError ? AI_ERROR_TEXT[e.code] : AI_ERROR_TEXT.failed, 'erro')
      }
    } finally {
      setSuggesting(false)
    }
  }

  if (!data) {
    return error ? (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-[15px] text-[var(--muted)]">Não deu para carregar seus treinos.</p>
        <button type="button" onClick={() => void load()} className={btnPrimary}>
          Tentar de novo
        </button>
      </div>
    ) : (
      <div role="status" className="grid min-h-[50dvh] place-items-center">
        <span aria-hidden className="size-6 animate-spin rounded-full border-[3px] border-[var(--accent-soft)] border-t-[var(--accent)]" />
        <span className="sr-only">Carregando…</span>
      </div>
    )
  }

  const { plan, weekday: today, open, recent } = data
  const shown = day ?? today
  const items = plan?.items.filter((i) => i.weekday === shown) ?? []
  const todayItems = plan?.items.filter((i) => i.weekday === today) ?? []
  const isToday = shown === today
  // Já concluiu um treino do plano hoje: o botão continua (pode treinar de novo), só muda o texto.
  const doneToday = recent.some((r) => r.day === todayIn() && r.planId !== null)

  const start = async () => {
    if (open) {
      setSessionOpen(true)
      return
    }
    setStarting(true)
    try {
      await startSessionApi(plan?.id)
      setSessionOpen(true)
    } catch (e) {
      console.error(e)
      toast('Não deu para começar o treino.', 'erro')
    } finally {
      setStarting(false)
    }
  }

  const planFromActive = (): PlanDraft | null =>
    plan
      ? {
          name: plan.name,
          notes: plan.notes ?? '',
          items: plan.items.map((i) => ({
            weekday: i.weekday,
            exercise: { name: i.exercise.name, description: i.exercise.description, kind: i.exercise.kind, muscles: i.exercise.muscles },
            ...(i.sets !== null && { sets: i.sets }),
            ...(i.reps !== null && { reps: i.reps }),
            ...(i.durationS !== null && { durationS: i.durationS }),
            ...(i.restS !== null && { restS: i.restS }),
            ...(i.loadKg !== null && { loadKg: i.loadKg }),
          })),
        }
      : null

  const aiButton = (
    <button type="button" onClick={() => void generate()} disabled={generating} className={`${btnPrimary} flex items-center justify-center gap-2`}>
      <Sparkles aria-hidden size={18} /> {generating ? 'Montando seu plano…' : 'Gerar plano com IA'}
    </button>
  )

  return (
    <div className="anim-enter-up flex flex-col gap-3 pt-3">
      {!plan ? (
        <section className={`${card} flex flex-col items-center gap-3 py-8 text-center`} aria-label="Sem plano">
          <span className="grid size-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Dumbbell aria-hidden size={26} strokeWidth={1.75} />
          </span>
          <p className="text-[17px] font-semibold">Monte sua rotina</p>
          <p className="max-w-xs text-[14px] leading-snug text-[var(--muted)]">
            A IA sugere um plano pelo seu perfil (dias, tempo, equipamentos e restrições), ou crie o seu à mão.
          </p>
          <div className="mt-1 flex w-full flex-col gap-2">
            {aiButton}
            <button type="button" onClick={() => setEditor({ initial: null, origin: 'manual', key: Date.now() })} className={btnOutline}>
              <Pencil aria-hidden size={17} /> Criar à mão
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className={card} aria-label="Plano da semana">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] text-[var(--muted)]">{isToday ? 'Hoje' : 'Espiando'}</p>
                <h2 className="text-[20px] leading-tight font-semibold tracking-[-0.01em]">{WEEKDAY_NAME[shown]}</h2>
              </div>
              <p className="min-w-0 truncate text-right text-[13px] text-[var(--muted)]">
                {plan.name}
                {plan.origin === 'ia' && ' · IA'}
              </p>
            </div>
            <WeekStrip value={shown} today={today} hasItems={(d) => plan.items.some((i) => i.weekday === d)} onChange={setDay} />
          </section>

          {open && !sessionOpen && (
            <section className={`${card} anim-enter-up flex items-center gap-3`} aria-label="Treino em andamento">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">Treino em andamento</p>
                <p className="text-[13px] text-[var(--muted)]">{open.sets.length} séries marcadas</p>
              </div>
              <button type="button" onClick={() => setSessionOpen(true)} className={`${btnPrimary} px-4`}>
                Continuar
              </button>
            </section>
          )}

          {items.length === 0 ? (
            <section className={`${card} py-6 text-center`} aria-label="Dia de descanso">
              <p className="text-[16px] font-semibold">Dia de descanso</p>
              <p className="mx-auto mt-1 max-w-xs text-[14px] leading-snug text-[var(--muted)]">
                Recuperar também faz parte. Se quiser se mexer, uma caminhada leve é bem-vinda.
              </p>
            </section>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((it) => (
                <ExerciseCard key={it.id} ex={{ ...it.exercise, ...it }} />
              ))}
            </div>
          )}

          {isToday && todayItems.length > 0 && !open && (
            <button type="button" onClick={() => void start()} disabled={starting} className={`${btnPrimary} flex items-center justify-center gap-2`}>
              <Play aria-hidden size={18} /> {doneToday ? 'Treinar de novo' : 'Começar treino'}
            </button>
          )}
        </>
      )}

      <button type="button" onClick={() => setActivityOpen(true)} className={btnOutline}>
        <Footprints aria-hidden size={18} /> Atividade avulsa
      </button>

      {recent.length > 0 && (
        <section className={card} aria-label="Últimos treinos">
          <h3 className="mb-1 text-[13px] font-medium text-[var(--muted)]">Últimos treinos</h3>
          <ul className="flex flex-col">
            {recent.map((r) => (
              <li key={r.id} className="flex min-h-12 items-center gap-3 border-b border-[var(--line)]/70 py-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">
                    {r.planId ? 'Treino do plano' : (r.exercises[0] ?? 'Atividade')}
                  </p>
                  <p className="truncate text-[12px] text-[var(--muted)]">
                    {[dateOnly(`${r.day}T12:00:00Z`), r.planId && r.exercises.length ? `${r.exercises.length} ${r.exercises.length === 1 ? 'exercício' : 'exercícios'}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="shrink-0 text-right text-[13px] tabular-nums">
                  {r.durationMin !== null && <p className="font-semibold">{r.durationMin} min</p>}
                  {r.rpe !== null && <p className="text-[var(--muted)]">RPE {r.rpe}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setEditor({ initial: planFromActive(), origin: 'manual', key: Date.now() })}
            className={btnOutline}
          >
            <Pencil aria-hidden size={17} /> Editar plano
          </button>
          <button type="button" onClick={() => void generate()} disabled={generating} className={btnOutline}>
            <Sparkles aria-hidden size={17} /> {generating ? 'Montando seu plano…' : 'Gerar novo plano com IA'}
          </button>
          <button type="button" onClick={() => void suggest()} disabled={suggesting} className={btnOutline}>
            <Sparkles aria-hidden size={17} /> {suggesting ? 'Analisando seus treinos…' : 'Sugestões da IA'}
          </button>
          <p className="text-center text-[12px] leading-snug text-[var(--muted)]">Ao salvar um plano novo, o atual fica guardado no histórico.</p>
        </div>
      )}

      {open && (
        <SessionSheet key={open.id} open={sessionOpen} onClose={() => setSessionOpen(false)} items={todayItems} session={open} />
      )}
      <AdjustSheet
        key={adjust ? 'open' : 'closed'}
        result={adjust}
        names={Object.fromEntries((plan?.items ?? []).map((i) => [i.id, i.exercise.name]))}
        onClose={() => setAdjust(null)}
      />
      <ActivitySheet open={activityOpen} onClose={() => setActivityOpen(false)} />
      <DraftSheet
        draft={draft}
        onClose={() => setDraft(null)}
        onAdjust={() => {
          setEditor({ initial: draft, origin: 'ia', key: Date.now() })
          setDraft(null)
        }}
      />
      {editor && (
        <PlanEditor
          key={editor.key}
          open
          onClose={() => setEditor(null)}
          initial={editor.initial}
          origin={editor.origin}
          today={today}
        />
      )}
    </div>
  )
}
