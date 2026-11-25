# gate-implementer-git.ps1: Block git from the task-implementer subagent.
#
# task-implementer has unrestricted Bash/PowerShell (for build/test commands), but the parent workflow owns all
# repo-state operations. This hook is the deterministic layer beneath the prose rule in agents/task-implementer.md.
#
# The caller is task-implementer if either the payload's agent_type says so, or the sibling
# agent-<hash>.meta.json ({"agentType":"<name>"}) of a transcript_path under <session>/subagents/agent-<hash>.jsonl does.

. "$PSScriptRoot\_lib.ps1"

$hookInput = Get-HookInput
if ($null -eq $hookInput) { exit 0 }

if ($hookInput.tool_name -notin @('Bash', 'PowerShell')) { exit 0 }

$command = Get-ToolText -HookInput $hookInput
if ([string]::IsNullOrWhiteSpace($command)) { exit 0 }

# git at line start, or after a shell separator / then / do: the bash hook's pattern, case-sensitive.
$gitAfterSeparator = '(?m)(^|[;&|`]\s*|\bthen\s+|\bdo\s+)git\b'
# Also ( { $( openers, env assignments, the & call operator, quoting, and git.exe, in any case.
$gitInvocation = '(?im)(^|[;&|(`{]|\$\(|\bthen\b|\bdo\b)\s*(?:[A-Za-z_]\w*=\S*\s+)*(?:&\s*)?["'']?git(?:\.exe)?["'']?(?=\s|$)'
if ($command -cnotmatch $gitAfterSeparator -and $command -notmatch $gitInvocation) { exit 0 }

function Get-MetaAgentType {
    param([string]$TranscriptPath)

    if ([string]::IsNullOrWhiteSpace($TranscriptPath)) { return $null }
    # Only subagent transcripts live under .../subagents/agent-<hash>.jsonl
    if ($TranscriptPath -notmatch '[\\/]subagents[\\/]agent-[A-Za-z0-9]+\.jsonl$') { return $null }

    $metaPath = ($TranscriptPath -replace '\.jsonl$', '') + '.meta.json'
    if (-not (Test-Path -LiteralPath $metaPath -PathType Leaf)) { return $null }

    try {
        return (Get-Content -LiteralPath $metaPath -Raw | ConvertFrom-Json).agentType
    } catch {
        # An unreadable meta file means the caller cannot be identified, which the bash hook treats as allow.
        return $null
    }
}

$implementerPattern = '^(refactoring:)?task-implementer$'
$isImplementer = ($hookInput.agent_type -match $implementerPattern) -or
    ((Get-MetaAgentType -TranscriptPath $hookInput.transcript_path) -match $implementerPattern)
if (-not $isImplementer) { exit 0 }

Emit-Deny ("task-implementer is not allowed to run git. The parent workflow owns all repo-state operations: staging, committing, history inspection, branch/stash/checkout, everything. This hook layered on top of the prose rule in your system prompt.`n" +
    "`n" +
    "If the step genuinely requires a git operation (revert a file, inspect a prior commit, etc.), do not retry with a different invocation. Return one of:`n" +
    "`n" +
    "  - NEEDS_CONTEXT: describe the git operation the orchestrator needs to do on your behalf.`n" +
    "  - BLOCKED: if the step cannot be completed without git access you do not have.`n" +
    "`n" +
    "Attempted command: $command")
