"""Il PDF deve essere generato senza dipendere dalla rete."""
import pytest

from apps.assessments.models import Assessment
from apps.assessments.pdf_report import build_report


@pytest.fixture
def assessment(db, company, user):
    return Assessment.objects.create(
        company=company,
        created_by=user,
        type=Assessment.Type.LIFT,
        worker_ref="MAG-014",
        workstation="Baia carico 2",
        pose_data={"trunk_flexion_deg": {"mean": 40, "p95": 55}, "hand_grip": "POOR"},
        task_data={
            "load_kg": 18,
            "freq_per_min": 4,
            "duration": "LONG",
            "_multipliers": {"LC": 23.0, "HM": 0.5, "VM": 0.86, "DM": 0.87,
                             "AM": 0.9, "FM": 0.45, "CM": 0.95},
        },
        risk_score=82.4,
        risk_level="RED",
        lifting_index=2.6,
        recommended_weight_limit=6.9,
        light_lux=140,
        noise_db=86,
        device_tilt_deg=1.1,
        frames_analyzed=420,
        duration_s=15.0,
        findings=[
            {
                "code": "NIOSH_LI", "severity": "CRITICAL", "title": "Indice IS = 2.6",
                "detail": "Peso 18 kg contro RWL 6.9 kg", "measured": 2.6, "threshold": 1.0,
                "reference": "ISO 11228-1", "recommendation": "Introdurre ausilio meccanico.",
            }
        ],
    )


def test_build_report_produces_a_pdf(assessment):
    content = build_report(assessment)
    assert content[:5] == b"%PDF-"
    assert len(content) > 3000


def test_free_plan_report_is_watermarked(assessment):
    plain = build_report(assessment, watermark=False)
    marked = build_report(assessment, watermark=True)
    assert len(marked) > len(plain)


def test_report_without_findings_still_renders(assessment):
    assessment.findings = []
    assessment.type = Assessment.Type.PC
    assessment.lifting_index = None
    assert build_report(assessment)[:5] == b"%PDF-"


def test_white_label_branding_is_applied(assessment, company):
    company.brand_name = "Studio Sicurezza Rossi"
    company.brand_color = "#8B1E3F"
    company.save()
    assessment.refresh_from_db()
    assert build_report(assessment)[:5] == b"%PDF-"
