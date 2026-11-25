---
name: nuget-package-update
description: Updates NuGet packages in a .NET solution that uses SDK-style (PackageReference) projects. Discovers outdated packages, enforces license restrictions, updates in incremental groups with build and test after each, researches and fixes breaking changes, commits locally per group, and prints a structured end-of-run report. Use only when the user explicitly asks to "update NuGet packages", "update dependencies", or "bump packages". Does not branch, push, or open a PR. Does not apply to classic packages.config solutions.
disable-model-invocation: true
---

# NuGet package update

## Objective

Update all NuGet packages in the solution to their latest stable versions. Use `dotnet list package --outdated` to discover updates, research breaking changes, update code as needed, and keep every build and test green.

The examples below use `MyApp.slnx`. Locate the actual solution file (`.slnx` or `.sln`) first; if there are several, ask the user which one, and substitute it throughout.

**Scope from $ARGUMENTS**: `minor` restricts to minor and patch updates, `patch` to patch only. No argument means all stable updates.

**Central Package Management**: check for `Directory.Packages.props` at the solution root first. If present, versions live there as `<PackageVersion>` entries, not in the csproj files; edit versions there. CPM guarantees cross-project version consistency, so the consolidation check below is unnecessary.

## License compliance

**Mandatory**: before updating any package, check it against the restrictions table. Some packages have moved from open-source to commercial licenses, which may violate organizational policy or incur unexpected costs.

### License restrictions table

| Package | Status | Reason | Alternative | Notes |
|---------|--------|--------|-------------|-------|
| FluentAssertions | BANNED (all versions) | License changed to commercial (Xceed) | Shouldly | Never update it. If the solution still references it, flag it in the final summary and recommend migrating to Shouldly |

### Handling license-restricted packages

1. **BANNED** packages: never update, regardless of version. Leave as-is, flag prominently in the final summary, and recommend the alternative. Do not perform the migration during a routine update unless the user asks.
2. **Version-capped** packages (if added later): skip any update that would cross the restricted version; hold at the max safe version.
3. Log every skip with its reason: "Skipped [Package]: [reason from table]".
4. Suggest the alternative package if one exists.
5. Include a "License Compliance" section in the final summary.

### Adding new restrictions

If a package's license is found to have changed during the update:
1. Research the change (changelog, GitHub issues, official announcements).
2. Add a row to the table with all relevant details.
3. Document the finding in the final summary.
4. Suggest alternatives if known.

## Requirements

- Discover the projects from the solution file.
- Tests may require Docker for Testcontainers.
- Follow the project's C# conventions (see `CLAUDE.md` and `${CLAUDE_SKILL_DIR}/../../rules/dotnet.md`).
- All tests must pass before each commit.

## Step-by-step instructions

### 1. Discovery: find all outdated packages

`dotnet list package --outdated` is the authoritative discovery mechanism, more reliable than checking nuget.org by hand.

1.1. Get structured JSON output:
```bash
dotnet list MyApp.slnx package --outdated --format json
```

1.2. For each outdated package the JSON provides `id`, `requestedVersion` (the version in the csproj), `resolvedVersion`, and `latestVersion`.

1.3. For packages already on prerelease versions, also run:
```bash
dotnet list MyApp.slnx package --outdated --include-prerelease --format json
```

1.4. Create an update list grouped by package category.

### 2. Validate and filter updates

2.1. From the output, filter packages:
   - Skip packages in the license restrictions table.
   - Skip packages showing "Not found at the sources" unless a prerelease check is needed.
   - Include all others.

2.2. **License compliance check** (mandatory): check each outdated package against the table. If restricted, log the skip reason and add it to the summary's "Skipped Due to License" section.

2.3. **Verify target-framework compatibility** for major bumps: the latest version may require a newer TFM than the project targets (restore fails with NU1202). Step down to the highest compatible version and log the hold.

2.4. **Flag likely blockers** up front:
   - **First-party or private package pins**: a private package compiled against an older dependency blocks bumping that dependency (NU1107 downgrade errors, or CS0012 at build). Hold the dependency at the pinned version and log "needs the private package rebuilt first".
   - **Private feed auth**: if restore returns 401 from a private feed, ask the user to authenticate. Do not retry in a loop.

2.5. Group packages for incremental updates (same groups as step 3). Prioritize by semver lag: packages one or more majors behind need breaking-change research; two or more majors behind are the riskiest, so research those first.

### 3. Update packages incrementally

**Branching is the user's job. Do not create branches.** Commits land on the currently checked-out branch. Before the first commit, tell the user which branch is checked out; if it is the default branch (main or master), pause and ask whether they want to create a branch first.

Update in logical groups to isolate breaking changes:

- **Group 1**: `Microsoft.Extensions.*` (typically compatible together)
- **Group 2**: `Microsoft.AspNetCore.*`
- **Group 3**: Azure packages (`Azure.*`, `Microsoft.Azure.*`)
- **Group 4**: testing packages (xunit, Shouldly, Moq, NSubstitute, Verify, Testcontainers, Bogus)
- **Group 5**: other packages, one at a time

For each group:

3.1. Update each package in the group with `dotnet package update <id>@<version> --project MyApp.slnx`, which edits the csproj files or `Directory.Packages.props` for you. Where the SDK has no `dotnet package update` command, edit the version numbers with the Edit tool.

3.2. Build:
```bash
dotnet build MyApp.slnx --configuration Release
```

3.3. Test:
```bash
dotnet test MyApp.slnx --configuration Release
```

3.4. If build or tests fail, go to step 4.

3.5. If successful, commit:
```bash
git add -u
git commit -m "Update [package group name] packages"
```

### 4. Fix breaking changes

4.1. **Research**: use WebSearch for "[PackageName] [OldVersion] to [NewVersion] breaking changes" and "[PackageName] [NewVersion] release notes"; use WebFetch to read official migration guides or changelogs. Look for API changes, removed features, new required configuration, and changed behavior.

4.2. **Identify errors**: read build errors and test failures with their stack traces; use Grep to find usages of the problematic APIs.

4.3. **Apply fixes**: update code to the new APIs, fix compilation errors, update tests if needed, and write the new code to `${CLAUDE_SKILL_DIR}/../../rules/dotnet.md`, which wins over a deviating local style.

4.4. **Verify**: rebuild and retest with the commands from step 3.

4.5. **Iteration limit**: attempt up to 3 fix iterations per group. If still failing, document the issue and move to the next group. Keep the failing update in place so the attempt is documented in the summary.

### 5. Consolidate and summarize

5.1. **Consolidation check** (skip under CPM): scan all csproj files for the same package id at different versions across projects. Align each drifted package to the highest version already present, rebuild and retest, and commit as `Consolidate package versions`.

5.2. This skill stops at local commits. It does not create branches, push, or open a PR. After all groups and consolidation are done, print the report below to the user (do not write it to a file unless asked).

**Summary template.** Keep it concise. List only packages that were actually updated.

```markdown
## Summary

Updated [X] NuGet package(s) to their latest stable versions.

## Updated Packages

### [Package Group Name]
- **PackageName**: `1.0.0` to `2.0.0`
  - [Brief summary of changes from release notes]
  - Reference: [link to release notes]

### Failed Updates (if any)
- **ProblematicPackage**: `1.0.0` to `2.0.0`
  - Issue: [description of failure]
  - Iterations attempted: 3

## Not Updated, Intentional (if any; group by reason)
- **Requires newer TFM**: [pkgs]; latest targets [TFM]; capped at `<ver>`.
- **Blocked by first-party/private pin**: [pkgs]; needs the private package rebuilt first.
- **Private feed (auth required)**: [pkgs]; could not restore.

## Runtime Verification
- [Updates a green build cannot fully validate (DI wiring, middleware, serialization behavior, client assets) listed as runtime-UNVERIFIED with a suggested smoke test; or "All changes covered by the test suite."]

## License Compliance

### Packages Skipped Due to License Restrictions
- **FluentAssertions**: BANNED, not updated (license changed to commercial; organizational policy)
  - Current: `[version]`; recommend migrating to Shouldly (BSD) in a follow-up

### New License Restrictions Discovered (if any)
- **[PackageName]**: License changed from [Previous] to [New] in v[Version]; added to restrictions table

## Breaking Changes Fixed (if any)

1. **PackageName 2.0.0**
   - Change: [description]
   - Fix applied: [code changes made]

## Test Results

- Build: Passed (0 warnings, 0 errors)
- Tests: All [X] tests passed
```

Suggesting a branch name and PR title (for example `Update <group names> packages`) is fine; running the commands is not.

## Error handling

- `dotnet list package --outdated` fails: fall back to reading the csproj files and checking nuget.org by hand.
- Docker unavailable: say that the integration tests could not run, and report them as unrun.
