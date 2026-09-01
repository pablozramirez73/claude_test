/**
 * Thin wrapper around the Telegram WebApp SDK (see PRD §6 — Integrazione
 * Telegram). Every call is guarded so the app also runs standalone in a
 * regular browser tab during development, outside of Telegram.
 */

function getWebApp(): WebApp | undefined {
  return typeof Telegram !== "undefined" ? Telegram.WebApp : undefined;
}

export function initTelegram(): void {
  const webApp = getWebApp();
  if (!webApp) return;

  webApp.ready();
  webApp.expand();

  // UI ad alto contrasto (PRD §5): allinea lo sfondo dell'header/bottom
  // bar al tema scuro ad alto contrasto usato dall'app.
  webApp.setHeaderColor("#000000");
  webApp.setBackgroundColor("#0b0b0b");
}

/**
 * Feedback aptico per confermare che un segno è stato riconosciuto
 * (PRD §5, "feedback aptico per conferma segno rilevato").
 */
export function hapticSignDetected(): void {
  getWebApp()?.HapticFeedback?.notificationOccurred("success");
}

export function hapticLightTap(): void {
  getWebApp()?.HapticFeedback?.impactOccurred("light");
}

/**
 * Salvataggio delle frasi frequenti dell'utente in CloudStorage
 * (PRD §6). Non bloccante: se l'API non è disponibile (fuori da
 * Telegram) la funzione è un no-op silenzioso.
 */
export function saveFrequentPhrase(phrase: string): void {
  const webApp = getWebApp();
  if (!webApp?.CloudStorage) return;

  const key = `segno:phrase:${Date.now()}`;
  webApp.CloudStorage.setItem(key, phrase);
}

export function isInsideTelegram(): boolean {
  return getWebApp() !== undefined;
}
