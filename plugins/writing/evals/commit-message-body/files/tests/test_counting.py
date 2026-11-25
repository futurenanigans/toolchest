import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from tally.counting import count_words


class CountWordsTests(unittest.TestCase):
    def test_ignore_case_merges_capitalised_words(self):
        with TemporaryDirectory() as tmp:
            sample = Path(tmp) / "a.txt"
            sample.write_text("Apple apple pear")
            self.assertEqual(count_words([sample], ignore_case=True)["apple"], 2)


if __name__ == "__main__":
    unittest.main()
