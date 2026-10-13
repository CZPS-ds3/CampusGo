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
| **Initial Situation / Project Context** | Incoming international students at DHBW Heilbronn face a steep learning curve during their first weeks. They struggle to navigate the campus layout, find essential campus facilities (canteen, library, card top-up stations, check-up areas, water coolers), and locate everyday city essentials (supermarkets like Rewe and Lidl, thrift stores, and specific grocery items like rice, eggs, vegetables, or protein bars). Traditional static PDF guides are unengaging and rarely read thoroughly. |
| **Relevance to Corporate Strategy** | Enhances the international student onboarding experience, promotes campus integration, and supports DHBW Heilbronn's goal of creating a welcoming, globally inclusive campus environment. |

---

## 2) WHY? — Impact, Benefits and Strategic Relevance

- Accelerates the adaptation process for international students through gamification (Pokémon GO style).
- Reduces initial culture shock and practical stress by turning everyday navigation and item hunting into an interactive game.
- Fosters community building and peer bonding through live leaderboards (solo, duo, team, and nationality/country rankings).
- Showcases innovative technical problem-solving by combining web applications with physical, multi-tiered tapping mechanisms.

---

## 3) WHAT exactly should be achieved? — Objectives and Scope

### Overall Project Objective

To develop a gamified web application for incoming international students at DHBW Heilbronn that facilitates campus and city exploration using a robust, multi-tiered interaction hierarchy: **DHBW Student ID cards** as the primary tapping method, backed by secondary **NFC tags** and universal **QR codes** as a foolproof fallback.

### Sub-objectives and Measurable Results

| Sub-objective | Measurable Result | Priority |
|---|---|---|
| Campus Facility Mastery | At least 80% of incoming international students complete all campus checkpoints within their first month. | Must |
| Multi-Tier Interaction System | QR fallback works on 100% of tested devices; NFC tags work on all NFC-capable Android devices tested; student ID card UID readers at major campus spots (subject to university permission). | Must (QR) / Should (NFC, ID card) |
| City & Grocery Locator | Interactive map (Google Maps API) and searchable item database for local supermarkets (Rewe, Lidl, etc.) and essentials. | Must (map) / Should (items) |
| Gamification & Leaderboards | Live leaderboards (update within 5 s) across solo, duo, team, and nationality categories with active student participation. | Must (solo) / Should (others) |

*Detailed MoSCoW prioritisation: see [docs/project_handbook.md](docs/project_handbook.md), §1.*

### Non-objectives / Out of Scope

- Building a native mobile application for Apple/Google App Stores (the solution will strictly be a mobile-responsive web app).
- Modifying official university student databases directly (student ID UIDs will be mapped via a secure, independent project database).
- Live price or stock data from supermarkets.
- Payment or card top-up functionality (only the location of top-up stations is shown).

---

## 4) WHO is involved? — Project Organisation

| Role | Name, Department |
|---|---|
| **Project Lead** | Yi Heng Lim, Business Information Systems (WI), DHBW Heilbronn |
| **Project Sponsor** | *To be confirmed (lecturer / international office)* |
| **Project Team Members** | Catalina — Product & UX; Ryan — Backend & security; Yuri — Check-in technology & DevOps; Akil — Maps, data & documentation |
| **Project Steering Committee** | ☐ Yes  ☒ No — escalation: project lead → lecturer (Prof. Dr. Aliona von der Trenck) |
| **Project Customer** | *To be confirmed — DHBW Heilbronn* |
| **Customer Decision-Maker** | *To be confirmed* |
| **Customer Project Manager** | *To be confirmed* |
| **Other Stakeholders** | Incoming international students (users); DHBW international office; DHBW WI IT (GitLab, Tessa Steinigke); data-protection officer (ID-card UIDs); supermarkets (Rewe, Lidl — information only) |

---

## 5) HOW can the objectives be achieved? — Project Structure

| Sub-/Main Task | Work Packages |
|---|---|
| 1 Project management | Set up organisation and tools; handbook; meetings and minutes; time tracking and status; presentation; report; closing; risk contingencies |
| 2 Concept & design | Requirements; game mechanics; UX wireframes; architecture and data model; checkpoint and POI list |
| 3 Implementation | Repo and CI; accounts and teams; QR check-in; NFC check-in; ID-card UID check-in; Google Maps; item database and search; leaderboards; responsive UI |
| 4 Testing & quality assurance | Test plan; automated tests; field test with pilot students; defect fixing |
| 5 Deployment & handover | Deployment; user guide and documentation; customer acceptance |

*Full WBS with codes, owners and dependencies: [docs/project_handbook.md](docs/project_handbook.md), §2.*

---

## 6) By WHEN? — Milestones and Deadlines

| | |
|---|---|
| **Project Start** | 12.10.2026 (planning phase) |
| **Project End** | 07.12.2026 (final report and handover) |
| **Project Start Event** | Kick-off / planning lecture, 12.10.2026 |
| **Project End Event** | Final report submission and customer acceptance, 07.12.2026 |

### Milestones

| # | Milestone | Date |
|---|---|---|
| 1 | Planning presentation | 13.10.2026 |
| 2 | Planning submitted (12:15), tools in use | 19.10.2026 |
| 3 | Requirements and design approved | 30.10.2026 |
| 4 | MVP — all Must features working | 13.11.2026 |
| 5 | Final presentation (16.11. tbd) | 18.11.2026 |
| 6 | Release and pilot test finished | 27.11.2026 |
| 7 | Final report and handover | 07.12.2026 |

---

## 7) HOW MUCH? — Project Budget and Cost-Effectiveness

*Fictional budget with stated assumptions; details in [docs/project_handbook.md](docs/project_handbook.md), §8.*

| | |
|---|---|
| **Personnel Effort** | 5 team members, 464 h in total (Yi Heng 79 h, Catalina 95 h, Ryan 108 h, Yuri 92 h, Akil 90 h) |
| **Total Personnel Costs** | € 13,920 (464 h × €30/h assumed internal rate) |
| **Other Resources** | DHBW WI GitLab, test smartphones (team's own), campus locations for field test |
| **Total Costs / Project Budget** | € 15,620 (incl. 10% risk reserve) |
| **Project Revenue / Cost-Effectiveness** | No revenue expected (non-profit student service) |
| **Follow-up Costs after Project Completion** | Hosting and Google Maps usage (est. €10–20/month, to be confirmed); content maintenance |

### External Costs

| External Service | Cost (€) |
|---|---|
| Google Maps API (safety allowance, expected within free quota) | 50 |
| Hardware (3 NFC/card readers, 50 NFC tags) | 160 |
| Printing (QR codes) | 30 |
| Hosting (≈ 4 months) | 40 |

---

## 8) Communication / Reporting / Other

| What? (Content) | How? (Medium) | Who? (Responsibility) | To whom? (Target group / Recipient) | When? How often? (Timing / Frequency) |
|---|---|---|---|---|
| Progress and blockers | Meeting | Project lead | Team | Weekly |
| Tasks, merge requests, documentation | GitLab | Work-package owners | Team | Ongoing |
| Status, clarifying requirements | E-mail / call | Project lead | Customer | Every 2 weeks |
| Milestone acceptance | Meeting + minutes | Project lead | Customer | At each milestone |
| Project status and time-tracking review | In person (10–15 min) | Project lead | Lecturer | Integration-seminar dates |
| Minutes and decisions | GitLab wiki | Rotating | All | After each meeting |

**Other Relevant Information:** AI use is permitted but must be disclosed (section "Use of AI Tools" at the end of presentation and report; logs in `ai-logs/`). Hours are tracked in GitLab per person and task. Repository rules: [docs/git-workflow.md](docs/git-workflow.md), [CLAUDE.md](CLAUDE.md).

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
