# AI Log — Ubuntu/Docker deployment check and GitLab pipeline fix

- **Date:** 2026-11-13
- **Team member:** Yi Heng
- **AI tool / model:** Claude Code, Opus
- **Objective:** Check that the app can be deployed to a domain on a Linux (Ubuntu) server with Docker, and that the
  GitLab pipeline passes.

## AI Prompts Used
1. "can you check if it is able to deploy to be deployed to a domain using linux ubuntu, and check that it passes the
   pipelines"
2. After a laptop restart: "help me check what are the newest changes and help me to revert all of it to the newest
   version"
3. "can you run all the check and make sure that the linux and docker works. only run what is needed to check. and
   help me to add the logs also"

## Decisions Made
- The GitLab pipeline page needs a login, so the AI replayed the `.gitlab-ci.yml` jobs locally in the same Linux
  Docker images (node:22, node:24-bookworm, python:3.11, mysql:8.4) on a clean copy of the branch.
- Found a real pipeline failure: the `docker-config` job exited with code 1, because `docker-compose.prod.yml` requires
  SESSION_SECRET, OTP_SECRET, SMTP_HOST, SMTP_FROM and TRUSTED_PROXIES but the job's dummy `.env.production` only set
  three values. Fixed in `.gitlab-ci.yml` (dummy values only, no real secrets) and added the regression test
  `test_bug_the_pipeline_docker_check_missed_required_production_settings_br52`, which reads every required variable of
  the compose file, so a future required setting cannot break the job unnoticed.
- Production stack (`docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`) built and
  run locally with test values under a separate project name: all containers healthy, 13 migrations, 8 quests and 69
  real questions seeded, app routes, API, photos and caching through nginx work, login reply is generic, code preview
  is off (BR52), only the web port is published, a restart keeps the data. The test stack was removed afterwards.
- After the restart: kept the CI fix instead of reverting (reverting would bring the failing job back).
- Linux re-check after the restart (only the jobs still open or touched by the changes): docker-config, python-lint,
  integration-tests (python-unit, node-config, python-db, python-api, python-security, regression) and backend-tests
  (30/30 files) all pass. lint, node-config, frontend-tests (197/197) and build had already passed on Linux before.
- backend-tests once failed by a timeout: the BR49 demo-seed test needs about 15 s in a Linux container, close to the
  20 s default. Gave only that test a 60 s limit (with a comment why) instead of raising the limit for all tests.
- Nothing was committed by the AI; Yi Heng commits and pushes.
- Still to do on the real server: fill in `.env.production` (TRUSTED_PROXIES from IT, real SMTP settings, secrets).
