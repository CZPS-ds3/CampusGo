# Git Branching Strategy & Workflow Guide

Team: Catalina, Yuri, Ryan, Yi Heng, Akil. Hosted on the DHBW WI GitLab. Follow these rules exactly, so the GitLab dashboard stays readable.

In the commands below, replace `[your_name]` with one of `catalina`, `yuri`, `ryan`, `yi_heng`, `akil`, and `[feature_name]` with a short lowercase description with hyphens (e.g. `auth-page`).

---

## 1. Branch Hierarchy Overview

```
main      ●───────────────────────────●───────────  stable, release-ready (protected)
           \                         /
develop     ●────●─────●─────●──────●───────●──────  integration branch (protected)
                  \   /       \     /
feature/[name]/x   ●─●         ●───●                short-lived, one per task
```

| Branch | Purpose | Who may push directly | Who may merge into it |
|---|---|---|---|
| `main` | Production/stable code, e.g. milestone releases and demos | Nobody | Project lead (Yi Heng), via MR from `develop`, after team agreement |
| `develop` | Integration branch where all finished features meet | Nobody | Any team member, via MR, **after 1 approval from another member** |
| `feature/[your_name]/[feature_name]` | New functionality | The author (own branch only) | – (merged into `develop` via MR) |
| `bugfix/[your_name]/[issue-number]-[desc]` | Bug fixes | The author | – |
| `docs/[your_name]/[desc]` | Documentation only | The author | – |
| `refactor/[your_name]/[desc]` | Code cleanup without behaviour change | The author | – |

**Naming rule:** `type/[your_name]/[short-description]`, lowercase, hyphens only, no spaces. Examples:

```
feature/catalina/auth-page
bugfix/yuri/42-qr-scan-crash
docs/akil/user-guide
refactor/ryan/leaderboard-queries
```

Short-lived branches are created from `develop`, merged back into `develop` and deleted afterwards. Never branch from `main`.

---

## 2. The 6-Step Feature Workflow

### Step 1 — Sync with the latest team code on `develop`

```bash
git checkout develop
git pull origin develop
```

### Step 2 — Create and switch to your feature branch

```bash
git checkout -b feature/[your_name]/[feature_name]
```

### Step 3 — Stage and commit using Conventional Commits

```bash
git status                       # see what changed
git add path/to/file             # stage specific files (avoid "git add ." unless you checked git status)
git commit -m "feat: add login page"
```

Format: `<type>: <short description>` (imperative, lowercase, under 72 characters, no trailing period).

| Type | Use for |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that is neither a fix nor a feature |
| `style` | Formatting only |
| `test` | Adding or updating tests |
| `chore` | Tooling, dependencies, config |
| `ci` | CI/CD changes |

Commit small and often. Before you push, run the checks:

```bash
npm run lint
npm test
```

### Step 4 — Push the branch to GitLab for the first time

```bash
git push -u origin feature/[your_name]/[feature_name]
```

Later pushes on the same branch only need `git push`.

### Step 5 — Open a Merge Request targeting `develop`

1. Open the link GitLab prints after the push, or go to **Code → Merge requests → New merge request**.
2. Set **Source** = your branch, **Target branch = `develop`** (never `main`).
3. Fill in the MR template (what it does, how it was tested, `Closes #<issue>`).
4. Assign a **reviewer** (a different team member) and wait for **1 approval**.
5. Resolve all review comments, then merge. Tick "Delete source branch" if offered.

Never merge your own MR without a peer review.

### Step 6 — Clean up after the merge

```bash
git checkout develop
git pull origin develop
git branch -d feature/[your_name]/[feature_name]                    # delete local branch
git push origin --delete feature/[your_name]/[feature_name]         # delete remote branch (skip if GitLab already did)
git fetch --prune                                                   # remove stale remote references
```

If `git branch -d` says the branch is "not fully merged" although the MR is merged (this happens with squash merges), check in GitLab that the MR is merged, then use `git branch -D ...`.

---

## 3. How to Handle Merge Conflicts

A conflict is normal — two people edited the same lines. Nothing is lost. Stay calm.

**Situation:** you want the latest `develop` inside your feature branch.

```bash
git checkout feature/[your_name]/[feature_name]
git fetch origin
git merge origin/develop
```

If Git prints `CONFLICT (content): Merge conflict in <file>`:

### Option A — Panic button: abort and go back to where you were

```bash
git merge --abort
```

Your branch is exactly as before the merge. Ask a teammate for help, or try again later.

### Option B — Resolve the conflicts

1. See which files conflict:
   ```bash
   git status
   ```
   Look under "Unmerged paths".
2. Open each file. Conflicts look like this:
   ```
   <<<<<<< HEAD
   your version
   =======
   the version from develop
   >>>>>>> origin/develop
   ```
3. Edit the file so only the correct final code remains, and delete the three marker lines (`<<<<<<<`, `=======`, `>>>>>>>`). If unsure which version is right, ask the author of the other change.
4. Mark the file as resolved and finish the merge:
   ```bash
   git add path/to/conflicted-file
   git commit            # accept the default merge message ("Merge remote-tracking branch 'origin/develop' ...")
   ```
5. Check that everything still works, then push:
   ```bash
   npm run lint
   npm test
   git push
   ```

**Tip:** pull `develop` into your branch regularly (every day you work on it) so conflicts stay small. If a conflict shows up in your MR on GitLab, do the same steps locally — do not resolve large conflicts in the browser.

---

## 4. Gold Rules Checklist

### Do ✅
- ✅ Always start from an up-to-date `develop` (`git pull origin develop`).
- ✅ One branch per task; keep merge requests small and focused.
- ✅ Put your name in the branch: `type/[your_name]/[description]`.
- ✅ Use Conventional Commits (`feat:`, `fix:`, `docs:` …).
- ✅ Run `npm run lint` and `npm test` before you push.
- ✅ Pull before you push if you work on the same branch from two machines.
- ✅ Get **1 approval from another member** before every merge.
- ✅ Delete your branch after it is merged.
- ✅ Log AI use in `ai-logs/[your_name]/` (see [CLAUDE.md](../CLAUDE.md)).

### Don't ❌
- ❌ Never push directly to `main` or `develop`.
- ❌ Never force-push (`git push --force`) to `main`, `develop` or a branch someone else uses.
- ❌ Never merge your own MR without a peer review.
- ❌ Never create branches from `main` — always from `develop`.
- ❌ Never commit `.env` files, API keys (Google Maps) or real student-card UIDs.
- ❌ Never commit generated files (`node_modules/`, `dist/`) — they are in `.gitignore`.
- ❌ Never leave a branch open for weeks — merge small and often.
- ❌ Never run `git reset --hard` or delete branches you don't own unless you know what you're doing.

### Release rule
`develop` is merged into `main` only by the project lead, via MR, when the team agrees `develop` is stable (e.g. at a milestone or demo). After that, `main` and `develop` stay in sync.
