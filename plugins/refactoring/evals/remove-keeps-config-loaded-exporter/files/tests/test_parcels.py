import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from shipper.parcels import Parcel, load_parcels


class LoadParcelsTests(unittest.TestCase):
    def test_reads_id_and_grams_and_skips_blank_lines(self):
        with TemporaryDirectory() as tmp:
            manifest = Path(tmp) / "manifest.txt"
            manifest.write_text("A1 1500\n\nB2 250\n")
            self.assertEqual(
                load_parcels(manifest), [Parcel("A1", 1500), Parcel("B2", 250)]
            )


if __name__ == "__main__":
    unittest.main()
