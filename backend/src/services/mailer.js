import nodemailer from 'nodemailer';

// A mailer has send({ to, subject, text, html? }), idle() (resolves when queued mails are handled) and
// verify() (resolves to { ok, detail } after checking the connection and login).
function withQueue(deliver) {
  const pending = new Set();
  return {
    send(message) {
      // Delivered after the HTTP response is sent so timing does not reveal whether an account exists (R-32).
      // The recipient is not logged: an e-mail address is personal data.
      const job = Promise.resolve()
        .then(() => deliver(message))
        .catch((error) => console.error(`[mail] delivery failed: ${error.message}`))
        .finally(() => pending.delete(job));
      pending.add(job);
    },
    idle: () => Promise.all([...pending]),
  };
}

/** SMTP transport. Credentials only ever travel encrypted: implicit TLS on 465, STARTTLS required otherwise. */
export function createSmtpTransport(smtp) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure,
    tls: { minVersion: 'TLSv1.2' },
    auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/** Real SMTP whenever SMTP_HOST is set; otherwise (development only) the OTP is printed to the console. */
export function createMailer(config, { transport } = {}) {
  if (config.smtp.host) {
    const smtp = transport ?? createSmtpTransport(config.smtp);
    return {
      ...withQueue((message) => smtp.sendMail({ from: config.smtp.from, ...message })),
      verify: () =>
        smtp.verify().then(
          () => ({ ok: true, detail: `SMTP ready (${config.smtp.host}:${config.smtp.port})` }),
          (error) => ({ ok: false, detail: `SMTP check failed: ${error.message}` }),
        ),
    };
  }
  // Development only: keep the latest mail per address so the dev-only /api/dev/last-otp route can show it.
  const latest = new Map();
  const queue = withQueue((message) => {
    if (!config.isDev) {
      throw new Error('no SMTP_HOST configured, the e-mail was not sent');
    }
    latest.set(message.to, message);
    console.log(`[mail:dev] to ${message.to}\n${message.text}`);
  });
  return {
    ...queue,
    lastTo: (to) => latest.get(to),
    verify: async () => ({
      ok: config.isDev,
      detail: config.isDev
        ? 'No SMTP_HOST: OTP codes are printed to this console (development only).'
        : 'No SMTP_HOST: OTP e-mails cannot be sent.',
    }),
  };
}

/** In-memory mailer for tests: every mail is kept in `outbox`. */
export function createTestMailer() {
  const outbox = [];
  const queue = withQueue((message) => outbox.push(message));
  return {
    ...queue,
    outbox,
    lastTo: (to) => [...outbox].reverse().find((m) => m.to === to),
    verify: async () => ({ ok: true, detail: 'test mailer' }),
  };
}
