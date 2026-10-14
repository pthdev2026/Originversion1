import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkPasswordPolicy, createLimiter, hashPassword, verifyPassword } from './password.ts';

describe('mots de passe', () => {
  it('hache avec argon2id et vérifie', async () => {
    const hash = await hashPassword('une phrase de passe solide');
    assert.match(hash, /^\$argon2id\$m=\d+,t=\d+,p=\d+\$/);
    assert.equal(await verifyPassword('une phrase de passe solide', hash), true);
    assert.equal(await verifyPassword('une phrase de passe fausse', hash), false);
  });

  it('produit deux empreintes différentes pour le même mot de passe (sel aléatoire)', async () => {
    assert.notEqual(await hashPassword('même mot de passe 1'), await hashPassword('même mot de passe 1'));
  });

  it('ne plante pas sur une empreinte illisible', async () => {
    assert.equal(await verifyPassword('x', 'pas-une-empreinte'), false);
  });

  it('applique la politique', () => {
    assert.match(checkPasswordPolicy('court', 'a@b.fr') ?? '', /au moins 10/);
    assert.match(checkPasswordPolicy('motdepasse1', 'a@b.fr') ?? '', /trop courant/);
    assert.match(checkPasswordPolicy('marie.dupont@mail.fr', 'marie.dupont@mail.fr') ?? '', /adresse e-mail/);
    assert.match(checkPasswordPolicy('aaaaaaaaaaaa', 'a@b.fr') ?? '', /répétitif/);
    assert.equal(checkPasswordPolicy('Un bon mot de passe 2026', 'a@b.fr'), null);
  });

  it('limite le nombre de tâches simultanées sans en perdre aucune', async () => {
    const limit = createLimiter(2);
    let running = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) => limit(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise(resolve => setTimeout(resolve, 10));
        running -= 1;
        return index;
      })),
    );
    assert.equal(peak, 2);
    assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
