/**
 * Client REST verso il backend Django.
 *
 * Ogni richiesta porta l'initData firmata di Telegram: il server la verifica
 * via HMAC, quindi non c'e' nessun token da conservare sul dispositivo.
 */
import { getInitData } from './telegram';
import type {
  Assessment,
  AssessmentType,
  Company,
  DashboardData,
  PoseData,
  Profile,
  TaskData,
  Thresholds,
} from '../types';

const BASE_URL = (import.meta.env.VITE_API_URL ?? '/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 402: quota del piano esaurita, la UI mostra il paywall. */
  get isQuotaExceeded(): boolean {
    return this.status === 402;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': getInitData(),
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      error?.message ?? `Errore di rete (${response.status})`,
      response.status,
      error?.fields ?? {},
    );
  }

  return payload as T;
}

export interface CreateAssessmentInput {
  type: AssessmentType;
  worker_ref?: string;
  workstation?: string;
  pose_data: PoseData;
  task_data?: TaskData;
  light_lux?: number | null;
  noise_db?: number | null;
  device_tilt_deg?: number | null;
  duration_s?: number;
  frames_analyzed?: number;
}

export const api = {
  me: () => request<Profile>('/me/'),

  thresholds: () => request<Thresholds>('/thresholds/'),

  joinCompany: (body: { name: string; vat: string; telegram_chat_id?: number | null; rspp_name?: string }) =>
    request<Company>('/companies/join/', { method: 'POST', body: JSON.stringify(body) }),

  createAssessment: (body: CreateAssessmentInput) =>
    request<Assessment>('/assessments/', { method: 'POST', body: JSON.stringify(body) }),

  getAssessment: (id: number) => request<Assessment>(`/assessments/${id}/`),

  listAssessments: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return request<{ count: number; results: Assessment[] }>(
      `/assessments/${query ? `?${query}` : ''}`,
    );
  },

  reportStatus: (id: number) =>
    request<{ status: string; pdf_url: string | null; error: string }>(`/assessments/${id}/report/`),

  regenerateReport: (id: number, sendToTelegram = true) =>
    request<{ task_id: string }>('/reports/generate/', {
      method: 'POST',
      body: JSON.stringify({ assessment_id: id, send_to_telegram: sendToTelegram }),
    }),

  dashboard: (companyId: number, days = 90) =>
    request<DashboardData>(`/companies/${companyId}/dashboard/?days=${days}`),

  plans: () =>
    request<{ code: string; label: string; price_eur: number; quota: number | null; features: string[] }[]>(
      '/billing/plans/',
    ),

  checkout: (plan: 'PRO' | 'AGENCY') =>
    request<{ checkout_url: string }>('/billing/checkout/', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),
};

/**
 * Quando l'API e' servita dalla stessa origine della Mini App il canale
 * WebSocket si ricava dall'indirizzo corrente: non serve configurarlo, e
 * resta corretto qualunque sia il dominio su cui gira l'app.
 * `new WebSocket()` non accetta URL relativi, da qui la costruzione.
 */
function defaultWsUrl(): string {
  if (typeof window === 'undefined') return '';
  if (import.meta.env.VITE_API_URL && /^https?:\/\//.test(import.meta.env.VITE_API_URL)) {
    // L'API sta su un'altra origine: senza VITE_WS_URL non si puo' indovinare.
    return '';
  }
  const schema = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${schema}//${window.location.host}/ws/assessments/`;
}

/**
 * Canale WebSocket per gli aggiornamenti di stato del report.
 * Restituisce la funzione di chiusura.
 */
export function subscribeAssessments(onUpdate: (data: Assessment) => void): () => void {
  const wsBase = import.meta.env.VITE_WS_URL || defaultWsUrl();
  if (!wsBase) return () => undefined;

  const socket = new WebSocket(`${wsBase}?initData=${encodeURIComponent(getInitData())}`);
  const keepAlive = window.setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
  }, 30_000);

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'assessment.update') onUpdate(payload as Assessment);
    } catch {
      /* messaggio non leggibile: si ignora */
    }
  };

  return () => {
    window.clearInterval(keepAlive);
    socket.close();
  };
}
