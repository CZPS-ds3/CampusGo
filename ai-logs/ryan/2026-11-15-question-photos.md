# AI Log — CampusGO checkpoint and question photos

- **Date:** 2026-11-15
- **Team member:** ryan
- **AI tool / model:** Copilot SDK in VS Code
- **Objective:** Integrate the `CampusGO_Photos` folder into the checkpoint carousel and quiz question photos, update the frontend mock data, and document the new asset location.

## AI Prompts Used
1. Asked where to put a folder containing checkpoint and question photos.
2. Asked the AI to inspect `CampusGO_Photos` and edit the code to use the photos where necessary.
3. Asked the AI to create AI logs for the changes made.

## Decisions Made
- Kept the supplied photos under `frontend/public/places/CampusGO_Photos/`.
- Reused the existing database image support instead of changing the schema.
- Updated checkpoint photo references in `frontend/src/api/places.json`.
- Updated question photo references in `backend/src/db/question-bank.js`.
- Synchronized `frontend/src/api/question-bank.json` with the backend question bank.
- Updated the related README, question-bank, and photo-credit documentation.
- Verified the photo URLs, linting, formatting, and frontend tests. Backend tests were not run successfully because MySQL was unavailable at `127.0.0.1:3307`.
