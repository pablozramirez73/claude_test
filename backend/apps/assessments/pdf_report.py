"""
Generazione del report PDF di valutazione ergonomica.

Il layout segue la struttura attesa da un allegato al DVR: intestazione con
i dati dell'azienda, metodo applicato, misure rilevate, esito NIOSH, elenco
dei rilievi con riferimento normativo e azioni correttive, note metodologiche.
"""
from __future__ import annotations

import io
from datetime import datetime

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

LEVEL_COLORS = {
    "GREEN": colors.HexColor("#16a34a"),
    "YELLOW": colors.HexColor("#ca8a04"),
    "ORANGE": colors.HexColor("#ea580c"),
    "RED": colors.HexColor("#dc2626"),
}

LEVEL_LABELS = {
    "GREEN": "ACCETTABILE",
    "YELLOW": "ATTENZIONE",
    "ORANGE": "RISCHIO ELEVATO",
    "RED": "RISCHIO INACCETTABILE",
}

SEVERITY_LABELS = {
    "CRITICAL": "Critico",
    "HIGH": "Alto",
    "WARN": "Medio",
    "INFO": "Informativo",
}

DURATION_LABELS = {
    "SHORT": "fino a 1 ora",
    "MODERATE": "da 1 a 2 ore",
    "LONG": "da 2 a 8 ore",
}

MULTIPLIER_LABELS = {
    "LC": "LC - Costante di carico",
    "HM": "HM - Distanza orizzontale",
    "VM": "VM - Altezza di presa",
    "DM": "DM - Dislocazione verticale",
    "AM": "AM - Asimmetria (torsione)",
    "FM": "FM - Frequenza",
    "CM": "CM - Qualità della presa",
}

DISCLAIMER = (
    "Il presente documento è prodotto da un sistema automatico di pre-screening "
    "ergonomico basato su analisi video on-device (MediaPipe Pose) e su sensori "
    "del dispositivo mobile. Costituisce elemento istruttorio a supporto della "
    "valutazione dei rischi e non sostituisce la valutazione del Datore di Lavoro "
    "ai sensi dell'art. 28 del D.Lgs 81/08, né il rilievo strumentale certificato "
    "per rumore e illuminamento. I valori di illuminamento e rumore sono acquisiti "
    "con i sensori dello smartphone e hanno valore indicativo."
)


def _styles(brand_color: str):
    base = getSampleStyleSheet()
    accent = colors.HexColor(brand_color or "#0B6BCB")
    return {
        "title": ParagraphStyle(
            "ErgoTitle", parent=base["Title"], fontSize=20, spaceAfter=2, textColor=accent
        ),
        "subtitle": ParagraphStyle(
            "ErgoSubtitle", parent=base["Normal"], fontSize=10, textColor=colors.HexColor("#555555")
        ),
        "h2": ParagraphStyle(
            "ErgoH2",
            parent=base["Heading2"],
            fontSize=12.5,
            spaceBefore=12,
            spaceAfter=6,
            textColor=accent,
        ),
        "body": ParagraphStyle(
            "ErgoBody", parent=base["Normal"], fontSize=9.5, leading=13, alignment=TA_JUSTIFY
        ),
        "small": ParagraphStyle(
            "ErgoSmall", parent=base["Normal"], fontSize=7.8, leading=10,
            textColor=colors.HexColor("#444444"),
        ),
        "cell": ParagraphStyle("ErgoCell", parent=base["Normal"], fontSize=8.5, leading=11),
        "score": ParagraphStyle(
            "ErgoScore", parent=base["Normal"], fontSize=34, alignment=TA_CENTER, leading=38
        ),
        "accent": accent,
    }


def _fmt(value, suffix="", nd=1, dash="n.d."):
    if value is None:
        return dash
    if isinstance(value, float):
        return f"{value:.{nd}f}{suffix}"
    return f"{value}{suffix}"


def _kv_table(rows, styles, col_widths=(58 * mm, 112 * mm)):
    data = [
        [Paragraph(f"<b>{k}</b>", styles["cell"]), Paragraph(str(v), styles["cell"])]
        for k, v in rows
    ]
    table = Table(data, colWidths=list(col_widths), hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f5f7fa")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def _score_banner(assessment, styles):
    level = assessment.risk_level
    color = LEVEL_COLORS.get(level, colors.grey)
    score_cell = Paragraph(
        f'<font color="{color.hexval()}"><b>{assessment.risk_score:.0f}</b></font>'
        f'<font size="12" color="#666666">/100</font>',
        styles["score"],
    )
    label_cell = Paragraph(
        f'<font size="13" color="{color.hexval()}">'
        f'<b>{LEVEL_LABELS.get(level, level)}</b></font><br/>'
        f'<font size="9" color="#444444">Indice di rischio ergonomico complessivo</font>',
        styles["cell"],
    )
    table = Table([[score_cell, label_cell]], colWidths=[38 * mm, 132 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1.0, color),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#fafafa")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return table


def _findings_table(findings, styles):
    header = ["Gravità", "Rilievo", "Misura", "Riferimento", "Azione correttiva"]
    data = [[Paragraph(f"<b>{h}</b>", styles["cell"]) for h in header]]
    row_styles = []

    for index, finding in enumerate(findings, start=1):
        severity = finding.get("severity", "INFO")
        measured = finding.get("measured")
        threshold = finding.get("threshold")
        measure_text = _fmt(measured, dash="-")
        if threshold is not None:
            measure_text += f"<br/><font size='7' color='#777777'>lim. {_fmt(threshold)}</font>"
        data.append(
            [
                Paragraph(SEVERITY_LABELS.get(severity, severity), styles["cell"]),
                Paragraph(
                    f"<b>{finding.get('title', '')}</b><br/>"
                    f"<font size='7.5' color='#555555'>{finding.get('detail', '')}</font>",
                    styles["cell"],
                ),
                Paragraph(measure_text, styles["cell"]),
                Paragraph(finding.get("reference", ""), styles["cell"]),
                Paragraph(finding.get("recommendation", ""), styles["cell"]),
            ]
        )
        if severity in {"CRITICAL", "HIGH"}:
            row_styles.append(
                (
                    "TEXTCOLOR",
                    (0, index),
                    (0, index),
                    LEVEL_COLORS["RED" if severity == "CRITICAL" else "ORANGE"],
                )
            )

    table = Table(data, colWidths=[16 * mm, 55 * mm, 20 * mm, 32 * mm, 47 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2f7")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
            + row_styles
        )
    )
    return table


def _niosh_table(assessment, styles):
    multipliers = (assessment.task_data or {}).get("_multipliers") or {}
    rows = [["Fattore", "Valore"]]
    for key, label in MULTIPLIER_LABELS.items():
        if key in multipliers:
            value = f"{multipliers[key]:.0f} kg" if key == "LC" else f"{multipliers[key]:.3f}"
            rows.append([label, value])
    if len(rows) == 1:
        return None

    data = [[Paragraph(f"<b>{c}</b>" if i == 0 else c, styles["cell"]) for c in row]
            for i, row in enumerate(rows)]
    table = Table(data, colWidths=[110 * mm, 60 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2f7")),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def _page_decorations(company, styles, watermark: bool):
    """Callback disegnata su ogni pagina: intestazione, piede, watermark."""

    def draw(canvas, doc):
        canvas.saveState()
        width, height = A4

        canvas.setFillColor(styles["accent"])
        canvas.rect(0, height - 12 * mm, width, 12 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(15 * mm, height - 8.2 * mm, company.display_name.upper())
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(
            width - 15 * mm, height - 8.2 * mm, "Valutazione ergonomica - D.Lgs 81/08"
        )

        canvas.setFillColor(colors.HexColor("#888888"))
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(
            15 * mm, 10 * mm,
            f"ErgoCheck - generato il {timezone.localtime().strftime('%d/%m/%Y %H:%M')}",
        )
        canvas.drawRightString(width - 15 * mm, 10 * mm, f"Pag. {doc.page}")

        if watermark:
            canvas.saveState()
            canvas.setFont("Helvetica-Bold", 58)
            canvas.setFillColor(colors.Color(0.85, 0.85, 0.85, alpha=0.35))
            canvas.translate(width / 2, height / 2)
            canvas.rotate(35)
            canvas.drawCentredString(0, 0, "ANTEPRIMA FREEMIUM")
            canvas.restoreState()

        canvas.restoreState()

    return draw


def build_report(assessment, watermark: bool = False) -> bytes:
    """Rende il PDF della valutazione e restituisce i byte del file."""
    company = assessment.company
    styles = _styles(company.brand_color)
    buffer = io.BytesIO()

    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        title=f"ErgoCheck - valutazione {assessment.pk}",
        author=company.display_name,
        subject="Valutazione ergonomica D.Lgs 81/08",
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")
    doc.addPageTemplates(
        [
            PageTemplate(
                id="ergo",
                frames=[frame],
                onPage=_page_decorations(company, styles, watermark),
            )
        ]
    )

    method = (
        "NIOSH / ISO 11228-1"
        if assessment.type == "LIFT"
        else "ISO 11226 - analisi posturale"
    )

    story = []
    story.append(Paragraph("Report di valutazione ergonomica", styles["title"]))
    story.append(
        Paragraph(
            f"Metodo: {method}"
            f" &middot; ID valutazione {assessment.pk}",
            styles["subtitle"],
        )
    )
    story.append(Spacer(1, 8))

    story.append(_score_banner(assessment, styles))
    story.append(Spacer(1, 10))

    story.append(Paragraph("1. Dati identificativi", styles["h2"]))
    story.append(
        _kv_table(
            [
                ("Azienda", company.name),
                ("Partita IVA", company.vat),
                ("RSPP / Tecnico", company.rspp_name or "-"),
                ("Postazione", assessment.workstation or "-"),
                ("Riferimento lavoratore", assessment.worker_ref or "-"),
                ("Tipo di compito", assessment.get_type_display()),
                (
                    "Data rilievo",
                    timezone.localtime(assessment.created_at).strftime("%d/%m/%Y %H:%M"),
                ),
            ],
            styles,
        )
    )

    story.append(Paragraph("2. Parametri rilevati", styles["h2"]))
    pose = assessment.pose_data or {}

    def _angle_value(key):
        raw = pose.get(key)
        if isinstance(raw, dict):
            mean = raw.get("mean")
            p95 = raw.get("p95")
            return f"medio {_fmt(mean, '°', 0)} / P95 {_fmt(p95, '°', 0)}"
        return _fmt(raw, "°", 0)

    story.append(
        _kv_table(
            [
                ("Flessione tronco", _angle_value("trunk_flexion_deg")),
                ("Torsione tronco", _angle_value("trunk_twist_deg")),
                ("Elevazione braccio", _angle_value("shoulder_elevation_deg")),
                ("Flessione collo", _angle_value("neck_flexion_deg")),
                ("Angolo ginocchio", _angle_value("knee_angle_deg")),
                ("Qualità della presa", pose.get("hand_grip", "n.d.")),
                ("Illuminamento", _fmt(assessment.light_lux, " lux", 0)),
                ("Rumore ambientale", _fmt(assessment.noise_db, " dB(A)", 0)),
                ("Stabilità dispositivo", _fmt(assessment.device_tilt_deg, "°", 2)),
                (
                    "Acquisizione",
                    f"{assessment.frames_analyzed} frame in {_fmt(assessment.duration_s, ' s', 1)}",
                ),
            ],
            styles,
        )
    )

    if assessment.type == "LIFT":
        story.append(Paragraph("3. Esito NIOSH", styles["h2"]))
        task = assessment.task_data or {}
        story.append(
            _kv_table(
                [
                    ("Peso movimentato", _fmt(task.get("load_kg"), " kg", 1)),
                    (
                        "Peso limite raccomandato (RWL)",
                        _fmt(assessment.recommended_weight_limit, " kg", 2),
                    ),
                    ("Indice di sollevamento (IS)", _fmt(assessment.lifting_index, "", 2)),
                    ("Frequenza", _fmt(task.get("freq_per_min"), " sollevamenti/min", 1)),
                    (
                        "Durata del compito",
                        DURATION_LABELS.get(str(task.get("duration", "")).upper(), "-"),
                    ),
                ],
                styles,
            )
        )
        niosh_table = _niosh_table(assessment, styles)
        if niosh_table is not None:
            story.append(Spacer(1, 6))
            story.append(niosh_table)
        story.append(Spacer(1, 4))
        story.append(
            Paragraph(
                "RWL = 23 &times; HM &times; VM &times; DM &times; AM &times; FM &times; CM. "
                "Un indice IS &gt; 1 indica esposizione a rischio per una quota crescente "
                "della popolazione lavorativa; IS &gt; 3 richiede intervento immediato.",
                styles["small"],
            )
        )

    section = "4" if assessment.type == "LIFT" else "3"
    story.append(Paragraph(f"{section}. Rilievi e azioni correttive", styles["h2"]))
    findings = assessment.findings or []
    if findings:
        story.append(_findings_table(findings, styles))
    else:
        story.append(
            Paragraph(
                "Nessuna non conformità rilevata: i parametri misurati rientrano "
                "nelle soglie di riferimento.",
                styles["body"],
            )
        )

    story.append(PageBreak())
    story.append(Paragraph("Nota metodologica e limiti", styles["h2"]))
    story.append(Paragraph(DISCLAIMER, styles["body"]))
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            "<b>Riferimenti normativi</b>: D.Lgs 81/08 Titolo VI e Allegato XXXIII "
            "(movimentazione manuale dei carichi); Titolo VII e Allegato XXXIV "
            "(attrezzature munite di videoterminali); Titolo VIII Capo II "
            "(rumore); UNI ISO 11228-1; UNI EN ISO 11226; NIOSH Revised Lifting "
            "Equation (Waters et al., 1993).",
            styles["small"],
        )
    )
    story.append(Spacer(1, 14))

    signature = [
        [
            Paragraph("Il Datore di Lavoro<br/><br/><br/>______________________", styles["small"]),
            Paragraph(
                f"Il RSPP{f' - {company.rspp_name}' if company.rspp_name else ''}"
                "<br/><br/><br/>______________________",
                styles["small"],
            ),
        ]
    ]
    signature_table = Table(signature, colWidths=[85 * mm, 85 * mm])
    signature_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(KeepTogether(signature_table))

    doc.build(story)
    return buffer.getvalue()


def report_metadata(assessment) -> dict:
    """Riepilogo testuale usato nel messaggio Telegram che accompagna il PDF."""
    return {
        "level": LEVEL_LABELS.get(assessment.risk_level, assessment.risk_level),
        "score": f"{assessment.risk_score:.0f}",
        "generated_at": datetime.now().strftime("%d/%m/%Y %H:%M"),
    }
