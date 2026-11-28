---
type: llm
---
PASS if the plan explicitly specifies: (1) creating contracts and dependency-wired queue items (e.g. `blueprint_import` or `contract_create` + `queue_add` with `dependsOn`), (2) running tasks in isolated Trestle worktrees (`worktree_create` / `queue_run_next` / `goal_loop_start`) with verification checks passing before merge, and (3) inspecting diff/preview (`worktree_diff` or `worktree_land` with `preview: true`) before landing.
FAIL if it describes generic git commands without Trestle's contract/queue/worktree workflow or skips verification before landing.
