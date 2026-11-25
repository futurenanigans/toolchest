---
name: gimlet
description: Run opengrep with Gimlet's bundled C#/.NET rules and triage the findings. Use when asked to scan C#, ASP.NET, Razor, web.config or appsettings files for security or quality issues, to check a branch or diff for newly introduced findings, to install or update opengrep, or to interpret a Gimlet or opengrep result.
---

# Running Gimlet

Gimlet is a wrapper around opengrep. Run it as `bash "${CLAUDE_SKILL_DIR}/../../bin/gimlet"`, which works whether or not the plugin's `bin/` is on PATH and whether or not the install kept the executable bit. The commands below shorten that to `gimlet`. The first scan downloads the latest opengrep release if none is installed. `gimlet update` moves to a newer release, and `gimlet install --version vX.Y.Z` pins one. Downloads are verified with cosign when cosign is on PATH; `--require-signature` refuses to install without it.

Pick the narrowest scan that answers the question:

| Question | Command |
|---|---|
| What did this branch introduce? | `gimlet scan --baseline origin/main` |
| What did the last few commits introduce? | `gimlet scan --baseline HEAD~3` |
| Is this file or directory clean? | `gimlet scan src/Web/Controllers` |
| Full inventory of the repository | `gimlet scan` |
| Where are the HTTP entrypoints and ORM leak risks? | `gimlet scan --audit` |

`--baseline` reports only findings absent at that git ref, so pre-existing findings stay out of a review of new code. Opengrep picks the files to scan from the diff between the ref and the index, then scans their working-tree content. A file whose only changes are unstaged is skipped and reported as zero findings. Run `git add` on the files to review before a baseline scan.

Results go to `.gimlet/results.json` in the working directory (`--sarif` adds `results.sarif`). Add `.gimlet/` to the repository's `.gitignore`. `gimlet summary` reprints the last result without rescanning; read the JSON with `jq` for the full message, matched lines, and rule metadata (`.results[].extra.metadata` carries CWE and OWASP tags).

## Triage

Treat every finding as a claim to verify against the code. The rules are syntactic pattern matches and intra-file taint; they do not resolve types across files or know what a value can hold at runtime. For each finding, open the reported line and decide one of:

- **Real**: attacker-influenced data reaches the sink, or the insecure setting is live in a build that ships. Fix the code.
- **False positive**: name the fact that disproves it (the argument is a constant, the value is validated earlier, the code is test-only). Report it with that fact; do not edit the rule to hide it.
- **Needs context**: the answer depends on deployment or configuration the code does not show. Say what would decide it.

Severity reads ERROR as likely exploitable, WARNING as a weakness worth fixing, INFO as a code-quality or review pointer. Order work by severity, then by how directly user input reaches the line.

Rules whose ids start with `merk.quality.` are code-quality checks (broad catches, swallowed errors, magic URLs). In a repository that already runs Awl, they overlap Awl's exception and literal rules; prefer Awl's verdict where both fire.

Known false-positive patterns:

- `csharp_injection_rule-CommandInjection` fires on every `Process.Start` and `ProcessStartInfo` with a non-literal argument. A tool that launches its own child process with arguments it builds itself is not injectable; check whether any part of the file name or arguments comes from a request, config value an attacker controls, or file content.
- `merk.quality.catch-general-exception-csharp` is expected at process boundaries (program entry, hook entrypoints, top-level request handlers).

## Errors in the result

`PartialParsing` warnings mean opengrep's C# parser did not understand part of a file. Newer syntax (`required` members, `with` expressions, list patterns, some property patterns) is the usual cause. The rest of the file is still scanned, but a finding inside the unparsed region is missed. Report the files affected; do not treat a scan with parse errors as a clean bill for those lines.

Exit status above 1 from opengrep is a failure of the scan itself; Gimlet stops and names the status.

## Rules

Rule files are YAML under `rules/` and `rules-audit/`, one directory per source; grep them by id. The sources and licences are in `rules/*/LICENSE`. `gimlet test` runs opengrep's rule tests against the fixtures next to each rule file. To add a rule, put the YAML beside a fixture of the same base name annotated with `// ruleid: <id>` and `// ok: <id>` lines, then run `gimlet test`.
