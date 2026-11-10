// Puts the test database into a known state: every table is dropped (so that the migrations really run
// again), then migrated and seeded. Never touches any database except campusquest_test.
import { migrate } from '../../backend/src/db/migrate.js';
import { createPool } from '../../backend/src/db/pool.js';
import {
  seedAdmins,
  seedImages,
  seedPlaceholderFacts,
  seedPlaceholderQuestions,
  seedReference,
} from '../../backend/src/db/seed.js';
import { loadConfig } from '../../backend/src/config.js';
import { testDatabaseUrl } from './env.mjs';

export async function resetDatabase(dbUrl = testDatabaseUrl()) {
  testDatabaseUrl({ TEST_DATABASE_URL: dbUrl, CI: process.env.CI }); // the same check, on the value that is used
  const pool = createPool(dbUrl);
  try {
    const conn = await pool.getConnection();
    try {
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      const [tables] = await conn.query('SHOW TABLES');
      for (const row of tables)
        await conn.query(`DROP TABLE IF EXISTS \`${Object.values(row)[0]}\``);
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    } finally {
      conn.release();
    }
  } finally {
    await pool.end();
  }

  await migrate(dbUrl, () => {});

  const seedPool = createPool(dbUrl);
  try {
    await seedReference(seedPool);
    await seedPlaceholderQuestions(seedPool);
    await seedPlaceholderFacts(seedPool);
    await seedImages(seedPool);
    await seedAdmins(seedPool, loadConfig({ NODE_ENV: 'development' }).adminEmails);
    // Canary: the state every Python test relies on.
    const [[admin]] = await seedPool.query("SELECT student_id FROM students WHERE role = 'admin'");
    const [[{ checkpoints }]] = await seedPool.query(
      'SELECT COUNT(*) AS checkpoints FROM checkpoints',
    );
    const [[{ rules }]] = await seedPool.query('SELECT COUNT(*) AS rules FROM scoring_multiplier');
    if (admin?.student_id !== 1 || Number(checkpoints) !== 8 || Number(rules) !== 6) {
      throw new Error(
        'the test database is not in the expected state after the reset (admin id 1, 8 checkpoints, 6 multipliers)',
      );
    }
  } finally {
    await seedPool.end();
  }
}
