/**
 * Wrapper tipizzato sull'SDK della Mini App.
 *
 * Tutte le funzioni degradano a no-op quando l'app gira in un browser
 * normale (sviluppo con `npm run dev`), cosi' il codice chiamante non deve
 * controllare ogni volta la presenza di window.Telegram.
 */

type HapticStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationType = 'error' | 'success' | 'warning';

interface MainButton {
  text: string;
  isVisible: boolean;
  isActive: boolean;
  show(): void;
  hide(): void;
  enable(): void;
  disable(): void;
  setText(text: string): void;
  setParams(params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface BackButton {
  isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface WebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; username?: string }; start_param?: string };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  viewportStableHeight: number;
  isExpanded: boolean;
  MainButton: MainButton;
  BackButton: BackButton;
  HapticFeedback: {
    impactOccurred(style: HapticStyle): void;
    notificationOccurred(type: NotificationType): void;
    selectionChanged(): void;
  };
  ready(): void;
  expand(): void;
  close(): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  showAlert(message: string, cb?: () => void): void;
  showConfirm(message: string, cb?: (ok: boolean) => void): void;
  showPopup(params: unknown, cb?: (id: string) => void): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: WebApp };
  }
}

export const webApp = (): WebApp | undefined => window.Telegram?.WebApp;

export const isTelegram = (): boolean => Boolean(webApp()?.initData);

/** initData firmata, da inoltrare al backend a ogni chiamata. */
export const getInitData = (): string => webApp()?.initData ?? '';

export function initTelegram(): void {
  const app = webApp();
  if (!app) return;
  app.ready();
  app.expand();
  app.enableClosingConfirmation();

  // I colori dell'app seguono il tema del client Telegram.
  const root = document.documentElement;
  const params = app.themeParams ?? {};
  const map: Record<string, string> = {
    '--tg-bg': params.bg_color ?? '#ffffff',
    '--tg-text': params.text_color ?? '#111111',
    '--tg-hint': params.hint_color ?? '#8a8a8e',
    '--tg-link': params.link_color ?? '#0b6bcb',
    '--tg-button': params.button_color ?? '#0b6bcb',
    '--tg-button-text': params.button_text_color ?? '#ffffff',
    '--tg-secondary-bg': params.secondary_bg_color ?? '#f2f2f7',
  };
  Object.entries(map).forEach(([key, value]) => root.style.setProperty(key, value));
  root.dataset.theme = app.colorScheme;
}

/* ------------------------------------------------------------------ haptics */

export const haptic = {
  tap(style: HapticStyle = 'light') {
    webApp()?.HapticFeedback.impactOccurred(style);
  },
  success() {
    webApp()?.HapticFeedback.notificationOccurred('success');
  },
  warning() {
    webApp()?.HapticFeedback.notificationOccurred('warning');
  },
  error() {
    webApp()?.HapticFeedback.notificationOccurred('error');
  },
  selection() {
    webApp()?.HapticFeedback.selectionChanged();
  },
};

/* -------------------------------------------------------------- main button */

export function showMainButton(text: string, onClick: () => void): () => void {
  const app = webApp();
  if (!app) return () => undefined;

  const button = app.MainButton;
  button.setText(text);
  button.enable();
  button.show();
  button.onClick(onClick);

  return () => {
    button.offClick(onClick);
    button.hide();
    button.hideProgress();
  };
}

export function setMainButtonBusy(busy: boolean): void {
  const button = webApp()?.MainButton;
  if (!button) return;
  if (busy) {
    button.showProgress(false);
    button.disable();
  } else {
    button.hideProgress();
    button.enable();
  }
}

export function showBackButton(onClick: () => void): () => void {
  const app = webApp();
  if (!app) return () => undefined;
  app.BackButton.show();
  app.BackButton.onClick(onClick);
  return () => {
    app.BackButton.offClick(onClick);
    app.BackButton.hide();
  };
}

export function alert(message: string): void {
  const app = webApp();
  if (app) app.showAlert(message);
  else window.alert(message);
}
