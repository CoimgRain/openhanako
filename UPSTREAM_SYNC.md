# Upstream Sync Workflow

This project may contain local custom changes on top of an original open-source repository. The goal of this workflow is:

- keep local commits and product changes;
- pull future updates from the original project;
- merge both sides when they do not conflict;
- resolve conflicts deliberately when they touch the same code.

## Terms

- `origin`: your own remote repository.
- `upstream`: the original open-source repository.
- local branch: the branch where this customized project is developed.
- sync branch: a temporary branch used to merge upstream updates safely.

## One-Time Setup

Check existing remotes:

```bash
git remote -v
```

Add the original project as `upstream`:

```bash
git remote add upstream https://github.com/original-owner/original-repo.git
```

If `upstream` already exists but points to the wrong URL:

```bash
git remote set-url upstream https://github.com/original-owner/original-repo.git
```

Verify:

```bash
git remote -v
```

## Before Syncing

Make sure local work is committed or intentionally stashed. Do not sync with important uncommitted changes mixed into the worktree.

```bash
git status --short
```

Recommended:

```bash
git add <files>
git commit -m "describe local change"
```

Or, only when the changes are temporary:

```bash
git stash push -m "before upstream sync"
```

## Safe Sync Flow

Create a temporary sync branch from your current local branch:

```bash
git checkout -b sync-upstream-YYYY-MM-DD
```

Fetch the original project:

```bash
git fetch upstream
```

Merge the original project's main branch:

```bash
git merge upstream/main
```

If the original project uses `master` instead of `main`:

```bash
git merge upstream/master
```

## If There Is No Conflict

Git will create a merge commit automatically or ask you to confirm one. Then run the project checks:

```bash
npm test
```

If everything passes, merge the sync branch back into your normal branch:

```bash
git checkout <your-normal-branch>
git merge sync-upstream-YYYY-MM-DD
```

Then push your updated branch:

```bash
git push origin <your-normal-branch>
```

## If There Are Conflicts

Git will mark conflicted files. List them:

```bash
git status --short
```

Open each conflicted file and resolve the conflict markers:

```text
<<<<<<< HEAD
your local version
=======
upstream version
>>>>>>> upstream/main
```

The correct resolution is not always "ours" or "theirs". Usually the goal is to preserve local behavior while incorporating upstream fixes.

After resolving:

```bash
git add <resolved-files>
git commit
```

Then run tests:

```bash
npm test
```

## Important Safety Rules

- Do not use `git reset --hard` during sync unless you intentionally want to throw away local work.
- Do not use `git checkout -- <file>` on conflicted files unless you intentionally want to discard one side.
- Always sync on a temporary branch first.
- Keep local customizations in small, named commits. Future upstream merges are much easier when each local change has a clear purpose.
- Prefer resolving conflicts by reading the code and keeping both valid behaviors when possible.

## Useful Inspection Commands

Show commits that exist locally but not upstream:

```bash
git log --oneline upstream/main..HEAD
```

Show commits from upstream that are not in the current branch:

```bash
git log --oneline HEAD..upstream/main
```

Preview changed files before merging:

```bash
git diff --stat HEAD..upstream/main
```

Show the merge base shared by both histories:

```bash
git merge-base HEAD upstream/main
```

## Practical Rule

As long as local changes are committed, upstream updates can usually be merged without losing them. If files do not overlap, Git merges automatically. If files overlap, resolve the conflict on a sync branch, test, and only then merge back.
