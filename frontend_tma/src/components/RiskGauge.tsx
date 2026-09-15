/** Indicatore semicircolare del punteggio di rischio 0-100. */
import type { RiskLevel } from '../types';

interface Props {
  score: number;
  level: RiskLevel;
  label?: string;
  size?: number;
}

export const LEVEL_COLORS: Record<RiskLevel, string> = {
  GREEN: '#16a34a',
  YELLOW: '#ca8a04',
  ORANGE: '#ea580c',
  RED: '#dc2626',
};

export const LEVEL_LABELS: Record<RiskLevel, string> = {
  GREEN: 'Accettabile',
  YELLOW: 'Attenzione',
  ORANGE: 'Rischio elevato',
  RED: 'Rischio inaccettabile',
};

export function RiskGauge({ score, level, label, size = 200 }: Props) {
  const radius = size / 2 - 14;
  const circumference = Math.PI * radius; // solo il semicerchio superiore
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);
  const color = LEVEL_COLORS[level];

  return (
    <div className="gauge" style={{ width: size }}>
      <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`}>
        <path
          d={`M 14 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 14} ${size / 2}`}
          fill="none"
          stroke="var(--tg-secondary-bg, #eceff3)"
          strokeWidth={14}
          strokeLinecap="round"
        />
        <path
          d={`M 14 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 14} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div className="gauge__value" style={{ color }}>
        {Math.round(clamped)}
        <span className="gauge__max">/100</span>
      </div>
      <div className="gauge__label" style={{ color }}>
        {label ?? LEVEL_LABELS[level]}
      </div>
    </div>
  );
}
