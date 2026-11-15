import { createApp } from './src/app.js';
import { systemClock } from './src/clock.js';
import { loadConfig, productionProblems, productionWarnings } from './src/config.js';
import { describeListenError } from './src/listen-error.js';
import { createPool } from './src/db/pool.js';
import { seedAdmins } from './src/db/seed.js';
import { createMailer } from './src/services/mailer.js';
import { countPlaceholders, placeholderWarning } from './src/services/placeholders.js';

const config = loadConfig();
const problems = productionProblems(config);
if (problems.length > 0) {
  console.error(`[config] refusing to start in production:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}

for (const warning of productionWarnings(config)) console.warn(`[config] warning: ${warning}`);

// A stray error outside a request (a timer, a library callback) must never take the API down silently: that is
// what makes the web app show "proxy error". It is logged (message only: no bodies, codes or coordinates).
process.on('unhandledRejection', (reason) => {
  console.error(`[server] unhandled promise rejection: ${reason?.message ?? reason}`);
});
process.on('uncaughtException', (error) => {
  console.error(`[server] uncaught error: ${error?.stack ?? error}`);
});

const pool = createPool(config.databaseUrl);
const mailer = createMailer(config);
const { app, services } = createApp({ pool, config, mailer, clock: systemClock });

// BR52: say once how login codes reach people, so nobody wonders where the code is.
services.settings
  .otpPreview()
  .then((preview) => {
    if (preview) {
      console.log(
        '[mail] Code preview is ON (admin switch): every login code is also shown in the test inbox and printed here.',
      );
    }
  })
  .catch(() => {}); // the database message below explains a missing database

// Tells the operator straight away whether login codes can be delivered (wrong password, blocked port ...).
mailer.verify().then(({ ok, detail }) => (ok ? console.log : console.error)(`[mail] ${detail}`));

// The pre-seeded admin accounts (ADMIN_EMAILS, BR26/BR37) exist on every server, however it was started: missing
// ones are created and existing ones stay admins. Safe to repeat on every start. Without the database (not up
// yet) the start goes on; the next start or "npm run db:seed" adds them.
seedAdmins(pool, config.adminEmails)
  .then(() => console.log(`[admin] ${config.adminEmails.length} admin account(s) ready`))
  .catch((error) => console.error(`[admin] admin accounts not checked: ${error.message}`));

// Seeded quiz texts are placeholders (seed.js): say so on every start until admins have replaced them.
countPlaceholders(pool)
  .then((counts) => {
    const warning = placeholderWarning(counts);
    if (warning) console.warn(`[content] warning: ${warning}`);
  })
  .catch(() => {}); // the database message below explains a missing database

// A stopped database (Docker Desktop closed) is the usual development problem: say so once, in plain words,
// instead of repeating the raw connection error every few seconds, and say when it is back.
let databaseDown = false;
function reportDatabase(error) {
  if (!error) {
    if (databaseDown) console.log('[db] MySQL is reachable again.');
    databaseDown = false;
    return;
  }
  if (error.code !== 'ECONNREFUSED' && error.code !== 'ETIMEDOUT') {
    console.error(`[db] ${error.message}`);
    return;
  }
  if (!databaseDown) {
    console.error(
      '[db] MySQL is not reachable. Start Docker Desktop, then run "npm run db:up" (also works in the backend folder) ' +
        '(or start everything with "npm run dev" from the project root folder). Login needs the database.',
    );
  }
  databaseDown = true;
}

const EXPIRY_SWEEP_MS = 10_000;
const HOUSEKEEPING_MS = 10 * 60 * 1000;

// Closes overdue attempts even if nobody asks for them (BR16, BR22).
const sweep = setInterval(() => {
  services.quiz
    .finalizeAllExpired()
    .then(() => reportDatabase(null))
    .catch(reportDatabase);
}, EXPIRY_SWEEP_MS);

const housekeeping = setInterval(() => {
  Promise.all([
    services.auth.purgeOldOtps(),
    services.auth.purgeOldSessions(),
    services.teams.expireOldInvitations(),
    services.quiz.purgeOldLocationChecks(),
  ]).catch((error) => console.error(`[housekeeping] ${error.message}`));
}, HOUSEKEEPING_MS);

const server = app.listen(config.port, () => {
  console.log(`Campus & City Quest API listening on http://localhost:${config.port}`);
});

// A port that is taken (another API still running) gets one clear line instead of a stack trace.
server.on('error', (error) => {
  // Without a listening port the API is useless, so any listen error ends the process with a clear line.
  const text = describeListenError(error, config.port) ?? `could not listen: ${error.message}`;
  console.error(`[server] ${text}`);
  clearInterval(sweep);
  clearInterval(housekeeping);
  pool.end().finally(() => process.exit(1));
});

function shutdown() {
  clearInterval(sweep);
  clearInterval(housekeeping);
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
