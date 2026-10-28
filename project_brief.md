# Project Brief — Campus & City Quest

**Project no.** DHBW-INT-2027-01 · **Status:** 26.10.2026 · based on the team's Main Project Document (business rules BR01–BR25)

> The current, binding description of behaviour is in [docs/business-rules.md](docs/business-rules.md). This brief is the short version for newcomers. The original pitch is kept at the bottom for history.

## 1. Idea
An interactive, gamified onboarding web app for incoming international students at DHBW Heilbronn, played like a location-based game. Instead of reading a static PDF guide, students explore the campus: they go to **8 checkpoints**, prove with their **live location** that they are there, answer a short quiz about the place and earn points. They can compete alone or in teams.

## 2. How it works
1. **Log in** with a one-time password sent to the school e-mail (it must end with `heilbronn.dhbw.de`). New users enter first and last name; a profile picture and nickname are optional. The login always answers: "If the account exists, an email containing the OTP has been sent."
2. **Teams (optional):** create a team (name, optional picture), invite students by e-mail (they accept or reject in the app; invitations expire after 24 hours). A team has 1–5 members; every student is in at most one team.
3. **Visit a checkpoint:** Mensa, Library, CAS Cafe, Campus Garden, Care.box and Shop.box, Building B, Building C or Sensoricum. The app checks the location when an attempt starts. If GPS is inaccurate or permission is denied, the student simply checks again (no attempt used, no timer).
4. **Quiz:** 5 questions (Mensa, Library, Building B, Building C) or 3 (the others); 1 minute per question; four options each; a wrong answer shows the right one; no retries. Pass with 4/5 or 2/3. Not passed? Try again; once passed, the checkpoint is complete forever.
5. **Points:** 1,000 per normal question, 2,000 for a hard question (attempt 1 only, big checkpoints, only if the first four answers are correct), +1 per whole second left, +200 for a full clear; multiplied by 100/85/70/55/40 % for attempts 1–5 (0 % from attempt 6); fractions are rounded up.
6. **Leaderboards:** solo (total points) and team (average of members, teams with at least 2 members).

## 3. Why it works
- Solves a real problem: first weeks are confusing; a game makes orientation memorable and social.
- Mobile web app: no app-store download; students just open a link.
- Fair play: the server decides everything (location, time, answers, points); points and questions are data in the database and can change without code changes.

## 4. Scope
- **Must:** BR01–BR25 (login/sessions, sign-up, teams, 8 checkpoints, location verification, quiz engine, scoring, leaderboards, content in the database, privacy).
- **Should:** read-first info page per checkpoint (before the quiz, no timer).
- **Could:** weekly streak reminders; random time-based events.
- **Won't:** city locators (supermarkets, clothing stores), native apps, NFC/student-card readers, duo and nationality leaderboards, admin UI.

## 5. Success criteria
All 25 rules implemented and traceable to tests; 15 worked scoring examples reproduce exactly; ≥ 50 simultaneous sessions; first question ≤ 1.5 s after the quiz starts; ≥ 90% of pilot students complete all checkpoints (pilot proxy: ≥ 9 of 10 volunteers).

## 6. Plan in one line
13.10.–16.11.2026, 230 h, 5 team members; milestones 20.10, 02.11, 10.11, 16.11 — see [docs/project_handbook.md](docs/project_handbook.md).

---

## Archived: original pitch (superseded)

Project Pitch: "Campus & City Quest" (Working Title)
An interactive, gamified onboarding web application for incoming international students at DHBW Heilbronn.

1. The Core Concept
Our web application, played like a location-based game, turns settling into Heilbronn and DHBW into an interactive adventure. Instead of just reading a static PDF guide, incoming international students will explore the campus and the city in a gamified way, helping them master daily life, find essential resources, and bond with their peers right from day one.

2. Key Features
Campus Exploration & QR Quests:

Students visit key spots around DHBW (e.g., the canteen, library, student check-up area, card top-up stations, vending machines, and water coolers).

At each location, they scan a QR code and answer a quick trivia or learning question about how that facility works to unlock information and earn points.

City Essentials & Item Locator:

Outside the campus, the app acts as a smart guide for everyday needs.

It maps nearby supermarkets (like Rewe and Lidl) and shopping spots (like New Yorker or local thrift stores).

A search feature lets students look up specific items (like rice, eggs, vegetables, or protein bars) to instantly see which nearby store carries them.

Smart Navigation & Proximity Verification:

Built-in Google Maps API integration gives students turn-by-turn directions to get to any location.

Geofencing/proximity checks ensure users are physically in the vicinity of the spot before they can check-in, scan the code, and claim their points.

Gamification & Leaderboards:

To keep engagement high, the experience is framed as a friendly competition.

Students can compete individually, in duos, as whole teams, or even pit countries/nationalities against each other on a live leaderboard.

3. Why This Project Works
Solves Real Pain Points: International students often struggle during their first weeks finding where to buy specific groceries, how to use campus facilities, or how to navigate the city.

High Engagement: Gamification transforms a tedious orientation process into a fun social activity that helps break the ice among new students.

Feasible & Scalable: Built as a mobile-friendly website, students don't even need to download a heavy app from an app store—they can just open a link and start playing.
