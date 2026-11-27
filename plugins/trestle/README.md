# trestle

Runs other coding agent CLIs (`claude`, `codex`, `opencode`, `agy`, `pi`) in isolated git worktrees against a contract whose criteria start failed, and only lands a worktree once its checks pass. An MCP server supervises the agents and runs the checks; a `/trestle` pane shows agents, worktrees, contracts, check results and the queue as they change.

Pass or fail comes from exit codes and structured test reports (`libtest-json`, `nextest-json`, `junit-xml`), never from what an agent says about its own work. [`AGENTS.md`](AGENTS.md) holds that rule for anyone changing the code.

## Skills

| Skill | Use |
| --- | --- |
| `orchestrate` | Write a contract, run a goal loop in one worktree or competing drafts in several, then compare, land and clean up. Also covers the persistent queue: `queue_add` with `dependsOn`, then `queue_run_next` to dispatch ready items in parallel. |
| `init` | Set user defaults in `~/.trestle/config.json` (model and effort tiers per CLI, the escalation ladder, resource limits) and repo checks in `<repo>/.trestle/config.json`, or a local override under `~/.trestle/<repo-key>/`. |

A goal loop runs the checks after every iteration and moves up the tier ladder (by default `cheap`, then `balanced`, then `strong`) after two failed iterations. Fast checks (`heavy: false`) run concurrently; heavy ones take a mutex so two builds never share a machine. Without configured checks, Trestle detects them from `Cargo.toml`, `package.json`, `*.sln`, `go.mod` or `pyproject.toml`, and fails closed when it finds none.

Worktrees live under `<repo>/.trestle-wt/`; queue, contract and experiment state under `~/.trestle/<repo-key>/`. `worktree_land` leaves `.env` and `.env.local` out of the merge and aborts on a conflict.

## Requirements

`bun` and `git` on `PATH`, and each agent CLI you want to drive, installed and signed in. A run that hits a login or usage-limit error fails fast with `login_failed` or `usage_limit` instead of burning iterations.

## Development

```bash
bun run test        # unit tests in src/__tests__
bun run test:plugin # pane and hook tests in tests/
bun run typecheck
bun run validate
```

`bun run test:live` drives the real CLIs and spends tokens.
