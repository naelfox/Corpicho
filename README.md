# Corpicho

App para **emagrecer com acompanhamento**, tudo no celular:

- **Hoje** — resumo do dia: calorias, macros e metas;
- **Comer** — registre refeições (busca, manual ou foto do prato com IA) e veja calorias e macros;
- **Meu Corpo** — peso, medidas e composição corporal (cada valor mostra se é medido, calculado ou estimado), fotos de progresso;
- **Treino** — plano semanal gerado por IA (você revisa e edita) e registro das sessões;
- **Evolução** — gráficos de peso, medidas e consumo;
- **Meu Coach IA** — conversa sobre os seus próprios dados (não substitui médico ou nutricionista).

App **Android** feito com Next.js (exportado como site estático) empacotado pelo **Capacitor**.
Não tem servidor nem login: os dados ficam **só no celular**, num Postgres que roda dentro do app
([PGlite](https://pglite.dev), guardado no IndexedDB do WebView). Fotos do corpo e das refeições ficam
na pasta privada do app e não saem do aparelho (só vão à OpenAI quando você pede uma análise).

## IA e chave da OpenAI

Abra **Ajustes**, cole sua chave da OpenAI e toque em **Testar**. A chave fica guardada só no aparelho
(nunca no código nem no APK) e o app chama a OpenAI direto. Em Ajustes também ficam o **custo estimado**
do mês, o **limite de gasto mensal** (a IA pausa ao chegar nele) e a escolha do **modelo**.
Sem chave ou sem internet, tudo continua funcionando manualmente.

## Instalar no celular

1. Gere o APK (veja abaixo) e copie `android/app/build/outputs/apk/debug/app-debug.apk` para o celular
   (cabo, Drive, e-mail...).
2. Abra o arquivo no celular e permita **instalar apps desconhecidos** para o app que o abriu.

Ou, com o celular no USB e depuração ativada (o `adb` vem no Android SDK, em `~/Android/Sdk/platform-tools/`; adicione essa pasta ao `PATH` ou use o caminho completo):

```bash
~/Android/Sdk/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Gerar uma nova build

Precisa uma vez: **JDK 21** (os plugins do Capacitor 8 exigem Java 21) e Android SDK
(o [Android Studio](https://developer.android.com/studio) traz os dois). No Ubuntu: `sudo apt install openjdk-21-jdk`.
Se aparecer `Cannot find a Java installation ... languageVersion=21`, falta o JDK 21 ou o `JAVA_HOME` aponta para outro.
Com as variáveis configuradas:

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=$HOME/Android/Sdk
```

```bash
npm install
npm run apk     # build do site + cap sync + gradlew assembleDebug
```

Para atualizar um app já instalado, aumente `versionCode` (e `versionName`) em
`android/app/build.gradle` antes de gerar. O APK de debug é assinado com a chave de debug da máquina;
na **mesma máquina** a assinatura é a mesma e a atualização instala por cima do app antigo.
Se trocar de máquina, desinstale o app antes — o que **apaga os dados** (ainda não há backup).

Também dá para `npm run android` e `npm run android:open` para rodar pelo Android Studio.

## Desenvolver no computador

```bash
npm run dev     # http://localhost:3000 — mesmo app, banco no IndexedDB do navegador
```

## Banco e migrações

O schema está em [`lib/schema.ts`](lib/schema.ts) e é aplicado na primeira vez que o app abre.
Para mudar o banco depois de ter dados no celular, adicione um passo em `MIGRATIONS`
no mesmo arquivo (nunca edite um passo já publicado). Os dados existem só no aparelho:
desinstalar o app ou limpar os dados dele apaga tudo, e ainda não há backup.

## Testes

```bash
npm test        # regras de negócio contra o mesmo schema (PGlite)
npm run lint
```

## Ícone

Ícone e tela de abertura saem de um desenho só: `node scripts/make-icons.mjs` regera tudo.
