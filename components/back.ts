'use client'

/**
 * "Voltar" do Android. Com um listener de `backButton` registrado, o Capacitor não faz mais nada sozinho;
 * a ordem aqui é: fecha a folha/sobreposição aberta por último → volta no histórico (abas e formulário
 * usam pushState/popstate) → no Início, sem histórico, minimiza o app (não fecha).
 */

const stack: Array<() => void> = []

/** Registra quem fecha com o "voltar" (folha aberta etc.). Devolve a função para sair da pilha. */
export function pushBackHandler(close: () => void): () => void {
  stack.push(close)
  return () => {
    const i = stack.lastIndexOf(close)
    if (i >= 0) stack.splice(i, 1)
  }
}

/** Fecha o que foi aberto por último. true se havia algo para fechar. */
export function closeTop(): boolean {
  const close = stack.pop()
  if (!close) return false
  close()
  return true
}

/** Liga o botão "voltar" do Android (no navegador não faz nada). Devolve a função para desligar. */
export async function installBackButton(): Promise<() => void> {
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) return () => {}
  const { App } = await import('@capacitor/app')
  const handle = await App.addListener('backButton', ({ canGoBack }) => {
    if (closeTop()) return
    // canGoBack vem da WebView: há entrada de verdade atrás (history.length conta também as da frente).
    if (canGoBack) window.history.back()
    else void App.minimizeApp()
  })
  return () => void handle.remove()
}
