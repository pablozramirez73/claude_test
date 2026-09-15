/** Schermata iniziale: scelta del tipo di valutazione e stato del piano. */
import { useNavigate } from 'react-router-dom';

import { useApp } from '../AppContext';
import { haptic } from '../lib/telegram';
import type { AssessmentType } from '../types';

const TYPES: { code: AssessmentType; title: string; description: string; icon: string }[] = [
  {
    code: 'LIFT',
    title: 'Sollevamento',
    description: 'Indice NIOSH, peso limite raccomandato, tecnica di presa',
    icon: '📦',
  },
  {
    code: 'PC',
    title: 'Videoterminale',
    description: 'Postura al VDT, affaticamento visivo, illuminamento',
    icon: '💻',
  },
  {
    code: 'HANDLING',
    title: 'Movimentazione',
    description: 'Traino, spinta e trasporto: torsioni e posture incongrue',
    icon: '🛒',
  },
];

export function HomePage() {
  const { profile, loading, error } = useApp();
  const navigate = useNavigate();

  if (loading) return <div className="loader">Caricamento…</div>;
  if (error) return <div className="alert alert--error">{error}</div>;

  if (!profile?.company) {
    return (
      <div className="page">
        <h1>Benvenuto in ErgoCheck</h1>
        <p className="muted">
          Registra l'azienda per iniziare: i report verranno intestati a lei e
          recapitati nel gruppo Telegram che collegherai.
        </p>
        <button className="button" onClick={() => navigate('/onboarding')}>
          Registra azienda
        </button>
      </div>
    );
  }

  const { company } = profile;
  const quota = company.quota_remaining;

  return (
    <div className="page">
      <header className="page__header">
        <h1>{company.display_name}</h1>
        <p className="muted">
          Piano {company.plan}
          {quota !== null && ` · ${quota} valutazioni residue`}
        </p>
      </header>

      {quota === 0 && (
        <div className="alert alert--warn">
          Quota esaurita. <a href="#/piani">Passa al piano Pro</a> per continuare.
        </div>
      )}

      <h2 className="section-title">Nuova valutazione</h2>
      <div className="cards">
        {TYPES.map((type) => (
          <button
            key={type.code}
            className="card"
            onClick={() => {
              haptic.tap();
              navigate(`/assessment/${type.code}`);
            }}
            disabled={quota === 0}
          >
            <span className="card__icon" aria-hidden="true">
              {type.icon}
            </span>
            <span className="card__body">
              <span className="card__title">{type.title}</span>
              <span className="card__description">{type.description}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="row">
        <button className="button button--ghost" onClick={() => navigate('/dashboard')}>
          Andamento del rischio
        </button>
        <button className="button button--ghost" onClick={() => navigate('/storico')}>
          Storico valutazioni
        </button>
      </div>
    </div>
  );
}
