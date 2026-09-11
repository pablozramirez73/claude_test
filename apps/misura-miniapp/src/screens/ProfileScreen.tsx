import { useEffect, useState } from "react";
import { buildShareLink, getTelegramUserId, loadProfileFromCloud } from "../telegram/webapp";
import { useScan } from "../state/ScanContext";

// Placeholder — a real deployment injects the shop's own bot username at build time.
const BOT_USERNAME = "misura_demo_bot";

export function ProfileScreen() {
  const { state, dispatch } = useScan();
  const [stored, setStored] = useState<string | null>(null);

  useEffect(() => {
    if (!state.profileId) return;
    loadProfileFromCloud(state.profileId).then(setStored).catch(() => setStored(null));
  }, [state.profileId]);

  if (!state.profileId) {
    return (
      <div className="screen screen--profile">
        <p>Nessun profilo salvato ancora.</p>
        <button className="button button--secondary" onClick={() => dispatch({ type: "GOTO", step: "welcome" })}>
          Torna all'inizio
        </button>
      </div>
    );
  }

  const shareLink = buildShareLink(BOT_USERNAME, state.profileId);
  const telegramUserId = getTelegramUserId();

  return (
    <div className="screen screen--profile">
      <h2>Il tuo profilo MISURA</h2>
      <p className="profile__id">ID profilo: {state.profileId}</p>
      {telegramUserId && <p className="profile__id">Telegram user: {telegramUserId}</p>}
      {stored && <p className="profile__stored">Salvato in CloudStorage ✓</p>}

      <div className="profile__share">
        <p>Condividi con un amico:</p>
        <code>{shareLink}</code>
      </div>

      <button className="button button--secondary" onClick={() => dispatch({ type: "RESET" })}>
        Nuova scansione
      </button>
    </div>
  );
}
