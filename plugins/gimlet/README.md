# Gimlet

A Claude Code plugin that runs C#/.NET security scanners over a repository and probes a running API, then merges what they report into one findings file. `bin/gimlet` installs each tool into the plugin data directory (`$CLAUDE_PLUGIN_DATA`, or `~/.local/share/gimlet` outside Claude Code) and keeps results there, so a scan never writes into the repository it reads. The `gimlet` skill tells Claude which command answers which question and how to triage the results.

```
bin/gimlet scan --baseline origin/main   # what this branch introduced
bin/gimlet scan src/                     # everything under src/
bin/gimlet probe --url http://localhost:5000   # test the running API
bin/gimlet query --severity error        # the last scan's errors
bin/gimlet test                          # opengrep rule tests against their fixtures
```

Install with `/plugin install gimlet@toolchest`.

## Scanners

| Scanner | Tool | What it finds | Needs |
|---|---|---|---|
| `opengrep` | [opengrep](https://github.com/opengrep/opengrep) with the bundled rules | Insecure configuration and API use by pattern, including web.config, appsettings and .NET Framework code | nothing |
| `analyzers` | The .NET SDK's Security analyzers (CA2100, CA23xx, CA3xxx, CA5xxx) with `AnalysisModeSecurity=All` | Type-resolved crypto, deserialization, XML and certificate misuse | `dotnet`; projects that build |
| `dotnetarium` | [Dotnetarium](https://github.com/dotnetarium/dotnetarium) | Taint from ASP.NET Core, Razor, gRPC and SignalR inputs to injection, path, redirect and SSRF sinks, across methods | the .NET 10 runtime |
| `packages` | `dotnet list package --vulnerable --include-transitive` | NuGet packages with GitHub advisories, direct and transitive | `dotnet` |
| `osv` | [OSV-Scanner](https://github.com/google/osv-scanner) | Vulnerable packages in any ecosystem's manifests and lock files (npm front ends, `deps.json`) | nothing |
| `secrets` | [Betterleaks](https://github.com/betterleaks/betterleaks) | Credentials in git history and files; reports are redacted | nothing |

| Probe | Tool | What it finds | Needs |
|---|---|---|---|
| `spectral` | [Spectral](https://github.com/stoplightio/spectral) with the OWASP API Security ruleset | OpenAPI documents missing auth, limits and error responses | `npm` |
| `schemathesis` | [Schemathesis](https://github.com/schemathesis/schemathesis) | Server errors and contract violations under generated input | `uv` |
| `zap` | [ZAP](https://github.com/zaproxy/zaproxy) automation framework | Active-scan vulnerabilities such as injection and path traversal | Java 17+ |

`gimlet` itself needs `bash` and `curl`, plus `git` for baselines. It uses the `jq` on `PATH`, or downloads a pinned one when there is none. It runs on Linux, macOS and Windows (Git Bash, with `unzip` or PowerShell); ZAP runs only on Linux and macOS. A scanner whose prerequisite is missing is reported as skipped.

Every file gimlet downloads itself is pinned in `config/defaults.env` with its SHA-256, and a mismatch is refused. Dotnetarium installs from its pinned `.nupkg` through a feed that holds only that file. `gimlet update` and `install --version` move opengrep to another release only after [cosign](https://github.com/sigstore/cosign) verifies its signature; the other tools change by editing their pins. Spectral installs with `npm ci` from the lock in `config/spectral`, including the vendored OWASP ruleset and its integrity hash. Schemathesis uses Python 3.11 or newer and installs with `uv pip sync --require-hashes` from `config/schemathesis.lock`.

Each run writes `report.json`. Read `.scanners[]` for each selected scanner's status and detail, and `.findings[]` for its results. A failed scanner makes the command exit 1 after it writes the report. The findings array is also available in `findings.json`. `gimlet query` filters a report by severity, tool, rule or path and prints text, JSON or SARIF 2.1.0; with no report named it reads the last scan of the current repository.

The `analyzers`, `dotnetarium` and `packages` scanners evaluate the repository's MSBuild files, which run code the same way `dotnet build` does. Scan only repositories you would build.

## Rules

| Directory | Source | Licence |
|---|---|---|
| `rules/gimlet` | this project | MIT |
| `rules/gitlab` | [gitlab-org/security-products/sast-rules](https://gitlab.com/gitlab-org/security-products/sast-rules), modified | MIT |
| `rules-audit/elttam` | [elttam/semgrep-rules](https://github.com/elttam/semgrep-rules), modified | MIT |

The opengrep rules cover what the compiler-based scanners do not: configuration files, .NET Framework APIs, Razor markup, and patterns that need no taint source. A rule whose every match the `analyzers` or `dotnetarium` scanner reports on .NET 8+ code is removed. `rules-audit` runs only with `scan --audit`; its rules inventory ASP.NET entrypoints and Entity Framework ORM-leak candidates and fire often.

Every rule file has a fixture beside it with the same base name, annotated with `// ruleid: <id>` and `// ok: <id>` lines; `gimlet test` runs them all.
