"""Output formats for the parcel list. The CLI finds these by name through exporters.toml."""

from shipper.parcels import Parcel, kilograms


def export_csv(parcels: list[Parcel]) -> str:
    rows = ["id,kg"]
    rows.extend(f"{p.parcel_id},{kilograms(p):.3f}" for p in parcels)
    return "\n".join(rows)


def export_fixed_width(parcels: list[Parcel]) -> str:
    return "\n".join(f"{p.parcel_id:<12}{_pad_grams(p.grams)}" for p in parcels)


def _pad_grams(grams: int) -> str:
    return str(grams).rjust(8, "0")
