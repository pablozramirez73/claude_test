/** Registrazione dell'azienda al primo accesso. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp } from '../AppContext';
import { api } from '../lib/api';
import { haptic, setMainButtonBusy, showBackButton, showMainButton } from '../lib/telegram';

export function OnboardingPage() {
  const navigate = useNavigate();
  const { refresh } = useApp();
  const [name, setName] = useState('');
  const [vat, setVat] = useState('');
  const [rspp, setRspp] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => showBackButton(() => navigate('/')), [navigate]);

  useEffect(() => {
    return showMainButton('Registra azienda', async () => {
      if (name.trim().length < 2 || vat.trim().length < 8) {
        setError('Inserisci ragione sociale e partita IVA.');
        haptic.error();
        return;
      }
      setMainButtonBusy(true);
      try {
        await api.joinCompany({ name: name.trim(), vat: vat.trim(), rspp_name: rspp.trim() });
        await refresh();
        haptic.success();
        navigate('/');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registrazione non riuscita');
        haptic.error();
      } finally {
        setMainButtonBusy(false);
      }
    });
  }, [name, navigate, refresh, rspp, vat]);

  return (
    <div className="page">
      <h1>Registra l'azienda</h1>
      <p className="muted">
        Se la partita IVA è già presente verrai collegato all'azienda esistente.
      </p>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="form">
        <label className="field">
          <span>Ragione sociale</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
        </label>
        <label className="field">
          <span>Partita IVA</span>
          <input
            value={vat}
            onChange={(event) => setVat(event.target.value.toUpperCase())}
            maxLength={20}
            placeholder="IT01234567890"
          />
        </label>
        <label className="field">
          <span>RSPP di riferimento (facoltativo)</span>
          <input value={rspp} onChange={(event) => setRspp(event.target.value)} maxLength={200} />
          <small>Compare in calce al report, sopra lo spazio per la firma.</small>
        </label>
      </div>

      <p className="muted small">
        Dopo la registrazione, aggiungi il bot al gruppo aziendale e invia
        <code> /collega </code>: i report PDF verranno recapitati lì.
      </p>
    </div>
  );
}
