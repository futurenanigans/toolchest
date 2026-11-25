---
name: awl-findings
description: Interpret Awl hook and scan findings, including denied edits and advisories. Use when deciding whether or how to refactor for a named Awl rule, running an Awl scan, or configuring Awl rules.
---

# Working with Awl

Awl analyses C# with Roslyn semantics loaded through standard MSBuild and reports findings from a
fixed set of rules. Its hook runs on every `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, MCP tool and shell command in a repository whose `.awl/awl.json` names a target.
It compares the code after the change with the code before it and reports only what the change
introduces. It lists no findings when the change is clean.

## Reading a report

```
Awl edit: 1 blocking, 1 advisory finding(s) introduced.
The edit was not applied. Fix the blocking findings and submit it again.
A.cs
  4:59 over-broad-catch   public int Run(int value) { try { return value + 1; } catch (Exception e) { throw new InvalidOperationException("m"); } ...
    The catch admits the general exception type without a transparent explicit rethrow exit.
  4:81 dropped-cause (advisory)
    This replacement throw does not establish passing caught local 'e' into its construction on every supported alternative.
over-broad-catch: The catch takes every exception type without rethrowing, so catch only the exception types this handler can handle and let the rest propagate.
dropped-cause: The replacement exception is constructed without the caught exception, so the original failure is lost; pass the caught exception to its constructor as the cause.
```

The first line names what was checked. `edit` is a proposed `Edit` or `Write` that has not been written.
`change on disk` is an `Edit` or `Write` after it was written and `command` is what any other tool call left on disk.
`session` is what the session as a whole has introduced when the turn ends. Findings are grouped by file, with
blocking findings first. Each row is `line:column rule`, the measured value where the rule measures
something, and the source line. A long source line is cut to a window around the finding, with
`...` where it was cut. A second finding on the same line does not repeat the source. The indented
line under a row is what Awl observed at that place, such as the layer, member or diagnostic
involved; an observation with the same text as an earlier one is not repeated. A row
marked `(advisory)` does not block, and `(changed)` marks a finding that existed before the change
and that the change altered. Each rule's sentence appears once after the rows and suggests a response
to what Awl observed. An `also at:` line under a row lists the finding's other locations, such as
the other members of a duplicate or a clump; read those before editing. A last line counts findings
that did not fit; the counts on the first line always cover every finding.

`This change was not verified:` lists what stopped Awl from checking the change, most often a
compile error, with its file and line; fix it before relying on a clean report. Places the
analysis could not establish before the change either are told once per session, and findings
there are not compared. Compile errors among them come first under their own heading: fix those.
The `Awl analysis limits` that follow need no action.

A finding can sit in a file the change did not touch. Rules about reachability, layers, cycles and
coupling look at the whole solution, so removing a call or adding a reference can create the
finding somewhere else. Start with the reported location and the dependencies named in the evidence.

## Responding to a finding

Use the report itself for a summary. When deciding whether or how to refactor, open
`references/rules/<rule-id>.md` relative to this `SKILL.md`, using the rule ID under consideration.
For example, `wide-fan-in` opens the [guide to caller roles and shared types](references/rules/wide-fan-in.md).
Use the [guide index](references/README.md) when the user describes a finding without its ID.

Before choosing a refactoring, check whether the source supports the rule's conclusion. Read the
guide's “Is this a false positive?” section when present. If the source contradicts the finding,
keep the code and report the rule ID with the evidence it missed. If an advisory is accurate and
the behavior is intentional, explain what keeping it preserves. Refactor within the task's scope
when the evidence shows a problem.
Consult the [solution-wide design guide](references/solution-wide-design.md) when the same design
decision repeatedly forces changes across modules. Source paths in the guides refer to the Awl repository.

A denied edit leaves the file as it was. Revise the proposal against the current file before retrying.
If the evidence contradicts a blocking finding, report the blocker to the user. A `command` report
covers changes already on disk, so apply any correction as a follow-up edit.

- Do not suppress a finding with `#pragma warning disable`, `SuppressMessage`, a `!` null-forgiving
  assertion or an empty `catch`. Each of those is its own finding.
- Do not move the code out of Awl's sight, split an edit to get under a threshold, or change
  `.awl/awl.json`. Which rules run and which ones block is the user's decision.

A report that says the result is not verified means Awl could not check the change: the analysis
was incomplete, or Awl no longer held the sources from before the tool call. The lines under it
name each cause. Fix a cause that is in the code, such as a compiler error. Say in the completion
report that the change was not verified instead of treating it as checked.

## Running a scan

The hook covers edits and commands. Run a scan to see the state of a whole solution, or a diff to
check a branch:

```
awl scan --target <solution> --format text
awl diff --target <solution> --base <ref>
```

Add `--config .awl/awl.json` to apply the repository's configuration. `--format` takes `sarif` (the
default) or `text`. `diff` reports what the working tree introduces, updates and resolves
relative to the Git revision `<ref>`. Both exit 0 whenever the analysis was complete, whatever it
found, so read the output for findings. Exit 2 means invalid input and exit 3 means the analysis
was incomplete, which is never a clean result.

## Configuration

`.awl/awl.json` at the repository root names the target and sets, per rule, the hook and reporting
breakpoints. `awl init --target <solution> --output <new-file>` writes a configuration with every
rule's defaults, and `awl explain --target <solution> --rule <id>` prints one rule's definition,
defaults and explanation. Change `.awl/awl.json` only when the user asks.
