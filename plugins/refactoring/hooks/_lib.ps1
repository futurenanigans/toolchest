# _lib.ps1: shared helpers for Claude Code PreToolUse hooks (PowerShell 7, Windows and Linux).
# Dot-source from each hook with `. "$PSScriptRoot\_lib.ps1"`. Advisory hooks call Emit-Context, which adds a
# warning without touching the permission decision; only Emit-Deny blocks.

# Claude Code reads hook stdout as UTF-8 whatever the console code page is.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-HookInput {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return $null
    }
    try {
        return $raw | ConvertFrom-Json -Depth 20
    } catch {
        # An advisory hook must never fail the tool call it is observing.
        exit 0
    }
}

function Emit-Context {
    # Omitting permissionDecision leaves the call to the normal permission flow; "allow" would auto-approve it.
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $payload = @{
        hookSpecificOutput = @{
            hookEventName     = 'PreToolUse'
            additionalContext = $Message
        }
    } | ConvertTo-Json -Depth 10 -Compress

    Write-Output $payload
    exit 0
}

function Emit-Deny {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Reason
    )

    $payload = @{
        hookSpecificOutput = @{
            hookEventName            = 'PreToolUse'
            permissionDecision       = 'deny'
            permissionDecisionReason = $Reason
        }
        systemMessage = $Reason
    } | ConvertTo-Json -Depth 10 -Compress

    Write-Output $payload
    exit 0
}

function Get-ToolText {
    param(
        [Parameter(Mandatory = $true)]
        $HookInput
    )

    switch ($HookInput.tool_name) {
        'Edit'       { return $HookInput.tool_input.new_string }
        'Write'      { return $HookInput.tool_input.content }
        'Bash'       { return $HookInput.tool_input.command }
        'PowerShell' { return $HookInput.tool_input.command }
        default      { return $null }
    }
}

function Get-OldText {
    # A Write replaces the whole file, so its "before" is the file on disk; without it a rewrite re-flags old code.
    param(
        [Parameter(Mandatory = $true)]
        $HookInput
    )

    switch ($HookInput.tool_name) {
        'Edit' {
            $old = $HookInput.tool_input.old_string
            if ($null -eq $old) { return '' }
            return $old
        }
        'Write' {
            $path = $HookInput.tool_input.file_path
            if (-not [string]::IsNullOrWhiteSpace($path) -and (Test-Path -LiteralPath $path -PathType Leaf)) {
                return [System.IO.File]::ReadAllText($path)
            }
            return ''
        }
        default { return '' }
    }
}

function Get-TargetPath {
    param(
        [Parameter(Mandatory = $true)]
        $HookInput
    )

    if ($HookInput.tool_name -in @('Edit', 'Write')) {
        return $HookInput.tool_input.file_path
    }
    return $null
}

function Get-FileExtension {
    # The lowercased extension with its dot, or an empty string.
    param(
        [string]$Path
    )

    $name = ($Path -replace '\\', '/') -replace '^.*/', ''
    $dot = $name.LastIndexOf('.')
    if ($dot -lt 0) { return '' }
    return $name.Substring($dot).ToLowerInvariant()
}

function Test-LooksLikeTestFile {
    param(
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }

    $p = $Path -replace '\\', '/'

    $insensitivePatterns = @(
        '\.test\.(ts|tsx|js|jsx|mjs|cjs)$',
        '\.spec\.(ts|tsx|js|jsx|mjs|cjs)$',
        '(^|/)test_[^/]*\.py$',
        '_test\.py$',
        '_test\.go$',
        '_test\.rs$',
        '_spec\.rb$',
        '(^|/)tests?/',
        '(^|/)__tests__/',
        '(^|/)spec/'
    )
    foreach ($pattern in $insensitivePatterns) {
        if ($p -match $pattern) { return $true }
    }

    # Case-sensitive so the .NET suffixes match OrderServiceTests.cs and MyApp.UnitTests/ but not Contest.cs.
    $sensitivePatterns = @(
        'Tests?\.cs$',
        '(^|/)[^/]*\.(Unit|Integration|Functional|Acceptance|E2E)?Tests?/'
    )
    foreach ($pattern in $sensitivePatterns) {
        if ($p -cmatch $pattern) { return $true }
    }
    return $false
}
