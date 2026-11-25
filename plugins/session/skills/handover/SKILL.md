---
name: handover
description: Produces a goal-anchored handover brief that lets a fresh Claude Code session pick up one specific next goal after /clear, with every file anchor and code claim verified against the working tree and every conversation-only fact preserved. Requires the user to state the next goal; never infers it.
when_to_use: Only when the user explicitly asks for a "handover", "handoff", "brief for a fresh session", or "something to paste after /clear". Not for commit messages, PR descriptions, or session summaries.
disable-model-invocation: true
argument-hint: "<next goal for the fresh session (required)>"
effort: high
allowed-tools: Read, Glob, Grep, Agent, Bash(date:*), Bash(git check-ignore:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git stash list:*), Write(/.claude/handover/*), Edit(/.claude/handover/*), Edit(/.gitignore), Write(/.gitignore), AskUserQuestion
---

# Handover

Produce a brief that lets a fresh session make progress on ONE stated goal. The user runs `/clear` and then `/session:continue <path>` to resume from the saved file. This is a forward-looking briefing filtered against the goal, not a session summary.

## Inputs captured up front

- **Goal (user-supplied):** $ARGUMENTS
- **Branch:** !`git branch --show-current 2>/dev/null || echo "(not a git repo)"`
- **HEAD:** !`git rev-parse --short HEAD 2>/dev/null || echo "(none)"`
- **Working tree:** !`git status --short 2>/dev/null || echo "(not a git repo)"`
- **Recent commits:** !`git log --oneline -10 2>/dev/null || echo "(none)"`
- **Unstaged:** !`git diff --stat 2>/dev/null || echo ""`
- **Staged:** !`git diff --staged --stat 2>/dev/null || echo ""`
- **Stashes:** !`git stash list 2>/dev/null || echo ""`
- **Brief timestamp:** !`date +%Y%m%d-%H%M%S`

## Step 1: require the goal

The goal is the filter. Without it there is no principled way to decide what to keep, so a handover without a goal is not produced.

**If the goal is empty or vague** (e.g. "continue", "next steps", "the thing we were doing"):

1. Look at uncommitted changes, the TODO list if present, and the most recent exchanges.
2. Propose 2 to 3 candidate goals, each one sentence, each with what tipped it (a file, a failing test, a user remark).
3. Ask the user to pick or state their own. Use AskUserQuestion if available; if the answer comes back empty, treat it as no answer.
4. End the turn. Tell the user to re-invoke with `/handover <goal>`. Do not fall through to a brief.

**If the goal is present:** restate it in one clean sentence without reinterpreting it. Then write a **done-when** line: the observable condition that means the goal is achieved (a passing test, a file existing, a behavior). If the goal does not imply one, ask for it in the same turn and stop.

Classify the goal kind; it tunes the filter in Step 2:

| Kind | The fresh agent most needs |
|---|---|
| Continue implementation | The plan, what is done vs remaining, the next file to touch, conventions already chosen |
| Debug / fix | The exact repro command, the exact error text, what has been ruled out, the current hypothesis |
| Review / verify | The intended behavior, the diff boundary, known weak spots |
| Document / explain | The public surface, what changed and why, audience |
| Plan / design | Constraints, decisions already locked, options still open |

## Step 2: filter against the goal

For every item ask: does the fresh agent need this to reach done-when? If no, drop it.

**Priority order, protect the top first:**

1. **Conversation-only facts.** Anything the fresh agent cannot rediscover from the working tree: constraints the user stated ("leave the migration alone", "skip perf for now"), rationale behind decisions, external inputs (ticket text, an error reproduced once, a colleague's requirement), preferences expressed this session. These are lost forever on `/clear`. Keep them even when they seem minor.
2. **Failed approaches** the fresh agent would plausibly retry, with why they failed.
3. **Decisions that lock in a choice** the fresh agent must respect.
4. **Files to read or modify**, with `file:line` anchors only where confirmed in Step 3.
5. **The exact first action.**

**Drop:** history for its own sake, tangents not at risk of being retried, anything trivially rediscoverable by reading the code, anything already in `CLAUDE.md`, `AGENTS.md`, or repo conventions, and anything about goals other than the stated one (list those under Deferred instead).

If the session was compacted before this turn, say so in the brief and note that pre-compaction detail may be missing.

Target 80 to 150 lines. Over 200 means the goal is too broad or the filter too loose.

## Step 3: verify before writing

Session recollection is the least reliable input available. The fresh agent cannot tell a remembered line number from a checked one, so check.

- **Every `file:line` anchor gets read.** Open the file, confirm the symbol or behavior is at that line, correct drift. Unconfirmable line → keep the path only. Unconfirmable path → drop it.
- **Every claim about current code gets checked** ("X now returns Y", "the handler validates Z"). Where the file contradicts memory, the file wins.
- **Tag provenance** on Decisions, Failed approaches, and Session-only facts: `[verified]` (checked against the tree this turn) or `[recalled]` (conversation memory only). Session-only facts are by definition `[recalled]`; that is fine, the tag tells the fresh agent to confirm with the user if it matters.
- **If context is tight**, batch the verification: hand an Explore subagent the list of anchors and claims and have it return confirmed/corrected values, instead of reading every file into this context.
- **Make no claim about remote state.** Local git output does not know whether a branch is behind, a PR merged, or main moved. Leave it out or mark it as something to fetch.

## Step 4: self-check, then output

Before writing, confirm every line of this list:

```
- [ ] Goal is user-supplied and restated verbatim in meaning; done-when is present
- [ ] Every conversation-only fact relevant to the goal is in Session-only facts
- [ ] Every file:line anchor was opened this turn; unconfirmed ones lost their line number
- [ ] Every Decision / Failed approach / Session-only fact carries [verified] or [recalled]
- [ ] No claim about remote state
- [ ] Nothing about goals other than the stated one outside Deferred
- [ ] Under 150 lines (hard cap 200)
```

Then:

1. Write the brief to `.claude/handover/<brief timestamp>.md`, using the timestamp captured above, and copy it to `.claude/handover/latest.md`, so earlier briefs survive. If `git check-ignore -q .claude/handover/` exits non-zero, add `.claude/handover/` to `.gitignore`, creating the file if the repo has none.
2. Do not output the brief to chat. Reply with exactly one line: the command the user runs after `/clear`:

```
/session:continue .claude/handover/latest.md
```

Use this structure exactly. Omit any section whose content would be empty.

---

# Handover: {one-line goal}

> You are resuming work in a fresh session. First run `git status --short` and `git rev-parse --short HEAD` and compare with the fingerprint below; if the tree moved, say so before acting. Then read the files under Relevant files, restate the goal and done-when back to me in one sentence each, and take the first action. Do not re-explore the codebase broadly; the file list is the map. If the goal looks wrong or out of date, stop and ask.

**Branch:** {branch} | **HEAD:** {sha} | **Tree:** {clean | N modified, M untracked} | **Goal kind:** {kind}

## Goal
{One to two sentences. User-supplied; restated, not reinterpreted.}

**Done when:** {observable condition}

## First action
{One concrete action: a file to open, a command to run, a question to answer.}

## Session-only facts
{Things stated in conversation that are not on disk and cannot be rediscovered: constraints, rationale, external inputs, user preferences. One line each. [recalled]}

## State of the working tree
{What is modified against committed and why it matters for the goal. Summarize; do not restate every file. Mention stashes if any.}

## Relevant files
{Bulleted, 10 max, each with one line on why it matters for the goal. `file:line` only where confirmed this turn.}

## Decisions that constrain the next step
{3 to 7 items. "Decision. Rationale. (Rejected alternative, if non-obvious.) [verified|recalled]"}

## Failed approaches to avoid
{"Tried X, failed because Y. [verified|recalled]"}

## Open questions
{Unresolved questions that block done-when.}

## Deferred
{Other goals noticed but excluded, one line each.}

---

End the response immediately after the `/session:continue` line. No closing remarks.