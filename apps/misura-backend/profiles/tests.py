from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from .hashing import hash_telegram_user_id
from .models import Profile, generate_profile_id


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
