import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import pino from 'pino';
import { createLogMailer, createResendMailer } from './mail.ts';

describe('envoi d’e-mails', () => {
  it('Resend : requête complète, clé en en-tête, corps JSON', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const mailer = createResendMailer({
      apiKey: 're_secret_key', from: 'ORIGIN <no-reply@origin.test>',
      fetch: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('{"id":"1"}', { status: 200 }); }) as typeof fetch,
    });
    await mailer.send({ to: 'a@mail.fr', subject: 'Sujet', text: 'Corps' });
    assert.equal(calls[0]?.url, 'https://api.resend.com/emails');
    assert.equal((calls[0]?.init.headers as Record<string, string>)['Authorization'], 'Bearer re_secret_key');
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { from: 'ORIGIN <no-reply@origin.test>', to: ['a@mail.fr'], subject: 'Sujet', text: 'Corps' });
  });

  it('Resend : une erreur du fournisseur échoue sans exposer la clé', async () => {
    const mailer = createResendMailer({ apiKey: 're_secret_key', from: 'x@y.z', fetch: (async () => new Response('{"message":"nope"}', { status: 422 })) as typeof fetch });
    await assert.rejects(mailer.send({ to: 'a@mail.fr', subject: 's', text: 't' }), (error: Error) => {
      assert.match(error.message, /HTTP 422/);
      assert.ok(!error.message.includes('re_secret_key'));
      return true;
    });
  });

  it('journal : le corps (lien secret) n’est pas écrit en production', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (line: string) => { lines.push(line); } });
    await createLogMailer(logger, { includeBody: false }).send({ to: 'a@mail.fr', subject: 'S', text: 'lien-secret' });
    await createLogMailer(logger, { includeBody: true }).send({ to: 'a@mail.fr', subject: 'S', text: 'lien-secret' });
    assert.ok(!lines[0]?.includes('lien-secret'));
    assert.ok(lines[1]?.includes('lien-secret'));
  });
});
