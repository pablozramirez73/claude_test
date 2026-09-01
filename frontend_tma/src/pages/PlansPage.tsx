/** Paywall: listino e passaggio al checkout Stripe. */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useApp } from '../AppContext';
import { api } from '../lib/api';
import { haptic, showBackButton, webApp } from '../lib/telegram';

interface Plan {
  code: string;
  label: string;
  price_eur: number;
  quota: number | null;
  features: string[];
}

export function PlansPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useApp();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(
    (location.state as { reason?: string } | null)?.reason ?? null,
  );

  useEffect(() => showBackButton(() => navigate('/')), [navigate]);

  useEffect(() => {
    api
      .plans()
      .then(setPlans)
      .catch((err) => setError(err instanceof Error ? err.message : 'Listino non disponibile'));
  }, []);

  const upgrade = async (code: string) => {
    haptic.tap();
    try {
      const session = await api.checkout(code as 'PRO' | 'AGENCY');
      webApp()?.openLink(session.checkout_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout non disponibile');
      haptic.error();
    }
  };

  if (!plans) return <div className="loader">Caricamento…</div>;

  return (
    <div className="page">
      <h1>Piani</h1>
      {error && <div className="alert alert--warn">{error}</div>}

      <div className="plans">
        {plans.map((plan) => {
          const current = profile?.company?.plan === plan.code;
          return (
            <div key={plan.code} className={`plan ${current ? 'plan--current' : ''}`}>
              <h2>{plan.label}</h2>
              <p className="plan__price">
                {plan.price_eur === 0 ? 'Gratis' : `${plan.price_eur} €`}
                {plan.price_eur > 0 && <span className="muted">/mese</span>}
              </p>
              <p className="muted small">
                {plan.quota === null ? 'Valutazioni illimitate' : `${plan.quota} valutazioni`}
              </p>
              <ul className="plan__features">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {current ? (
                <span className="plan__badge">Piano attivo</span>
              ) : plan.code !== 'FREE' ? (
                <button className="button" onClick={() => upgrade(plan.code)}>
                  Attiva {plan.label}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
