"""Command-line entry point: `python -m shipper <format> <file>` exports the parcel list."""

import importlib
import sys
import tomllib
from pathlib import Path

from shipper.parcels import load_parcels


def load_exporters(config_path: Path) -> dict:
    config = tomllib.loads(config_path.read_text())
    exporters = {}
    for name, target in config["exporters"].items():
        module_name, function_name = target.split(":")
        exporters[name] = getattr(importlib.import_module(module_name), function_name)
    return exporters


def main(argv: list[str]) -> int:
    exporters = load_exporters(Path(__file__).parent.parent / "exporters.toml")
    fmt, path = argv
    print(exporters[fmt](load_parcels(Path(path))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
