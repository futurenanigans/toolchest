"""`tally [--top N] [--ignore-case] [--min-length N] FILE...` prints the N most frequent words with their counts."""

import argparse
from collections import Counter
from pathlib import Path

from tally.counting import count_words


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tally")
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--top", type=int, default=10)
    parser.add_argument("--ignore-case", action="store_true")
    parser.add_argument("--min-length", type=int, default=1)
    args = parser.parse_args(argv)

    counts = count_words(args.files, ignore_case=args.ignore_case)
    counts = Counter({w: n for w, n in counts.items() if len(w) >= args.min_length})
    for word, n in counts.most_common(args.top):
        print(f"{n:>7}  {word}")
    return 0
