---
name: awl-enable
description: Use when the user asks to enable, set up, turn on, disable or check Awl semantic analysis for the current repository, or asks why Awl hooks do nothing here.
---

# Enable Awl in a repository

The Awl plugin hooks run on every session, but a repository without a `.awl/awl.json` at its root answers `{}`
and loads nothing. Awl looks only for the exact file `.awl/awl.json`, from the project directory up to the
Git root. It never discovers solutions or projects; the file names the target explicitly.

## Enable

1. Choose the target. Use the solution or project the user names. Otherwise list the `.sln` and
   `.slnx` files at the repository root; when there is exactly one, propose it and ask the user to
   confirm. When there are none or several, ask which file to use. Never pick one silently.
2. Write `.awl/awl.json` at the repository root. Paths are relative to the repository root:

   ```json
   {
     "schemaVersion": 1,
     "target": "MySolution.slnx"
   }
   ```

   Optional members: `host` (an `Awl.Host.dll`; the installed tool's packaged host is the default)
   and `state` (default: the target directory's folder in `~/.cache/awl`). The same file is the strict Awl configuration, so
   `analysis`, `hook` and `reporting` sections belong here too; `awl init` prints every
   rule's defaults. If a `.awl/awl.json` already exists, add `target` to it instead of replacing it.
3. Verify with a fresh analysis through the host:

   ```
   awl doctor --agent claude --target MySolution.slnx --settings .claude/settings.local.json --check current --config .awl/awl.json
   ```

   Report the `current` section: a complete analysis with no evidence gaps means Awl is ready. Exit 3
   with `claude-runtime-unavailable` is expected because Claude runtime discovery is unavailable; any
   other gap or an incomplete analysis is a problem to report, not a pass.
4. Tell the user the hooks take effect on the next tool call; no restart is needed.

## Disable

Delete `.awl/awl.json` (or ask the user before removing it if it also carries configuration they want to
keep for CI). The hooks then answer `{}` again.

## Errors

An invalid `.awl/awl.json`, a missing `target`, or a target path that does not exist makes every hook exit
2 with the reason. Fix the file; do not delete it to get past the error unless the user wants Awl off.
