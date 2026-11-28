# session

Two skills and a hook for moving work from one Claude Code session to a fresh one. `handover` writes a brief aimed at one next goal; `continue` reads it back after `/clear`. Both run only when you invoke them, since the model cannot call either on its own.

## Writing a handover

```
/session:handover <goal for the fresh session>
```

The goal is required, because it decides what goes into the brief. If it is missing or vague ("continue", "next steps"), the skill proposes two or three candidate goals drawn from uncommitted changes and recent exchanges, asks you to pick one, and stops without writing anything. Run it again with the goal.

With a goal, it restates the goal in one sentence and writes a done-when line: the observable condition that means the goal is met. If the goal implies none, it asks you for one and stops. It also classifies the goal (implementation, debugging, review, documentation or design), which tunes what it keeps.

The brief keeps only what the fresh session needs to reach done-when, in this priority:

1. Facts that exist only in the conversation: constraints you stated, rationale, external inputs, preferences.
2. Failed approaches the next session might retry, with why they failed.
3. Decisions that lock in a choice.
4. Files to read or change.
5. The exact first action.

A hook records the last five shell commands that failed in the session, without duplicates, and offers them to the skill as verified leads for item 2. A failed lookup is left out: a command that starts with a read-only tool such as `grep`, `ls`, `cat`, `test` or `git status`, with or without a leading `cd`.

Before writing, it checks its own memory against the working tree. Every `file:line` anchor is opened and corrected, or loses its line number, or is dropped. Every claim about current code is checked, and the file wins where they disagree. Decisions, failed approaches and session-only facts carry a `[verified]` or `[recalled]` tag. The brief makes no claim about remote state, and other goals go under Deferred. It aims for 80 to 150 lines.

The brief opens with instructions for the next session, followed by a fingerprint (branch, HEAD, tree state, goal kind), then Goal with done-when, First action, Session-only facts, State of the working tree, Relevant files, Decisions, Failed approaches, Open questions and Deferred. Empty sections are left out.

It is written to `.claude/handover/<timestamp>.md` and copied to `.claude/handover/latest.md`, so earlier briefs stay on disk. If `.claude/handover/` is not already ignored by git, the skill adds it to `.gitignore`, creating the file if needed.

The brief is not printed in chat. The reply is a single line, the command to run after `/clear`:

```
/session:continue .claude/handover/latest.md
```

The skill runs at high effort. Its `allowed-tools` pre-approves reading files, read-only git commands, `date`, subagents, and writing under `.claude/handover/` and to `.gitignore`, so those run without a prompt while it works. That list grants, it does not restrict: any other tool stays available and asks for permission under your session's normal rules.

## Resuming

After `/clear`, run:

```
/session:continue [path]
```

The path defaults to `.claude/handover/latest.md`. If the file does not exist, it stops and says so. When the default brief was written on another branch, or at a HEAD this checkout does not contain, it lists the dated briefs with their goal, branch and HEAD and asks which to resume. A path you pass is used as given. Otherwise it reads the brief in full and follows its header: compare `git status` and HEAD with the fingerprint and report if the tree has moved, read the listed files, restate the goal and done-when, then take the first action. It works until done-when holds or a blocker needs you. It respects the recorded decisions and failed approaches, and treats `[recalled]` items as claims to confirm when they matter.

