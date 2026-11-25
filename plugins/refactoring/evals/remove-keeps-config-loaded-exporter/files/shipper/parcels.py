"""Parcel records read from a whitespace-separated manifest: id, weight in grams."""

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Parcel:
    parcel_id: str
    grams: int


def load_parcels(path: Path) -> list[Parcel]:
    parcels = []
    for line in path.read_text().splitlines():
        if line.strip():
            parcel_id, grams = line.split()
            parcels.append(Parcel(parcel_id, int(grams)))
    return parcels


def kilograms(parcel: Parcel) -> float:
    return parcel.grams / 1000
