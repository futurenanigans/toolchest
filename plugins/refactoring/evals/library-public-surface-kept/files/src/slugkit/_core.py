import re

_SEPARATOR = "-"


def slugify(title: str) -> str:
    words = re.findall(r"[a-z0-9]+", title.lower())
    return _SEPARATOR.join(words)


def unslugify(slug: str) -> str:
    return " ".join(slug.split(_SEPARATOR)).capitalize()


def _collapse_separators(slug: str) -> str:
    return re.sub(f"{_SEPARATOR}+", _SEPARATOR, slug)
