# Gimlet

A Claude Code plugin that runs [opengrep](https://github.com/opengrep/opengrep) with a bundled C#/.NET ruleset. `bin/gimlet` installs opengrep into the plugin data directory (`$CLAUDE_PLUGIN_DATA`, or `~/.local/share/gimlet` outside Claude Code), runs scans, and keeps their results there. The `gimlet` skill tells Claude when to scan and how to triage what comes back.

```
bin/gimlet scan --baseline origin/main   # findings introduced since main
bin/gimlet scan src/                     # everything under src/
bin/gimlet update                        # move to the latest opengrep release (needs cosign)
bin/gimlet test                          # rule tests against their fixtures
```

Install with `/plugin install gimlet@toolchest`. Needs `bash` and `curl`, plus `git` for baseline scans. Runs on Linux, macOS and Windows (Git Bash, with `unzip` or PowerShell to unpack the Windows release).

The opengrep release gimlet installs by default is pinned in `config/defaults.env` with the SHA-256 of each platform's asset, and a download that does not match is refused. `gimlet update` and `install --version` install other releases only after [cosign](https://github.com/sigstore/cosign) verifies their signature.

## Rules

| Directory | Source | Licence |
|---|---|---|
| `rules/gimlet` | this project | MIT |
| `rules/gitlab` | [gitlab-org/security-products/sast-rules](https://gitlab.com/gitlab-org/security-products/sast-rules), modified | MIT |
| `rules-audit/elttam` | [elttam/semgrep-rules](https://github.com/elttam/semgrep-rules), modified | MIT |

`rules-audit` runs only with `scan --audit`; its rules inventory ASP.NET entrypoints and Entity Framework ORM-leak candidates and fire often. Where a repository enables awl (`.awl/awl.json`), a scan skips `rules/gimlet/quality` and `rules/gimlet/architecture`, which overlap awl's rules; `--quality` runs them anyway.

Every rule file has a fixture beside it with the same base name, annotated with `// ruleid: <id>` and `// ok: <id>` lines; `gimlet test` runs them all.
