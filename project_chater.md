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
| **Initial Situation / Project Context** | Incoming international students at DHBW Heilbronn face a steep learning curve during their first weeks. They struggle to navigate the campus layout and to find essential campus facilities (canteen, library, card top-up area, check-up area, water coolers). Traditional static PDF guides are unengaging and rarely read thoroughly. |
| **Relevance to Corporate Strategy** | Enhances the international student onboarding experience, promotes campus integration, and supports DHBW Heilbronn's goal of creating a welcoming, globally inclusive campus environment. |

---

## 2) WHY? — Impact, Benefits and Strategic Relevance

- Accelerates the adaptation process for international students through gamification (Pokémon GO style).
- Reduces initial culture shock and practical stress by turning campus orientation into an interactive game with location-specific information and trivia.
- Fosters community building and peer bonding through live leaderboards (individual, duo and nationality rankings).
- Showcases innovative technical problem-solving by using the phone's live location to verify that students really visit the places.

---

## 3) WHAT exactly should be achieved? — Objectives and Scope

### Overall Project Objective

To develop a gamified, mobile-responsive web application for incoming international students at DHBW Heilbronn. Students use only their phones: the app verifies their live location at key campus places, unlocks a read-first information page, and offers a timed quiz (5-minute timer, 80% to pass) that can only be taken while staying at the place. Points reward first try, speed and correct answers and feed live leaderboards.

### Sub-objectives and Measurable Results

| Sub-objective | Measurable Result | Priority |
|---|---|---|
| Core web app | Mobile-responsive app with secure authentication, ≥ 50 simultaneous student sessions | Must |
| Location-verified checkpoints | 5 geofenced campus places (canteen, library, card top-up area, check-up area, 5th location tbc) verified by live location | Must |
| Info + quiz flow | Info page ≤ 3 s after arrival (no reading time limit); first question ≤ 1.5 s after Start; 5-minute timer; pass at ≥ 80% | Must |
| Anti-cheat | Quiz only possible at the place; away > 30 s cancels the attempt; server-side timing | Must |
| Scoring | Points for first try, speed and correct answers | Must |
| Privacy | Consent for location; no raw coordinates stored | Must |
| Campus completion | ≥ 90% of incoming international students complete all campus checkpoints within 30 days of semester start (database logs); verified inside the project via a 10-student pilot | Must |
| Extended campus coverage | 10+ checkpoints (vending machines, department wings) | Should |
| Competitive leaderboards | Individual, duo and nationality rankings, updated instantly after a correct answer | Should |
| Reminders and events | Weekly streak reminders; random time-based events | Could |

*Detailed MoSCoW, verification methods and traceability: see [docs/project_handbook.md](docs/project_handbook.md), §1.*

### Non-objectives / Out of Scope

- City-wide supermarket (Rewe, Lidl) or clothing-store locators (explicitly removed from scope for now).
- Native mobile applications for the Apple App Store / Google Play (mobile-responsive web app only).
- NFC tags, student-card (UID) reading and physical reader stations (replaced by live-location verification).
- Modifying official university student databases.

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
| **Other Stakeholders** | Incoming international students (users); data-protection officer (location data); DHBW WI GitLab admin (Tessa Steinigke); student buddies (onboarding) |

---

## 5) HOW can the objectives be achieved? — Project Structure

| Sub-/Main Task | Work Packages |
|---|---|
| 1.0 Project management (WP1) | Set up and plan; track time and review progress; maintain documentation and wiki |
| 2.0 Concept & design (WP2) | UI/UX wireframes and user journey; database (ER) and architecture |
| 3.0 System development (WP3, WP4, WP5) | Backend server and REST API; frontend mobile web app; live-location verification and anti-cheat |
| 4.0 Campus content (WP6) | Map and calibrate campus locations; write info texts and the trivia question bank |
| 5.0 Testing & deployment (WP7) | Integration and code reviews; pilot trial and handover |

*Full WBS with codes, owners and dependencies: [docs/project_handbook.md](docs/project_handbook.md), §2.*

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
| 1 | UI/UX wireframes and technical architecture approved | 20.10.2026 |
| 2 | Core web app, database and location-verification prototype functional | 02.11.2026 |
| 3 | 5 campus locations populated with trivia; integration testing complete | 10.11.2026 |
| 4 | Pilot testing complete, time-tracking reports final, ready for final presentation | 16.11.2026 |

*Course deadline: planning submission 19.10.2026, 12:15.*

---

## 7) HOW MUCH? — Project Budget and Cost-Effectiveness

*Fictional budget with stated assumptions; details in [docs/project_handbook.md](docs/project_handbook.md), §8.*

| | |
|---|---|
| **Personnel Effort** | 145 h in total (Yi Heng 27 h, Catalina 31 h, Ryan 32 h, Yuri 29 h, Akil 26 h) |
| **Total Personnel Costs** | € 4,350 (145 h × €30/h assumed internal rate) |
| **Other Resources** | DHBW WI GitLab; the 5 campus locations (for on-site calibration); test phones (Android and iOS); 10 student volunteers for the pilot |
| **Total Costs / Project Budget** | € 4,829 (incl. 10% risk reserve) |
| **Project Revenue / Cost-Effectiveness** | No revenue expected (non-profit student service) |
| **Follow-up Costs after Project Completion** | Hosting, updating location and trivia content (to be confirmed) |

### External Costs

| External Service | Cost (€) |
|---|---|
| Hardware (none needed — students use their phones) | 0 |
| Hosting (≈ 4 months) | 40 |

---

## 8) Communication / Reporting / Other

| What? (Content) | How? (Medium) | Who? (Responsibility) | To whom? (Target group / Recipient) | When? How often? (Timing / Frequency) |
|---|---|---|---|---|
| Progress, blockers | Weekly sync (Discord / in person, 1 h) | Project lead | Team | Every Monday |
| Tasks, merge requests | GitLab Issues | Work-package owners | Team | Ongoing |
| Status, clarifying requirements | Call / e-mail | Project lead | Client (International Office) | Bi-weekly |
| Milestone acceptance | Review meeting with signed minutes | Project lead | Client | At each milestone |
| Project status, time-tracking review | In person (10–15 min) | Project lead | Lecturer | Integration-seminar dates |
| Meeting minutes | GitLab wiki | Akil | All | Immediately after each session |

**Other Relevant Information:** AI use is permitted but must be disclosed (section "Use of AI Tools" at the end of presentation and report; logs in `ai-logs/`). Hours are tracked in GitLab per person and task. Repository rules: [docs/git-workflow.md](docs/git-workflow.md), [CLAUDE.md](CLAUDE.md). Setup: [requirements.md](requirements.md).

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
