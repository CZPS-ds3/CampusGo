import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MAP_STYLE, normalizeColor, validateMapStyle } from '../src/services/map-style.js';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

describe('BR48 colours', () => {
  it('BR48 hex and rgb() colours become #rrggbb; anything else is refused', () => {
    expect(normalizeColor('#ABC')).toBe('#aabbcc');
    expect(normalizeColor(' #E2001A ')).toBe('#e2001a');
    expect(normalizeColor('rgb(226, 0, 26)')).toBe('#e2001a');
    expect(normalizeColor('RGB(0,0,0)')).toBe('#000000');
    for (const bad of [
      'rgb(256,0,0)',
      'rgb(1,2)',
      'red',
      '#12',
      '#gggggg',
      '',
      null,
      5,
      'url(x)',
    ]) {
      expect(normalizeColor(bad), String(bad)).toBeNull();
    }
  });

  it('BR48 a style is checked as a whole and names every problem', () => {
    const attempt = () =>
      validateMapStyle({ base: 'purple', tint: { color: 'x', strength: 150 }, extra: 1 });
    expect(attempt).toThrowError(/base must be one of/);
    expect(attempt).toThrowError(/tint\.color is not a colour/);
    expect(attempt).toThrowError(/tint\.strength must be a whole number/);
    expect(attempt).toThrowError(/extra is not a known setting/);
    expect(validateMapStyle({ pins: { open: 'rgb(1, 2, 3)' } }).pins).toEqual({
      ...DEFAULT_MAP_STYLE.pins,
      open: '#010203',
    });
  });
});

describe('BR48 one map style per account', () => {
  it('BR48 a new account has the default style: follows the app theme, which is light', async () => {
    const student = await ctx.login('new');
    const { body } = await student.agent.get('/api/me/map-style').expect(200);
    expect(body.style).toEqual(DEFAULT_MAP_STYLE);
    expect(body.style.base).toBe('follow');
  });

  it('BR48 saving replaces the one style; it follows the account, not the device', async () => {
    const first = await ctx.login('painter');
    const custom = {
      preset: 'ocean',
      base: 'light',
      tint: { color: 'rgb(0, 120, 200)', strength: 35 },
      pins: { open: '#0077cc', done: '#00aa66', locked: '#556677' },
      highlight: '#ffaa00',
      route: 'rgb(255, 0, 128)',
    };
    const saved = await first.agent.put('/api/me/map-style').send(custom).expect(200);
    expect(saved.body.style.tint).toEqual({ color: '#0078c8', strength: 35 });
    expect(saved.body.style.route).toBe('#ff0080');
    await first.agent.put('/api/me/map-style').send({ base: 'dark' }).expect(200);
    const [[row]] = await ctx.pool.query(
      'SELECT COUNT(*) AS n FROM students WHERE map_style IS NOT NULL',
    );
    expect(row.n).toBe(1);

    // A login on "another device" (a new session) gets the same style.
    const again = await ctx.login('painter');
    const { body } = await again.agent.get('/api/me/map-style').expect(200);
    expect(body.style.base).toBe('dark');
    expect(body.style.preset).toBe('classic'); // the second save replaced the whole style
    const other = await ctx.login('someone-else');
    expect((await other.agent.get('/api/me/map-style').expect(200)).body.style).toEqual(
      DEFAULT_MAP_STYLE,
    );
  });

  it('BR48 invalid styles are refused with the reason and nothing is saved', async () => {
    const student = await ctx.login('careful');
    const res = await student.agent
      .put('/api/me/map-style')
      .send({ pins: { open: 'banana' }, tint: { strength: 101 } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_MAP_STYLE');
    expect(res.body.error.message).toMatch(/pins.open is not a colour/);
    expect(res.body.error.message).toMatch(/tint.strength/);
    expect((await student.agent.get('/api/me/map-style')).body.style).toEqual(DEFAULT_MAP_STYLE);
    await student.agent.put('/api/me/map-style').send([1]).expect(400);
  });

  it('BR48 reset brings the default back, and the endpoints need a login', async () => {
    const student = await ctx.login('resetter');
    await student.agent.put('/api/me/map-style').send({ base: 'dark' }).expect(200);
    const res = await student.agent.delete('/api/me/map-style').expect(200);
    expect(res.body.style).toEqual(DEFAULT_MAP_STYLE);
    const [[row]] = await ctx.pool.query('SELECT map_style FROM students WHERE student_id = ?', [
      student.student.id,
    ]);
    expect(row.map_style).toBeNull();
    await request(ctx.app).get('/api/me/map-style').expect(401);
    await request(ctx.app).put('/api/me/map-style').send({}).expect(401);
  });

  it('BR48 erasing an account clears its map style', async () => {
    const student = await ctx.login('erased');
    await student.agent.put('/api/me/map-style').send({ base: 'dark' }).expect(200);
    await student.agent.delete('/api/me').expect(204);
    const [[row]] = await ctx.pool.query('SELECT map_style FROM students WHERE student_id = ?', [
      student.student.id,
    ]);
    expect(row.map_style).toBeNull();
  });
});
