---
name: gimlet
description: Run C#/.NET security scanners (opengrep rules, the SDK's Security analyzers, Dotnetarium taint analysis, NuGet and OSV vulnerable-package checks, Betterleaks secrets) over a repository, probe a running ASP.NET Core API (Spectral, Schemathesis, ZAP), and triage and fix the findings. Use when asked to scan C#, ASP.NET, Razor, web.config or appsettings for security issues, to check a branch or diff for new findings, to look for vulnerable packages or leaked secrets, to security-test a running API, or to interpret a gimlet result.
---

# Running gimlet

Run it as `bash "${CLAUDE_SKILL_DIR}/../../bin/gimlet"`, which works whether or not the plugin's `bin/` is on PATH and whether or not the install kept the executable bit. The commands below shorten that to `gimlet`. Each tool installs on first use at the version pinned in `config/defaults.env`. The files gimlet downloads itself (opengrep, Dotnetarium, Betterleaks, OSV-Scanner, ZAP, jq) are checked against a pinned SHA-256; Spectral and Schemathesis use lockfiles with integrity hashes. `gimlet update` and `gimlet install --version vX.Y.Z` change only opengrep and need cosign; run them only when asked.

Pick the narrowest command that answers the question:

| Question | Command |
|---|---|
| What did this branch introduce? | `gimlet scan --baseline origin/main` |
| Is this file or directory clean? | `gimlet scan src/Web/Controllers` |
| Full inventory of the repository | `gimlet scan` |
| Any vulnerable packages? | `gimlet scan --only packages,osv` |
| Any leaked secrets in history? | `gimlet scan --only secrets` |
| Where are the HTTP entrypoints and ORM leak risks? | `gimlet scan --only opengrep --audit` |
| Does the running API hold up? | `gimlet probe --url http://localhost:5000` |

Scanners: `opengrep`, `analyzers`, `dotnetarium`, `packages`, `osv`, `secrets`. `--only` and `--skip` take comma-separated names. The dotnet scanners find a `.sln`/`.slnx` in each scan path, else the `.csproj` files under it, else the nearest project above it; `--project` overrides. They restore and build into the results directory, so the first run on a repository takes minutes. The build runs the repository's MSBuild code, the same as `dotnet build`.

What `--baseline REF` means per scanner:

- `opengrep` reports findings absent at REF, comparing REF with the index. A file whose only changes are unstaged is skipped; `git add` the files to review first.
- `analyzers` and `dotnetarium` also analyze a `git archive` export of REF and drop findings it already had (matched on rule, file and message, so moved lines still match). If REF cannot be restored or built, the scanner is marked INCOMPLETE and reports every finding.
- `packages` and `osv` run only when a project, props, lock or package manifest file changed since REF, and then report every vulnerable package.
- `secrets` scans the commits in `REF..HEAD` plus the staged changes.

The first line of output names the scanners, baseline and paths; quote it in the report so the reader knows what was covered. The summary gives each scanner a count and a status. INCOMPLETE, SKIPPED and FAILED each carry a reason; report every one of them, because a scanner that did not run is not a clean result for what it covers. A FAILED scanner makes the command exit non-zero after the summary; INCOMPLETE and SKIPPED do not. It also exits non-zero, with no summary, when the scan cannot start (an unknown option, a missing path, a baseline that is not a commit).

Read `report.json` in the results directory, or filter large reports with `gimlet query [report.json|results-dir] [--severity error,warning] [--tool ...] [--rule ...] [--path ...] [--format text|json|sarif]` instead of loading the entire raw file into context. With no report or directory it reads the last scan of the current repository; probe results need their `probe/` directory named. The SARIF output lists every scanner that is not `ok` under `invocations[0].toolExecutionNotifications` and sets `executionSuccessful` to false when one failed, so read those before treating an empty `results` array as clean. Its `scanners` array gives the tool, status (`ok`, `partial`, `skipped` or `failed`) and detail for each selected scanner. Check those statuses before interpreting an empty `findings` array. Each finding contains `tool`, `rule`, `severity`, `file`, `line` and `message`. Package findings also include `package`. Existing consumers can read the same findings from `findings.json` and statuses from `status.tsv`. Each scanner's raw output and log sit beside it (`opengrep.raw.json` carries CWE and OWASP metadata under `.results[].extra.metadata`, the SARIF from `dotnetarium-*.sarif` carries data-flow paths).

## Probing a running API

`gimlet probe` needs the API already running. Start it in the background with `dotnet run --project <web project> --urls http://127.0.0.1:<free port>` (add `--environment Development` when the OpenAPI document is mapped only there), wait until `curl --retry 60 --retry-connrefused --retry-delay 1 <url>/openapi/v1.json` answers, probe, then stop the process. It fetches the OpenAPI document from `openapi/v1.json` or `swagger/v1/swagger.json` under the URL, or from `--openapi URL|FILE`. Pass `--auth-header 'Authorization: Bearer …'` so the probes reach authenticated operations; without it they test only what an anonymous caller sees.

Schemathesis and ZAP send attack traffic. Probe only a local or test instance with throwaway data; gimlet refuses a URL that is not on this machine unless `--allow-remote` is passed, and pass it only when the user says the target is theirs to test. Results go to the `probe/` subdirectory of the results directory. The run budgets come from `GIMLET_SCHEMATHESIS_MAX_SECONDS` and `GIMLET_ZAP_MAX_MINUTES`.

## Triage

Treat every finding as a claim to verify against the code. For each one, open the reported line and decide one of:

- **Real**: attacker-influenced data reaches the sink, the insecure setting is live in a build that ships, or the vulnerable package's affected API is reachable. Fix it.
- **False positive**: name the fact that disproves it (the argument is a constant, the value is validated earlier, the code is test-only, the advisory's vulnerable function is never called). Report it with that fact; do not edit a rule or add a suppression to hide it.
- **Needs context**: the answer depends on deployment or configuration the code does not show. Say what would decide it.

Severity reads `error` as likely exploitable, `warning` as a weakness worth fixing, `note` as a review pointer. Order work by severity, then by how directly user input reaches the line.

The same defect often appears under several scanners (opengrep's SQL injection rule, CA2100 and DNA0001 on one line). Report it once, naming the scanners that agree; agreement between a pattern match and a taint path is stronger evidence than either alone.

Per scanner:

- `opengrep` rules are syntactic patterns and intra-file taint; they do not resolve types across files. `csharp_injection_rule-CommandInjection` fires on every `Process.Start` with a non-literal argument; it is injectable only when part of the file name or arguments comes from a request, an attacker-controlled config value or file content.
- `analyzers` are type-resolved, but their taint rules (CA3001 to CA3012) do not treat ASP.NET Core handler parameters as sources, so their silence on injection proves nothing. CA2100 flags any non-constant SQL text, tainted or not. Each rule's doc is at `https://learn.microsoft.com/dotnet/fundamentals/code-analysis/quality-rules/<id lowercased>`.
- `dotnetarium` findings are taint paths from a modeled input to a sink; the SARIF `codeFlows` show the path. Its silence covers only modeled sources and sinks. Dotnetarium's rule docs are at https://github.com/dotnetarium/dotnetarium/tree/main/docs/rules.
- `packages` and `osv` report a package version, not a reachable call. Check the advisory for the affected API before ranking it; fix by upgrading to the first patched version and re-running `gimlet scan --only packages`.
- `secrets` findings are redacted. Treat a real credential in history as compromised even after the file is fixed: say it must be rotated, because removing it from the tree leaves it in every clone.
- `spectral` reports document gaps (no security scheme, unbounded strings, missing 401/429 responses). Each is real only when the running API also lacks the control; check the endpoint's code.
- `schemathesis` server errors (ST101) mean an input crashed the handler. The log holds a reproducing request; read the handler to find what the input reached.
- `zap` findings come from requests that succeeded against the app. Path traversal, injection or XSS there is confirmed behavior, not a pattern match.

## Fixing

Before fixing a finding, read `${CLAUDE_SKILL_DIR}/fixing.md` and search it for the finding's rule id (opengrep ids without their `gimlet.security.` or `csharp_*_rule-` prefix). It holds one fix pattern per kind of defect, shared across the scanners that report it, and names the fixes that need the user's decision. Fix the code, then re-run the narrowest command that covers it (`gimlet scan <file> --only <scanner>`, or the single probe) and report that it no longer reports the finding. A fix that only satisfies the scanner (renaming a variable, casting to silence a type match) is not a fix.

### Variant analysis after a confirmed finding

Once a finding is confirmed as real, sweep the repository for siblings of the same defect shape before closing the issue. Search for the same sink, unsafe helper, missing authorization attribute, or unvalidated boundary pattern across adjacent controllers, handlers, and services. Apply the same triage bar to every hit: verify attacker-controlled input reaches the sink, report confirmed variants together with the original fix, and drop false positives rather than padding the list.

## Errors in the result

An `opengrep` INCOMPLETE status lists files where the C# parser skipped regions (`required` members, `with` expressions and list patterns are common causes). A finding inside the skipped region is missed; report the files.

A `dotnetarium` INCOMPLETE status for degraded input means unresolved references or compiler errors; the `Input warning` lines in `dotnetarium.log` name them. An `analyzers` INCOMPLETE status means a project failed to build and was not analyzed; `analyzers.log` names the errors.

## Rules

Opengrep rule files are YAML under `rules/` and `rules-audit/`, one directory per source; grep them by id. `rules/gimlet` is this project's own (MIT); the other directories carry their source's MIT `LICENSE`. A rule stays only while the compiler-based scanners do not report every match it makes on .NET 8+ code. `gimlet test` runs opengrep's rule tests against the fixtures next to each rule file. To add a rule, put the YAML beside a fixture of the same base name annotated with `// ruleid: <id>` and `// ok: <id>` lines, then run `gimlet test`.
