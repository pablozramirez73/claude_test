from django.conf import settings
from rest_framework import serializers

from apps.billing.plans import check_quota

from . import niosh_calculator as calc
from .models import Assessment

# Angoli accettati in pose_data. Chiavi ignote vengono scartate: il payload
# arriva dal client e non deve poter gonfiare la riga a piacere.
ALLOWED_POSE_KEYS = {
    "trunk_flexion_deg", "trunk_twist_deg", "neck_flexion_deg",
    "shoulder_elevation_deg", "elbow_angle_deg", "knee_angle_deg",
    "wrist_deviation_deg", "hand_grip", "ear", "landmark_confidence",
    "samples", "fps",
}

ALLOWED_TASK_KEYS = {
    "load_kg", "h_cm", "v_cm", "d_cm", "a_deg", "freq_per_min",
    "duration", "coupling", "notes",
}


class PoseDataField(serializers.JSONField):
    """Valida la forma di pose_data: solo chiavi note, valori numerici plausibili."""

    def to_internal_value(self, data):
        data = super().to_internal_value(data)
        if not isinstance(data, dict):
            raise serializers.ValidationError("pose_data deve essere un oggetto JSON.")
        cleaned = {}
        for key, value in data.items():
            if key not in ALLOWED_POSE_KEYS:
                continue
            if isinstance(value, bool):
                continue
            if isinstance(value, (int, float)):
                cleaned[key] = self._check_scalar(key, value)
            elif isinstance(value, dict):
                cleaned[key] = {
                    stat: self._check_scalar(key, v)
                    for stat, v in value.items()
                    if isinstance(v, (int, float)) and not isinstance(v, bool)
                }
            elif isinstance(value, str):
                cleaned[key] = value[:32]
        if not any(k.endswith("_deg") for k in cleaned):
            raise serializers.ValidationError("pose_data non contiene angoli riconosciuti.")
        return cleaned

    @staticmethod
    def _check_scalar(key, value):
        """Gli angoli stanno in [-360, 360]; i contatori non possono essere negativi."""
        value = float(value)
        if key.endswith("_deg"):
            if not -360 <= value <= 360:
                raise serializers.ValidationError(f"Valore fuori scala per {key}.")
        elif value < 0:
            raise serializers.ValidationError(f"Valore negativo non ammesso per {key}.")
        return value


class AssessmentSerializer(serializers.ModelSerializer):
    pose_data = PoseDataField()
    task_data = serializers.JSONField(required=False, default=dict)
    risk_level_display = serializers.CharField(source="get_risk_level_display", read_only=True)
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = Assessment
        fields = [
            "id", "type", "type_display", "worker_ref", "workstation",
            "pose_data", "task_data", "light_lux", "noise_db", "device_tilt_deg",
            "duration_s", "frames_analyzed",
            "risk_score", "risk_level", "risk_level_display",
            "lifting_index", "recommended_weight_limit", "findings",
            "status", "pdf_url", "created_at",
        ]
        read_only_fields = [
            "risk_score", "risk_level", "lifting_index", "recommended_weight_limit",
            "findings", "status", "created_at",
        ]

    def get_pdf_url(self, obj):
        if not obj.pdf_report:
            return None
        request = self.context.get("request")
        url = obj.pdf_report.url
        return request.build_absolute_uri(url) if request else url

    def validate_task_data(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("task_data deve essere un oggetto JSON.")
        return {k: v for k, v in value.items() if k in ALLOWED_TASK_KEYS}

    def validate(self, attrs):
        if attrs.get("type") == Assessment.Type.LIFT:
            task = attrs.get("task_data") or {}
            if not task.get("load_kg"):
                raise serializers.ValidationError(
                    {
                        "task_data": "Per il sollevamento è obbligatorio il peso "
                        "del carico (load_kg)."
                    }
                )
            try:
                load = float(task["load_kg"])
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError(
                    {"task_data": "load_kg deve essere numerico."}
                ) from exc
            if not 0 < load <= 200:
                raise serializers.ValidationError(
                    {"task_data": "load_kg fuori intervallo (0-200 kg)."}
                )

        tilt = attrs.get("device_tilt_deg")
        if tilt is not None and tilt > settings.ERGO_MAX_TILT_DEG * 5:
            # Oltre 10 gradi di deviazione gli angoli non sono ricostruibili.
            raise serializers.ValidationError(
                {"device_tilt_deg": "Acquisizione non valida: stabilizza il dispositivo e ripeti."}
            )
        return attrs

    def create(self, validated_data):
        user = self.context["request"].user
        company = user.company
        check_quota(company)  # solleva QuotaExceeded -> 402

        result = calc.evaluate(
            assessment_type=validated_data["type"],
            pose_data=validated_data["pose_data"],
            task_data=validated_data.get("task_data") or {},
            light_lux=validated_data.get("light_lux"),
            noise_db=validated_data.get("noise_db"),
            tilt_deg=validated_data.get("device_tilt_deg"),
            thresholds={
                "min_lux": settings.ERGO_MIN_LUX,
                "max_noise_db": settings.ERGO_MAX_NOISE_DB,
                "max_tilt_deg": settings.ERGO_MAX_TILT_DEG,
            },
        )

        if result.multipliers:
            # I moltiplicatori NIOSH restano allegati alla valutazione: il report
            # deve poter mostrare come si è arrivati al peso limite.
            validated_data.setdefault("task_data", {})
            validated_data["task_data"]["_multipliers"] = result.multipliers

        return Assessment.objects.create(
            company=company,
            created_by=user,
            risk_score=result.score,
            risk_level=result.level,
            findings=result.findings,
            lifting_index=result.lifting_index,
            recommended_weight_limit=result.recommended_weight_limit,
            **validated_data,
        )


class AssessmentListSerializer(serializers.ModelSerializer):
    """Versione leggera per liste e dashboard (niente pose_data)."""

    type_display = serializers.CharField(source="get_type_display", read_only=True)

    class Meta:
        model = Assessment
        fields = [
            "id", "type", "type_display", "worker_ref", "workstation",
            "risk_score", "risk_level", "lifting_index", "status", "created_at",
        ]


class ReportGenerateSerializer(serializers.Serializer):
    assessment_id = serializers.IntegerField()
    send_to_telegram = serializers.BooleanField(default=True)

    def validate_assessment_id(self, value):
        user = self.context["request"].user
        if not Assessment.objects.filter(pk=value, company_id=user.company_id).exists():
            raise serializers.ValidationError("Valutazione inesistente o non accessibile.")
        return value
