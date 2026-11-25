import unittest

from slugkit import slugify


class SlugifyTests(unittest.TestCase):
    def test_lowercases_and_joins_words(self):
        self.assertEqual(slugify("Hello, World 2"), "hello-world-2")


if __name__ == "__main__":
    unittest.main()
