import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { base32Decode, base32Encode, newRecoveryCode, openSecret, otpauthUrl, sealSecret, stepAt, totpAtStep, verifyTotp } from './totp.ts';

describe('TOTP (RFC 6238)', () => {
  // Vecteurs officiels : secret ASCII « 12345678901234567890 », SHA-1, codes à 8 chiffres.
  const secret = Buffer.from('12345678901234567890');
  it('reproduit les vecteurs de test de la RFC 6238', () => {
    const vectors: [number, string][] = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037']];
    for (const [seconds, expected] of vectors) {
      assert.equal(totpAtStep(secret, Math.floor(seconds / 30), 8), expected, `t=${seconds}`);
    }
  });

  it('base32 : aller-retour et valeur connue', () => {
    assert.equal(base32Encode(secret), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    assert.deepEqual(base32Decode('gezd gnbv-GY3TQOJQGEZDGNBVGY3TQOJQ'), secret);
    assert.throws(() => base32Decode('0189'));
  });

  it('accepte ±1 pas, refuse au-delà et les formats invalides', () => {
    const b32 = base32Encode(secret);
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    const code = (s: number) => totpAtStep(secret, s);
    assert.equal(verifyTotp(b32, code(step), now), step);
    assert.equal(verifyTotp(b32, code(step - 1), now), step - 1);
    assert.equal(verifyTotp(b32, code(step + 1), now), step + 1);
    assert.equal(verifyTotp(b32, code(step + 2), now), null);
    assert.equal(verifyTotp(b32, code(step - 5), now), null);
    assert.equal(verifyTotp(b32, '12345', now), null);
    assert.equal(verifyTotp(b32, 'abcdef', now), null);
  });

  it('chiffre le secret au repos (aller-retour, clé fausse refusée, altération détectée)', () => {
    const sealed = sealSecret('une-cle-de-chiffrement-de-test-assez-longue', 'JBSWY3DPEHPK3PXP');
    assert.ok(!sealed.includes('JBSWY3DP'));
    assert.equal(openSecret('une-cle-de-chiffrement-de-test-assez-longue', sealed), 'JBSWY3DPEHPK3PXP');
    assert.throws(() => openSecret('une-autre-cle-de-chiffrement-assez-longue!!', sealed));
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('AA') ? 'BB' : 'AA');
    assert.throws(() => openSecret('une-cle-de-chiffrement-de-test-assez-longue', tampered));
  });

  it('URL otpauth et codes de secours bien formés', () => {
    const url = otpauthUrl({ secret: 'ABC234', email: 'a+b@mail.fr', issuer: 'ORIGIN' });
    assert.match(url, /^otpauth:\/\/totp\/ORIGIN%3Aa%2Bb%40mail\.fr\?secret=ABC234&issuer=ORIGIN/);
    const codes = new Set(Array.from({ length: 50 }, () => newRecoveryCode()));
    assert.equal(codes.size, 50);
    for (const code of codes) assert.match(code, /^[a-z2-7]{5}-[a-z2-7]{5}$/);
  });
});
