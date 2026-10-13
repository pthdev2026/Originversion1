import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { createBunnySigner, createOriginSigner } from '../playback/delivery.ts';
import { bunnyDirectoryToken, bunnySignedUrl } from './bunny-token.ts';

describe('jeton CDN Bunny', () => {
  const key = 'cle-de-securite-de-test';
  const directory = '/hls/mon-film/v1abc/';

  it('suit l’algorithme documenté : SHA-256 de clé + répertoire + expiration + token_path, en base64 URL-safe', () => {
    const expires = 1_800_000_000;
    const expected = createHash('sha256').update(`${key}${directory}${expires}token_path=${directory}`).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    assert.equal(bunnyDirectoryToken(key, directory, expires), expected);
    assert.doesNotMatch(bunnyDirectoryToken(key, directory, expires), /[+/=]/);
  });

  it('change quand la clé, le répertoire ou l’expiration changent', () => {
    const base = bunnyDirectoryToken(key, directory, 1000);
    assert.notEqual(base, bunnyDirectoryToken('autre-cle-de-test', directory, 1000));
    assert.notEqual(base, bunnyDirectoryToken(key, '/hls/autre/v1/', 1000));
    assert.notEqual(base, bunnyDirectoryToken(key, directory, 1001));
  });

  it('place le jeton dans le chemin, devant le fichier : les segments relatifs en héritent', () => {
    const url = bunnySignedUrl({ cdnUrl: 'https://videos.b-cdn.net', tokenKey: key }, directory, 'master.m3u8', 1_800_000_000);
    assert.match(url, /^https:\/\/videos\.b-cdn\.net\/bcdn_token=[\w-]+&expires=1800000000&token_path=%2Fhls%2Fmon-film%2Fv1abc%2F\/hls\/mon-film\/v1abc\/master\.m3u8$/);
  });

  it('refuse un répertoire mal formé', () => {
    assert.throws(() => bunnySignedUrl({ cdnUrl: 'https://x.b-cdn.net', tokenKey: key }, 'hls/x', 'f', 1));
  });
});

describe('signataires de livraison', () => {
  it('mode CDN : URLs signées sur le répertoire versionné du média', () => {
    const signer = createBunnySigner({ cdnUrl: 'https://videos.b-cdn.net/', tokenKey: 'cle-de-securite-de-test', ttlSeconds: 600 });
    const now = 1_700_000_000_000;
    const signed = signer.sign({ playbackId: 'film', storagePath: 'film/v9' }, { publicOrigin: 'http://x', now });
    assert.equal(signed.expiresAt.getTime(), now + 600_000);
    assert.match(signed.manifestUrl, /^https:\/\/videos\.b-cdn\.net\/bcdn_token=.+\/hls\/film\/v9\/master\.m3u8$/);
    assert.match(signed.posterUrl, /\/hls\/film\/v9\/poster\.jpg$/);
    assert.equal(signed.manifestUrl.includes('//bcdn'), false, 'pas de double barre');
  });

  it('mode origine : jeton API dans le chemin', () => {
    const signer = createOriginSigner({ secret: 'secret-test-secret-test-secret-test!!', ttlSeconds: 60 });
    const signed = signer.sign({ playbackId: 'film', storagePath: 'film' }, { publicOrigin: 'http://127.0.0.1:4000' });
    assert.match(signed.manifestUrl, /^http:\/\/127\.0\.0\.1:4000\/media\/\d+\.[\w-]+\/film\/master\.m3u8$/);
  });
});
