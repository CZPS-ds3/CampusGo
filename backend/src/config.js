// Reads environment variables once and returns a plain config object.
const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  return {
    nodeEnv,
    isDev: nodeEnv === 'development',
    isTest: nodeEnv === 'test',
    port: int(env.PORT, 3000),
    frontendOrigin: env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    databaseUrl:
      env.NODE_ENV === 'test'
        ? (env.TEST_DATABASE_URL ?? 'mysql://cq:cq_dev_password@127.0.0.1:3307/campusquest_test')
        : (env.DATABASE_URL ?? 'mysql://cq:cq_dev_password@127.0.0.1:3307/campusquest'),
    sessionSecret: env.SESSION_SECRET ?? 'dev-session-secret',
    otpSecret: env.OTP_SECRET ?? 'dev-otp-secret',
    allowedEmailDomain: (env.ALLOWED_EMAIL_DOMAIN ?? 'heilbronn.dhbw.de').toLowerCase(),
    otpTtlMinutes: int(env.OTP_TTL_MINUTES, 10),
    otpMaxFailedAttempts: int(env.OTP_MAX_FAILED_ATTEMPTS, 5),
    otpResendCooldownSeconds: int(env.OTP_RESEND_COOLDOWN_SECONDS, 30),
    otpResendMaxPerHour: int(env.OTP_RESEND_MAX_PER_HOUR, 5),
    sessionInactivityMinutes: int(env.SESSION_INACTIVITY_MINUTES, 30),
    invitationTtlHours: int(env.INVITATION_TTL_HOURS, 24),
    maxAccuracyM: int(env.MAX_ACCURACY_M, 50),
    locationVerificationValidMinutes: int(env.LOCATION_VERIFICATION_VALID_MINUTES, 5),
    locationRetentionDays: int(env.LOCATION_RETENTION_DAYS, 7),
    maxProfilePictureBytes: int(env.MAX_PROFILE_PICTURE_MB, 2) * 1024 * 1024,
    smtp: {
      host: env.SMTP_HOST ?? '',
      port: int(env.SMTP_PORT, 587),
      user: env.SMTP_USER ?? '',
      password: env.SMTP_PASSWORD ?? '',
      from: env.SMTP_FROM ?? 'Campus & City Quest <no-reply@localhost>',
    },
    uploadDir: env.UPLOAD_DIR ?? 'uploads',
  };
}
