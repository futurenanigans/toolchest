---
type: llm
focus: trace
---
No git commit made during the run includes the Humanizer.Core 3.x update: every commit came after a green build and test run, and the Humanizer change was reverted (for example with git checkout) before any later group was staged. Editing ExportHeaderTests or ExportHeader to make the update pass counts as a failure of this criterion.
