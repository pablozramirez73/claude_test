// Thin wrapper around the Telegram WebApp SDK (window.Telegram.WebApp).
//
// Every call is defensive: the mini app must keep working as a plain browser
// tab during local development, when the global `Telegram` object is
// undefined (the SDK script tag is present in index.html, but it only
// defines `window.Telegram` when actually running inside a Telegram client).

function getWebApp() {
  return typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
}

export function isInsideTelegram(): boolean {
  return getWebApp() !== undefined;
}

/** Call once on app start: ready() + expand() so the mini app takes the full viewport. */
export function initTelegram(): void {
  const app = getWebApp();
  if (!app) return;
  app.ready();
  app.expand();
}

export function getTelegramUserId(): string | null {
  const id = getWebApp()?.initDataUnsafe?.user?.id;
  return id !== undefined ? String(id) : null;
}

export function haptic(kind: "success" | "warning" | "error" | "light" | "medium" | "heavy"): void {
  const impact = getWebApp()?.HapticFeedback;
  if (!impact) return;
  if (kind === "success" || kind === "warning" || kind === "error") {
    impact.notificationOccurred(kind);
  } else {
    impact.impactOccurred(kind);
  }
}

export function showMainButton(text: string, onClick: () => void): void {
  const app = getWebApp();
  if (!app) return;
  app.MainButton.setText(text);
  app.MainButton.onClick(onClick);
  app.MainButton.show();
}

export function hideMainButton(): void {
  getWebApp()?.MainButton.hide();
}

/** Persist the fit profile via Telegram CloudStorage (synced across the user's devices). */
export function saveProfileToCloud(profileId: string, json: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const app = getWebApp();
    if (!app?.CloudStorage) {
      // No Telegram runtime (local dev) — fall back to localStorage so the
      // flow is still testable outside Telegram.
      try {
        window.localStorage.setItem(`misura:${profileId}`, json);
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
      return;
    }
    app.CloudStorage.setItem(`misura:${profileId}`, json, (error) => {
      if (error) reject(new Error(String(error)));
      else resolve();
    });
  });
}

export function loadProfileFromCloud(profileId: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const app = getWebApp();
    if (!app?.CloudStorage) {
      resolve(window.localStorage.getItem(`misura:${profileId}`));
      return;
    }
    app.CloudStorage.getItem(`misura:${profileId}`, (error, value) => {
      if (error) reject(new Error(String(error)));
      else resolve(value ?? null);
    });
  });
}

/** Builds the shareable deep link the user can send to friends: t.me/<bot>?start=fit_<id> */
export function buildShareLink(botUsername: string, profileId: string): string {
  return `https://t.me/${botUsername}?start=fit_${profileId}`;
}
