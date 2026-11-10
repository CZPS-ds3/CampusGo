// Reads environment variables once and returns a plain config object.
const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const DEV_SECRETS = new Set([
  '',
  'dev-session-secret',
  'dev-otp-secret',
  'change-me-session-secret',
  'change-me-otp-secret',
]);
const MIN_SECRET_LENGTH = 32;

/**
 * "trust proxy" must match the real deployment: trusting X-Forwarded-For without a proxy lets any client
 * pick its own IP and slip past the rate limits. Default: trust nothing. Set TRUST_PROXY=1 behind one proxy.
 */
function trustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  const hops = Number.parseInt(value, 10);
  return Number.isFinite(hops) ? hops : value;
}

/** BR37: the pre-seeded administrators. The first one is the main admin and takes id 1. */
export const DEFAULT_ADMIN_EMAILS = 'sekretariat.dski@heilbronn.dhbw.de,dhbw.campus@gmail.com';

/** `ADMIN_EMAIL` holds one address or several, separated by commas. */
function adminEmails(value) {
  const parse = (text) =>
    String(text)
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  const list = parse(value ?? '');
  return [...new Set(list.length > 0 ? list : parse(DEFAULT_ADMIN_EMAILS))];
}

export function loadConfig(env = process.env) {
  const admins = adminEmails(env.ADMIN_EMAIL);
  const nodeEnv = env.NODE_ENV ?? 'development';
  const smtpPort = int(env.SMTP_PORT, 587);
  return {
    nodeEnv,
    isDev: nodeEnv === 'development',
    isTest: nodeEnv === 'test',
    isProd: nodeEnv === 'production',
    port: int(env.PORT, 3000),
    frontendOrigin: env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    trustProxy: trustProxy(env.TRUST_PROXY),
    databaseUrl:
      env.NODE_ENV === 'test'
        ? (env.TEST_DATABASE_URL ?? 'mysql://cq:cq_dev_password@127.0.0.1:3307/campusquest_test')
        : (env.DATABASE_URL ?? 'mysql://cq:cq_dev_password@127.0.0.1:3307/campusquest'),
    sessionSecret: env.SESSION_SECRET ?? 'dev-session-secret',
    otpSecret: env.OTP_SECRET ?? 'dev-otp-secret',
    adminEmails: admins,
    adminEmail: admins[0],
    allowedEmailDomain: (env.ALLOWED_EMAIL_DOMAIN ?? 'heilbronn.dhbw.de').toLowerCase(),
    otpTtlMinutes: int(env.OTP_TTL_MINUTES, 10),
    otpMaxFailedAttempts: int(env.OTP_MAX_FAILED_ATTEMPTS, 5),
    otpResendCooldownSeconds: int(env.OTP_RESEND_COOLDOWN_SECONDS, 30),
    otpResendMaxPerHour: int(env.OTP_RESEND_MAX_PER_HOUR, 5),
    // BR52: start value of the admin switch "show the login code in the test inbox" (the admin can change it).
    otpPreviewDefault: env.OTP_PREVIEW_DEFAULT
      ? env.OTP_PREVIEW_DEFAULT === 'true'
      : nodeEnv === 'development',
    sessionInactivityMinutes: int(env.SESSION_INACTIVITY_MINUTES, 30),
    invitationTtlHours: int(env.INVITATION_TTL_HOURS, 24),
    // Geofencing settings (Main Project Document, section 5 "Settings kept in one config file").
    maxAccuracyM: int(env.MAX_ACCURACY_M, 200), // laptops and indoor phones are often 50-200 m off
    geofenceSlackM: int(env.GEOFENCE_SLACK_M, 30), // grace zone added to every radius
    accuracyCreditM: int(env.ACCURACY_CREDIT_M, 50), // at most this much of a reading's error margin counts for the student
    nearerMarginM: int(env.NEARER_MARGIN_M, 20), // another checkpoint must be this much nearer to win
    maxPositionAgeMs: int(env.MAX_POSITION_AGE_MS, 30_000),
    secondsPerQuestion: int(env.SECONDS_PER_QUESTION, 60), // BR13
    verifyLimitPerMin: int(env.VERIFY_LIMIT_PER_MIN, 10),
    locationRetentionDays: int(env.LOCATION_RETENTION_DAYS, 7),
    maxProfilePictureBytes: int(env.MAX_PROFILE_PICTURE_MB, 2) * 1024 * 1024,
    smtp: {
      host: env.SMTP_HOST ?? '',
      port: smtpPort,
      // Port 465 is implicit TLS; 587 upgrades with STARTTLS, which we then require.
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : smtpPort === 465,
      user: env.SMTP_USER ?? '',
      password: env.SMTP_PASSWORD ?? '',
      from: env.SMTP_FROM ?? 'DHBW campusGO <no-reply@localhost>',
    },
    uploadDir: env.UPLOAD_DIR ?? 'uploads',
  };
}

/**
 * Refuses to start production with development defaults: guessable secrets would let anyone forge
 * OTP hashes, and without SMTP no student could ever receive a login code. Returns a list of problems.
 */
export function productionProblems(config) {
  if (!config.isProd) return [];
  const problems = [];
  for (const [name, value] of [
    ['SESSION_SECRET', config.sessionSecret],
    ['OTP_SECRET', config.otpSecret],
  ]) {
    if (DEV_SECRETS.has(value) || value.length < MIN_SECRET_LENGTH) {
      problems.push(`${name} must be a random value of at least ${MIN_SECRET_LENGTH} characters.`);
    }
  }
  if (!config.smtp.host) problems.push('SMTP_HOST is required so that OTP e-mails can be sent.');
  if (!config.frontendOrigin.startsWith('https://')) {
    problems.push('FRONTEND_ORIGIN must be an https:// address (geolocation needs HTTPS).');
  }
  return problems;
}

/**
 * Things that are allowed but risky in production: printed as warnings at start-up, never a reason to refuse.
 * The code preview (BR52) lets anyone log in as anyone, so a live system should start with it off.
 */
export function productionWarnings(config) {
  if (!config.isProd) return [];
  return config.otpPreviewDefault
    ? [
        'OTP_PREVIEW_DEFAULT=true: login codes are shown on the login page until an admin turns it off.',
      ]
    : [];
}
