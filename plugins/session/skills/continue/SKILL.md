---
name: continue
description: Resumes work from a handover brief written by /session:handover. Takes the path of the brief and follows its instructions to reach the stated goal.
when_to_use: Only when the user explicitly runs /session:continue with a handover file path. Not for general "keep going" requests without a brief.
disable-model-invocation: true
argument-hint: "<path to handover brief, e.g. .claude/handover/latest.md>"
arguments: [path]
---

# Continue

Resume the work described in the handover brief at `$path`. If `$path` is empty, use `.claude/handover/latest.md`.

1. Read the brief in full. If the file does not exist, stop and say so.
2. When `$path` was empty, check that the brief belongs to this checkout before following it. It does not when its **Branch** differs from `git branch --show-current`, or when `git merge-base --is-ancestor <its HEAD> HEAD` fails. Then list the other briefs in `.claude/handover/` (every `*.md` except `latest.md`), newest first by the timestamp in the file name, each with its `# Handover:` goal and its **Branch** and **HEAD**, and ask with `AskUserQuestion` which to resume. The options are the four best candidates, matching branch and HEAD first; the rest of the list stays in the question text for the user to name instead. Resume the chosen brief from step 1 with that path. If the user picks none, stop. A brief the user named explicitly is never second-guessed this way.
3. Follow the instructions in its blockquote header: check the tree fingerprint, read the files listed under Relevant files, restate the goal and done-when in one sentence each.
4. Take the first action and continue until done-when holds or a blocker needs the user. Respect Decisions and Failed approaches as stated; treat `[recalled]` items as claims to confirm when they matter.
