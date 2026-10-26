# Use cases

Actor: **Student** (incoming international student of DHBW Heilbronn). There is no admin actor in the pilot (no admin UI). Rule numbers refer to [docs/business-rules.md](../../docs/business-rules.md); the matching tests are listed in [docs/traceability.md](../../docs/traceability.md).

| ID | Use case | Main flow | Alternative flows and errors | Rules |
|---|---|---|---|---|
| UC1 | Log in with a one-time code | Enter school e-mail, receive the 6-digit code, enter it, land on the map | Address does not end with `heilbronn.dhbw.de`: error. Unknown address: ask for first name, last name and optional nickname, then the account is created. Wrong, expired or used code: one generic error. Fifth wrong entry locks the code. Resend only every 30 s | BR01, BR02, BR03 |
| UC2 | Stay logged in on one device | Use the app; every request extends the session | A login on another phone ends this session (401, back to login with a message). 30 minutes without activity ends it | BR03 |
| UC3 | Create or join a team | Create a team and invite students by e-mail; the invitee accepts within 24 h | Team full (5), invitation expired, invitee already in a team, name taken: refused, the answer to the inviter never reveals whether an address has an account | BR05, BR06 |
| UC4 | View leaderboards | Open Ranks; solo list for everyone, team list for students in a team | Students without a team do not see the team list. Teams with one member are not listed. Equal scores share a rank, the earlier achiever is listed first | BR04, BR24 |
| UC5 | Explore the map | See the 8 checkpoints, pick one, see its status and attempts | Inactive checkpoint cannot be played. Completed checkpoint is final | BR07, BR08, BR21 |
| UC6 | Check in at a checkpoint | Accept the location notice once, press check, the phone sends one position, the server decides inside or outside the radius | Permission denied, no signal, timeout, accuracy worse than 50 m or outside the radius: try again, no attempt used, no timer started. Only "inside yes/no" and the time are stored | BR12 |
| UC7 | Play a quiz | Start: 3 or 5 random distinct questions, one deadline of 1 minute per question, answer one after the other, the right answer is shown after a wrong pick, no retry | Refresh, a second tab or a new login resume the same attempt. Time over: the answers so far count. Offline: options locked, the server clock keeps running | BR09, BR10, BR13, BR14, BR15, BR22, BR23, BR25 |
| UC8 | Take the hard question | After four right answers on the first attempt at a large checkpoint, choose between the normal fifth question (1,000) and a hard one (2,000) | Not offered on later attempts or at small checkpoints. Wrong hard answer: the attempt can still pass, no full clear bonus | BR20 |
| UC9 | See the result | Passing: points = (questions + time bonus + full clear) x attempt multiplier, rounded up; failing: 0 points, the next attempt has a lower multiplier | Attempt 6 passes with 0 points and completes the checkpoint | BR16 to BR19, BR21 |
| UC10 | Manage the profile | See own details, change the picture (PNG, JPG, WebP, up to 2 MB), log out | Wrong type or too large: refused with a message | BR01 |
| UC11 | See the city teaser (Could) | Open "City quests" from the profile and read that more places are planned | Nothing is playable | Scope: Could |
