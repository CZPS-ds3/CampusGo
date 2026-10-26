# Git Branching Strategy & Workflow Guide

Team: Catalina, Yuri, Ryan, Yi Heng, Akil. Hosted on the DHBW WI GitLab. Follow these rules exactly, so the GitLab dashboard stays readable.

In the commands below, replace `[your_name]` with one of `catalina`, `yuri`, `ryan`, `yi_heng`, `akil`.

---

## 1. Branch Hierarchy Overview

```
main                                   stable/release only (protected)
 └─ preproduction                      integration branch (protected)
     └─ wip/                           folder for work in progress (not a branch)
         ├─ catalina/   feature    bugfix
         ├─ ryan/       feature    bugfix
         ├─ yuri/       feature    bugfix
         ├─ akil/       feature    bugfix
         └─ yi_heng/    feature    bugfix
```

Everyone owns **two personal branches**, side by side: `wip/[your_name]/feature` for new work and `wip/[your_name]/bugfix` for fixes. They exist permanently — you do not create or delete them. GitLab shows them grouped like folders, so you can see at a glance who is working on what.

| Branch | Purpose | Direct push | Who may merge into it, and how |
|---|---|---|---|
| `main` | Stable, demo/release-ready code | **Nobody** | **Nobody merges a feature or bugfix branch here.** Only the project lead (Yi Heng) merges `preproduction` → `main` via MR, at a milestone, after team agreement |
| `preproduction` | Integration branch: all finished work meets and is tested here | **Nobody** | Any team member, via MR from their own `feature` or `bugfix` branch, **after 1 approval from another member** |
| `wip/[your_name]/feature` | Your new functionality (also documentation and refactoring — use a `DOCS:`/`REFACTOR:` title tag) | The owner only | Merged into `preproduction` via MR |
| `wip/[your_name]/bugfix` | Your fixes for existing features | The owner only | Merged into `preproduction` via MR |

> **Why `wip/[name]/feature` and not `wip/[name]/feature/[task]`?** Git cannot have a branch named `wip/catalina/feature` and branches named `wip/catalina/feature/quiz-screen` at the same time (the names clash). Because the team wants the branch tree above, each person works on their own `feature` and `bugfix` branch, and the *task* is named in the commit messages and in the Merge Request title. `wip` and `[your_name]` are only folder prefixes.

**Never branch from `main` and never open an MR from a feature/bugfix branch to `main`.** Never push to someone else's branch.

### Titles for issues and Merge Requests

Because the branch does not name the task, the **MR title must**. Start it with a type tag:

| Tag | Example title |
|---|---|
| `FEATURE:` | `FEATURE: Build team invitation accept and reject (BR06)` |
| `BUG-FIX:` | `BUG-FIX: Fixing feature 1 issue of OTP code rejected after a resend` |
| `DOCS:` | `DOCS: Add user guide for checkpoint setup` |
| `REFACTOR:` | `REFACTOR: Simplify user queries` |

Commit messages use Conventional Commits (`feat:`, `fix:` …, see Step 3).

### One task per branch at a time
Finish one task (MR merged) before starting the next one on the same branch, so MRs stay small and separate. If you must work on a fix while a feature MR is still open, use your `bugfix` branch for it.

---

## 2. The 6-Step Workflow

### Step 1 — Sync your branch with the latest team code

```bash
git checkout wip/[your_name]/feature      # or wip/[your_name]/bugfix
git fetch origin
git merge origin/preproduction            # bring in everything the team merged
npm ci
```

### Step 2 — Check that you are on the right branch

```bash
git branch                                # the * marks your current branch
git status
```

Features go on `wip/[your_name]/feature`, fixes on `wip/[your_name]/bugfix`. If `git status` shows `main` or `preproduction`, switch first (Step 1).

### Step 3 — Stage and commit using Conventional Commits

```bash
git status                       # see what changed
git add path/to/file             # stage specific files (avoid "git add ." unless you checked git status)
git commit -m "feat: add quiz timer"
```

Format: `<type>: <short description>` (imperative, lowercase, under 72 characters, no trailing period). The commit message names the task.

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

### Step 4 — Push your branch to GitLab

```bash
git push origin wip/[your_name]/feature
```

The branch already exists on GitLab, so a plain `git push` works too.

### Step 5 — Open a Merge Request targeting `preproduction`

1. Go to **Code → Merge requests → New merge request**.
2. Set **Source** = your branch (`wip/[your_name]/feature` or `…/bugfix`), **Target branch = `preproduction`** (never `main`).
3. Title with a tag, e.g. `FEATURE: …` or `BUG-FIX: Fixing feature 1 issue of …`.
4. Fill in the MR template (what it does, how it was tested, `Closes #<issue>`).
5. Assign a **reviewer** (a different team member) and wait for **1 approval**.
6. Resolve all review comments, then merge.
7. **Untick "Delete source branch"** — your personal branches must stay.

Never merge your own MR without a peer review. Prefer a normal merge commit (no squash), so your branch stays in sync with `preproduction`.

### Step 6 — Re-sync after the merge (do not delete your branch)

```bash
git checkout wip/[your_name]/feature
git fetch origin
git merge origin/preproduction           # your merged work comes back; your branch is up to date again
git push origin wip/[your_name]/feature
```

You are ready for the next task. Do **not** run `git branch -d` or `git push origin --delete` on `wip/[your_name]/…` branches.

---

## 3. Releasing to `main` (project lead only)

At a milestone, when `preproduction` is tested and the team agrees it is stable:

1. Project lead opens an MR with **Source = `preproduction`**, **Target = `main`**, title `RELEASE: Milestone [n]`.
2. At least 1 other member approves.
3. Project lead merges. Do **not** delete `preproduction`.

Afterwards everyone updates their branches with Step 1 (`git merge origin/preproduction`).

---

## 4. How to Handle Merge Conflicts

A conflict is normal — two people edited the same lines. Nothing is lost. Stay calm.

**Situation:** you want the latest `preproduction` inside your branch (Step 1 or Step 6).

```bash
git checkout wip/[your_name]/feature
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

**Tip:** merge `origin/preproduction` into your branch every day you work on it, so conflicts stay small. If a conflict shows up in your MR on GitLab, resolve it locally with the steps above.

---

## 5. Gold Rules Checklist

### Do ✅
- ✅ Work only on **your own** `wip/[your_name]/feature` or `wip/[your_name]/bugfix` branch.
- ✅ Start every session with `git fetch origin` and `git merge origin/preproduction`.
- ✅ Name the task in the commit messages and in the MR title (`FEATURE:`, `BUG-FIX:`, `DOCS:`, `REFACTOR:`).
- ✅ Use Conventional Commits (`feat:`, `fix:`, `docs:` …).
- ✅ Run `npm run check` before you push.
- ✅ Get **1 approval from another member** before every merge.
- ✅ Keep MRs small: one task per MR.
- ✅ Log AI use in `ai-logs/[your_name]/` (see [CLAUDE.md](../CLAUDE.md)).

### Don't ❌
- ❌ Never merge a feature/bugfix branch into `main`.
- ❌ Never push directly to `main` or `preproduction`.
- ❌ Never force-push (`git push --force`) to `main`, `preproduction` or any branch someone else uses.
- ❌ Never merge your own MR without a peer review.
- ❌ Never delete your personal `wip/…` branches and never tick "Delete source branch" on your MR.
- ❌ Never commit to or push to someone else's branch without asking them.
- ❌ Never commit `.env` files, API keys, secrets or real student location data.
- ❌ Never commit generated files (`node_modules/`, `dist/`) — they are in `.gitignore`.
- ❌ Never use another package manager; the project uses **npm only**.
- ❌ Never leave a task open for weeks — merge small and often.
- ❌ Never run `git reset --hard` unless you know what you're doing.
