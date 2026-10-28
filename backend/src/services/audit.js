// Audit trail (logins, logouts, account and admin actions). Never put e-mail addresses, codes or coordinates in `detail`.
import { at } from '../clock.js';

/** Writes one event. `conn` can be the pool or a transaction connection. */
export async function recordEvent(
  conn,
  now,
  { studentId = null, actorId = null, type, detail = null },
) {
  await conn.query(
    'INSERT INTO audit_events (student_id, actor_id, event_type, detail, created_at) VALUES (?, ?, ?, ?, ?)',
    [studentId, actorId, type, detail && detail.slice(0, 300), at(now)],
  );
}
