from unittest.mock import patch

import requests
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from . import dashboard, llm
from .hashing import hash_telegram_user_id
from .models import Profile, generate_profile_id
from .sizing import recommend_size


class GenerateProfileIdTests(TestCase):
    def test_generates_eight_char_id(self):
        profile_id = generate_profile_id()
        self.assertEqual(len(profile_id), 8)

    def test_generates_distinct_ids(self):
        ids = {generate_profile_id() for _ in range(50)}
        self.assertEqual(len(ids), 50)


class HashTelegramUserIdTests(TestCase):
    def test_same_input_same_hash(self):
        self.assertEqual(hash_telegram_user_id("12345"), hash_telegram_user_id("12345"))

    def test_different_input_different_hash(self):
        self.assertNotEqual(hash_telegram_user_id("12345"), hash_telegram_user_id("67890"))

    def test_hash_does_not_contain_raw_id(self):
        self.assertNotIn("12345", hash_telegram_user_id("12345"))


class ProfileApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_check(self):
        response = self.client.get(reverse("health"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_create_profile(self):
        response = self.client.post(
            reverse("profile-create"),
            {"chest_cm": 96.5, "waist_cm": 82.1, "hips_cm": 101.0},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Profile.objects.count(), 1)
        self.assertIn("profile_id", response.json())

    def test_create_profile_hashes_telegram_id_and_never_returns_it(self):
        response = self.client.post(
            reverse("profile-create"),
            {"chest_cm": 96.5, "waist_cm": 82.1, "hips_cm": 101.0, "telegram_user_id": "999888777"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        profile = Profile.objects.get()
        self.assertEqual(profile.telegram_user_hash, hash_telegram_user_id("999888777"))
        self.assertNotIn("telegram_user_id", response.json())
        self.assertNotIn("999888777", response.content.decode())

    def test_create_profile_rejects_out_of_range_measurement(self):
        response = self.client.post(
            reverse("profile-create"),
            {"chest_cm": 5.0, "waist_cm": 82.1, "hips_cm": 101.0},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_retrieve_profile(self):
        profile = Profile.objects.create(chest_cm=90, waist_cm=75, hips_cm=95)
        response = self.client.get(reverse("profile-detail", args=[profile.profile_id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["profile_id"], profile.profile_id)

    def test_retrieve_missing_profile_404(self):
        response = self.client.get(reverse("profile-detail", args=["doesnotexist"]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_profile(self):
        profile = Profile.objects.create(chest_cm=90, waist_cm=75, hips_cm=95)
        response = self.client.delete(reverse("profile-detail", args=[profile.profile_id]))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Profile.objects.filter(profile_id=profile.profile_id).exists())

    def test_client_supplied_profile_id_is_respected(self):
        response = self.client.post(
            reverse("profile-create"),
            {"profile_id": "abcd1234", "chest_cm": 96.5, "waist_cm": 82.1, "hips_cm": 101.0},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["profile_id"], "abcd1234")


class GenerateStyleAdviceTests(TestCase):
    """profiles/llm.py — mocked HTTP, no real Ollama needed."""

    @patch("profiles.llm.requests.post")
    def test_returns_ollama_response_text(self, mock_post):
        mock_post.return_value.json.return_value = {"response": "Un abbinamento slim-fit ti starebbe benissimo."}
        mock_post.return_value.raise_for_status.return_value = None

        advice = llm.generate_style_advice(96.5, 82.1, 101.0)

        self.assertEqual(advice, "Un abbinamento slim-fit ti starebbe benissimo.")
        called_json = mock_post.call_args.kwargs["json"]
        self.assertIn("96.5", called_json["prompt"])
        self.assertFalse(called_json["stream"])

    @patch("profiles.llm.requests.post", side_effect=requests.ConnectionError("refused"))
    def test_connection_error_raises_advice_generation_error(self, mock_post):
        with self.assertRaises(llm.AdviceGenerationError):
            llm.generate_style_advice(96.5, 82.1, 101.0)

    @patch("profiles.llm.requests.post")
    def test_empty_response_raises_advice_generation_error(self, mock_post):
        mock_post.return_value.json.return_value = {"response": "   "}
        mock_post.return_value.raise_for_status.return_value = None

        with self.assertRaises(llm.AdviceGenerationError):
            llm.generate_style_advice(96.5, 82.1, 101.0)


class ProfileAdviceApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.profile = Profile.objects.create(chest_cm=96.5, waist_cm=82.1, hips_cm=101.0)

    @patch("profiles.views.llm.generate_style_advice")
    def test_generates_and_caches_advice(self, mock_generate):
        mock_generate.return_value = "Prova un taglio regular fit."

        response = self.client.post(reverse("profile-advice", args=[self.profile.profile_id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["style_advice"], "Prova un taglio regular fit.")
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.style_advice, "Prova un taglio regular fit.")
        mock_generate.assert_called_once()

    @patch("profiles.views.llm.generate_style_advice")
    def test_second_call_uses_cache_without_calling_ollama_again(self, mock_generate):
        mock_generate.return_value = "Prova un taglio regular fit."

        self.client.post(reverse("profile-advice", args=[self.profile.profile_id]))
        response = self.client.post(reverse("profile-advice", args=[self.profile.profile_id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_generate.assert_called_once()  # not called again on the 2nd request

    @patch("profiles.views.llm.generate_style_advice")
    def test_regenerate_query_param_forces_a_fresh_call(self, mock_generate):
        mock_generate.side_effect = ["prima versione", "seconda versione"]

        self.client.post(reverse("profile-advice", args=[self.profile.profile_id]))
        response = self.client.post(f"{reverse('profile-advice', args=[self.profile.profile_id])}?regenerate=true")

        self.assertEqual(response.json()["style_advice"], "seconda versione")
        self.assertEqual(mock_generate.call_count, 2)

    @patch("profiles.views.llm.generate_style_advice", side_effect=llm.AdviceGenerationError("Ollama non raggiungibile"))
    def test_ollama_unavailable_returns_503_without_touching_profile(self, mock_generate):
        response = self.client.post(reverse("profile-advice", args=[self.profile.profile_id]))

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.profile.refresh_from_db()
        self.assertIsNone(self.profile.style_advice)

    def test_advice_for_missing_profile_404(self):
        response = self.client.post(reverse("profile-advice", args=["doesnotexist"]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class RecommendSizeTests(TestCase):
    """Mirrors apps/misura-miniapp/src/measure/sizeChart.test.ts — same chart, same cases."""

    def test_picks_smallest_size_covering_all_measurements(self):
        self.assertEqual(recommend_size(80, 65, 85), "XS")
        self.assertEqual(recommend_size(100, 84, 104), "M")

    def test_driven_by_the_largest_required_size(self):
        # Chest alone fits S (max 94), but hips need L (max 114).
        self.assertEqual(recommend_size(90, 75, 112), "L")

    def test_falls_back_to_largest_size_when_body_exceeds_every_range(self):
        self.assertEqual(recommend_size(200, 200, 200), "XXL")


class DashboardCallbackTests(TestCase):
    """profiles/dashboard.py — powers the admin index page (templates/admin/index.html)."""

    def setUp(self):
        Profile.objects.create(chest_cm=96.5, waist_cm=82.1, hips_cm=101.0, style_advice="consiglio")
        Profile.objects.create(chest_cm=110.0, waist_cm=98.0, hips_cm=118.0)
        Profile.objects.create(chest_cm=80.0, waist_cm=65.0, hips_cm=88.0)

    @patch("profiles.dashboard.requests.get", side_effect=requests.ConnectionError("refused"))
    def test_counts_and_advice_percentage(self, mock_get):
        context = dashboard.dashboard_callback(request=None, context={})

        self.assertEqual(context["misura_total_profiles"], 3)
        self.assertEqual(context["misura_with_advice"], 1)
        self.assertEqual(context["misura_advice_percent"], 33)

    @patch("profiles.dashboard.requests.get", side_effect=requests.ConnectionError("refused"))
    def test_size_distribution_matches_recommend_size(self, mock_get):
        context = dashboard.dashboard_callback(request=None, context={})
        by_label = {row["label"]: row["count"] for row in context["misura_size_distribution"]}

        self.assertEqual(by_label["XS"], 1)  # 80/65/88
        self.assertEqual(by_label["M"], 1)  # 96.5/82.1/101
        self.assertEqual(by_label["XL"], 1)  # 110/98/118 — waist 98 rules out L (max 94)
        self.assertEqual(sum(by_label.values()), 3)

    @patch("profiles.dashboard.requests.get", side_effect=requests.ConnectionError("refused"))
    def test_ollama_unreachable_is_reported_not_raised(self, mock_get):
        context = dashboard.dashboard_callback(request=None, context={})
        self.assertEqual(context["misura_ollama"], {"reachable": False, "model_pulled": False, "models_count": 0})

    @patch("profiles.dashboard.requests.get")
    def test_ollama_reachable_with_model_pulled(self, mock_get):
        mock_get.return_value.json.return_value = {"models": [{"name": "gemma4:latest"}]}
        mock_get.return_value.raise_for_status.return_value = None

        with self.settings(OLLAMA_MODEL="gemma4:latest"):
            context = dashboard.dashboard_callback(request=None, context={})

        self.assertTrue(context["misura_ollama"]["reachable"])
        self.assertTrue(context["misura_ollama"]["model_pulled"])

    @patch("profiles.dashboard.requests.get", side_effect=requests.ConnectionError("refused"))
    def test_recent_profiles_ordered_newest_first(self, mock_get):
        context = dashboard.dashboard_callback(request=None, context={})
        created_ats = [row["created_at"] for row in context["misura_recent_profiles"]]
        self.assertEqual(created_ats, sorted(created_ats, reverse=True))
