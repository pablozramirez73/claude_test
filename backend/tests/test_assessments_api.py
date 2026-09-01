"""Test end-to-end delle API di valutazione."""
import pytest

from apps.assessments.models import Assessment

LIFT_PAYLOAD = {
    "type": "LIFT",
    "worker_ref": "MAG-014",
    "workstation": "Baia carico 2",
    "pose_data": {
        "trunk_flexion_deg": {"mean": 38, "p95": 52, "max": 61},
        "trunk_twist_deg": {"mean": 12, "p95": 24},
        "knee_angle_deg": {"mean": 168, "p95": 175},
        "shoulder_elevation_deg": {"mean": 40, "p95": 62},
        "hand_grip": "FAIR",
        "samples": 420,
        "fps": 28,
    },
    "task_data": {
        "load_kg": 16, "h_cm": 45, "v_cm": 30, "d_cm": 80,
        "a_deg": 24, "freq_per_min": 3, "duration": "LONG", "coupling": "FAIR",
    },
    "light_lux": 320,
    "noise_db": 74,
    "device_tilt_deg": 0.8,
    "duration_s": 15.2,
    "frames_analyzed": 420,
}


@pytest.fixture(autouse=True)
def no_telegram(monkeypatch, settings):
    """Nessuna chiamata di rete verso Telegram durante i test."""
    sent = []
    monkeypatch.setattr(
        "apps.bot.client.send_document",
        lambda chat_id, filename, content, caption="": sent.append(
            {"chat_id": chat_id, "filename": filename, "caption": caption}
        )
        or {"message_id": 1},
    )
    return sent


@pytest.mark.django_db
def test_create_lift_assessment_computes_score_and_report(api, company, no_telegram):
    response = api.post("/api/v1/assessments/", LIFT_PAYLOAD, format="json")
    assert response.status_code == 201, response.data

    body = response.json()
    assert body["risk_level"] in {"YELLOW", "ORANGE", "RED"}
    assert body["lifting_index"] is not None
    assert body["recommended_weight_limit"] > 0
    assert any(f["code"] == "TRUNK_FLEXION" for f in body["findings"])

    assessment = Assessment.objects.get(pk=body["id"])
    # Celery gira in modalita' eager: il PDF esiste gia' a fine richiesta.
    assessment.refresh_from_db()
    assert assessment.status == Assessment.Status.READY
    assert assessment.pdf_report.name.endswith(".pdf")
    assert assessment.task_data["_multipliers"]["HM"] == pytest.approx(25 / 45, abs=1e-3)
    # Il report e' stato recapitato al gruppo aziendale.
    assert no_telegram and no_telegram[0]["chat_id"] == company.telegram_chat_id


@pytest.mark.django_db
def test_lift_without_load_is_rejected(api):
    payload = {**LIFT_PAYLOAD, "task_data": {"h_cm": 40}}
    response = api.post("/api/v1/assessments/", payload, format="json")
    assert response.status_code == 400
    assert "load_kg" in str(response.json())


@pytest.mark.django_db
def test_unknown_pose_keys_are_dropped(api):
    payload = {
        **LIFT_PAYLOAD,
        "pose_data": {**LIFT_PAYLOAD["pose_data"], "evil_key": "drop me"},
    }
    response = api.post("/api/v1/assessments/", payload, format="json")
    assert response.status_code == 201
    assert "evil_key" not in Assessment.objects.get(pk=response.json()["id"]).pose_data


@pytest.mark.django_db
def test_unstable_capture_is_rejected(api):
    payload = {**LIFT_PAYLOAD, "device_tilt_deg": 14.0}
    response = api.post("/api/v1/assessments/", payload, format="json")
    assert response.status_code == 400
    assert "device_tilt_deg" in str(response.json())


@pytest.mark.django_db
def test_pc_assessment_flags_neck_and_light(api):
    payload = {
        "type": "PC",
        "workstation": "Ufficio 1",
        "pose_data": {
            "neck_flexion_deg": {"mean": 30, "p95": 38},
            "trunk_flexion_deg": 10,
            "shoulder_elevation_deg": 20,
            "ear": {"mean": 0.18, "yawn_count": 3},
        },
        "light_lux": 120,
        "noise_db": 55,
        "device_tilt_deg": 0.4,
    }
    response = api.post("/api/v1/assessments/", payload, format="json")
    assert response.status_code == 201
    codes = {f["code"] for f in response.json()["findings"]}
    assert {"NECK_FLEXION", "LIGHT_LOW", "FATIGUE_EAR", "FATIGUE_YAWN"} <= codes


@pytest.mark.django_db
def test_free_plan_quota_returns_402(api, company):
    company.plan = "FREE"
    company.save()
    for _ in range(3):
        assert api.post("/api/v1/assessments/", LIFT_PAYLOAD, format="json").status_code == 201

    response = api.post("/api/v1/assessments/", LIFT_PAYLOAD, format="json")
    assert response.status_code == 402
    assert "quota" in response.json()["error"]["message"].lower()


@pytest.mark.django_db
def test_assessments_are_scoped_to_own_company(api, company, db):
    from apps.accounts.models import Company, TelegramUser
    from tests.factories import build_init_data
    from rest_framework.test import APIClient

    api.post("/api/v1/assessments/", LIFT_PAYLOAD, format="json")

    other_company = Company.objects.create(name="Beta Spa", vat="IT09876543210")
    other_user = TelegramUser.objects.create_user(telegram_id=777, company=other_company)
    other_client = APIClient()
    other_client.credentials(HTTP_X_TELEGRAM_INIT_DATA=build_init_data(other_user.telegram_id))

    assert other_client.get("/api/v1/assessments/").json()["count"] == 0
    assert api.get("/api/v1/assessments/").json()["count"] == 1


@pytest.mark.django_db
def test_dashboard_returns_trend_and_top_findings(api, company):
    api.post("/api/v1/assessments/", LIFT_PAYLOAD, format="json")
    response = api.get(f"/api/v1/companies/{company.pk}/dashboard/")
    assert response.status_code == 200

    body = response.json()
    assert body["total_assessments"] == 1
    assert body["avg_risk_score"] > 0
    assert len(body["trend"]) == 1
    assert body["top_findings"][0]["count"] == 1


@pytest.mark.django_db
def test_dashboard_of_another_company_is_forbidden(api):
    from apps.accounts.models import Company

    other = Company.objects.create(name="Beta Spa", vat="IT09876543210")
    assert api.get(f"/api/v1/companies/{other.pk}/dashboard/").status_code == 403


@pytest.mark.django_db
def test_report_regeneration_is_accepted(api):
    created = api.post("/api/v1/assessments/", LIFT_PAYLOAD, format="json").json()
    response = api.post(
        "/api/v1/reports/generate/",
        {"assessment_id": created["id"], "send_to_telegram": False},
        format="json",
    )
    assert response.status_code == 202
    assert response.json()["assessment_id"] == created["id"]


@pytest.mark.django_db
def test_thresholds_endpoint_is_public(client):
    response = client.get("/api/v1/thresholds/")
    assert response.status_code == 200
    assert response.json()["min_lux"] == 200
