# GitHub

Read-only commands for a PR on GitHub, through `gh`. Every `gh api` call here is a REST GET; never add `--method` or `-f`/`-F` fields to one, which turns it into a write, and never call `gh api graphql`. If `gh` reports it is not authenticated, stop and ask the user to run `! gh auth login`. For a branch target, a missing or signed-out `gh` is not a blocker: review the branch without platform comments and say so under Coverage.

## Find the PR for a branch

```sh
gh pr list --head <branch> --state open --json number,url,baseRefName
```

No result means the branch has no PR. More than one means asking the user which PR to read.

## Read the PR

```sh
gh pr view <n> --json number,title,body,state,isDraft,author,baseRefName,headRefName,headRefOid,isCrossRepository,url,closingIssuesReferences
gh issue view <issue> --json title,body
```

`state` is `OPEN`, `CLOSED` or `MERGED`. `isCrossRepository` true means the head lives in a fork. `headRefOid` is the head to review.

## Get the code

```sh
git fetch origin "pull/<n>/head" <baseRefName>
base=$(git merge-base "origin/<baseRefName>" <headRefOid>)
git diff --stat $base <headRefOid>
git diff $base <headRefOid>
git worktree add --detach "<scratchpad>/review-github-<n>" <headRefOid>
```

`pull/<n>/head` works for fork PRs too. Do not use `gh pr checkout`, which switches the user's working tree. GitHub keeps no push history through these commands, so Re-review detects a rewritten history with `git merge-base --is-ancestor` alone.

## Read existing comments

```sh
gh api "repos/{owner}/{repo}/pulls/<n>/reviews" --paginate
gh api "repos/{owner}/{repo}/pulls/<n>/comments" --paginate
gh pr view <n> --json comments
```

Review bodies and `gh pr view` comments are change-level. Inline comments carry `path`, `line`, `side` and `in_reply_to_id`; group each reply under the comment it answers to rebuild the threads. An inline comment whose `line` is null sits on code that has since changed: `original_line` locates it at `original_commit_id`, so find the line again by the code it discusses. The REST API does not expose whether a thread is resolved, so every thread's status is `open` unless a reply rejects the point (won't fix, by design, out of scope), which makes it `dismissed`. A reply saying "fixed" leaves it `open` until the code shows the fix.
