/** Stato condiviso: profilo utente, azienda e soglie normative. */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from './lib/api';
import type { Profile, Thresholds } from './types';

const DEFAULT_THRESHOLDS: Thresholds = {
  min_lux: 200,
  max_noise_db: 80,
  max_tilt_deg: 2,
  trunk_flexion_warn: 20,
  trunk_twist_warn: 15,
  arm_elevation_warn: 90,
  neck_flexion_warn: 20,
  ear_fatigue: 0.21,
};

interface AppState {
  profile: Profile | null;
  thresholds: Thresholds;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const AppContext = createContext<AppState>({
  profile: null,
  thresholds: DEFAULT_THRESHOLDS,
  loading: true,
  error: null,
  refresh: async () => undefined,
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const [me, limits] = await Promise.all([api.me(), api.thresholds()]);
        setProfile(me);
        setThresholds(limits);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Errore di connessione');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ profile, thresholds, loading, error, refresh }),
    [profile, thresholds, loading, error, refresh],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
