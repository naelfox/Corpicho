@AGENTS.md

## Fluxo de git

- Não abrir PR. Ao terminar, juntar na `main` e dar `git push` direto na `main`.

## App

- Corpicho: app Android (Capacitor) com Next em `output: "export"`: nada de server actions, proxy, cookies ou rotas de API.
- Dados só no aparelho (PGlite em `lib/localDb.ts`, `idb://corpicho`). Mudança de banco = novo passo em `MIGRATIONS` (`lib/schema.ts`), nunca editar um já publicado.
- Depois de mudar o app: `npm run android` para copiar o build para `android/`.
