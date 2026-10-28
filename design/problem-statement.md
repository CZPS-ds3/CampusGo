# Problem Statement

## Problem
Incoming international students at DHBW Heilbronn need weeks to learn the campus. Static PDF guides are unengaging and rarely read. Students also arrive without friends and without a feeling of belonging.

## Who is affected
- **Students (primary users):** new international students, often arriving together at semester start, using their own phones.
- **International office (client):** wants a smooth, welcoming onboarding and some measurable engagement.
- **Team and lecturer:** deliver a working, rule-driven pilot in the course project (13.10.–16.11.2026).

## What we build
A location-based onboarding game (web app, no download). Students visit 8 campus checkpoints, prove with live location that they are there, answer a short quiz about the place and earn points. They can play alone or in teams of up to five and see solo and team rankings.

## Goals (measurable)
- All 25 business rules (BR01–BR25) implemented and traceable to tests.
- The 15 worked scoring examples reproduce exactly.
- At least 50 simultaneous sessions; first question visible within 1.5 s of the quiz start.
- At least 90% of incoming international students complete all checkpoints within 30 days (pilot proxy: 9 of 10 volunteers).

## Constraints
- School e-mail only (`…heilbronn.dhbw.de`), one-time password login, one active session.
- Location is personal data: consent, only "inside radius yes/no + time" stored.
- Mobile first, but fully usable on tablets and laptops.
- Stack: React (Vite), Node/Express, MySQL, npm only.

## Not in scope
City locators (supermarkets, clothing stores — only a teaser as a "Could" idea), native apps, NFC/student cards, duo and nationality leaderboards, an admin UI.

See [docs/business-rules.md](../docs/business-rules.md) and [docs/project_handbook.md](../docs/project_handbook.md).
