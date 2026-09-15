export type AssessmentType = 'LIFT' | 'PC' | 'HANDLING';
export type RiskLevel = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
export type Coupling = 'GOOD' | 'FAIR' | 'POOR';

/** Statistiche di un angolo sull'intera finestra di acquisizione. */
export interface AngleStats {
  mean: number;
  p95: number;
  max: number;
  min: number;
}

export interface PoseData {
  trunk_flexion_deg?: AngleStats;
  trunk_twist_deg?: AngleStats;
  neck_flexion_deg?: AngleStats;
  shoulder_elevation_deg?: AngleStats;
  elbow_angle_deg?: AngleStats;
  knee_angle_deg?: AngleStats;
  hand_grip?: Coupling;
  ear?: { mean: number; min: number; blink_rate_per_min: number; yawn_count: number };
  landmark_confidence?: number;
  samples?: number;
  fps?: number;
}

export interface TaskData {
  load_kg?: number;
  h_cm?: number;
  v_cm?: number;
  d_cm?: number;
  a_deg?: number;
  freq_per_min?: number;
  duration?: 'SHORT' | 'MODERATE' | 'LONG';
  coupling?: Coupling;
  notes?: string;
}

export interface Finding {
  code: string;
  severity: 'INFO' | 'WARN' | 'HIGH' | 'CRITICAL';
  title: string;
  detail: string;
  measured?: number | null;
  threshold?: number | null;
  reference?: string;
  recommendation?: string;
}

export interface Assessment {
  id: number;
  type: AssessmentType;
  type_display: string;
  worker_ref: string;
  workstation: string;
  risk_score: number;
  risk_level: RiskLevel;
  risk_level_display: string;
  lifting_index: number | null;
  recommended_weight_limit: number | null;
  findings: Finding[];
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  pdf_url: string | null;
  created_at: string;
}

export interface Company {
  id: number;
  name: string;
  display_name: string;
  vat: string;
  plan: 'FREE' | 'PRO' | 'AGENCY';
  brand_color: string;
  telegram_chat_id: number | null;
  monthly_quota: number | null;
  quota_remaining: number | null;
}

export interface Profile {
  id: number;
  telegram_id: number;
  username: string;
  full_name: string;
  role: 'OPERATOR' | 'RSPP' | 'ADMIN';
  company: Company | null;
}

export interface Thresholds {
  min_lux: number;
  max_noise_db: number;
  max_tilt_deg: number;
  trunk_flexion_warn: number;
  trunk_twist_warn: number;
  arm_elevation_warn: number;
  neck_flexion_warn: number;
  ear_fatigue: number;
}

export interface DashboardData {
  company: { id: number; name: string; plan: string; quota_remaining: number | null };
  period_days: number;
  total_assessments: number;
  avg_risk_score: number;
  critical_count: number;
  trend: { day: string; avg_score: number; count: number }[];
  by_level: Record<RiskLevel, number>;
  by_type: { type: AssessmentType; count: number; avg_score: number }[];
  top_findings: { code: string; title: string; count: number }[];
}
