import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMediaToken, verifyMediaToken } from './token.ts';

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

describe('rotation du secret', () => {
  it('accepte un jeton signé avec l’ancien secret tant qu’il figure dans la liste', () => {
    const oldSecret = 'ancien-secret-ancien-secret-ancien-12';
    const newSecret = 'nouveau-secret-nouveau-secret-nouv-34';
    const { token } = createMediaToken(oldSecret, 'film', 60);
    assert.equal(verifyMediaToken([newSecret, oldSecret], 'film', token), true);
    assert.equal(verifyMediaToken([newSecret], 'film', token), false);
  });
});
