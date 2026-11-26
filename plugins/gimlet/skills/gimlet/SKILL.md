---
name: gimlet
description: Run opengrep with Gimlet's bundled C#/.NET rules and triage the findings. Use when asked to scan C#, ASP.NET, Razor, web.config or appsettings files for security issues, to check a branch or diff for newly introduced findings, to install or update opengrep, or to interpret a Gimlet or opengrep result.
---

# Running Gimlet

Gimlet is a wrapper around opengrep. Run it as `bash "${CLAUDE_SKILL_DIR}/../../bin/gimlet"`, which works whether or not the plugin's `bin/` is on PATH and whether or not the install kept the executable bit. The commands below shorten that to `gimlet`. The first scan installs the opengrep release pinned in `config/defaults.env`, checked against its pinned SHA-256. `gimlet update` installs the latest release and `gimlet install --version vX.Y.Z` a specific one; both refuse to install without cosign on PATH to verify the signature. Run them only when asked to update opengrep.

Pick the narrowest scan that answers the question:

| Question | Command |
|---|---|
| What did this branch introduce? | `gimlet scan --baseline origin/main` |
| What did the last few commits introduce? | `gimlet scan --baseline HEAD~3` |
| Is this file or directory clean? | `gimlet scan src/Web/Controllers` |
| Full inventory of the repository | `gimlet scan` |
| Where are the HTTP entrypoints and ORM leak risks? | `gimlet scan --audit` |

`--baseline` reports only findings absent at that git ref, so pre-existing findings stay out of a review of new code. Opengrep picks the files to scan from the diff between the ref and the index, then scans their working-tree content. A file whose only changes are unstaged is skipped and reported as zero findings. Run `git add` on the files to review before a baseline scan.

The scan's first line names the opengrep version, the rule directories, the baseline and the paths; quote it in the report so the reader knows what was and was not covered, together with any partial-parse errors (see below). The scan writes nothing into the repository. Results go to `results.json` (and `results.sarif` with `--sarif`) in a per-repository directory under the plugin data directory; the scan's last line names the file. The scan prints findings grouped by file and rule; the JSON holds the full message, matched lines, and rule metadata (`.results[].extra.metadata` carries CWE and OWASP tags).

## Triage

Treat every finding as a claim to verify against the code. The rules are syntactic pattern matches and intra-file taint; they do not resolve types across files or know what a value can hold at runtime. For each finding, open the reported line and decide one of:

- **Real**: attacker-influenced data reaches the sink, or the insecure setting is live in a build that ships. Fix the code.
- **False positive**: name the fact that disproves it (the argument is a constant, the value is validated earlier, the code is test-only). Report it with that fact; do not edit the rule to hide it.
- **Needs context**: the answer depends on deployment or configuration the code does not show. Say what would decide it.

Severity reads ERROR as likely exploitable, WARNING as a weakness worth fixing, INFO as a review pointer. Order work by severity, then by how directly user input reaches the line.

Known false-positive patterns:

- `csharp_injection_rule-CommandInjection` fires on every `Process.Start` and `ProcessStartInfo` with a non-literal argument. A tool that launches its own child process with arguments it builds itself is not injectable; check whether any part of the file name or arguments comes from a request, config value an attacker controls, or file content.

## Errors in the result

`PartialParsing` warnings mean opengrep's C# parser did not understand part of a file. Newer syntax (`required` members, `with` expressions, list patterns, some property patterns) is the usual cause. The rest of the file is still scanned, but a finding inside the unparsed region is missed. Report the files affected; do not treat a scan with parse errors as a clean bill for those lines.

Exit status above 1 from opengrep is a failure of the scan itself; Gimlet stops and names the status.

## Rules

Rule files are YAML under `rules/` and `rules-audit/`, one directory per source; grep them by id. `rules/gimlet` is this project's own (MIT); the other directories carry their source's MIT `LICENSE`. `gimlet test` runs opengrep's rule tests against the fixtures next to each rule file. To add a rule, put the YAML beside a fixture of the same base name annotated with `// ruleid: <id>` and `// ok: <id>` lines, then run `gimlet test`.
