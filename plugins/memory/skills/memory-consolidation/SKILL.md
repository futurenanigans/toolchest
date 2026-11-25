---
name: memory-consolidation
description: Reviews the saved memory files for one project or all of them, checks each claim against the repository and the standing instructions, and proposes which to keep, update, merge, promote or delete. Applies the changes after confirmation, with a backup taken first, and repairs the MEMORY.md index.
when_to_use: Only when the user explicitly asks to "consolidate memory", "clean up memories", "prune stale memories", or "review what you remember". Never self-triggered.
disable-model-invocation: true
argument-hint: "[--all] [--apply] [project path]"
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, AskUserQuestion
---

# Memory consolidation

Memory files are claims with a timestamp. Each one loads into future sessions through its index line and is trusted there, so a stale or duplicated memory costs more than a missing one. This skill re-reads every memory as a claim to verify, then leaves the store smaller and true.

## Scope

- No argument: the memory directory of the current project, as named in this session's instructions.
- A project path: that project's store under `~/.claude/projects/`.
- `--all`: every `~/.claude/projects/*/memory/` directory that holds at least one file. Work through them one store at a time and report per store.

Without `--apply` the run ends at the report. With `--apply` it continues to the changes, asking first for anything in the confirmation list below.

## Read the store

For each store, read `MEMORY.md` and every memory file in full. Record for each file its `name` and `description`, its type (`metadata.type` in the frontmatter: `user`, `feedback`, `project` or `reference`), its last modification time on disk, and the `[[links]]` in its body, if any. A file missing `name`, `description` or `metadata.type` is a structural finding.

Then check the store's own consistency:

- every file has an index line, and every index line names a file that exists;
- no index line carries memory content beyond its one-line hook;
- every `[[link]]` names a memory that exists, or is listed as a dangling link;
- the project the store belongs to still exists. A store whose project directory is gone (a renamed or deleted repository) is reported as a whole: its memories are candidates to move to the project that replaced it, or to delete.

## Verify each memory

A memory is judged against what is true now, never against how recent it is. Age alone is not a reason to delete; a two-year-old preference is as binding as the day it was stated.

1. **Check what it names.** A file, command, flag, configuration key, branch or tool named in the memory is looked up on disk. What no longer exists makes the memory stale in that part.
2. **Check its dates.** A memory with an end date (a discount, a deadline, a temporary constraint) is compared with today. Past the date, the memory has either expired or turned into its follow-up action; say which.
3. **Check it against the standing instructions.** Read the global `CLAUDE.md`, the project's `CLAUDE.md` or `AGENTS.md`, and any rule or skill covering the same ground. A memory those files already state is a duplicate. A memory they contradict is a conflict for the user to settle, never something to resolve silently.
4. **Check it against its neighbours.** Two memories that say the same thing, or one that supersedes another, are a merge. Check sibling stores too when a project has several (a parent directory and its repositories), since the same fact is often saved in each.
5. **Check it is a memory at all.** A record of finished work (a commit, a merge, a review outcome, a status summary) changes no future behaviour and does not belong in the store.

## Classify

Give each memory exactly one outcome:

| Outcome | When |
| --- | --- |
| **Keep** | True, still applicable, stated once. |
| **Update** | The guidance holds but a name, path, date or detail in it is wrong. |
| **Merge** | It overlaps another memory; name the survivor. |
| **Promote** | It is a standing rule that every session should follow, so it belongs in `CLAUDE.md`, a rule file, a skill or the repository's own docs. Name the destination. |
| **Delete** | Stale throughout, expired, a duplicate of the standing instructions, or a record of finished work. |
| **Ask** | It conflicts with the standing instructions, or its truth cannot be checked from here. |

Two kinds of memory are never deleted or weakened without the user saying so, whatever the checks found: guidance the user gave about how to work (`feedback`), and any caution about a risky, destructive or irreversible action. When one looks stale, classify it **Ask**.

## Report

Reply in chat; write no report file. Per store:

1. One line: the store, the number of memories, and the counts per outcome.
2. A table of every memory that is not **Keep**, with the columns Memory, Type, Outcome and Why. Why names the check that decided it and what was found (the missing path, the passed date, the file that already states it).
3. Index problems: files with no index line, index lines with no file, dangling links.
4. The **Ask** items as questions the user can answer in a word.

Do not list the **Keep** memories. Their count is enough.

## Apply

1. Back up first. Archive the store to `memory-backup-<YYYYMMDD-HHMMSS>.tgz` beside the memory directory, keeping earlier backups, and confirm the archive lists every file.
2. Confirm before changing anything, in one question that lists them all: every **Delete**, every **Promote** (it edits instruction files other sessions load), and every **Update** or **Merge** that touches a `feedback` memory or a caution. What the user declines stays as it is.
3. Apply every **Update** and **Merge** the user did not decline. A merged memory keeps the survivor's file name, carries every still-true detail of both, and the absorbed file is removed.
4. Apply each confirmed **Delete**. For a **Promote**, write the rule into its destination in that file's own style, then delete the memory. A fact that lives in two places drifts.
5. Rewrite `MEMORY.md` to match the files: one line per memory, in the form `- [Title](file.md)` followed by a short hook, no content beyond that, and no line for a file that is gone. Fix or remove dangling `[[links]]`.

Finish with one line per store: what was updated, merged, promoted and deleted, and where the backup is.
