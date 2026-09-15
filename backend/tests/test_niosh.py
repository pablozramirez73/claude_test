"""Verifiche sull'equazione NIOSH e sul motore di rischio."""
import math

import pytest

from apps.assessments import niosh_calculator as calc


def test_multipliers_ideal_conditions():
    """Nel compito ideale ogni moltiplicatore vale 1 e RWL = 23 kg."""
    rwl, multipliers = calc.niosh_rwl(
        h_cm=25, v_cm=75, d_cm=25, a_deg=0, freq_per_min=0.2,
        duration=calc.DURATION_SHORT, coupling="GOOD",
    )
    assert multipliers["HM"] == 1.0
    assert multipliers["VM"] == 1.0
    assert multipliers["DM"] == 1.0
    assert multipliers["AM"] == 1.0
    assert multipliers["FM"] == 1.0
    assert multipliers["CM"] == 1.0
    assert rwl == pytest.approx(23.0, abs=0.01)


@pytest.mark.parametrize(
    "h_cm,expected",
    [(10, 1.0), (25, 1.0), (50, 0.5), (63, 25 / 63), (70, 0.0)],
)
def test_horizontal_multiplier(h_cm, expected):
    assert calc.horizontal_multiplier(h_cm) == pytest.approx(expected, abs=1e-3)


@pytest.mark.parametrize("v_cm,expected", [(75, 1.0), (0, 0.775), (175, 0.7), (200, 0.0)])
def test_vertical_multiplier(v_cm, expected):
    assert calc.vertical_multiplier(v_cm) == pytest.approx(expected, abs=1e-3)


def test_asymmetric_multiplier_zero_over_135_deg():
    assert calc.asymmetric_multiplier(90) == pytest.approx(0.712, abs=1e-3)
    assert calc.asymmetric_multiplier(150) == 0.0


def test_frequency_multiplier_matches_table():
    # Riga 4 sollevamenti/min, durata 2-8h, V < 75 -> 0.45 da tabella NIOSH.
    assert calc.frequency_multiplier(4, calc.DURATION_LONG, 50) == pytest.approx(0.45)
    # Oltre 15 sollevamenti al minuto il compito non è valutabile.
    assert calc.frequency_multiplier(20, calc.DURATION_SHORT, 50) == 0.0


def test_coupling_multiplier_depends_on_height():
    assert calc.coupling_multiplier("FAIR", 50) == 0.95
    assert calc.coupling_multiplier("FAIR", 100) == 1.0
    assert calc.coupling_multiplier("POOR", 100) == 0.90


def test_lifting_index_infinite_when_rwl_zero():
    assert math.isinf(calc.lifting_index(10, 0))
    assert calc.lifting_index(0, 0) == 0.0


def test_score_from_lifting_index_is_monotonic():
    scores = [calc.score_from_lifting_index(li) for li in (0.2, 0.85, 0.95, 1.5, 2.5, 6)]
    assert scores == sorted(scores)
    assert scores[-1] == 100.0


def test_evaluate_lift_flags_niosh_and_posture():
    result = calc.evaluate(
        assessment_type="LIFT",
        pose_data={
            "trunk_flexion_deg": {"mean": 42, "p95": 58},
            "trunk_twist_deg": 28,
            "knee_angle_deg": 172,
            "hand_grip": "POOR",
        },
        task_data={
            "load_kg": 18, "h_cm": 55, "v_cm": 25, "d_cm": 90,
            "a_deg": 28, "freq_per_min": 5, "duration": "LONG",
        },
        light_lux=150,
        noise_db=87,
        tilt_deg=1.0,
    )
    codes = {f["code"] for f in result.findings}
    expected = {
        "NIOSH_LI", "TRUNK_FLEXION", "TRUNK_TWIST", "STOOP_LIFT", "LIGHT_LOW", "NOISE_HIGH",
    }
    assert expected <= codes
    assert result.level == "RED"
    assert result.lifting_index > 1
    # Il primo rilievo è sempre il più grave: guida la lettura del PDF.
    assert result.findings[0]["severity"] == "CRITICAL"


def test_evaluate_pc_is_green_when_posture_is_correct():
    result = calc.evaluate(
        assessment_type="PC",
        pose_data={
            "trunk_flexion_deg": 8,
            "neck_flexion_deg": 12,
            "shoulder_elevation_deg": 25,
            "ear": {"mean": 0.29, "yawn_count": 0},
        },
        light_lux=450,
        noise_db=58,
        tilt_deg=0.6,
    )
    assert result.level == "GREEN"
    assert result.findings == []
    assert result.lifting_index is None


def test_capture_instability_is_reported_but_not_scored():
    stable = calc.evaluate(assessment_type="PC", pose_data={"neck_flexion_deg": 5}, tilt_deg=0.5)
    shaky = calc.evaluate(assessment_type="PC", pose_data={"neck_flexion_deg": 5}, tilt_deg=6.0)
    assert shaky.score == stable.score
    assert any(f["code"] == "CAPTURE_UNSTABLE" for f in shaky.findings)
