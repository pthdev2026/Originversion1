import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTtlCache } from './ttl-cache.ts';

describe('cache à durée de vie — lecture directe', () => {
  it('has/set : expire avec la durée de vie et reste borné', () => {
    let clock = 0;
    const cache = createTtlCache<true>({ ttlMs: 1000, maxEntries: 3, now: () => clock });
    for (const key of ['a', 'b', 'c', 'd']) cache.set(key, true);
    assert.equal(cache.size, 3);
    assert.equal(cache.has('a'), false, 'la plus ancienne est sortie');
    assert.equal(cache.has('d'), true);
    clock = 1500;
    assert.equal(cache.has('d'), false, 'expirée');
    assert.equal(createTtlCache<true>({ ttlMs: 0 }).has('x'), false);
  });
});

describe('cache à durée de vie', () => {
  it('ne charge qu’une fois dans la durée de vie, puis recharge', async () => {
    let clock = 0;
    let loads = 0;
    const cache = createTtlCache<number>({ ttlMs: 1000, now: () => clock });
    const load = async () => ++loads;
    assert.equal(await cache.getOrLoad('a', load), 1);
    clock = 999;
    assert.equal(await cache.getOrLoad('a', load), 1);
    clock = 1000;
    assert.equal(await cache.getOrLoad('a', load), 2);
  });

  it('regroupe les chargements simultanés (une seule lecture pour 100 demandes)', async () => {
    let loads = 0;
    const cache = createTtlCache<string>({ ttlMs: 1000 });
    const slow = async () => { loads += 1; await new Promise(resolve => setTimeout(resolve, 20)); return 'ok'; };
    const results = await Promise.all(Array.from({ length: 100 }, () => cache.getOrLoad('k', slow)));
    assert.equal(loads, 1);
    assert.ok(results.every(value => value === 'ok'));
  });

  it('ne mémorise pas une valeur refusée par cacheIf (introuvable) : 3000 inconnus ne chassent rien du cache', async () => {
    const cache = createTtlCache<string | null>({ ttlMs: 1000, maxEntries: 10 });
    await cache.getOrLoad('accueil', async () => 'accueil', value => value !== null);
    for (let i = 0; i < 3000; i++) await cache.getOrLoad(`inconnu-${i}`, async () => null, value => value !== null);
    assert.equal(cache.size, 1);
    let loads = 0;
    await cache.getOrLoad('accueil', async () => { loads += 1; return 'autre'; }, value => value !== null);
    assert.equal(loads, 0, 'l’accueil est toujours en cache');
  });

  it('ne mémorise jamais une erreur', async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000 });
    let attempt = 0;
    const flaky = async () => { attempt += 1; if (attempt === 1) throw new Error('panne'); return attempt; };
    await assert.rejects(cache.getOrLoad('k', flaky), /panne/);
    assert.equal(await cache.getOrLoad('k', flaky), 2, 'la requête suivante réessaie');
  });

  it('reste borné, vide à la demande, et ttl 0 désactive tout', async () => {
    const bounded = createTtlCache<number>({ ttlMs: 1000, maxEntries: 3 });
    for (let i = 0; i < 10; i += 1) await bounded.getOrLoad(`k${i}`, async () => i);
    assert.equal(bounded.size, 3);
    bounded.clear();
    assert.equal(bounded.size, 0);

    let loads = 0;
    const off = createTtlCache<number>({ ttlMs: 0 });
    await off.getOrLoad('a', async () => ++loads);
    await off.getOrLoad('a', async () => ++loads);
    assert.equal(loads, 2);
    assert.equal(off.size, 0);
  });
});
