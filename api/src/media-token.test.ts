import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';
import { createMediaToken, verifyMediaToken } from './media-token.ts';
import { resolveMediaPath } from './app.ts';

describe('jeton de lecture', () => {
  const secret = 'secret-de-test';

  it('accepte un jeton valide pour le bon programme', () => {
    const { token } = createMediaToken(secret, 'deux-fois-oui', 60);
    assert.equal(verifyMediaToken(secret, 'deux-fois-oui', token), true);
  });

  it('refuse un autre programme', () => {
    const { token } = createMediaToken(secret, 'deux-fois-oui', 60);
    assert.equal(verifyMediaToken(secret, 'le-jour', token), false);
  });

  it('refuse un jeton expiré', () => {
    const { token } = createMediaToken(secret, 'deux-fois-oui', 60, Date.now() - 120_000);
    assert.equal(verifyMediaToken(secret, 'deux-fois-oui', token), false);
  });

  it('refuse une signature altérée ou un mauvais secret', () => {
    const { token } = createMediaToken(secret, 'deux-fois-oui', 60);
    assert.equal(verifyMediaToken(secret, 'deux-fois-oui', `${token}x`), false);
    assert.equal(verifyMediaToken('autre', 'deux-fois-oui', token), false);
    assert.equal(verifyMediaToken(secret, 'deux-fois-oui', 'n-importe-quoi'), false);
  });
});

describe('résolution des chemins', () => {
  const root = path.resolve('/srv/hls');

  it('autorise les fichiers du programme', () => {
    assert.equal(resolveMediaPath(root, 'a', 'v0/seg_00001.m4s'), path.join(root, 'a', 'v0', 'seg_00001.m4s'));
  });

  it('refuse toute sortie du dossier', () => {
    assert.equal(resolveMediaPath(root, 'a', '../b/master.m3u8'), null);
    assert.equal(resolveMediaPath(root, 'a', '../../etc/passwd'), null);
    assert.equal(resolveMediaPath(root, 'a', ''), null);
  });
});
