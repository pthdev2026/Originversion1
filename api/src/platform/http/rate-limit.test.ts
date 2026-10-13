import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Hono } from 'hono';
import { AppError } from '../errors.ts';
import { rateLimit } from './rate-limit.ts';

function appWith(options: { max: number; now: () => number; keyOf?: () => string; maxKeys?: number }): Hono {
  const app = new Hono();
  app.use('*', rateLimit({ windowMs: 60_000, max: options.max, now: options.now, keyOf: options.keyOf ?? (() => 'ip-1'), ...(options.maxKeys ? { maxKeys: options.maxKeys } : {}) }));
  app.get('/', c => c.text('ok'));
  app.onError((error, c) => (error instanceof AppError ? c.json({ error: error.code }, error.status) : c.text('erreur', 500)));
  return app;
}

describe('limitation de débit', () => {
  it('laisse passer jusqu’à la limite puis répond 429 avec Retry-After', async () => {
    let t = 1_000_000;
    const app = appWith({ max: 3, now: () => t });
    for (let i = 0; i < 3; i += 1) assert.equal((await app.request('/')).status, 200);
    const blocked = await app.request('/');
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal(blocked.headers.get('ratelimit-remaining'), '0');
    t += 61_000; // la fenêtre est écoulée
    assert.equal((await app.request('/')).status, 200);
  });

  it('compte séparément chaque adresse', async () => {
    let ip = 'a';
    const app = appWith({ max: 1, now: () => 1, keyOf: () => ip });
    assert.equal((await app.request('/')).status, 200);
    assert.equal((await app.request('/')).status, 429);
    ip = 'b';
    assert.equal((await app.request('/')).status, 200);
  });

  it('borne sa mémoire quand les adresses se multiplient', async () => {
    let ip = 0;
    const app = appWith({ max: 5, now: () => 1, keyOf: () => `ip-${ip}`, maxKeys: 50 });
    for (ip = 0; ip < 500; ip += 1) assert.equal((await app.request('/')).status, 200);
  });
});
