"""
Generic size-chart lookup — a Python port of the frontend's
apps/misura-miniapp/src/measure/sizeChart.ts (`genericSizeChart`), kept in
sync intentionally so the admin/dashboard's "recommended size" badge means
the same thing the Mini App shows the user. Only used for admin display,
never returned by the API (the frontend already computes and shows this
to the user directly).
"""

from typing import NamedTuple


class SizeRange(NamedTuple):
    label: str
    chest_max: float
    waist_max: float
    hips_max: float


GENERIC_CHART: list[SizeRange] = [
    SizeRange("XS", 86, 70, 90),
    SizeRange("S", 94, 78, 98),
    SizeRange("M", 102, 86, 106),
    SizeRange("L", 110, 94, 114),
    SizeRange("XL", 118, 102, 122),
    SizeRange("XXL", 130, 114, 134),
]


def recommend_size(chest_cm: float, waist_cm: float, hips_cm: float) -> str:
    """Smallest size whose upper bounds cover all three measurements;
    falls back to the largest size if the body exceeds every range."""
    for size in GENERIC_CHART:
        if chest_cm <= size.chest_max and waist_cm <= size.waist_max and hips_cm <= size.hips_max:
            return size.label
    return GENERIC_CHART[-1].label
