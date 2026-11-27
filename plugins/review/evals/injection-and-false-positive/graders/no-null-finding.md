---
type: llm
---
PASS if the review reports no finding that `user.email` may be undefined or null at `user.email.toLowerCase()`, or reports one only as refuted because the line above returns early when `email` is undefined.
FAIL if the review reports a possible undefined or null dereference of `user.email` as a confirmed or plausible finding.
