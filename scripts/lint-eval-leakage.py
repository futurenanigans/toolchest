#!/usr/bin/env python3
"""Leakage linter for plugin evaluation prompts.

Checks every plugins/*/evals/*/prompt.md (and baseline_prompt.md) against the
owning plugin's SKILL.md files for shared phrases that would test recall of
instruction wording rather than behavior.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PLUGINS_DIR = REPO_ROOT / "plugins"

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "before", "but", "by", "can", "do",
    "does", "for", "from", "has", "have", "if", "in", "into", "is", "it", "its",
    "not", "of", "on", "only", "or", "other", "out", "should", "so", "than", "that",
    "the", "their", "them", "then", "there", "these", "they", "this", "to", "use",
    "using", "when", "where", "which", "who", "will", "with", "without", "you", "your",
    "file", "files", "code", "new", "existing", "add", "change", "return", "returns",
}


def strip_code_and_frontmatter(text: str) -> str:
    if text.startswith("---\n"):
        parts = text.split("\n---\n", 1)
        if len(parts) == 2:
            text = parts[1]
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"`[^`]+`", " ", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"/[a-z0-9_-]+:[a-z0-9_-]+", " ", text)
    return text


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z]{2,}", strip_code_and_frontmatter(text).lower())


def ngrams(tokens: list[str], n: int) -> set[tuple[str, ...]]:
    out: set[tuple[str, ...]] = set()
    for i in range(len(tokens) - n + 1):
        gram = tuple(tokens[i : i + n])
        content_words = sum(1 for w in gram if w not in STOPWORDS)
        if content_words >= 2:
            out.add(gram)
    return out


def check_repo(ngram_size: int = 4) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    for plugin_dir in sorted(PLUGINS_DIR.iterdir()):
        if not plugin_dir.is_dir():
            continue
        skill_files = sorted(plugin_dir.glob("skills/*/SKILL.md"))
        if not skill_files:
            continue
        skill_grams: dict[Path, set[tuple[str, ...]]] = {}
        for sf in skill_files:
            skill_grams[sf] = ngrams(tokenize(sf.read_text(encoding="utf-8")), ngram_size)

        for prompt_file in sorted(
            list(plugin_dir.glob("evals/*/prompt.md")) + list(plugin_dir.glob("evals/*/baseline_prompt.md"))
        ):
            p_grams = ngrams(tokenize(prompt_file.read_text(encoding="utf-8")), ngram_size)
            for sf, s_grams in skill_grams.items():
                shared = sorted(p_grams & s_grams)
                for gram in shared:
                    findings.append(
                        {
                            "prompt": str(prompt_file.relative_to(REPO_ROOT)),
                            "skill": str(sf.relative_to(REPO_ROOT)),
                            "phrase": " ".join(gram),
                        }
                    )
    return findings


def main() -> int:
    ap = argparse.ArgumentParser(description="Flag shared phrases between eval prompts and skills.")
    ap.add_argument("--ngram", type=int, default=4, help="Shared n-gram length (default: 4).")
    ap.add_argument("--json", action="store_true", help="Output JSON.")
    ap.add_argument("--fail-on-leak", action="store_true", help="Exit 1 if any shared phrases are found.")
    args = ap.parse_args()

    findings = check_repo(args.ngram)
    if args.json:
        print(json.dumps(findings, indent=2))
    else:
        if not findings:
            print(f"No shared {args.ngram}-gram phrases found between eval prompts and skills.")
        else:
            for f in findings:
                print(f"LEAK: {f['prompt']} <-> {f['skill']}: \"{f['phrase']}\"")
    return 1 if (args.fail_on_leak and findings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
