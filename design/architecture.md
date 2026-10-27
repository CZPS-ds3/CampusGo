# Architecture

## Overview
A single-page web app talks to a REST API. The API holds all rules, time and state; the browser only shows state and reports the phone's position. MySQL is the source of truth, including all point values (BR11).

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend (`frontend/`) | React 18, Vite, React Router, Leaflet (OpenStreetMap tiles, darkened by CSS), plain CSS with semantic design tokens (light and dark theme), self-hosted Source Sans 3, German and English texts | Screens, map, geolocation request, server-driven quiz, mock mode for development without a backend |
| Backend (`backend/`) | Node 20+, Express, zod, helmet, express-rate-limit, nodemailer, multer + sharp | OTP login, sessions, teams, location check (haversine), quiz engine, scoring, leaderboards |
| Database | MySQL 8.4 (Docker Compose, port 3307) | Students, sessions, attempts, questions, scoring tables, location checks |
| Tooling | npm workspaces, ESLint, Prettier, Vitest, Supertest, Playwright | One install, one `npm run dev`, one `npm run check` |

## Key design decisions
1. **Server-authoritative:** timer (`expires_at`), question order, selections, location decision, points. The client re-syncs from the server after refresh/reconnect (BR25).
2. **Rules as data:** point values, bonuses, multipliers and checkpoint settings live in tables, never in code (BR11). Scoring is a pure function fed by those tables, so it is unit-testable.
3. **Integer arithmetic for points:** exact points are kept in hundredths (`points_exact`), rounded up once per user (R-02).
4. **Privacy by design:** no raw coordinates stored or logged; OTP codes and session tokens stored only as hashes; e-mail never shown to other users.
5. **Concurrency safety:** row locks and unique indexes (one passed attempt per student and checkpoint, one active attempt per student, one active session per student, one pending invitation per team and invitee).
6. **Injectable clock and mailer:** services take `clock` and `mailer`, so tests can test expiry boundaries (±1 s) and read OTP mails without SMTP.
7. **Same-origin in development:** Vite proxies `/api` to the backend, so the session cookie works without CORS tricks; CORS is still restricted to `FRONTEND_ORIGIN`.

## Folder layout
See the README. Backend code: `backend/src/{routes,services,db,middleware}`; frontend code: `frontend/src/{api,components,hooks,pages,styles,assets}`.

Diagram: [architecture-diagram.md](architecture-diagram.md). Data model: [er-diagram.md](er-diagram.md), [yi_heng/database-schema.md](yi_heng/database-schema.md). API: [yi_heng/api-documentation.md](yi_heng/api-documentation.md).
