/** Esito della valutazione, rilievi e download del report PDF. */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { FindingList } from '../components/FindingList';
import { RiskGauge } from '../components/RiskGauge';
import { api, subscribeAssessments } from '../lib/api';
import { haptic, showBackButton, showMainButton, webApp } from '../lib/telegram';
import type { Assessment } from '../types';

export function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [assessment, setAssessment] = useState<Assessment | null>(
    (location.state as { assessment?: Assessment } | null)?.assessment ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (assessment || !id) return;
    api
      .getAssessment(Number(id))
      .then(setAssessment)
      .catch((err) => setError(err instanceof Error ? err.message : 'Valutazione non trovata'));
  }, [assessment, id]);

  // Il PDF arriva in modo asincrono: si resta in ascolto sul canale WebSocket
  // e, come rete di sicurezza, si interroga l'endpoint di stato.
  useEffect(() => {
    if (!assessment || assessment.pdf_url) return undefined;

    const unsubscribe = subscribeAssessments((update) => {
      if (update.id === assessment.id) {
        setAssessment((current) => (current ? { ...current, ...update } : current));
      }
    });

    const poll = window.setInterval(async () => {
      const status = await api.reportStatus(assessment.id).catch(() => null);
      if (status?.pdf_url) {
        setAssessment((current) => (current ? { ...current, pdf_url: status.pdf_url, status: 'READY' } : current));
      }
    }, 4000);

    return () => {
      unsubscribe();
      window.clearInterval(poll);
    };
  }, [assessment]);

  useEffect(() => showBackButton(() => navigate('/')), [navigate]);

  useEffect(() => {
    if (!assessment?.pdf_url) return undefined;
    return showMainButton('Apri report PDF', () => {
      haptic.tap();
      webApp()?.openLink(assessment.pdf_url as string);
    });
  }, [assessment]);

  if (error) return <div className="alert alert--error">{error}</div>;
  if (!assessment) return <div className="loader">Caricamento…</div>;

  return (
    <div className="page">
      <RiskGauge score={assessment.risk_score} level={assessment.risk_level} />

      <p className="muted center">
        {assessment.type_display}
        {assessment.workstation && ` · ${assessment.workstation}`}
        {assessment.worker_ref && ` · ${assessment.worker_ref}`}
      </p>

      {assessment.lifting_index !== null && (
        <div className="stats">
          <div className="stat">
            <span className="stat__value">{assessment.lifting_index}</span>
            <span className="stat__label">Indice di sollevamento</span>
          </div>
          <div className="stat">
            <span className="stat__value">{assessment.recommended_weight_limit} kg</span>
            <span className="stat__label">Peso limite raccomandato</span>
          </div>
        </div>
      )}

      <h2 className="section-title">Rilievi</h2>
      <FindingList findings={assessment.findings} />

      <div className="report-status">
        {assessment.pdf_url ? (
          <p className="muted">
            Il report è stato generato e inviato al gruppo Telegram aziendale.
          </p>
        ) : assessment.status === 'FAILED' ? (
          <>
            <p className="alert alert--error">Generazione del report non riuscita.</p>
            <button
              className="button button--ghost"
              onClick={() => api.regenerateReport(assessment.id)}
            >
              Riprova
            </button>
          </>
        ) : (
          <p className="muted">Generazione del report PDF in corso…</p>
        )}
      </div>

      <button className="button button--ghost" onClick={() => navigate('/')}>
        Nuova valutazione
      </button>
    </div>
  );
}
