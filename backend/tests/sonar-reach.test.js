// The unlock reach the map draws as the sonar range ring (BR12): each quest's radius plus the grace zone.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

describe('BR12 the sonar range ring gets the real unlock reach', () => {
  it('BR12 every quest in the list says how far away it can be unlocked: radius + grace zone', async () => {
    const student = await ctx.login('sonar');
    const { checkpoints } = (await student.agent.get('/api/checkpoints').expect(200)).body;
    expect(checkpoints.length).toBeGreaterThan(0);
    const grace = loadConfig(process.env).geofenceSlackM;
    for (const quest of checkpoints) {
      expect(quest.reachM, quest.name).toBe(quest.radius + grace);
    }
  });

  it('BR12 the reach leaves out the accuracy credit, so the map never promises more than the server', async () => {
    const student = await ctx.login('sonar2');
    const { checkpoints } = (await student.agent.get('/api/checkpoints').expect(200)).body;
    const config = loadConfig(process.env);
    expect(checkpoints[0].reachM).toBeLessThan(
      checkpoints[0].radius + config.geofenceSlackM + config.accuracyCreditM,
    );
  });
});
