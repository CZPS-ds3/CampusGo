import { createHmac } from 'node:crypto';
import mysql from 'mysql2/promise';

/**
 * Makes `code` the valid login code of `email` in the test database. Real codes are only e-mailed (and stored as
 * hashes), so a test cannot read them: it writes the hash of a known code instead, exactly as the API does, and
 * then types the code into the page. Needs CQ_TEST_DB_URL and CQ_OTP_SECRET, which `npm run test:e2e:full` sets.
 */
export async function plantCode(email, code = '123456') {
  const url = process.env.CQ_TEST_DB_URL;
  const secret = process.env.CQ_OTP_SECRET;
  if (!url || !secret || new URL(url).pathname !== '/campusquest_test') {
    throw new Error(
      'run this test with: npm run test:e2e:full (test database and test secret only)',
    );
  }
  const address = email.trim().toLowerCase();
  const digest = createHmac('sha256', secret).update(`${address}:${code}`).digest('hex');
  const connection = await mysql.createConnection({ uri: url, timezone: 'Z' });
  try {
    await connection.query(
      'UPDATE otp_codes SET code_hash = ? WHERE email = ? AND is_used = 0 ORDER BY created_at DESC LIMIT 1',
      [digest, address],
    );
  } finally {
    await connection.end();
  }
  return code;
}
