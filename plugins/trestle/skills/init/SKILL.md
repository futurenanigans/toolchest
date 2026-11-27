---
name: init
description: Initialize and configure Trestle user defaults (~/.trestle/config.json) and per-repo settings (.trestle/config.json or local repo config), including agent CLI model/effort tiers, escalation policy, custom verification checks (fast vs heavy), and memory/parallelism resource limits.
---

# Trestle Initialization & Configuration (`/trestle:init`)

Configure Trestle cleanly at two layers:
- **User defaults (`~/.trestle/config.json`):** Personal CLI model/effort tiers, escalation policy, custom Windows/runner commands, and default resource limits. Used whenever a repository does not override them.
- **Per-repo config:**
  - **Checked-in (`<repo>/.trestle/config.json`, `inRepo: true`):** Shared repo verification commands (`checks.commands`), `includeMortise`, and recommended `resources.maxParallel`.
  - **Local (`~/.trestle/<repo-key>/config.json`, `inRepo: false`):** Personal overrides for this repo without modifying git-tracked files.

## Step-by-Step Setup Workflow

### 1. Inspect Current State & Environment
1. Call `config_get` (with `repoRoot` and `scope: "effective"`) to see current defaults and whether user/repo configs already exist.
2. Check which external CLIs are installed and authenticated on this machine (`claude`, `codex`, `opencode`, `agy`, `pi`) and inspect the repository root for project files (`Cargo.toml`, `package.json`, `*.sln`/`*.csproj`, `go.mod`, `pyproject.toml`, `.mortise/config.json`).

### 2. Configure User Defaults (`scope: "user"`)
Ask the user (or confirm sensible defaults) for:
- **Default CLI & Tier:** e.g. `defaultCli: "claude"`, `defaultTier: "cheap"`, `maxIterations: 10`.
- **Model & Effort Tiers per CLI (`agents.<cli>.tiers`):** Map `cheap`, `balanced`, and `strong` to `{ model, effort }` entries (valid effort levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`).
  - Example:
    ```json
    {
      "defaultCli": "claude",
      "maxIterations": 10,
      "escalation": {
        "enabled": true,
        "tiers": ["cheap", "balanced", "strong"],
        "stepAfterFailures": 2,
        "fallbackClis": ["claude", "codex"]
      },
      "agents": {
        "claude": {
          "tiers": {
            "cheap": { "model": "claude-haiku-5-5", "effort": "low" },
            "balanced": { "model": "claude-sonnet-5-5", "effort": "medium" },
            "strong": { "model": "claude-opus-5-5", "effort": "high" }
          }
        },
        "codex": {
          "tiers": {
            "cheap": { "model": "gpt-6-luna", "effort": "low" },
            "balanced": { "model": "gpt-6.2-sol", "effort": "medium" },
            "strong": { "model": "gpt-6.2-sol", "effort": "high" }
          }
        },
        "opencode": {
          "maxTier": "cheap",
          "quota": { "fiveHourMaxTokens": 500000, "weeklyMaxTokens": 3000000 },
          "tiers": {
            "cheap": { "model": "opencode-go/deepseek-v4.1-flash", "effort": "low" },
            "balanced": { "model": "opencode-go/glm-5.3", "effort": "medium" },
            "strong": { "model": "opencode-go/deepseek-v4-pro", "effort": "high" }
          }
        },
        "agy": {
          "maxTier": "balanced",
          "quota": { "fiveHourMaxTokens": 1000000, "weeklyMaxTokens": 6000000 },
          "tiers": {
            "cheap": { "model": "gemini-3.8-flash-low", "effort": "low" },
            "balanced": { "model": "gemini-4-neon-medium", "effort": "medium" },
            "strong": { "model": "gemini-4-neon-high", "effort": "high" }
          }
        },
        "pi": {
          "maxTier": "cheap",
          "tiers": {
            "cheap": { "model": "anthropic/claude-haiku-5-5", "effort": "medium" },
            "balanced": { "model": "openai/gpt-6.2-sol", "effort": "medium" },
            "strong": { "model": "openai/gpt-6.2-sol", "effort": "high" }
          }
        }
      },
      "resources": {
        "maxParallel": 2,
        "minFreeMemMb": 2048,
        "partitionThreads": true
      }
    }
    ```
- **Windows / custom runners (if applicable):** Set `agents.<cli>.command` (e.g. `["bun", "x", "@openai/codex"]`) if standalone binaries are blocked or wrapped.
- Save via `config_set` (`scope: "user"`).

### 3. Configure Per-Repo Checks & Resource Limits (`scope: "repo"`)
Ask whether the user wants repo config checked in (`inRepo: true` → `<repo>/.trestle/config.json`) or kept local (`inRepo: false` → `~/.trestle/<repo-key>/config.json`):
- **Verification checks (`checks`):**
  - Define `commands` tailored to the repo, marking fast lint/typecheck/unit checks with `heavy: false` (so they never block behind slow builds/mutation runs) and leaving full builds/integration/mutation checks as `heavy: true` (default).
  - Add optional `metricPattern` (regex with capture group) on benchmark commands if tracking a scalar metric.
  - Set `includeMortise` and `timeoutMs` as appropriate.
- **Resource limits (`resources`):**
  - For heavy compiled repos (Rust workspaces, large .NET solutions): recommend `maxParallel: 1` (or `maxParallel: 2` with `perAgentMaxMemMb` and `partitionThreads: true`).
  - For lightweight TS/Python/Go repos: `maxParallel: 2` to `3` works well.
- Save via `config_set` (`scope: "repo"`, `repoRoot`, `inRepo`).

### 4. Verify Configuration
1. Call `config_get` (`scope: "effective"`, `repoRoot`) and show the user the resolved config paths, checks, tiers, and resource limits.
2. Optionally run `check_run` on `repoRoot` to verify the configured repo checks execute cleanly before launching agents.
3. Remind the user to open **`/trestle`** to view the live sidepanel.
