# Gimlet

A Claude Code plugin that runs [opengrep](https://github.com/opengrep/opengrep) with a bundled C#/.NET ruleset. `bin/gimlet` downloads opengrep release binaries into the plugin data directory (`$CLAUDE_PLUGIN_DATA`, or `~/.local/share/gimlet` outside Claude Code), and runs scans. The `gimlet` skill tells Claude when to scan and how to triage what comes back.

```
bin/gimlet scan --baseline origin/main   # findings introduced since main
bin/gimlet scan src/                     # everything under src/
bin/gimlet update                        # move to the latest opengrep release
bin/gimlet test                          # rule tests against their fixtures
```

Needs `bash`, `curl`, and `git` for baseline scans. Linux and macOS only; opengrep ships Windows as a zip that this script does not unpack.

Install with `/plugin install gimlet@toolchest`. Add `.gimlet/` to the `.gitignore` of a repository you scan; results land there.

## Rules

| Directory | Source | Licence |
|---|---|---|
| `rules/merkhet` | Merkhet's opengrep rule packs | the Merkhet project's own |
| `rules/gitlab` | [gitlab-org/security-products/sast-rules](https://gitlab.com/gitlab-org/security-products/sast-rules) `csharp/` | MIT |
| `rules-audit/elttam` | [elttam/semgrep-rules](https://github.com/elttam/semgrep-rules) `rules-audit/csharp/dotnet/` | MIT |

`rules-audit` runs only with `scan --audit`. Its rules inventory ASP.NET entrypoints and Entity Framework ORM-leak candidates; they are review pointers and fire often.

Changes from upstream:

- GitLab's test fixtures were dropped. Each carries an LGPL-3.0 header from security-code-scan, which is not a permissive licence; GitLab's rules themselves are MIT. Only `crypto/rule-WeakCipherMode.cs` (MIT) remains, so the other GitLab rules have no fixtures.
- `rule-CertificateValidationDisabled.yml`: the lambda pattern `(...) => true;` does not parse as C# in opengrep; the trailing semicolon was removed.
- elttam `entity-framework-orm.yaml`: `ef-ormleak-dynamic-where` was removed because its `metavariable-pattern` sat outside a `patterns` block, which opengrep ignores, so it matched every `.Where(...)` call. `ef-ormleak-dynamic-orderby` had the same defect and now excludes string literals and lambdas inside a `patterns` block. The `Include` sink now excludes string literals. The fixture's annotations were renamed to the rule ids the file defines.

Excluded collections: `opengrep/opengrep-rules` and `semgrep/semgrep-rules` (Commons Clause and the Semgrep Rules License), `trailofbits/semgrep-rules` (AGPL-3.0), `mindedsecurity/semgrep-rules-android-security` (GPL-3.0). `patched-codes/semgrep-rules` (MIT) is an older copy of the GitLab C# rules. `lambdasec/autogrep` (Apache-2.0) is untested model-generated rules tied to single projects.
