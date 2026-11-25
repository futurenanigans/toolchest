"""Word counting. A word is a run of letters, digits or apostrophes; everything else separates words."""

import re
from collections import Counter
from pathlib import Path

_WORD = re.compile(r"[\w']+")


def count_words(paths: list[Path], *, ignore_case: bool) -> Counter[str]:
    counts: Counter[str] = Counter()
    for path in paths:
        text = path.read_text(encoding="utf-8")
        if ignore_case:
            text = text.casefold()
        counts.update(_WORD.findall(text))
    return counts
