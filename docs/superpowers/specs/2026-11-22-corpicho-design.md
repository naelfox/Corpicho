# Corpicho — design

Data: 2026-11-22

## Por quê

O usuário quer um assistente pessoal de emagrecimento e condicionamento físico, para uso próprio no celular Android.
Ele junta num app só o que come, como o corpo muda (peso, medidas, composição, fotos) e o que treina.
Uma IA (OpenAI, com a chave do próprio usuário) responde a partir desses dados, sem inventar nada.
Sucesso é registrar refeição, medida e treino em poucos toques, e enxergar a evolução ao longo de meses.

## Objetivos

1. **Perfil e meta**: idade, sexo, altura, peso inicial, peso desejado, nível de atividade, condicionamento, experiência,
   disponibilidade semanal, tempo por treino, equipamentos, restrições/lesões. Meta diária de calorias e macros
   calculada (Mifflin-St Jeor + fator de atividade − déficit), e editável.
2. **Dashboard**: peso atual/desejado, barra de progresso, anel de calorias (consumidas/meta/restantes),
   barras de proteína/carbo/gordura, treinos da semana, mini-gráfico de peso e resumo das medidas.
3. **Alimentação**:
   - Registro manual (nome, gramas, kcal, P, C, G). Se o alimento já tem valores por 100 g, os valores são calculados pelos gramas.
   - Base de alimentos: tabela TACO (brasileira, por 100 g) embutida, mais os alimentos do usuário e os que a IA estimou.
     Busca por nome. Alimentos usados recentemente aparecem primeiro.
   - **Foto do prato**: câmera → IA identifica os itens e estima por 100 g e um peso visual → tela de revisão:
     cada item com peso editável (a balança manda), recálculo na hora, trocar o alimento (busca na base), remover/adicionar.
     Nada é salvo sem confirmar. O peso digitado sempre substitui a estimativa visual.
   - Refeições: café da manhã, almoço, lanche, jantar, outras. Histórico por dia, com refeições anteriores consultáveis
     e o botão "repetir refeição".
4. **Meu Corpo**:
   - Silhueta SVG frente/costas com 12 regiões tocáveis (pescoço, ombros, peitoral, braço D/E, cintura, abdômen,
     quadril, coxa D/E, panturrilha D/E). Cada região mostra a última medida e a diferença para a anterior.
     Tocar abre a folha de registro (cm) e o histórico daquela região.
   - Registro de peso.
   - Composição corporal: % gordura, massa muscular, gordura visceral, água corporal, IMC, peso.
     Cada valor tem a **origem**: `medido` (balança de bioimpedância, adipômetro…), `calculado` (IMC a partir de peso e altura)
     ou `estimado` (ex.: % gordura pela fórmula da Marinha dos EUA com cintura/pescoço/quadril), sempre com um selo na tela.
   - Medições nunca são sobrescritas: cada registro tem data/hora próprias. Dá para apagar um registro errado, mas não editar.
5. **Evolução**: gráficos individuais (peso, cintura, abdômen, quadril, peitoral, braços, coxas, % gordura, massa muscular)
   com períodos 7d / 30d / 3m / 6m / 1a / tudo. Mostram os pontos registrados e a diferença entre o primeiro e o último do período.
   Mais um cartão de resumo da evolução.
6. **Fotos do corpo**: frente/lado/costas por data, guardadas na pasta privada do app (não vão para a galeria).
   Comparação lado a lado entre duas datas. A IA pode descrever as mudanças visuais, com instrução explícita para não
   afirmar medidas nem % de gordura. Proteção extra: bloqueio por biometria/PIN do aparelho para abrir a área de fotos.
7. **Treino**:
   - A IA monta a rotina semanal a partir da avaliação (perfil + histórico). Cada exercício tem nome, descrição,
     músculos trabalhados, séries, repetições ou tempo, descanso e visual.
   - Visual (decisão minha): os músculos trabalhados acendem na mesma silhueta do Meu Corpo, mais o ícone do tipo de atividade
     e o botão "ver demonstração", que abre uma busca de vídeo do exercício. Imagens geradas por IA ficam de fora (caras e pouco confiáveis).
   - O usuário também pode criar e editar exercícios e planos à mão.
   - Execução: marcar exercício como feito, registrando duração, carga, séries, repetições e dificuldade percebida (RPE 1–10).
     Atividade avulsa também (caminhada de 40 min, por exemplo).
   - Ajuste pela IA: analisa frequência, cargas, RPE e intervalos entre treinos e **sugere** mudanças, que o usuário
     aceita ou não. Nunca aumenta a intensidade sozinha. Com RPE alto ou pouca recuperação, a sugestão é manter ou reduzir.
8. **Meu Coach IA**: chat livre. A cada mensagem, o app monta um resumo dos dados reais (perfil, meta, hoje,
   últimos 7/30 dias de alimentação, peso, medidas, treinos) e o envia como contexto. Instruções do sistema:
   usar só esses dados, dizer quando falta dado, tom educativo, lembrar que não substitui médico ou nutricionista.
   As conversas ficam salvas.
9. **Relatório semanal**: gerado ao abrir o app depois que a semana fecha (seg–dom), ou na hora, pelo botão.
   Números calculados localmente (peso inicial/final/variação, medidas, média de kcal e proteína, nº de treinos,
   evolução de cargas). A IA escreve uma análise curta do que melhorou e do que merece atenção.
   Relatórios salvos. Sem chave, o relatório sai só com os números.
10. **Ajustes**: chave da OpenAI (colar, testar, apagar), escolha do modelo, limite de gasto (US$/mês), uso e custo
    estimado do mês, tema claro/escuro/sistema, editar perfil e meta.

## Fora do escopo

- Backend próprio, login, sincronização entre aparelhos, conta na nuvem.
- Integração com Google Fit/Health Connect, balanças Bluetooth, código de barras.
- Notificações e lembretes (pode vir depois).
- iOS.
- Exportar/importar backup (pode vir depois; fica anotado como próximo passo natural).

## Anti-objetivos (seria fracasso mesmo funcionando)

- Registrar uma refeição levar mais que alguns toques. O caso comum ("repetir o café de ontem", "foto → confirmar") tem que ser rápido.
- A IA apresentar estimativa como medição, inventar dado ausente ou afirmar % de gordura a partir de foto.
- Perder histórico: medida sobrescrita, migração que apaga dados.
- Tela entulhada: cada tela tem um foco. Os detalhes ficam a um toque.
- A IA aumentar o treino sem considerar recuperação e dificuldade relatada.

## Restrições

- Mesmo stack e padrões do Picadinho/Decoreba: Next.js 16 com `output: "export"` + Capacitor 8 (Android),
  React 19, Tailwind 4, motion, vaul (folhas), lucide-react, zod, `ai` + `@ai-sdk/openai`, PGlite, vitest.
  Sem server actions, rotas de API, proxy ou cookies.
- **Decisão do usuário: sem backend.** Toda a lógica e os dados ficam no celular, como nos outros apps.
  - A chave da OpenAI é colada nos Ajustes e guardada no aparelho (Capacitor Preferences), nunca no código nem no APK.
    O app chama a OpenAI direto. Isso substitui o requisito original de "toda comunicação pelo backend".
  - O controle de custo é local: cada chamada grava tokens de entrada/saída e custo estimado (tabela de preço por modelo
    no código). Ao passar do limite mensal, novas chamadas são bloqueadas com aviso. Erros (sem chave, chave inválida,
    sem internet, cota, tempo esgotado) viram mensagens claras, e o fluxo manual continua funcionando.
- Banco: PGlite no IndexedDB do WebView (`idb://corpicho`). Mudança de banco = novo passo em `MIGRATIONS`, nunca editar um publicado.
- Fotos: `@capacitor/camera` para tirar a foto e `@capacitor/filesystem` (diretório Data, privado do app) para guardar.
  O banco guarda só o caminho. As fotos de prato são reduzidas (~1024 px, JPEG) antes de ir para a IA.
- Bloqueio da área de fotos: plugin de biometria do Capacitor. Se o aparelho não tiver, cai no PIN/padrão do sistema.
- Design: as skills do Emil Kowalski usadas nos outros projetos (apple-design, mobile-native, animate etc.), copiadas
  para `.claude/skills` do Corpicho. Tema claro/escuro com tokens CSS como no Picadinho.
  Ícone e tela de abertura saem de um desenho só, via `scripts/make-icons.mjs` (sharp).
- appId `app.corpicho`, nome "Corpicho".

## Abordagens consideradas

- **A. Tudo no celular (PGlite) e chave no aparelho, igual aos outros apps**, *escolhida pelo usuário*.
  Funciona offline (menos a IA), as fotos nunca saem do aparelho e não há servidor para manter.
  Custo: a chave fica no aparelho, e não existe backup automático.
- **B. Dados no celular e backend mínimo (Cloudflare Workers) como proxy da OpenAI.** A chave sai do aparelho,
  mas é mais uma peça para manter. O usuário descartou.
- **C. Tudo num backend na nuvem (API + Postgres + fotos).** Tem backup, mas depende de internet e as fotos ficam num servidor. Descartada.

## Design

### Arquitetura no app

```
app/            página única (export estático), navegação por abas no cliente
components/     telas e folhas (vaul): Dashboard, Comer, MeuCorpo, Treino, Coach + Evolução/Fotos/Relatórios/Ajustes
lib/
  localDb.ts    abre o PGlite (cópia do padrão do Picadinho)
  schema.ts     SCHEMA + MIGRATIONS
  db.ts         wrap/initDb (padrão do Picadinho)
  nutrition.ts  cálculos por 100 g, metas (TMB, TDEE, macros), somatórios do dia
  body.ts       medidas, diferenças, IMC, % gordura Marinha, séries para gráficos/períodos
  training.ts   planos, sessões, estatísticas para a IA
  reports.ts    números da semana
  photos.ts     câmera + filesystem
  settings.ts   chave, modelo, limite, tema (Preferences)
  ai/           um serviço por função, todos sobre um cliente comum:
    client.ts   modelo, chave, tempo limite, registro de uso/custo, limite, mapa de erros
    pricing.ts  preço por modelo
    plate.ts    foto → itens (zod)
    coach.ts    chat com contexto
    context.ts  monta o resumo dos dados reais para o coach/relatório
    workout.ts  gerar plano, sugerir ajustes
    report.ts   análise da semana
    photoCompare.ts descrição visual das fotos
  taco.json     tabela TACO por 100 g (dados públicos)
```

Abas embaixo: **Início · Comer · Corpo · Treino · Coach**. Evolução e Fotos ficam dentro de Corpo,
Relatórios saem do Início, e os Ajustes ficam na engrenagem do topo.

### Dados (migração 0 = schema inicial)

- `profile` (linha única): nascimento, sexo, altura_cm, nível de atividade, condicionamento, experiência, dias/semana,
  minutos/treino, equipamentos text[], restrições text.
- `goals`: peso_inicial, peso_alvo, kcal_dia, prot_g, carb_g, gord_g, criado_em. Histórico preservado; vale a mais recente.
- `foods`: nome, origem (`taco` | `usuario` | `ia`), kcal/P/C/G por 100 g, último uso. A TACO entra como seed.
- `meals`: dia, tipo (enum das 5 refeições), criado_em, foto_path opcional.
- `meal_items`: meal_id, food_id opcional, nome, gramas (>0, ≤5000), kcal/P/C/G **calculados e gravados**
  (o histórico não muda se o alimento for editado depois), origem (`manual` | `ia_confirmada`).
- `weights`: medido_em, kg (20–400).
- `body_measurements`: medido_em, região (enum das 12), cm (5–300). Só inserção.
- `body_composition`: medido_em, métrica (enum), valor, unidade, origem (`medido` | `calculado` | `estimado`), método text.
- `body_photos`: tirada_em, ângulo (`frente` | `lado` | `costas`), path.
- `workout_plans`: nome, criado_em, origem (`ia` | `manual`), ativo, observações da IA.
- `exercises`: nome, descrição, tipo (`musculacao` | `cardio` | `funcional` | `casa` | `mobilidade`), músculos text[],
  link de demonstração opcional.
- `plan_items`: plan_id, dia da semana, exercise_id, ordem, séries, reps, duração_s, descanso_s, carga sugerida.
- `workout_sessions`: dia, plan_id opcional, iniciada/terminada, duração_min, RPE geral, notas.
- `session_sets`: session_id, exercise_id, série nº, reps, carga_kg, duração_s, RPE.
- `ai_conversations` / `ai_messages`: papel, conteúdo, criado_em.
- `weekly_reports`: semana_inicio (único), números jsonb, análise text, criado_em.
- `ai_usage`: criado_em, função, modelo, tokens_in, tokens_out, custo_usd.

As validações ficam nos `check` do banco e no zod da entrada. Datas são `timestamptz` e dias são `date` no fuso do aparelho.

### Fluxos principais

- **Foto do prato**: Comer → câmera → "Analisando…" → revisão (itens com peso editável e total recalculado ao vivo)
  → escolher refeição → Salvar. Se a IA falhar, abre a revisão vazia para registrar à mão, sem perder a foto.
- **Medida**: Corpo → tocar na região → folha com teclado numérico, a última medida ao lado → Salvar → a região mostra a nova diferença.
- **Treino do dia**: Treino → hoje → cada exercício com "feito" e campos já preenchidos com o planejado → ajustar → concluir sessão com RPE.

### Etapas

1. **Base + versão 1 funcional**: projeto, tema, ícone, navegação, banco; perfil e meta; alimentação manual + TACO
   + foto com IA; peso e medidas na silhueta; composição; gráficos de evolução; treino manual + gerado por IA + registro;
   coach; ajustes com chave, modelo, uso e limite; APK.
2. **Complementos**: fotos do corpo com comparação e descrição pela IA + bloqueio; relatórios semanais;
   ajustes de treino sugeridos pela IA; repetir refeição e outros atalhos; polimento de animações.

### Testes

vitest para as regras (cálculos nutricionais, metas, diferenças de medidas, períodos dos gráficos, IMC/Marinha,
custo/limite de IA, montagem do contexto) contra o mesmo schema PGlite, como no Picadinho.
Serviços de IA testados com modelo falso (`MockLanguageModel` do `ai`). `npm run build` e `assembleDebug` como verificação final.

## Decisões minhas (para o usuário conferir)

- Tabela TACO embutida como base de alimentos.
- Modelos padrão: um modelo pequeno com visão para foto e coach, e um nano para tarefas simples, ambos trocáveis nos Ajustes.
  Os IDs exatos saem da lista atual da OpenAI na hora de implementar.
- Visual dos exercícios: músculos acesos na silhueta + link de vídeo, sem imagens geradas.
- Gráficos em SVG próprio, sem biblioteca, como no Picadinho.
- Medidas: dá para apagar um registro errado, mas nunca editar.
- % de gordura estimada só pela fórmula da Marinha, e só quando existirem as medidas necessárias, com selo "estimado".
- Bloqueio por biometria só na área de fotos, não no app todo.

## Fica para quem constrói

Layout exato de cada tela, desenho da silhueta e do ícone, prompts das IAs, nomes de componentes e animações
(seguindo as skills de design).
