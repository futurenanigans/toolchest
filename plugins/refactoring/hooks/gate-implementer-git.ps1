# gate-implementer-git.ps1: Block git from the task-implementer subagent.
#
# task-implementer has unrestricted Bash/PowerShell (for build/test commands), but the parent workflow owns all
# repo-state operations. This hook is the deterministic layer beneath the prose rule in agents/task-implementer.md.
# The caller is identified by the hook payload's documented agent_type. Any word `git` in the command counts,
# including `bash -c "git ..."`, `command git` and `/usr/bin/git`; a shell can still build the name at run time,
# so this is a guard against habit, and the prose rule stays the contract.

. "$PSScriptRoot\_lib.ps1"

$hookInput = Get-HookInput
if ($null -eq $hookInput) { exit 0 }

if ($hookInput.tool_name -notin @('Bash', 'PowerShell')) { exit 0 }
if ($hookInput.agent_type -notmatch '^(refactoring:)?task-implementer$') { exit 0 }

$command = Get-ToolText -HookInput $hookInput
if ([string]::IsNullOrWhiteSpace($command)) { exit 0 }

$gitWord = '(?i)(?<![\w.-])(?:[\w.~-]*[\\/])?git(?:\.exe)?(?=$|[\s"''`;&|)}])'
if ($command -notmatch $gitWord) { exit 0 }

Emit-Deny ("task-implementer is not allowed to run git. The parent workflow owns all repo-state operations: staging, committing, history inspection, branch/stash/checkout, everything. This hook layered on top of the prose rule in your system prompt.`n" +
    "`n" +
    "If the step genuinely requires a git operation (revert a file, inspect a prior commit, etc.), do not retry with a different invocation. Return one of:`n" +
    "`n" +
    "  - NEEDS_CONTEXT: describe the git operation the orchestrator needs to do on your behalf.`n" +
    "  - BLOCKED: if the step cannot be completed without git access you do not have.`n" +
    "`n" +
    "Attempted command: $command")
