import { describe, expect, it, vi } from 'vitest';
import { waitForDatabase } from '../src/db/migrate.js';

const refused = () => Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });

describe('CI: the migration waits for a database that is still starting', () => {
  it('returns at once when the database is already up', async () => {
    const pool = { query: vi.fn().mockResolvedValue([[{ 1: 1 }]]) };
    await waitForDatabase(pool, { waitSeconds: 5, log: () => {} });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('keeps trying while the connection is refused, then succeeds', async () => {
    const pool = {
      query: vi
        .fn()
        .mockRejectedValueOnce(refused())
        .mockRejectedValueOnce(refused())
        .mockResolvedValue([[{ 1: 1 }]]),
    };
    const log = vi.fn();
    await waitForDatabase(pool, { waitSeconds: 30, log });
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledTimes(1); // the "waiting" line is printed once, not per try
  });

  it('gives up with the real error when the database never comes up', async () => {
    const pool = { query: vi.fn().mockRejectedValue(refused()) };
    await expect(waitForDatabase(pool, { waitSeconds: 0, log: () => {} })).rejects.toMatchObject({
      code: 'ECONNREFUSED',
    });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('does not wait for errors that waiting cannot fix, such as a wrong password', async () => {
    const wrong = Object.assign(new Error('Access denied'), { code: 'ER_ACCESS_DENIED_ERROR' });
    const pool = { query: vi.fn().mockRejectedValue(wrong) };
    await expect(waitForDatabase(pool, { waitSeconds: 60, log: () => {} })).rejects.toBe(wrong);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
