/** Elenco dei rilievi con riferimento normativo e azione correttiva. */
import type { Finding } from '../types';

const SEVERITY_LABEL: Record<Finding['severity'], string> = {
  CRITICAL: 'Critico',
  HIGH: 'Alto',
  WARN: 'Medio',
  INFO: 'Info',
};

export function FindingList({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <p className="empty">
        Nessuna non conformità rilevata: i parametri misurati rientrano nelle
        soglie di riferimento.
      </p>
    );
  }

  return (
    <ul className="findings">
      {findings.map((finding) => (
        <li key={finding.code} className={`finding finding--${finding.severity.toLowerCase()}`}>
          <div className="finding__head">
            <span className="finding__severity">{SEVERITY_LABEL[finding.severity]}</span>
            <h3 className="finding__title">{finding.title}</h3>
          </div>
          <p className="finding__detail">{finding.detail}</p>
          {finding.recommendation && (
            <p className="finding__action">
              <strong>Azione:</strong> {finding.recommendation}
            </p>
          )}
          {finding.reference && <p className="finding__ref">{finding.reference}</p>}
        </li>
      ))}
    </ul>
  );
}
