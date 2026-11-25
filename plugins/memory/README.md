# memory

One skill that reviews the memory files Claude Code saves for a project and leaves them smaller and true. Memories load into every later session and are trusted there, so a stale or duplicated one does more harm than a missing one. Install it if your memory directories have grown and you no longer know what Claude believes about your projects.

## memory-consolidation

Only you can start it; model invocation is disabled. Run `/memory:memory-consolidation [--all] [--apply] [project path]`.

| Argument | Scope or effect |
| --- | --- |
| none | The current project's memory directory |
| a project path | That project's store under `~/.claude/projects/` |
| `--all` | Every `~/.claude/projects/*/memory/` that holds a file, one store at a time |
| `--apply` | Continue from the report to the changes |

Without `--apply` the run only reports. Nothing on disk changes.

The skill reads `MEMORY.md` and every memory file in full. It checks that `MEMORY.md` fits in what Claude Code loads at session start (the first 200 lines or 25KB), that every file has an index line, every index line has a file, links point at real memories, and the project the store belongs to still exists. Then it checks each memory against what is true now. Files, commands and branches it names are looked up on disk; a reference outside the project (a path under `~`, a URL, another repository) is reported as unverified, never stale. End dates are compared with today. Your global and project `CLAUDE.md` and any matching rule or skill are read for duplicates and conflicts. Sibling stores are searched for the same fact, and records of finished work are flagged. Age alone never makes a memory stale.

Each memory gets one outcome: Keep, Update, Merge, Promote (move it into `CLAUDE.md`, a rule, a skill or the repository's docs), Delete, or Ask. Feedback you gave about how to work, and any caution about a risky or irreversible action, are never deleted or weakened without your say; when they look stale they become Ask.

The report goes to chat, with no report file. Per store you get the counts, a table of every memory that is not Keep with the check that decided it, the index problems, and the Ask items as short questions.

With `--apply` the skill does this in order:

1. Archives the store to `memory-backup-<YYYYMMDD-HHMMSS>.tgz` beside the memory directory, keeps older backups, and checks the archive lists every file.
2. Asks one question listing every Delete, every Promote, and every Update or Merge that touches feedback or a caution. Anything you decline stays as it is.
3. Applies the updates and merges. A merge keeps the surviving file and removes the absorbed one.
4. Applies confirmed deletes, and for each promotion writes the rule into its destination file and deletes the memory.
5. Copies `MEMORY.md` to `.MEMORY.md.prev`, then rewrites it to one line per remaining memory, shortening hooks if it would pass the load limit, and fixes or removes dangling links.

It ends with one line per store saying what changed and where the backup is. It does not use git, so promotions into tracked files are left for you to commit.
