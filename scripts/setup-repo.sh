#!/usr/bin/env bash
# One-time repository bootstrap for Campus & City Quest.
# Run from the repository root in Git Bash / macOS / Linux:  bash scripts/setup-repo.sh
#
# Optional (protects branches in GitLab via API):
#   export GITLAB_TOKEN=<personal access token with api scope, Maintainer/Owner>
#   export GITLAB_PROJECT_ID=<numeric project ID, shown on the project overview page>
#   export GITLAB_URL=https://wi-git.heilbronn.dhbw.de   # default (DHBW WI GitLab)
set -euo pipefail

MEMBERS=(catalina yuri ryan yi_heng akil)

echo "==> Creating folders"
for m in "${MEMBERS[@]}"; do
  mkdir -p "ai-logs/$m"
  [ -f "ai-logs/$m/.gitkeep" ] || touch "ai-logs/$m/.gitkeep"
done
mkdir -p .gitlab/issue_templates .gitlab/merge_request_templates

echo "==> Creating develop branch"
git checkout main
git pull origin main || true
if git show-ref --quiet refs/heads/develop; then
  git checkout develop
else
  git checkout -b develop
fi

echo "==> Committing baseline on develop"
git add -A
if ! git diff --cached --quiet; then
  git commit -m "chore: add repository baseline (CLAUDE.md, docs/git-workflow.md, ai-logs, templates)"
fi

echo "==> Pushing baseline to main first, then develop"
# The initial baseline is the only allowed direct push to main; protection is applied afterwards.
git checkout main
git merge --no-ff develop -m "chore: initial repository baseline"
git push origin main
git push -u origin develop

if [ -n "${GITLAB_TOKEN:-}" ] && [ -n "${GITLAB_PROJECT_ID:-}" ]; then
  API="${GITLAB_URL:-https://wi-git.heilbronn.dhbw.de}/api/v4/projects/${GITLAB_PROJECT_ID}"
  H="PRIVATE-TOKEN: ${GITLAB_TOKEN}"

  echo "==> Protecting main and develop (no direct push; Developers may merge)"
  for b in main develop; do
    # main: only Maintainers merge (project lead); develop: Developers may merge via MR
    if [ "$b" = "main" ]; then LEVEL=40; else LEVEL=30; fi
    curl -s -X DELETE -H "$H" "$API/protected_branches/$b" > /dev/null || true
    curl -s -X POST -H "$H" "$API/protected_branches"       --data "name=$b&push_access_level=0&merge_access_level=$LEVEL&allow_force_push=false" > /dev/null
    echo "    protected: $b"
  done

  echo "==> Requiring MR pipelines/discussions resolved and disabling self-approval"
  curl -s -X PUT -H "$H" "$API" \
    --data "only_allow_merge_if_all_discussions_are_resolved=true&remove_source_branch_after_merge=true&merge_method=merge" > /dev/null
  curl -s -X POST -H "$H" "$API/approvals" \
    --data "merge_requests_author_approval=false&disable_overriding_approvers_per_merge_request=true" > /dev/null || true

  echo "==> Creating approval rule: 1 approval required on protected branches (Premium tier only)"
  curl -s -X POST -H "$H" "$API/approval_rules" \
    --data "name=Peer review&approvals_required=1&rule_type=regular" > /dev/null || true
else
  echo "==> GITLAB_TOKEN / GITLAB_PROJECT_ID not set: configure protection manually (see README steps)."
fi

git checkout develop
echo "Done."
