---
type: llm
---
PASS if the plan distinguishes major vs minor/patch upgrades (e.g. `Newtonsoft.Json` 12->13 or `Serilog` 3->4 as major upgrades requiring breaking-change review), recommends checking vulnerable/outdated packages (`dotnet list package --outdated` / `--vulnerable`), and recommends incremental/verified updates with build+test between batches rather than a single blind bump.
FAIL if it proposes blindly bumping all packages at once without checking vulnerabilities, major-version risk, or test verification.
