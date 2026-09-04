/** Andamento del rischio nel tempo: e' il valore che giustifica l'abbonamento. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp } from '../AppContext';
import { LEVEL_COLORS } from '../components/RiskGauge';
import { api } from '../lib/api';
import { showBackButton } from '../lib/telegram';
import type { DashboardData, RiskLevel } from '../types';

const PERIODS = [30, 90, 365];

export function DashboardPage() {
  const { profile } = useApp();
  const navigate = useNavigate();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => showBackButton(() => navigate('/')), [navigate]);

  useEffect(() => {
    if (!profile?.company) return;
    api
      .dashboard(profile.company.id, days)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Errore di caricamento'));
  }, [days, profile]);

  if (error) return <div className="alert alert--error">{error}</div>;
  if (!data) return <div className="loader">Caricamento…</div>;

  const maxScore = Math.max(100, ...data.trend.map((point) => point.avg_score));

  return (
    <div className="page">
      <h1>Andamento del rischio</h1>

      <div className="chips">
        {PERIODS.map((period) => (
          <button
            key={period}
            className={`chip ${period === days ? 'chip--active' : ''}`}
            onClick={() => setDays(period)}
          >
            {period} giorni
          </button>
        ))}
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat__value">{data.total_assessments}</span>
          <span className="stat__label">Valutazioni</span>
        </div>
        <div className="stat">
          <span className="stat__value">{data.avg_risk_score}</span>
          <span className="stat__label">Punteggio medio</span>
        </div>
        <div className="stat">
          <span className="stat__value">{data.critical_count}</span>
          <span className="stat__label">Situazioni critiche</span>
        </div>
      </div>

      <h2 className="section-title">Punteggio medio giornaliero</h2>
      {data.trend.length === 0 ? (
        <p className="empty">Nessun dato nel periodo selezionato.</p>
      ) : (
        <div className="chart" role="img" aria-label="Andamento del punteggio di rischio">
          {data.trend.map((point) => (
            <div key={point.day} className="chart__col" title={`${point.day}: ${Math.round(point.avg_score)}`}>
              <div
                className="chart__bar"
                style={{
                  height: `${(point.avg_score / maxScore) * 100}%`,
                  background: barColor(point.avg_score),
                }}
              />
            </div>
          ))}
        </div>
      )}

      <h2 className="section-title">Distribuzione per livello</h2>
      <ul className="legend">
        {(Object.keys(data.by_level) as RiskLevel[]).map((level) => (
          <li key={level}>
            <span className="legend__dot" style={{ background: LEVEL_COLORS[level] }} />
            {level} <strong>{data.by_level[level]}</strong>
          </li>
        ))}
      </ul>

      <h2 className="section-title">Criticità ricorrenti</h2>
      {data.top_findings.length === 0 ? (
        <p className="empty">Nessun rilievo registrato.</p>
      ) : (
        <ol className="ranking">
          {data.top_findings.map((finding) => (
            <li key={finding.code}>
              <span>{finding.title || finding.code}</span>
              <strong>{finding.count}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function barColor(score: number): string {
  if (score < 25) return LEVEL_COLORS.GREEN;
  if (score < 50) return LEVEL_COLORS.YELLOW;
  if (score < 75) return LEVEL_COLORS.ORANGE;
  return LEVEL_COLORS.RED;
}
