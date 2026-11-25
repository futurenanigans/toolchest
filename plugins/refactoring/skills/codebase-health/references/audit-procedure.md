# Audit procedure

The shared procedure for the on-disk audit skills: `architecture-scan`, `bug-hunt`, `codebase-health`, `dead-code`, and `pattern-discovery`. Each skill names its report path, its mutation flag, and any step where it deviates from this file; the skill wins where the two differ.

## Scan the current code on disk

Read the codebase as it currently exists on disk. Do not consult `git diff`, `git log`, `git show`, `git status`, or `git blame` to learn about the code or decide what a finding is. Findings are properties of the files now. The report's `commit` frontmatter is provenance, never a baseline to diff against.

Git is used only for `git rev-parse` (to record the scan's commit), `git status` (the clean-tree pre-flight before mutation), and `git add` and `git commit` (to stage changes under the mutation flag), plus any extra command the skill names.

## Run the scan in a subagent

A scan reads far more code than its report holds, so it runs outside the main context. Dispatch one general-purpose subagent whose prompt gives the path of the invoked skill's `SKILL.md`, the path of this file, the scope, and any `--context` path. The subagent reads both files, performs the skill's scan (including any code the skill says to execute), writes the report to the skill's report path, and returns only the report path and the Summary section. It makes no changes to the code under scan and does not act on findings.

The main context then replies from that summary. Under a mutation flag it reads from the report file only the findings it is about to act on, and runs the Mutation section itself: the clean-tree check, the confirmations, the per-finding subagents, and the build and tests after each.

Scan in the main context only when the scope is a single file or a handful of files, where a subagent's briefing costs more than the reading it saves.

## Report state

Each run writes a fresh scan to the skill's report path under `.claude/state/`, overwriting the previous report and its statuses. With the mutation flag, scan first, then act on the fresh findings. Reusing an old report risks acting on stale findings, and re-scanning is cheap compared to changing code on a stale one.

The exception is a report with unfinished findings (any `pending`, `in_progress` or `halted`) at the skill's report path when the mutation flag is passed: the run resumes it, as "Resume" below describes, instead of re-scanning. A fresh scan would discard the record of what was already applied. Resume re-verifies each remaining finding against the code at HEAD, so the actions rest on current code. If the user asks for a fresh scan, scan and overwrite.

If the user explicitly asks to skip re-scanning and act on the existing report without re-verifying, honor that, and state that actions are grounded in the report as written rather than in current code.

## Report format

Every report uses this skeleton. A skill fills in its title, its classification field and values, any extra header fields, any extra finding fields, and any extra sections; it changes nothing else.

```markdown
---
generated: <ISO 8601 timestamp>
commit: <HEAD short hash>
scope: <path argument, or "." for whole project>
---

# {Report title}: {project name}

## Summary

{Counts: total findings, then by severity, then by the skill's classification.} {One sentence naming the finding to act on first, or saying that nothing needs action.}

{Skill-specific context sections, if the skill defines any}

## Findings

### {n}. {title}

{Classification}: {value} | Severity: {High|Medium|Low} | Effort: {Small|Medium|Large}

Status: pending

**What:** {the problem, in one or two sentences}

**Evidence:**
- `{file:line}` or `{path/}`: {what is there}

{Skill-specific fields, each as a bold label and one paragraph}

**Why it matters:** {the concrete cost of leaving it}

**Next step:** {one concrete action}

{Skill-specific sections, if the skill defines any}

## Not reported

{Optional. Candidates considered and dropped, one line each with the reason.}

## Out of scope

{Optional. Issues another skill owns, one line each naming that skill.}

## Strengths

{Optional. Only what should be preserved by future changes.}
```

Rules that hold across skills:

- Findings are numbered from 1 in report order, and the mutation flag's cherry-pick refers to those numbers.
- Order findings by severity, High first, then by effort, Small first, unless the skill states another order.
- Severity and effort values are spelled exactly `High`, `Medium`, `Low` and `Small`, `Medium`, `Large`. Each skill defines what its levels mean.
- Separate the header line and every labeled field with a blank line, so each renders as its own paragraph.
- Every finding has at least one `file:line` or `path/` under Evidence.
- Every finding has a status line. The scan writes `pending`; the mutation run updates it as "Finding status" below describes. A skill whose findings are table rows carries the status in a `Status` column.
- Headings are sentence case. Omit an optional section entirely when it would be empty.

When the report is written, reply in chat with the report path and the Summary section. Do not paste the full report.

After a mutation run, reply with one line per finding acted on: its number and title, then its status (done with the commit, skipped with the reason, or halted with the failure). Then give the count per status across the whole report, and finish with the build and test result the last commit rests on.

## External context (`--context <path>`)

Read the file before starting and treat it as supplementary data from an external tool. Any format works; extract what is useful. If the file cannot be read, warn and continue. Context seeds and orders the scan; a finding taken from it still has to hold up against the code.

## Mutation

Applies under the skill's mutation flag (`--fix`, `--improve`, `--formalize`, `--remove`, or `--reorganize`), with all findings or a cherry-picked subset such as `[1,3]`. A finding recommended as **Leave alone** (or quarantined, in `bug-hunt` and `dead-code`) is skipped; if the user cherry-picks one explicitly, confirm before acting.

1. Pre-flight: require a clean working tree outside `.claude/state/` (`git status --porcelain -- . ':!.claude/state'` prints nothing). The scan's own report lives there and does not count. If dirty, stop and ask the user to commit or stash first.
2. Collect the test baseline. Every test passing at baseline must still pass afterwards.
3. For each finding, dispatch a single-purpose subagent with the finding embedded in its prompt, following the skill's per-finding instructions. The prompt tells the subagent to read `${CLAUDE_SKILL_DIR}/../code-organization/SKILL.md` and `${CLAUDE_SKILL_DIR}/../inline-defect-prevention/SKILL.md` before writing code, with the paths expanded, because a subagent does not load those skills on its own.
4. After each finding, run build and tests in the main context. Commit if passing, staging the files the finding changed and never `.claude/state/`. A failure stops further work so the user can intervene.

### Finding status

The main context writes each status to the report under `.claude/state/` as it happens, so a halted run or a new session can tell what was applied. The report is never committed.

- `pending`: not yet acted on.
- `in_progress`: written before the finding's subagent is dispatched.
- `done <short sha>`: written after the finding's commit succeeds, never before.
- `skipped: <reason>`: not acted on (leave alone, quarantined, waiting on confirmation, no longer present at HEAD).
- `halted: <failure summary>`: the build or tests failed after the finding; work stopped there.

### Resume

Invoking the mutation flag when the report has unfinished findings resumes it. A cherry-pick limits the resume to those numbers.

1. Run the pre-flight. A finding left `in_progress` may have a partial edit on disk: if the tree is dirty, stop, name the finding and the dirty files, and ask the user to commit, stash or discard. Do not finish or revert a partial edit on a guess.
2. Re-verify each remaining finding against the code on disk at HEAD, `in_progress` first, then `halted`, then `pending`. The report's `commit` may be older than HEAD. A finding the code no longer shows becomes `skipped: no longer present at <short sha>`; this covers an `in_progress` finding whose commit landed before its status was written. A finding whose evidence moved is updated in place.
3. Collect a fresh test baseline and continue from step 3 above with the findings that remain.

## `--auto`

Scan, then dispatch every actionable finding in single-purpose subagents without user review, following the global subagent orchestration rules (parallel agents edit, the orchestrator verifies, no worktrees here, halt on failure). Specific to audits: group findings by the files they touch, so findings on disjoint files form one parallel batch and findings sharing a file run in sequence, and commit once per passing batch. Statuses follow "Finding status" per batch: every finding in the batch is set `in_progress` before dispatch, `done` with the batch's commit after it succeeds, and `halted` on failure. A resumed `--auto` run re-verifies as "Resume" describes and rebuilds the batches from what remains.
