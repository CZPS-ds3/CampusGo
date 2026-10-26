# Requirements — What to Install

Everyone on the team needs the tools below on their own machine. The project uses **npm only** (no yarn, no pnpm). Check each version with the command shown.

## 1. Required software

| Tool | Version | Check | Download |
|---|---|---|---|
| Git | any recent | `git --version` | https://git-scm.com/downloads |
| Node.js (includes npm) | **LTS ≥ 20** (24 works) | `node -v` and `npm -v` | https://nodejs.org |
| Code editor | VS Code recommended | – | https://code.visualstudio.com |
| SSH key registered on the DHBW WI GitLab | – | `ssh -T git@wi-git.heilbronn.dhbw.de` | GitLab → Preferences → SSH Keys |

## 2. Install the project dependencies (one command)

```bash
git clone git@wi-git.heilbronn.dhbw.de:yih.lim.26/campus-city-quest.git
cd campus-city-quest
git checkout preproduction
npm ci
```

Use `npm ci` for a clean, reproducible install from `package-lock.json`. Use `npm install <package>` only when you deliberately add a dependency (commit `package.json` and `package-lock.json`, and say why in the MR).

## 3. What gets installed (dev tooling, from `package.json`)

| Package | Purpose |
|---|---|
| `eslint`, `@eslint/js`, `globals`, `eslint-config-prettier` | **Linting** (JavaScript code quality) |
| `prettier` | **Code formatting** |
| `vitest` | **Automated tests** |

Application libraries (web framework, database driver, etc.) are added here once the team confirms the stack in the architecture design (WBS 2.2).

## 4. Daily commands (all via npm)

| Task | Command |
|---|---|
| Lint | `npm run lint` |
| Lint and auto-fix | `npm run lint:fix` |
| Check formatting | `npm run format:check` |
| Format all files | `npm run format` |
| Run tests | `npm test` |
| **Everything before you push** | `npm run check` |

Run `npm run check` before every push and before opening a Merge Request. It must pass.

## 5. Environment variables

```bash
cp .env.example .env     # Windows PowerShell: Copy-Item .env.example .env
```

Fill in the values you need locally. **Never commit `.env`.**

## 5a. Accounts and services you need

| Need | Why | Who decides |
|---|---|---|
| An SMTP server or a mail provider (free tier is enough for the pilot) | Sends the login OTP e-mails (BR01) | Ryan / Yuri, WBS 3.1 |
| A relational database (engine chosen in WBS 2.2) | Students, attempts, questions, scoring tables (BR11) | Ryan, WBS 2.2 |
| A web host with HTTPS | Browser geolocation requires HTTPS on real phones | Team, WBS 5.2 |
| Android and iOS phones | On-site location tests | Everyone |

## 6. Recommended VS Code extensions

- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)
- GitLens (optional)

## 7. Testing live location (everyone who works on location features)

- Browser geolocation only works on **HTTPS** or on `http://localhost` — use `localhost` in development.
- Test on **real phones** (Android Chrome and iOS Safari). Laptop location and emulators are not accurate enough.
- Keep the page open and the screen on while testing; browsers can pause location in the background.
- Never commit real location data of students or teammates; use fake coordinates in tests.

## 8. About `pylint`

`pylint` is a **Python** linter and is installed with pip, not npm, so it is not part of the npm toolchain. The web app is JavaScript, which is linted with ESLint (section 3). There is no Python code in the project today, so pylint is not needed. If Python scripts are ever added (e.g. for data preparation), install it for that folder only:

```bash
python -m pip install pylint
pylint scripts/
```
