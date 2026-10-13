import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkPasswordPolicy, hashPassword, verifyPassword } from './password.ts';

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
});
