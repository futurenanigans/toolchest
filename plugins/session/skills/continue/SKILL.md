---
name: continue
description: Resumes work from a handover brief written by /handover. Takes the path of the brief and follows its instructions to reach the stated goal.
when_to_use: Only when the user explicitly runs /continue with a handover file path. Not for general "keep going" requests without a brief.
disable-model-invocation: true
argument-hint: "<path to handover brief, e.g. .claude/handover/latest.md>"
arguments: [path]
---

# Continue

Resume the work described in the handover brief at `$path`. If `$path` is empty, use `.claude/handover/latest.md`.

1. Read the brief in full. If the file does not exist, stop and say so.
2. Follow the instructions in its blockquote header: check the tree fingerprint, read the files listed under Relevant files, restate the goal and done-when in one sentence each.
3. Take the first action and continue until done-when holds or a blocker needs the user. Respect Decisions and Failed approaches as stated; treat `[recalled]` items as claims to confirm when they matter.
