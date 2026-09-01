"""Quote dei piani e listino pubblico."""
import pytest

from apps.billing.plans import QuotaExceeded, check_quota, quota_for_plan


def test_quota_for_each_plan():
    assert quota_for_plan("FREE") == 3
    assert quota_for_plan("PRO") == 50
    assert quota_for_plan("AGENCY") is None
    assert quota_for_plan("SCONOSCIUTO") == 3  # fallback prudente sul piano free


@pytest.mark.django_db
def test_agency_plan_has_no_limit(company):
    company.plan = "AGENCY"
    company.save()
    check_quota(company)  # non solleva


@pytest.mark.django_db
def test_pro_plan_counts_only_current_month(company, user):
    from datetime import timedelta

    from django.utils import timezone

    from apps.assessments.models import Assessment

    company.plan = "PRO"
    company.save()

    old = Assessment.objects.create(
        company=company, created_by=user, type="PC", pose_data={}, risk_score=10
    )
    # Una valutazione del mese scorso non consuma la quota corrente.
    Assessment.objects.filter(pk=old.pk).update(
        created_at=timezone.now().replace(day=1) - timedelta(days=5)
    )
    assert company.assessments_this_month() == 0
    assert company.quota_remaining() == 50


@pytest.mark.django_db
def test_free_plan_raises_after_three_assessments(company, user):
    from apps.assessments.models import Assessment

    for _ in range(3):
        Assessment.objects.create(
            company=company, created_by=user, type="PC", pose_data={}, risk_score=10
        )
    with pytest.raises(QuotaExceeded):
        check_quota(company)


@pytest.mark.django_db
def test_plans_endpoint_is_public(client):
    response = client.get("/api/v1/billing/plans/")
    assert response.status_code == 200
    codes = {p["code"] for p in response.json()}
    assert codes == {"FREE", "PRO", "AGENCY"}
