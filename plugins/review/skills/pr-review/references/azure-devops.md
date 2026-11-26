# Azure DevOps

Read-only commands for a PR in Azure Repos, through the Azure CLI with the `azure-devops` extension. `--detect true` (the default) reads the organization and project from the git remote; pass `--org https://dev.azure.com/<org>` when it cannot. If a command fails on authentication, stop and ask the user to run `! az login` (or set `AZURE_DEVOPS_EXT_PAT`); do not guess at another route. For a branch target, a missing or signed-out CLI is not a blocker: review the branch without platform comments and say so under Coverage.

The REST calls go through `az devops invoke`, which shares the CLI's authentication. Its route parameters are the placeholders of the documented REST URL (`{project}`, `{repositoryId}`, `{pullRequestId}`). Always pass `--api-version 7.1`, since the command defaults to 5.0, and never pass `--http-method` or `--in-file`: the default GET is the only method this skill uses.

## Find the PR for a branch

```sh
az repos pr list --source-branch <branch> --status active -o json
```

`<branch>` is the name without `refs/heads/` or the remote prefix. No result means the branch has no PR. More than one (the same branch proposed into two targets) means asking the user which PR to read.

## Read the PR

```sh
az repos pr show --id <n> -o json
az repos pr work-item list --id <n> -o json
az boards work-item show --id <work item id> -o json
```

From `pr show` take `title`, `description`, `status` (`active`, `abandoned`, `completed`), `isDraft`, `sourceRefName`, `targetRefName`, `repository.id`, `repository.project.name` and `forkSource`. A non-null `forkSource` means the source branch lives in a fork, at `forkSource.repository.remoteUrl`. Do not take the head from `lastMergeSourceCommit`: it belongs to the last merge Azure DevOps computed for the PR, which can trail the source branch, for instance while the PR has conflicts. The head comes from the iterations below.

For each linked work item, the intent is in `fields."System.Title"`, `fields."System.Description"` and `fields."Microsoft.VSTS.Common.AcceptanceCriteria"`. The last two are HTML; read the text, not the markup.

## Read the iterations

```sh
az devops invoke --area git --resource pullRequestIterations \
  --route-parameters project=<project> repositoryId=<repository.id> pullRequestId=<n> \
  --api-version 7.1 -o json
```

Each push to the source branch is one iteration in `value`, numbered by `id` from 1. The highest `id` is the current state: its `sourceRefCommit.commitId` is the head to review. Each iteration's `reason` says how it arrived; `forcePush` or `rebase` on any iteration after the one whose `sourceRefCommit` matches a saved report's head means the history was rewritten, and Re-review starts over.

## Get the code

```sh
git fetch origin <sourceRefName> <targetRefName>
git cat-file -e <head>
base=$(git merge-base "origin/<target branch>" <head>)
git diff --stat $base <head>
git diff $base <head>
git worktree add --detach "<scratchpad>/review-azure-devops-<n>" <head>
```

`<target branch>` is `targetRefName` without `refs/heads/`. For a fork, fetch the source branch from `forkSource.repository.remoteUrl` instead of `origin`. If `git cat-file` fails, the source branch moved after the iterations were read; read them again and use the new head. Do not use `az repos pr checkout`, which switches the user's working tree.

## Read existing threads

```sh
az devops invoke --area git --resource pullRequestThreads \
  --route-parameters project=<project> repositoryId=<repository.id> pullRequestId=<n> \
  --api-version 7.1 -o json
```

Skip threads with `isDeleted` true, and threads whose comments all have `commentType` `system` (votes, pushes, policy updates). Map the rest onto the skill's comment shape:

| Thread field | Comment shape |
| --- | --- |
| `threadContext` null | Change-level comment, no location |
| `threadContext.rightFileStart.line` | `threadContext.filePath` at that line, on the new side |
| `threadContext.leftFileStart.line` with no `rightFileStart` | `threadContext.filePath` at that line, on the old side: a comment on removed code, located in the merge-base version |
| `status` `active` or `pending` | `open` |
| `status` `fixed` or `closed` | `resolved` |
| `status` `wontFix` or `byDesign` | `dismissed` |
| `status` `unknown` | `unknown` |

Line numbers refer to the iteration the thread was left on, in `pullRequestThreadContext.iterationContext.secondComparingIteration`. When that is not the current iteration, the code may have moved: find the line again by the code the comment discusses before treating it as a location at the head. The first comment in `comments` is the original; the rest are replies, with the author in `author.displayName`.
