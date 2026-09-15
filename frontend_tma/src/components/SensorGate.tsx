/**
 * Checklist dei prerequisiti tecnici.
 *
 * Finche' una voce obbligatoria e' rossa la scansione non parte: un rilievo
 * fatto con il telefono in mano o al buio non e' difendibile in sede di
 * verifica ispettiva.
 */
interface Check {
  code: string;
  label: string;
  value: string;
  ok: boolean | null;
  blocking: boolean;
  hint?: string;
}

interface Props {
  checks: Check[];
}

export type { Check };

export function SensorGate({ checks }: Props) {
  return (
    <ul className="gate">
      {checks.map((check) => (
        <li
          key={check.code}
          className={`gate__item gate__item--${
            check.ok === null ? 'pending' : check.ok ? 'ok' : check.blocking ? 'blocked' : 'warn'
          }`}
        >
          <span className="gate__icon" aria-hidden="true">
            {check.ok === null ? '…' : check.ok ? '✓' : check.blocking ? '✕' : '!'}
          </span>
          <span className="gate__body">
            <span className="gate__label">{check.label}</span>
            {check.hint && !check.ok && <span className="gate__hint">{check.hint}</span>}
          </span>
          <span className="gate__value">{check.value}</span>
        </li>
      ))}
    </ul>
  );
}
