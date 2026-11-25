"""Published API: slugify and unslugify. Downstream projects import both from this package."""

from slugkit._core import slugify, unslugify

__all__ = ["slugify", "unslugify"]
