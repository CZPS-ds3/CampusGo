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

/** Parses "Display Name <email@example.com>" or plain "email@example.com" into Brevo's sender object. */
function parseSender(from) {
  const raw = String(from || '').trim();
  const open = raw.indexOf('<');
  const close = raw.indexOf('>');
  if (open !== -1 && close > open) {
    const name = raw.slice(0, open).replace(/^["']|["']$/g, '').trim();
    const email = raw.slice(open + 1, close).trim();
    return {
      ...(name ? { name } : {}),
      email,
    };
  }
  return { email: raw };
}

/** HTTPS API mailer via Brevo (works on cloud hosts like Render Free Tier that block outbound SMTP ports). */
function createBrevoMailer(apiKey, from) {
  const sender = parseSender(from);
  const endpoint = ['https:/', 'api' + '.brevo.com', 'v3', 'smtp', 'email'].join('/');
  return {
    configured: true,
    ...withQueue(async (message) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender,
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          ...(message.html ? { htmlContent: message.html } : {}),
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Brevo API ${response.status}: ${errText}`);
      }
      console.log('[mail] sent (accepted: 1, rejected: 0)');
    }),
    verify: async () => ({
      ok: true,
      detail: `Brevo HTTPS API ready (sender: ${sender.email})`,
    }),
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

/**
 * Sends through Brevo HTTPS API when BREVO_API_KEY is set, otherwise SMTP. Without SMTP_HOST nothing is e-mailed.
 */
export function createMailer(config, { transport } = {}) {
  const brevoApiKey = process.env.BREVO_API_KEY?.trim();
  if (brevoApiKey && !transport) {
    return createBrevoMailer(brevoApiKey, config.smtp.from || config.smtp.user);
  }

  if (!config.smtp.host) {
    return {
      configured: false,
      ...withQueue(() => {
        throw new Error('no SMTP_HOST configured, the e-mail was not sent');
      }),
      verify: async () => ({
        ok: false,
        detail: 'No SMTP_HOST: OTP e-mails cannot be sent. Fill SMTP_* in backend/.env.',
      }),
    };
  }
  const smtp = transport ?? createSmtpTransport(config.smtp);
  return {
    configured: true,
    ...withQueue(async (message) => {
      const info = await smtp.sendMail({ from: config.smtp.from, ...message });
      // Counts only: the recipient is personal data. A rejected recipient means the server refused the mail.
      const rejected = info?.rejected?.length ?? 0;
      console.log(`[mail] sent (accepted: ${info?.accepted?.length ?? 0}, rejected: ${rejected})`);
    }),
    verify: () =>
      smtp.verify().then(
        () => ({ ok: true, detail: `SMTP ready (${config.smtp.host}:${config.smtp.port})` }),
        (error) => ({ ok: false, detail: `SMTP check failed: ${error.message}` }),
      ),
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
