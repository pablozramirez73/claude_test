/** Storico delle valutazioni dell'azienda. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { LEVEL_COLORS } from '../components/RiskGauge';
import { api } from '../lib/api';
import { showBackButton } from '../lib/telegram';
import type { Assessment } from '../types';

export function HistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Assessment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => showBackButton(() => navigate('/')), [navigate]);

  useEffect(() => {
    api
      .listAssessments()
      .then((page) => setItems(page.results))
      .catch((err) => setError(err instanceof Error ? err.message : 'Errore di caricamento'));
  }, []);

  if (error) return <div className="alert alert--error">{error}</div>;
  if (!items) return <div className="loader">Caricamento…</div>;
  if (items.length === 0) return <p className="empty">Nessuna valutazione registrata.</p>;

  return (
    <div className="page">
      <h1>Storico</h1>
      <ul className="list">
        {items.map((item) => (
          <li key={item.id}>
            <button className="list__row" onClick={() => navigate(`/result/${item.id}`)}>
              <span className="list__dot" style={{ background: LEVEL_COLORS[item.risk_level] }} />
              <span className="list__body">
                <strong>{item.type_display}</strong>
                <span className="muted small">
                  {new Date(item.created_at).toLocaleString('it-IT')}
                  {item.workstation && ` · ${item.workstation}`}
                </span>
              </span>
              <span className="list__score">{Math.round(item.risk_score)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
