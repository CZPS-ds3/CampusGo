// Console table and the data for tests/reports/summary.json.
const out = (text = '') => process.stdout.write(`${text}\n`);

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

/** Prints the result of the last attempt and a note about every failure of earlier attempts. */
export function printSummary(attempts, verdict, categories) {
  const last = attempts.at(-1);
  out('\n==================== TEST SUMMARY ====================');
  for (const category of categories) {
    const result = last.find((r) => r.id === category.id);
    const status = !result ? 'not run' : result.ok ? 'PASS' : 'FAIL';
    out(
      `${status.padEnd(8)} ${category.id.padEnd(16)} ${category.kind.padEnd(12)} ${result ? seconds(result.ms) : ''}`,
    );
  }
  const earlier = attempts
    .slice(0, -1)
    .flat()
    .filter((r) => !r.ok);
  if (earlier.length > 0) {
    out(
      '\nFailures in earlier attempts (visible on purpose, a pass after a restart can hide a flaky test):',
    );
    for (const r of earlier) out(`  - ${r.id}: ${r.tail.trim().split('\n').slice(-2).join(' / ')}`);
  }
  out(`\nVERDICT: ${verdict} after ${attempts.length} attempt(s)`);
  out('=======================================================');
  return {
    verdict,
    attempts: attempts.map((results, i) => ({
      attempt: i + 1,
      categories: results.map(({ id, kind, ok, ms, code }) => ({ id, kind, ok, ms, code })),
      failure:
        results
          .find((r) => !r.ok)
          ?.tail.trim()
          .split('\n')
          .slice(-6) ?? null,
    })),
  };
}
