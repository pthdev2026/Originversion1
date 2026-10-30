/** Lecture signée Mux d'un film long : durée de vie du jeton, renouvellement, échéance annoncée au lecteur. */
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';
import { createMuxSigner } from './signer.ts';

const privateBase64 = Buffer.from(generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64');
const signer = createMuxSigner({ ttlSeconds: 14_400, signing: { keyId: 'kid-123456', privateKey: privateBase64 } });
const asset = (durationSeconds: number) => ({ playbackId: 'film', storagePath: 'x', provider: 'mux' as const, providerPlaybackId: 'pid-9', providerPolicy: 'signed' as const, durationSeconds });
const expOf = (url: string) => JSON.parse(Buffer.from((new URL(url).searchParams.get('token') as string).split('.')[1] as string, 'base64url').toString()).exp as number;
const NOW = 1_700_000_000_000;

describe('lecture signée Mux — films longs', () => {
  it('un film de 2 h garde la durée habituelle (4 h) ; un film de 6 h obtient durée + 1 h', () => {
    const short = signer.sign(asset(7_200), { publicOrigin: 'x', now: NOW });
    assert.equal(expOf(short.manifestUrl), NOW / 1000 + 14_400);
    const long = signer.sign(asset(21_600), { publicOrigin: 'x', now: NOW });
    assert.equal(expOf(long.manifestUrl), NOW / 1000 + 21_600 + 3_600, 'le jeton survit à toute la lecture');
  });

  it('l’échéance annoncée au lecteur est celle du jeton (manifeste et affiche alignés)', () => {
    const signed = signer.sign(asset(21_600), { publicOrigin: 'x', now: NOW });
    assert.equal(signed.expiresAt.getTime() / 1000, expOf(signed.manifestUrl));
    assert.equal(expOf(signed.posterUrl), expOf(signed.manifestUrl));
  });

  it('un nouvel appel plus tard fournit un jeton plus récent (renouvellement avant échéance)', () => {
    const first = signer.sign(asset(7_200), { publicOrigin: 'x', now: NOW });
    const later = signer.sign(asset(7_200), { publicOrigin: 'x', now: NOW + 3 * 3_600_000 });
    assert.ok(later.expiresAt.getTime() > first.expiresAt.getTime());
    assert.notEqual(first.manifestUrl, later.manifestUrl);
  });

  it('durée inconnue : le jeton garde au moins la durée habituelle', () => {
    const unknown = signer.sign({ ...asset(0), durationSeconds: undefined }, { publicOrigin: 'x', now: NOW });
    assert.ok(expOf(unknown.manifestUrl) >= NOW / 1000 + 14_400);
  });
});
