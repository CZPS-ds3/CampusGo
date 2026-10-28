# Entity-relationship diagram

Source of the tables: [backend/src/db/migrations/001_init.sql](../backend/src/db/migrations/001_init.sql). Rules behind them: [docs/data-model.md](../docs/data-model.md) and [docs/business-rules.md](../docs/business-rules.md). A PNG export of the diagram is not part of the repository; the Mermaid text below renders on GitLab and in VS Code.

```mermaid
erDiagram
    TEAMS ||--o{ STUDENTS : "has members (1 to 5)"
    TEAMS ||--o{ TEAM_INVITATIONS : "issues"
    STUDENTS ||--o{ TEAM_INVITATIONS : "is invitee"
    STUDENTS ||--o{ TEAM_INVITATIONS : "is inviter"
    STUDENTS ||--o{ SESSIONS : "logs in with"
    STUDENTS ||--o{ ATTEMPTS : "makes"
    STUDENTS ||--o{ LOCATION_CHECKS : "triggers"
    CHECKPOINTS ||--o{ ATTEMPTS : "is played in"
    CHECKPOINTS ||--o{ QUESTIONS : "owns"
    CHECKPOINTS ||--o{ LOCATION_CHECKS : "is checked by"
    CHECKPOINTS ||--o{ CHECKPOINT_FACTS : "has read-first facts"
    CHECKPOINTS ||--o{ CHECKPOINT_IMAGES : "has photos"
    STUDENTS ||--o{ AUDIT_EVENTS : "appears in"
    DIFFICULTY ||--o{ QUESTIONS : "classifies"
    QUESTIONS ||--|{ OPTIONS : "has 4"
    ATTEMPTS ||--|{ ATTEMPT_QUESTIONS : "presents 3 or 5"
    QUESTIONS ||--o{ ATTEMPT_QUESTIONS : "is drawn as"
    OPTIONS ||--o{ ATTEMPT_QUESTIONS : "is selected in"
    ATTEMPTS ||--o| LOCATION_CHECKS : "is unlocked by one"
    SCORING_MULTIPLIER {
        int attempt_number PK
        int percentage
    }
    BONUS {
        string bonus_type PK
        int points_awarded
    }
    DIFFICULTY {
        string difficulty PK
        int points_awarded
    }
    TEAMS {
        bigint team_id PK
        string team_name UK
        string profile_picture
        int team_score
        datetime score_updated_at
    }
    STUDENTS {
        bigint student_id PK
        bigint team_id FK
        string email UK
        string first_name
        string last_name
        string nickname
        int avatar_preset
        string role "student or admin"
        string status "active, blocked, archived, deleted"
        string status_reason
        datetime reported_at
        string report_reason
        datetime deleted_at
        int total_points
        bigint points_exact_x100
        datetime points_updated_at
        datetime location_consent_at
    }
    OTP_CODES {
        bigint otp_id PK
        string email
        string code_hash
        datetime expires_at
        bool is_used
        int failed_attempts
    }
    SESSIONS {
        bigint session_id PK
        bigint student_id FK
        string token_hash UK
        datetime expires_at
        bool is_active
    }
    CHECKPOINTS {
        bigint checkpoint_id PK
        string checkpoint_name UK
        decimal latitude
        decimal longitude
        int radius
        bool is_active
        int question_count
        int pass_threshold
        bool hard_question_enabled
    }
    QUESTIONS {
        bigint question_id PK
        bigint checkpoint_id FK
        string difficulty FK
        string question_text
        bool is_active
    }
    OPTIONS {
        bigint option_id PK
        bigint question_id FK
        int option_position
        string option_text
        bool is_correct
    }
    ATTEMPTS {
        bigint attempt_id PK
        bigint student_id FK
        bigint checkpoint_id FK
        int attempt_number
        datetime start_time
        datetime expires_at
        string status
        string end_reason
        int points_earned
    }
    ATTEMPT_QUESTIONS {
        bigint attempt_id PK
        int question_number PK
        bigint question_id FK
        bigint replaced_question_id FK
        bigint selected_option_id FK
    }
    TEAM_INVITATIONS {
        bigint invitation_id PK
        bigint team_id FK
        bigint inviter_id FK
        bigint invitee_id FK
        string status
        datetime expires_at
    }
    CHECKPOINT_FACTS {
        bigint checkpoint_id PK
        int position PK
        string fact_text
    }
    CHECKPOINT_IMAGES {
        bigint checkpoint_id PK
        int position PK
        string url
        string alt_text
        string credit
    }
    AUDIT_EVENTS {
        bigint event_id PK
        bigint student_id FK
        bigint actor_id
        string event_type
        string detail
        datetime created_at
    }
    BANNED_TERMS {
        string term PK
        string mode
    }
    LOCATION_CHECKS {
        bigint check_id PK
        bigint student_id FK
        bigint checkpoint_id FK
        datetime checked_at
        bool inside_radius
        bigint used_by_attempt_id FK
    }
```

`OTP_CODES` is keyed by the e-mail address, not by a student, because a student may not exist yet when the first code is requested. Scoring tables (`SCORING_MULTIPLIER`, `BONUS`, `DIFFICULTY`) are read by the code at run time (BR11); no point value is written into the program.
