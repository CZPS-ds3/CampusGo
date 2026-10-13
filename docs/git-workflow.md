# Git Branching Strategy & Workflow Guide

Team: Catalina, Yuri, Ryan, Yi Heng, Akil. Hosted on the DHBW WI GitLab. Follow these rules exactly, so the GitLab dashboard stays readable.

In the commands below, replace `[your_name]` with one of `catalina`, `yuri`, `ryan`, `yi_heng`, `akil`, and `[feature_name]` with a short lowercase description with hyphens (e.g. `quiz-timer`).

---

## 1. Branch Hierarchy Overview

```
main                                   stable/release only (protected)
 └─ preproduction                      integration branch (protected)
     └─ wip/                           folder for work in progress (not a branch)
         ├─ catalina/   feature/<task>    bugfix/<task>
         ├─ ryan/       feature/<task>    bugfix/<task>
         ├─ yuri/       feature/<task>    bugfix/<task>
         ├─ akil/       feature/<task>    bugfix/<task>
         └─ yi_heng/    feature/<task>    bugfix/<task>
```

Everyone has the same two kinds of branches side by side: **`feature`** for new work and **`bugfix`** for fixes. GitLab shows the branches grouped like folders, so you can see at a glance who is working on what.

| Branch | Purpose | Direct push | Who may merge into it, and how |
|---|---|---|---|
| `main` | Stable, demo/release-ready code | **Nobody** | **Nobody merges a feature or bugfix branch here.** Only the project lead (Yi Heng) merges `preproduction` → `main` via MR, at a milestone, after team agreement |
| `preproduction` | Integration branch: all finished work meets and is tested here | **Nobody** | Any team member, via MR from their own branch, **after 1 approval from another member** |
| `wip/[your_name]/feature/[task]` | New functionality (also documentation and refactoring — use a `DOCS:`/`REFACTOR:` title tag) | The author only | Merged into `preproduction` via MR |
| `wip/[your_name]/bugfix/[feature]-[issue]` | Fix for an existing feature | The author only | Merged into `preproduction` via MR |

> **Why `wip/` and not a branch called `wip`?** Git cannot have a branch named `wip` and branches named `wip/catalina/...` at the same time, so `wip` is only a folder prefix. For the same reason there is no branch called `catalina`: it is just the next folder level. The `wip/<name>/...` branches appear when a person creates their first branch; nothing has to be created in advance.

Short-lived branches are created from `preproduction`, merged back into `preproduction` and deleted afterwards. **Never branch from `main` and never open an MR from a feature/bugfix branch to `main`.**

### Naming rule

`wip/[your_name]/[feature|bugfix]/[short-description]` — lowercase, hyphens only, no spaces. Names: `catalina`, `ryan`, `yuri`, `akil`, `yi_heng`.

```
wip/catalina/feature/quiz-screen
wip/yuri/feature/geofence-check
wip/ryan/bugfix/leaderboard-wrong-rank
wip/yuri/bugfix/feature-1-gps-jitter
wip/akil/feature/docs-user-guide
```

### Titles for issues and Merge Requests

Start the title with a type tag so the board is readable at a glance:

| Tag | Example title |
|---|---|
| `FEATURE:` | `FEATURE: Show first question within 1.5 s of pressing Start` |
| `BUG-FIX:` | `BUG-FIX: Fixing feature 1 issue of GPS jitter cancelling the quiz` |
| `DOCS:` | `DOCS: Add user guide for checkpoint setup` |
| `REFACTOR:` | `REFACTOR: Simplify user queries` |

Commit messages still use Conventional Commits (`feat:`, `fix:` …, see Step 3).

---

## 2. The 6-Step Feature Workflow

### Step 1 — Sync with the latest team code on `preproduction`

```bash
git checkout preproduction
git pull origin preproduction
npm ci
```

### Step 2 — Create and switch to your branch

```bash
# new feature
git checkout -b wip/[your_name]/feature/[feature_name]

# or a bug fix
git checkout -b wip/[your_name]/bugfix/[feature_name]-[issue]
```

### Step 3 — Stage and commit using Conventional Commits

```bash
git status                       # see what changed
git add path/to/file             # stage specific files (avoid "git add ." unless you checked git status)
git commit -m "feat: add quiz timer"
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

Commit small and often. Before you push, run all checks (ESLint, Prettier, tests):

```bash
npm run check
```

### Step 4 — Push the branch to GitLab for the first time

```bash
git push -u origin wip/[your_name]/feature/[feature_name]
```

Later pushes on the same branch only need `git push`.

### Step 5 — Open a Merge Request targeting `preproduction`

1. Open the link GitLab prints after the push, or go to **Code → Merge requests → New merge request**.
2. Set **Source** = your branch, **Target branch = `preproduction`** (never `main`).
3. Title with a tag, e.g. `FEATURE: …` or `BUG-FIX: Fixing feature 1 issue of …`.
4. Fill in the MR template (what it does, how it was tested, `Closes #<issue>`).
5. Assign a **reviewer** (a different team member) and wait for **1 approval**.
6. Resolve all review comments, then merge. Tick "Delete source branch" if offered.

Never merge your own MR without a peer review.

### Step 6 — Clean up after the merge

```bash
git checkout preproduction
git pull origin preproduction
git branch -d wip/[your_name]/feature/[feature_name]                    # delete local branch
git push origin --delete wip/[your_name]/feature/[feature_name]         # delete remote branch (skip if GitLab already did)
git fetch --prune                                                   # remove stale remote references
```

If `git branch -d` says the branch is "not fully merged" although the MR is merged (this happens with squash merges), check in GitLab that the MR is merged, then use `git branch -D ...`.

---

## 3. Releasing to `main` (project lead only)

At a milestone, when `preproduction` is tested and the team agrees it is stable:

1. Project lead opens an MR with **Source = `preproduction`**, **Target = `main`**, title `RELEASE: Milestone [n]`.
2. At least 1 other member approves.
3. Project lead merges. Do **not** delete `preproduction`.

```bash
git checkout main
git pull origin main
git checkout preproduction
git pull origin preproduction
```

---

## 4. How to Handle Merge Conflicts

A conflict is normal — two people edited the same lines. Nothing is lost. Stay calm.

**Situation:** you want the latest `preproduction` inside your branch.

```bash
git checkout wip/[your_name]/feature/[feature_name]
git fetch origin
git merge origin/preproduction
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
   the version from preproduction
   >>>>>>> origin/preproduction
   ```
3. Edit the file so only the correct final code remains, and delete the three marker lines (`<<<<<<<`, `=======`, `>>>>>>>`). If unsure which version is right, ask the author of the other change.
4. Mark the file as resolved and finish the merge:
   ```bash
   git add path/to/conflicted-file
   git commit            # accept the default merge message
   ```
5. Check that everything still works, then push:
   ```bash
   npm run check
   git push
   ```

**Tip:** pull `preproduction` into your branch every day you work on it, so conflicts stay small. If a conflict shows up in your MR on GitLab, resolve it locally with the steps above.

---

## 5. Gold Rules Checklist

### Do ✅
- ✅ Always start from an up-to-date `preproduction` (`git pull origin preproduction`).
- ✅ One branch per task; keep merge requests small and focused.
- ✅ Put your name in the branch: `wip/[your_name]/feature/...` or `wip/[your_name]/bugfix/...`.
- ✅ Tag MR and issue titles: `FEATURE:`, `BUG-FIX:`, `DOCS:`, `REFACTOR:`.
- ✅ Use Conventional Commits (`feat:`, `fix:`, `docs:` …).
- ✅ Run `npm run check` before you push.
- ✅ Pull before you push if you work on the same branch from two machines.
- ✅ Get **1 approval from another member** before every merge.
- ✅ Delete your branch after it is merged.
- ✅ Log AI use in `ai-logs/[your_name]/` (see [CLAUDE.md](../CLAUDE.md)).

### Don't ❌
- ❌ Never merge a feature/bugfix branch into `main`.
- ❌ Never push directly to `main` or `preproduction`.
- ❌ Never force-push (`git push --force`) to `main`, `preproduction` or a branch someone else uses.
- ❌ Never merge your own MR without a peer review.
- ❌ Never create branches from `main` — always from `preproduction`.
- ❌ Never commit `.env` files, API keys, secrets or real student location data.
- ❌ Never commit generated files (`node_modules/`, `dist/`) — they are in `.gitignore`.
- ❌ Never use another package manager; the project uses **npm only**.
- ❌ Never leave a branch open for weeks — merge small and often.
- ❌ Never run `git reset --hard` or delete branches you don't own unless you know what you're doing.
