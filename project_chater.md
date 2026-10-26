# Project Charter — Campus & City Quest

| | |
|---|---|
| **Project Number** | DHBW-INT-2027-01 |
| **Project Manager** | Yi Heng Lim |
| **Project Type** | IT Project / Product Development Project |

---

## 1) WHERE do we stand? — Initial Situation and Project Context

| | |
|---|---|
| **Initial Situation / Project Context** | Incoming international students at DHBW Heilbronn face a steep learning curve during their first weeks. They struggle to navigate the campus and to find essential facilities (canteen, library, cafe, garden, card top-up and shop boxes, buildings). Traditional static PDF guides are unengaging and rarely read thoroughly. The team has defined 25 business rules (BR01–BR25) for a pilot at 8 campus checkpoints. |
| **Relevance to Corporate Strategy** | Enhances the international student onboarding experience, promotes campus integration, and supports DHBW Heilbronn's goal of a welcoming, globally inclusive campus. |

---

## 2) WHY? — Impact, Benefits and Strategic Relevance

- Accelerates the adaptation of international students through gamification (a location-based game).
- Reduces initial culture shock and practical stress by turning campus orientation into a game: visit places, answer questions about them, earn points.
- Fosters community building through teams (1–5 members) and live solo and team leaderboards.
- Showcases innovative technical problem-solving: live-location verification, a server-authoritative quiz engine and a rule-driven scoring system.

---

## 3) WHAT exactly should be achieved? — Objectives and Scope

### Overall Project Objective

To develop a gamified, mobile-responsive web application for incoming international students at DHBW Heilbronn. Students log in with a one-time password sent to their school e-mail (address ending with `heilbronn.dhbw.de`), may form teams, verify their live location at one of **8 pilot checkpoints** (Mensa, Library, CAS Cafe, Campus Garden, Care.box and Shop.box, Building B, Building C, Containers) and take a timed multiple-choice quiz (3 or 5 questions, 1 minute per question; pass at 2/3 or 4/5). Points (question points, time bonus, full-clear bonus, attempt multipliers, optional hard question) feed solo and team leaderboards.

### Sub-objectives and Measurable Results

| Sub-objective | Rules | Measurable Result | Priority |
|---|---|---|---|
| Login and sessions | BR01, BR03 | OTP login with school e-mail; one active session; generic response that does not reveal whether an account exists | Must |
| Sign-up and profile | BR02 | First and last name required; optional picture and nickname | Must |
| Teams | BR05, BR06 | Teams of 1–5; invitations by e-mail with accept/reject and 24 h expiry | Must |
| Checkpoints and location | BR07, BR08, BR12 | 8 checkpoints with calibrated geofences; location checked at every attempt start; poor accuracy/denied permission can be retried without consuming an attempt | Must |
| Quiz engine | BR09–BR15, BR22, BR23, BR25 | Random 3/5 distinct questions; server-side timer and state; pass at 4/5 or 2/3; state survives refresh | Must |
| Scoring | BR14, BR16–BR21 | 15 worked examples in `docs/business-rules.md` §3.3 reproduce exactly | Must |
| Leaderboards | BR04, BR24 | Solo and team boards; correct ranks and tie order | Must |
| Content in the database | BR09, BR11 | 76 verified questions; points/multipliers/bonuses editable without code changes | Must |
| Privacy | team decision | Location consent; only "inside radius yes/no + time" stored; OTP codes/tokens hashed | Must |
| Performance | – | ≥ 50 simultaneous sessions; first question ≤ 1.5 s after quiz start | Must |
| Completion target | – | ≥ 90% of incoming international students complete all campus checkpoints within 30 days (database logs); verified inside the project by a pilot with 10 volunteers (≥ 9 complete all 8) | Must |
| Info page | – | Read-first information per checkpoint before the quiz (no timer) | Should |
| Reminders and events | – | Weekly streak reminders; random time-based events | Could |

*Rules, resolutions and scoring examples: [docs/business-rules.md](docs/business-rules.md). Data model: [docs/data-model.md](docs/data-model.md). Plan: [docs/project_handbook.md](docs/project_handbook.md).*

### Non-objectives / Out of Scope

- City-wide supermarket (Rewe, Lidl) or clothing-store locators.
- Native mobile applications for the Apple App Store / Google Play (mobile-responsive web app only).
- NFC tags, student-card reading and physical reader stations (replaced by live-location verification).
- Duo and nationality leaderboards (only solo and team leaderboards).
- An admin user interface (content is loaded by seed scripts).
- Leaving or deleting teams, removing members, and editing the profile after sign-up (no rule requires it; to be confirmed).

---

## 4) WHO is involved? — Project Organisation

| Role | Name, Department |
|---|---|
| **Project Lead** | Yi Heng Lim, Business Information Systems (WI), DHBW Heilbronn |
| **Project Sponsor** | *To be confirmed (lecturer / international office)* |
| **Project Team Members** | Catalina — UI/UX & Frontend Developer; Ryan — Backend & Database Engineer; Yuri — Location & Integration Specialist; Akil — QA & Documentation Lead |
| **Project Steering Committee** | ☐ Yes  ☒ No — escalation: project lead → lecturer (Prof. Dr. Aliona von der Trenck) |
| **Project Customer** | DHBW Heilbronn, International Office *(contact to be confirmed)* |
| **Customer Decision-Maker** | *To be confirmed* |
| **Customer Project Manager** | *To be confirmed* |
| **Other Stakeholders** | Incoming international students (users); data-protection contact (location and personal data); DHBW mail/IT (OTP e-mail delivery); DHBW WI GitLab admin (Tessa Steinigke); student buddies (onboarding) |

---

## 5) HOW can the objectives be achieved? — Project Structure

| Sub-/Main Task | Work Packages |
|---|---|
| 1.0 Project management (WP1) | Set up and plan; track time and review progress; documentation and wiki |
| 2.0 Concept & design (WP2) | UI/UX wireframes and flows; database model and architecture; geofencing architecture and API contract |
| 3.0 System development (WP3, WP4, WP5) | OTP login and sessions; profile, teams, invitations; checkpoint and quiz engine; scoring and leaderboards; location verification; frontend (login/profile/teams, quiz, leaderboards/info page) |
| 4.0 Campus content (WP6) | Set up and calibrate 8 checkpoints; write question bank (76 questions) and info texts |
| 5.0 Testing & deployment (WP7) | Test, integrate and review; pilot with 10 volunteers and handover |

*Full WBS with codes, owners, rules and dependencies: [docs/project_handbook.md](docs/project_handbook.md), §2. Traceability: [docs/traceability.md](docs/traceability.md).*

---

## 6) By WHEN? — Milestones and Deadlines

| | |
|---|---|
| **Project Start** | 13.10.2026 |
| **Project End** | 16.11.2026 |
| **Project Start Event** | Planning presentation, 13.10.2026 |
| **Project End Event** | Pilot completed; final presentation 18.11.2026 (16.11. tbd); final report 07.12.2026 |

### Milestones

| # | Milestone | Date |
|---|---|---|
| 1 | UI/UX wireframes, ER model and architecture approved | 20.10.2026 |
| 2 | OTP login, 8 checkpoints in the database and location check working | 02.11.2026 |
| 3 | Full quiz, scoring and leaderboards working; 76 questions loaded; integration testing complete | 10.11.2026 |
| 4 | Pilot testing complete, time-tracking reports final, ready for final presentation | 16.11.2026 |

*Course deadline: planning submission 19.10.2026, 12:15.*

---

## 7) HOW MUCH? — Project Budget and Cost-Effectiveness

*Fictional budget with stated assumptions; details in [docs/project_handbook.md](docs/project_handbook.md), §8.*

| | |
|---|---|
| **Personnel Effort** | 5 team members, 230 h in total (Yi Heng 46 h, Catalina 47 h, Ryan 50 h, Yuri 42 h, Akil 45 h) |
| **Total Personnel Costs** | € 6,900 (230 h × €30/h assumed internal rate) |
| **Other Resources** | DHBW WI GitLab; test phones (Android and iOS); the 8 campus checkpoints; 10 student volunteers for the pilot |
| **Total Costs / Project Budget** | € 7,656 (incl. 10% risk reserve) |
| **Project Revenue / Cost-Effectiveness** | No revenue expected (non-profit student service) |
| **Follow-up Costs after Project Completion** | Hosting, e-mail service, updating checkpoint and question content (to be confirmed) |

### External Costs

| External Service | Cost (€) |
|---|---|
| Hosting (≈ 4 months) | 40 |
| E-mail delivery for OTP (allowance) | 20 |
| Hardware | 0 (students use their phones) |

---

## 8) Communication / Reporting / Other

| What? (Content) | How? (Medium) | Who? (Responsibility) | To whom? (Target group / Recipient) | When? How often? (Timing / Frequency) |
|---|---|---|---|---|
| Progress, blockers | Weekly sync (Discord / in person, 1 h) | Project lead | Team | Every Monday |
| Tasks, merge requests | GitLab Issues | Work-package owners | Team | Ongoing |
| Status, open rule questions | Call / e-mail | Project lead | Client (International Office) | Bi-weekly |
| Milestone acceptance | Review meeting with signed minutes | Project lead | Client | At each milestone |
| Project status, time-tracking review | In person (10–15 min) | Project lead | Lecturer | Integration-seminar dates |
| Meeting minutes | GitLab wiki | Akil | All | Immediately after each session |

**Other Relevant Information:** AI use is permitted but must be disclosed (section "Use of AI Tools" at the end of presentation and report; logs in `ai-logs/`). Hours are tracked in GitLab per person and task. Source of truth for behaviour: [docs/business-rules.md](docs/business-rules.md). Repository rules: [docs/git-workflow.md](docs/git-workflow.md), [CLAUDE.md](CLAUDE.md). Setup: [requirements.md](requirements.md). Open points to confirm with the client: business-rules §7.

---

## Project Decision

- ☐ The project is approved.
- ☐ The project charter is to be revised. **Changes:**
- ☐ The project is rejected. **Reason:**

&nbsp;

| | |
|---|---|
| ........................................ | ........................................ |
| `<Date>` | `<Date>` |
| **Project Sponsor:** `<Name>` | **Project Lead:** Yi Heng Lim |
