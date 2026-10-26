import nodemailer from 'nodemailer';

// A mailer has send({ to, subject, text }) and idle() (resolves when queued mails are handled).
function withQueue(deliver) {
  const pending = new Set();
  return {
    send(message) {
      // Delivered after the HTTP response is sent so timing does not reveal whether an account exists (R-32).
      const job = Promise.resolve()
        .then(() => deliver(message))
        .catch((error) => console.error(`[mail] delivery failed: ${error.message}`))
        .finally(() => pending.delete(job));
      pending.add(job);
    },
    idle: () => Promise.all([...pending]),
  };
}

/** Real SMTP in production; in development without SMTP_HOST the OTP is printed to the console. */
export function createMailer(config) {
  if (config.smtp.host) {
    const transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
    });
    return withQueue((message) => transport.sendMail({ from: config.smtp.from, ...message }));
  }
  // Development only: keep the latest mail per address so the dev-only /api/dev/last-otp route can show it.
  const latest = new Map();
  const queue = withQueue((message) => {
    if (!config.isDev) return;
    latest.set(message.to, message);
    console.log(`[mail:dev] to ${message.to}\n${message.text}`);
  });
  return { ...queue, lastTo: (to) => latest.get(to) };
}

/** In-memory mailer for tests: every mail is kept in `outbox`. */
export function createTestMailer() {
  const outbox = [];
  const queue = withQueue((message) => outbox.push(message));
  return { ...queue, outbox, lastTo: (to) => [...outbox].reverse().find((m) => m.to === to) };
}
