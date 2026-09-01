"""
Motore di calcolo del rischio ergonomico.

Contiene tre blocchi indipendenti e testabili:

1. `niosh_rwl` / `lifting_index` - equazione NIOSH rivista (1991), recepita in
   Italia dalla ISO 11228-1 e richiamata dall'Allegato XXXIII del D.Lgs 81/08.
2. `score_posture` - punteggio posturale in stile RULA/REBA calcolato sugli
   angoli medi e sul 95o percentile prodotti da MediaPipe.
3. `score_environment` - conformita' ambientale (illuminamento, rumore) e
   validita' tecnica dell'acquisizione (stabilita' del telefono).

`evaluate()` li combina in un unico punteggio 0-100 con l'elenco dei rilievi.
Il modulo e' puro Python: nessun import di Django, cosi' e' testabile a parte.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Any

# ---------------------------------------------------------------- costanti NIOSH

LOAD_CONSTANT = 23.0  # kg, popolazione lavorativa mista (ISO 11228-1)

# Tabella dei moltiplicatori di frequenza (NIOSH 1991, Tab. 5).
# chiave: sollevamenti/minuto -> (<=1h V<75, <=1h V>=75,
#                                 1-2h V<75, 1-2h V>=75,
#                                 2-8h V<75, 2-8h V>=75)
_FM_TABLE: dict[float, tuple[float, ...]] = {
    0.2: (1.00, 1.00, 0.95, 0.95, 0.85, 0.85),
    0.5: (0.97, 0.97, 0.92, 0.92, 0.81, 0.81),
    1.0: (0.94, 0.94, 0.88, 0.88, 0.75, 0.75),
    2.0: (0.91, 0.91, 0.84, 0.84, 0.65, 0.65),
    3.0: (0.88, 0.88, 0.79, 0.79, 0.55, 0.55),
    4.0: (0.84, 0.84, 0.72, 0.72, 0.45, 0.45),
    5.0: (0.80, 0.80, 0.60, 0.60, 0.35, 0.35),
    6.0: (0.75, 0.75, 0.50, 0.50, 0.27, 0.27),
    7.0: (0.70, 0.70, 0.42, 0.42, 0.22, 0.22),
    8.0: (0.60, 0.60, 0.35, 0.35, 0.18, 0.18),
    9.0: (0.52, 0.52, 0.30, 0.30, 0.00, 0.15),
    10.0: (0.45, 0.45, 0.26, 0.26, 0.00, 0.13),
    11.0: (0.41, 0.41, 0.00, 0.23, 0.00, 0.00),
    12.0: (0.37, 0.37, 0.00, 0.21, 0.00, 0.00),
    13.0: (0.00, 0.34, 0.00, 0.00, 0.00, 0.00),
    14.0: (0.00, 0.31, 0.00, 0.00, 0.00, 0.00),
    15.0: (0.00, 0.28, 0.00, 0.00, 0.00, 0.00),
}
_FM_KEYS = sorted(_FM_TABLE)

# Moltiplicatore di presa: (V<75, V>=75)
_CM_TABLE = {
    "GOOD": (1.00, 1.00),
    "FAIR": (0.95, 1.00),
    "POOR": (0.90, 0.90),
}

DURATION_SHORT = "SHORT"  # <= 1 ora
DURATION_MODERATE = "MODERATE"  # > 1 e <= 2 ore
DURATION_LONG = "LONG"  # > 2 e <= 8 ore

_DURATION_OFFSET = {DURATION_SHORT: 0, DURATION_MODERATE: 2, DURATION_LONG: 4}

# --------------------------------------------------------- soglie ambientali/posturali

MIN_LUX = 200.0  # Allegato XXXIV: illuminamento adeguato alla postazione VDT
MAX_NOISE_DB = 80.0  # Titolo VIII Capo II: valore inferiore di azione LEX,8h
MAX_TILT_DEG = 2.0  # oltre questa deviazione l'acquisizione non e' attendibile

TRUNK_FLEXION_WARN = 20.0
TRUNK_FLEXION_HIGH = 60.0
TRUNK_TWIST_WARN = 15.0
ARM_ELEVATION_WARN = 90.0
NECK_FLEXION_WARN = 20.0
EAR_FATIGUE_THRESHOLD = 0.21  # Eye Aspect Ratio sotto cui l'occhio e' chiuso


@dataclass
class Finding:
    """Singolo rilievo, pronto per finire in tabella nel PDF."""

    code: str
    severity: str  # INFO | WARN | HIGH | CRITICAL
    title: str
    detail: str
    measured: float | None = None
    threshold: float | None = None
    reference: str = ""
    recommendation: str = ""

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RiskResult:
    score: float
    level: str
    findings: list[dict] = field(default_factory=list)
    lifting_index: float | None = None
    recommended_weight_limit: float | None = None
    multipliers: dict[str, float] = field(default_factory=dict)
    breakdown: dict[str, float] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


# ------------------------------------------------------------------------ utility


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def angle(pose: dict, key: str, stat: str = "p95", default: float = 0.0) -> float:
    """
    Legge un angolo da `pose_data` accettando sia uno scalare sia un dizionario
    di statistiche ({"mean": .., "p95": .., "max": ..}). Se la statistica
    richiesta manca, ripiega su mean e poi su max.
    """
    raw = pose.get(key)
    if raw is None:
        return default
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, dict):
        for candidate in (stat, "p95", "mean", "max", "value"):
            if isinstance(raw.get(candidate), (int, float)):
                return float(raw[candidate])
    return default


# -------------------------------------------------------------------- NIOSH


def horizontal_multiplier(h_cm: float) -> float:
    """HM = 25/H, saturato a 1 sotto i 25 cm e nullo oltre i 63 cm."""
    if h_cm <= 0:
        return 0.0
    if h_cm < 25:
        return 1.0
    if h_cm > 63:
        return 0.0
    return 25.0 / h_cm


def vertical_multiplier(v_cm: float) -> float:
    """VM = 1 - 0.003 * |V - 75|, nullo oltre 175 cm."""
    if v_cm < 0 or v_cm > 175:
        return 0.0
    return 1 - 0.003 * abs(v_cm - 75.0)


def distance_multiplier(d_cm: float) -> float:
    """DM = 0.82 + 4.5/D, saturato a 1 sotto i 25 cm e nullo oltre 175 cm."""
    if d_cm < 25:
        return 1.0
    if d_cm > 175:
        return 0.0
    return 0.82 + 4.5 / d_cm


def asymmetric_multiplier(a_deg: float) -> float:
    """AM = 1 - 0.0032 * A, nullo oltre 135 gradi di torsione."""
    a_deg = abs(a_deg)
    if a_deg > 135:
        return 0.0
    return 1 - 0.0032 * a_deg


def frequency_multiplier(freq_per_min: float, duration: str, v_cm: float) -> float:
    """FM da tabella NIOSH, con interpolazione lineare tra le righe."""
    if freq_per_min > 15:
        return 0.0
    col = _DURATION_OFFSET.get(duration, _DURATION_OFFSET[DURATION_LONG])
    col += 1 if v_cm >= 75 else 0

    freq = max(freq_per_min, _FM_KEYS[0])
    lower = _FM_KEYS[0]
    upper = _FM_KEYS[-1]
    for key in _FM_KEYS:
        if key <= freq:
            lower = key
        if key >= freq:
            upper = key
            break

    low_value = _FM_TABLE[lower][col]
    high_value = _FM_TABLE[upper][col]
    if upper == lower:
        return low_value
    ratio = (freq - lower) / (upper - lower)
    return low_value + (high_value - low_value) * ratio


def coupling_multiplier(coupling: str, v_cm: float) -> float:
    """CM in base alla qualita' della presa rilevata dal Hand Landmarker."""
    values = _CM_TABLE.get((coupling or "FAIR").upper(), _CM_TABLE["FAIR"])
    return values[1] if v_cm >= 75 else values[0]


def niosh_rwl(
    *,
    h_cm: float,
    v_cm: float,
    d_cm: float,
    a_deg: float,
    freq_per_min: float,
    duration: str,
    coupling: str,
) -> tuple[float, dict[str, float]]:
    """Peso limite raccomandato e moltiplicatori che lo compongono."""
    multipliers = {
        "LC": LOAD_CONSTANT,
        "HM": round(horizontal_multiplier(h_cm), 3),
        "VM": round(vertical_multiplier(v_cm), 3),
        "DM": round(distance_multiplier(d_cm), 3),
        "AM": round(asymmetric_multiplier(a_deg), 3),
        "FM": round(frequency_multiplier(freq_per_min, duration, v_cm), 3),
        "CM": round(coupling_multiplier(coupling, v_cm), 3),
    }
    rwl = LOAD_CONSTANT
    for key in ("HM", "VM", "DM", "AM", "FM", "CM"):
        rwl *= multipliers[key]
    return round(rwl, 2), multipliers


def lifting_index(load_kg: float, rwl: float) -> float:
    """Indice di sollevamento IS = peso movimentato / RWL."""
    if rwl <= 0:
        return math.inf if load_kg > 0 else 0.0
    return round(load_kg / rwl, 2)


def score_from_lifting_index(li: float) -> float:
    """
    Converte l'indice di sollevamento in un punteggio 0-100 con le fasce
    usate dalla prassi italiana (ISO 11228-1):
      IS <= 0.85 accettabile | 0.85-1 borderline | 1-2 rischio | > 2 elevato.
    """
    if math.isinf(li):
        return 100.0
    if li <= 0.85:
        return _clamp(li / 0.85 * 25.0, 0.0, 25.0)
    if li <= 1.0:
        return 25.0 + (li - 0.85) / 0.15 * 25.0
    if li <= 2.0:
        return 50.0 + (li - 1.0) / 1.0 * 25.0
    return _clamp(75.0 + (li - 2.0) / 2.0 * 25.0, 75.0, 100.0)


# ------------------------------------------------------------------- postura


def score_posture(pose: dict, assessment_type: str) -> tuple[float, list[Finding]]:
    """
    Penalita' posturale 0-100 con i rilievi associati.

    Gli angoli attesi in `pose` (gradi, gia' aggregati sul dispositivo):
      trunk_flexion_deg, trunk_twist_deg, neck_flexion_deg,
      shoulder_elevation_deg, elbow_angle_deg, knee_angle_deg,
      wrist_deviation_deg, e opzionalmente ear (fatica) e hand_grip.
    """
    findings: list[Finding] = []
    penalty = 0.0

    trunk = angle(pose, "trunk_flexion_deg")
    twist = abs(angle(pose, "trunk_twist_deg"))
    neck = angle(pose, "neck_flexion_deg")
    shoulder = angle(pose, "shoulder_elevation_deg")
    knee = angle(pose, "knee_angle_deg", default=180.0)

    if trunk > TRUNK_FLEXION_WARN:
        over = trunk - TRUNK_FLEXION_WARN
        penalty += _clamp(over * 0.9, 0, 40)
        findings.append(
            Finding(
                code="TRUNK_FLEXION",
                severity="HIGH" if trunk >= TRUNK_FLEXION_HIGH else "WARN",
                title="Flessione del tronco oltre soglia",
                detail=(
                    f"Flessione rilevata (95o percentile) di {trunk:.0f}gradi, "
                    f"oltre i {TRUNK_FLEXION_WARN:.0f}gradi raccomandati."
                ),
                measured=round(trunk, 1),
                threshold=TRUNK_FLEXION_WARN,
                reference="ISO 11226 / D.Lgs 81/08 All. XXXIII",
                recommendation=(
                    "Sollevare la superficie di prelievo o adottare piani a "
                    "quota variabile per portare il carico all'altezza delle nocche."
                ),
            )
        )

    if twist > TRUNK_TWIST_WARN:
        penalty += _clamp((twist - TRUNK_TWIST_WARN) * 0.8, 0, 25)
        findings.append(
            Finding(
                code="TRUNK_TWIST",
                severity="HIGH" if twist > 30 else "WARN",
                title="Torsione del busto",
                detail=f"Torsione di {twist:.0f}gradi durante il compito.",
                measured=round(twist, 1),
                threshold=TRUNK_TWIST_WARN,
                reference="ISO 11228-1",
                recommendation=(
                    "Riposizionare pallet e scaffale per eliminare la rotazione: "
                    "il lavoratore deve ruotare i piedi, non il busto."
                ),
            )
        )

    if shoulder > ARM_ELEVATION_WARN:
        penalty += _clamp((shoulder - ARM_ELEVATION_WARN) * 0.7, 0, 25)
        findings.append(
            Finding(
                code="ARM_ELEVATION",
                severity="HIGH" if shoulder > 120 else "WARN",
                title="Braccia sopra la linea delle spalle",
                detail=f"Elevazione del braccio di {shoulder:.0f}gradi.",
                measured=round(shoulder, 1),
                threshold=ARM_ELEVATION_WARN,
                reference="ISO 11226",
                recommendation="Abbassare i ripiani sopra i 150 cm o dotare la postazione di scaletta.",
            )
        )

    if neck > NECK_FLEXION_WARN:
        weight = 1.2 if assessment_type == "PC" else 0.6
        penalty += _clamp((neck - NECK_FLEXION_WARN) * weight, 0, 30)
        findings.append(
            Finding(
                code="NECK_FLEXION",
                severity="WARN",
                title="Flessione del collo",
                detail=f"Flessione cervicale di {neck:.0f}gradi.",
                measured=round(neck, 1),
                threshold=NECK_FLEXION_WARN,
                reference="D.Lgs 81/08 All. XXXIV",
                recommendation=(
                    "Portare il bordo superiore dello schermo all'altezza degli occhi."
                    if assessment_type == "PC"
                    else "Evitare la lettura di etichette a quota bassa senza piegare le ginocchia."
                ),
            )
        )

    if assessment_type == "LIFT" and knee > 165 and trunk > 45:
        # Schiena curva a gambe tese: la tecnica di sollevamento e' scorretta.
        penalty += 12
        findings.append(
            Finding(
                code="STOOP_LIFT",
                severity="HIGH",
                title="Sollevamento a schiena curva",
                detail=(
                    f"Ginocchia quasi estese ({knee:.0f}gradi) con tronco flesso "
                    f"a {trunk:.0f}gradi: tecnica 'stoop' anziche' 'squat'."
                ),
                measured=round(knee, 1),
                threshold=165.0,
                reference="ISO 11228-1",
                recommendation="Formazione specifica sulla tecnica di sollevamento (art. 37 D.Lgs 81/08).",
            )
        )

    grip = str(pose.get("hand_grip", "")).upper()
    if grip == "POOR":
        penalty += 8
        findings.append(
            Finding(
                code="GRIP_POOR",
                severity="WARN",
                title="Presa inadeguata",
                detail="Rilevata presa a uncino/pinch anziche' presa di potenza.",
                reference="NIOSH - coupling multiplier",
                recommendation="Dotare i contenitori di maniglie o adottare ausili di presa.",
            )
        )

    ear = pose.get("ear") or {}
    if isinstance(ear, dict):
        ear_mean = ear.get("mean")
        yawns = ear.get("yawn_count", 0) or 0
        if isinstance(ear_mean, (int, float)) and ear_mean < EAR_FATIGUE_THRESHOLD:
            penalty += 6
            findings.append(
                Finding(
                    code="FATIGUE_EAR",
                    severity="WARN",
                    title="Indicatori di affaticamento visivo",
                    detail=f"Eye Aspect Ratio medio {ear_mean:.2f} sotto la soglia di {EAR_FATIGUE_THRESHOLD}.",
                    measured=round(float(ear_mean), 3),
                    threshold=EAR_FATIGUE_THRESHOLD,
                    reference="D.Lgs 81/08 art. 175 (pause VDT)",
                    recommendation="Applicare la pausa di 15 minuti ogni 120 minuti di lavoro al VDT.",
                )
            )
        if yawns and yawns >= 2:
            penalty += 4
            findings.append(
                Finding(
                    code="FATIGUE_YAWN",
                    severity="INFO",
                    title="Segnali di sonnolenza",
                    detail=f"{int(yawns)} sbadigli rilevati nella finestra di analisi.",
                    measured=float(yawns),
                    reference="Buone prassi turnistica",
                    recommendation="Verificare organizzazione dei turni e microplause.",
                )
            )

    return _clamp(penalty, 0, 100), findings


# ------------------------------------------------------------------ ambiente


def score_environment(
    *,
    light_lux: float | None,
    noise_db: float | None,
    tilt_deg: float | None,
    min_lux: float = MIN_LUX,
    max_noise_db: float = MAX_NOISE_DB,
    max_tilt_deg: float = MAX_TILT_DEG,
) -> tuple[float, list[Finding]]:
    """Penalita' 0-100 per non conformita' ambientali e qualita' acquisizione."""
    findings: list[Finding] = []
    penalty = 0.0

    if light_lux is not None and light_lux < min_lux:
        deficit = (min_lux - light_lux) / min_lux
        penalty += _clamp(deficit * 30, 0, 30)
        findings.append(
            Finding(
                code="LIGHT_LOW",
                severity="HIGH" if light_lux < min_lux / 2 else "WARN",
                title="Illuminamento insufficiente",
                detail=f"Misurati {light_lux:.0f} lux contro i {min_lux:.0f} lux minimi.",
                measured=round(light_lux, 1),
                threshold=min_lux,
                reference="D.Lgs 81/08 All. XXXIV, punto 2.d",
                recommendation="Integrare l'illuminazione localizzata sulla postazione.",
            )
        )

    if noise_db is not None and noise_db > max_noise_db:
        penalty += _clamp((noise_db - max_noise_db) * 2.0, 0, 30)
        findings.append(
            Finding(
                code="NOISE_HIGH",
                severity="CRITICAL" if noise_db >= 85 else "HIGH",
                title="Rumore oltre il valore di azione",
                detail=f"Livello misurato {noise_db:.0f} dB(A) contro {max_noise_db:.0f} dB(A).",
                measured=round(noise_db, 1),
                threshold=max_noise_db,
                reference="D.Lgs 81/08 Titolo VIII Capo II, art. 189",
                recommendation=(
                    "Rilievo fonometrico con tecnico competente e fornitura di DPI uditivi."
                ),
            )
        )

    if tilt_deg is not None and tilt_deg > max_tilt_deg:
        findings.append(
            Finding(
                code="CAPTURE_UNSTABLE",
                severity="INFO",
                title="Acquisizione poco stabile",
                detail=(
                    f"Deviazione media del dispositivo {tilt_deg:.1f}gradi "
                    f"(limite {max_tilt_deg:.1f}gradi): gli angoli hanno tolleranza maggiore."
                ),
                measured=round(tilt_deg, 2),
                threshold=max_tilt_deg,
                reference="Nota metodologica ErgoCheck",
                recommendation="Ripetere la scansione con il telefono su treppiede.",
            )
        )

    return _clamp(penalty, 0, 100), findings


# --------------------------------------------------------------- valutazione


def level_from_score(score: float) -> str:
    if score < 25:
        return "GREEN"
    if score < 50:
        return "YELLOW"
    if score < 75:
        return "ORANGE"
    return "RED"


def evaluate(
    *,
    assessment_type: str,
    pose_data: dict,
    task_data: dict | None = None,
    light_lux: float | None = None,
    noise_db: float | None = None,
    tilt_deg: float | None = None,
    thresholds: dict | None = None,
) -> RiskResult:
    """
    Calcola il punteggio complessivo della valutazione.

    Per il sollevamento il punteggio NIOSH domina (peso 65%) ed e' corretto
    dalla postura; per VDT e movimentazione la componente posturale e'
    prevalente. Le non conformita' ambientali si sommano come penalita'.
    """
    task_data = task_data or {}
    thresholds = thresholds or {}
    findings: list[Finding] = []

    posture_score, posture_findings = score_posture(pose_data, assessment_type)
    findings.extend(posture_findings)

    env_score, env_findings = score_environment(
        light_lux=light_lux,
        noise_db=noise_db,
        tilt_deg=tilt_deg,
        min_lux=thresholds.get("min_lux", MIN_LUX),
        max_noise_db=thresholds.get("max_noise_db", MAX_NOISE_DB),
        max_tilt_deg=thresholds.get("max_tilt_deg", MAX_TILT_DEG),
    )
    findings.extend(env_findings)

    li = None
    rwl = None
    multipliers: dict[str, float] = {}
    niosh_score = 0.0

    if assessment_type == "LIFT":
        rwl, multipliers = niosh_rwl(
            h_cm=float(task_data.get("h_cm", 40)),
            v_cm=float(task_data.get("v_cm", 75)),
            d_cm=float(task_data.get("d_cm", 25)),
            a_deg=float(task_data.get("a_deg", angle(pose_data, "trunk_twist_deg"))),
            freq_per_min=float(task_data.get("freq_per_min", 1)),
            duration=str(task_data.get("duration", DURATION_MODERATE)).upper(),
            coupling=str(task_data.get("coupling", pose_data.get("hand_grip", "FAIR"))),
        )
        li = lifting_index(float(task_data.get("load_kg", 0)), rwl)
        niosh_score = score_from_lifting_index(li)
        base = 0.65 * niosh_score + 0.35 * posture_score

        if li >= 1.0:
            findings.insert(
                0,
                Finding(
                    code="NIOSH_LI",
                    severity="CRITICAL" if li >= 3 else "HIGH",
                    title=f"Indice di sollevamento IS = {li}",
                    detail=(
                        f"Peso movimentato {task_data.get('load_kg', 0)} kg contro un "
                        f"peso limite raccomandato di {rwl} kg."
                    ),
                    measured=li,
                    threshold=1.0,
                    reference="ISO 11228-1 / D.Lgs 81/08 All. XXXIII",
                    recommendation=(
                        "Ridurre il peso unitario, avvicinare il carico al corpo o "
                        "introdurre un ausilio meccanico."
                    ),
                ),
            )
    elif assessment_type == "PC":
        base = posture_score
    else:  # HANDLING e futuri tipi
        base = 0.8 * posture_score + 0.2 * min(env_score, 40)

    score = _clamp(base + env_score * 0.5, 0, 100)

    severity_rank = {"CRITICAL": 0, "HIGH": 1, "WARN": 2, "INFO": 3}
    findings.sort(key=lambda f: severity_rank.get(f.severity, 9))

    return RiskResult(
        score=round(score, 1),
        level=level_from_score(score),
        findings=[f.as_dict() for f in findings],
        lifting_index=li,
        recommended_weight_limit=rwl,
        multipliers=multipliers,
        breakdown={
            "niosh": round(niosh_score, 1),
            "posture": round(posture_score, 1),
            "environment": round(env_score, 1),
        },
    )
