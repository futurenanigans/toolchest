#!/usr/bin/env python3
"""Leakage linter for plugin evaluation prompts.

Checks every plugins/*/evals/*/prompt.md and baseline_prompt.md two ways:

  - instruction leaks: phrases and backticked identifiers the prompt shares
    with the owning plugin's instruction files (skill bodies and their
    descriptions, references, agents, output styles), which would test recall
    of the wording.
  - answer leaks: phrases the prompt shares with its own case's graders,
    fixture script or case description, which would hand the model what the
    graders look for.

Other plugins' skills and claude-md/CLAUDE.md, which the suite arm also loads,
are not compared.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PLUGINS_DIR = REPO_ROOT / "plugins"
INSTRUCTION_GLOBS = ("skills/**/*.md", "references/**/*.md", "agents/**/*.md", "output-styles/**/*.md")
ANSWER_GLOBS = ("graders/*.md", "fixture.sh", "case.yaml")
MIN_IDENTIFIER_CHARS = 4

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "before", "but", "by", "can", "do",
    "does", "for", "from", "has", "have", "if", "in", "into", "is", "it", "its",
    "not", "of", "on", "only", "or", "other", "out", "should", "so", "than", "that",
    "the", "their", "them", "then", "there", "these", "they", "this", "to", "use",
    "using", "when", "where", "which", "who", "will", "with", "without", "you", "your",
    "file", "files", "code", "new", "existing", "add", "change", "return", "returns",
}

SLASH_COMMAND = re.compile(r"/[a-z0-9_-]+:[a-z0-9_-]+")
FILE_PATH = re.compile(r"[\w.~-]*(?:/[\w.-]+)+")
FENCED_BLOCK = re.compile(r"```[\s\S]*?```")
INLINE_CODE = re.compile(r"`([^`\n]+)`")
FRONT_MATTER_DESCRIPTION = re.compile(r"^description:\s*(.+)$", re.MULTILINE)


def prose(text: str) -> str:
    """Text to compare: the front matter description plus the body, without fenced code, URLs, file paths and slash commands.

    A prompt has to name the fixture files it works on, so a shared path is not a leak.
    """
    if text.startswith("---\n"):
        parts = text.split("\n---\n", 1)
        if len(parts) == 2:
            description = FRONT_MATTER_DESCRIPTION.search(parts[0])
            text = (description.group(1) if description else "") + "\n" + parts[1]
    text = FENCED_BLOCK.sub(" ", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = SLASH_COMMAND.sub(" ", text)
    return FILE_PATH.sub(" ", text)


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z]{2,}", prose(text).lower())


def identifiers(text: str) -> set[str]:
    return {m.strip() for m in INLINE_CODE.findall(prose(text)) if len(m.strip()) >= MIN_IDENTIFIER_CHARS}


def ngrams(tokens: list[str], n: int) -> set[tuple[str, ...]]:
    out: set[tuple[str, ...]] = set()
    for i in range(len(tokens) - n + 1):
        gram = tuple(tokens[i : i + n])
        content_words = sum(1 for w in gram if w not in STOPWORDS)
        if content_words >= 2:
            out.add(gram)
    return out


def collect(base: Path, globs: tuple[str, ...]) -> list[Path]:
    return sorted({p for pattern in globs for p in base.glob(pattern) if p.is_file()})


def check_repo(ngram_size: int = 4) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []

    def report(kind: str, prompt_file: Path, source: Path, phrase: str) -> None:
        findings.append(
            {
                "kind": kind,
                "prompt": str(prompt_file.relative_to(REPO_ROOT)),
                "source": str(source.relative_to(REPO_ROOT)),
                "phrase": phrase,
            }
        )

    for plugin_dir in sorted(PLUGINS_DIR.iterdir()):
        if not plugin_dir.is_dir():
            continue
        instruction_text = {f: f.read_text(encoding="utf-8") for f in collect(plugin_dir, INSTRUCTION_GLOBS)}
        instruction_grams = {f: ngrams(tokenize(t), ngram_size) for f, t in instruction_text.items()}
        instruction_ids = {f: identifiers(t) for f, t in instruction_text.items()}

        for prompt_file in sorted(
            list(plugin_dir.glob("evals/*/prompt.md")) + list(plugin_dir.glob("evals/*/baseline_prompt.md"))
        ):
            prompt_text = prompt_file.read_text(encoding="utf-8")
            p_grams = ngrams(tokenize(prompt_text), ngram_size)
            p_ids = identifiers(prompt_text)

            for source, grams in instruction_grams.items():
                for gram in sorted(p_grams & grams):
                    report("instruction", prompt_file, source, " ".join(gram))
                for ident in sorted(p_ids & instruction_ids[source]):
                    report("identifier", prompt_file, source, ident)

            for source in collect(prompt_file.parent, ANSWER_GLOBS):
                grams = ngrams(tokenize(source.read_text(encoding="utf-8")), ngram_size)
                for gram in sorted(p_grams & grams):
                    report("answer", prompt_file, source, " ".join(gram))
    return findings


def main() -> int:
    ap = argparse.ArgumentParser(description="Flag phrases eval prompts share with skills and with their own graders.")
    ap.add_argument("--ngram", type=int, default=4, help="Shared n-gram length (default: 4).")
    ap.add_argument("--json", action="store_true", help="Output JSON.")
    ap.add_argument("--fail-on-leak", action="store_true", help="Exit 1 if any shared phrases are found.")
    args = ap.parse_args()

    findings = check_repo(args.ngram)
    if args.json:
        print(json.dumps(findings, indent=2))
    elif not findings:
        print(f"No shared {args.ngram}-gram phrases or identifiers found.")
    else:
        for f in findings:
            print(f"LEAK ({f['kind']}): {f['prompt']} <-> {f['source']}: \"{f['phrase']}\"")
    return 1 if (args.fail_on_leak and findings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
