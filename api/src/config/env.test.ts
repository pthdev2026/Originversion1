import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigError, loadConfig } from './env.ts';

describe('configuration', () => {
  it('applique des valeurs de développement par défaut', () => {
    const config = loadConfig({});
    assert.equal(config.env, 'development');
    assert.equal(config.port, 4000);
    assert.equal(config.mediaSecretIsEphemeral, true);
    assert.equal(config.mediaTtlSeconds, 4 * 60 * 60);
  });

  it('refuse un port invalide', () => {
    assert.throws(() => loadConfig({ PORT: 'abc' }), ConfigError);
    assert.throws(() => loadConfig({ PORT: '70000' }), ConfigError);
  });

  it('exige les secrets en production', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /MEDIA_SECRET est obligatoire/);
  });

  it('accepte une configuration de production complète', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://u:p@db:5432/origin',
      MEDIA_SECRET: 'x'.repeat(40),
      CORS_ORIGINS: 'https://origin.example, https://www.origin.example',
    });
    assert.equal(config.isProduction, true);
    assert.equal(config.mediaSecretIsEphemeral, false);
    assert.deepEqual(config.corsOrigins, ['https://origin.example', 'https://www.origin.example']);
  });

  it('refuse un secret trop court', () => {
    assert.throws(() => loadConfig({ MEDIA_SECRET: 'court' }), /au moins 32 caractères/);
  });
});
