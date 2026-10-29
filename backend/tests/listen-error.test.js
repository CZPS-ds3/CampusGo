import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { describeListenError } from '../src/listen-error.js';

describe('start-up errors are explained in plain words', () => {
  it('a port that is already in use says so and names the port and a way out', () => {
    const text = describeListenError({ code: 'EADDRINUSE' }, 3000);
    expect(text).toMatch(/Port 3000 is already in use/);
    expect(text).toMatch(/Get-NetTCPConnection -LocalPort 3000/);
    expect(text).toMatch(/PORT in backend\/\.env/);
  });

  it('a refused port gives a permission hint', () => {
    expect(describeListenError({ code: 'EACCES' }, 80)).toMatch(/permission denied/);
  });

  it('unknown errors are not explained, so the real error stays visible', () => {
    expect(describeListenError(new Error('boom'), 3000)).toBeNull();
    expect(describeListenError(undefined, 3000)).toBeNull();
  });

  it('a real second listener on a busy port produces the EADDRINUSE error that is explained', async () => {
    const first = createServer();
    await new Promise((resolve) => first.listen(0, resolve));
    const { port } = first.address();
    const second = createServer();
    const error = await new Promise((resolve) => {
      second.once('error', resolve);
      second.listen(port);
    });
    first.close();
    expect(error.code).toBe('EADDRINUSE');
    expect(describeListenError(error, port)).toContain(`Port ${port} is already in use`);
  });
});
