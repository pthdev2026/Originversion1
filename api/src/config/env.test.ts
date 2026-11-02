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

  it('origine unique : l\'adresse publique configurée est toujours de confiance, sans doublon', () => {
    const base = { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@db:5432/origin', MEDIA_SECRET: 'x'.repeat(40) };
    assert.deepEqual(loadConfig({ ...base, CORS_ORIGINS: 'https://autre.example', PUBLIC_APP_URL: 'https://app.origin.example/' }).corsOrigins, ['https://autre.example', 'https://app.origin.example']);
    assert.deepEqual(loadConfig({ ...base, CORS_ORIGINS: 'https://app.origin.example', PUBLIC_APP_URL: 'https://app.origin.example' }).corsOrigins, ['https://app.origin.example']);
  });

  it('mode démo : DEMO_PLAYBACK_OVERRIDE accepté hors production, refusé en production, identifiants contrôlés', () => {
    assert.deepEqual(loadConfig({ DEMO_PLAYBACK_OVERRIDE: 'les-passagers, film-b' }).demoPlaybackOverride, ['les-passagers', 'film-b']);
    assert.equal(loadConfig({}).demoPlaybackOverride, null);
    const prod = { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@db:5432/origin', MEDIA_SECRET: 'x'.repeat(40), CORS_ORIGINS: 'https://app.example' };
    assert.throws(() => loadConfig({ ...prod, DEMO_PLAYBACK_OVERRIDE: 'les-passagers' }), /interdit en production/);
    assert.throws(() => loadConfig({ DEMO_PLAYBACK_OVERRIDE: '../../etc/passwd' }), /invalides/);
  });

  it('accepte une rotation de secret et des limites personnalisées', () => {
    const config = loadConfig({
      MEDIA_SECRET: 'n'.repeat(40),
      MEDIA_SECRET_PREVIOUS: 'o'.repeat(40),
      TRUST_PROXY: 'true',
      RATE_LIMIT_API_PER_MIN: '30',
    });
    assert.equal(config.mediaSecrets.length, 2);
    assert.equal(config.trustProxy, true);
    assert.equal(config.rateLimits.apiPerMinute, 30);
    assert.equal(config.rateLimits.mediaPerMinute, 3000);
  });

  it('exige les paramètres du CDN en mode bunny', () => {
    assert.throws(() => loadConfig({ DELIVERY_MODE: 'bunny' }), /BUNNY_CDN_URL est obligatoire/);
    const config = loadConfig({
      DELIVERY_MODE: 'bunny',
      BUNNY_CDN_URL: 'https://videos.b-cdn.net/',
      BUNNY_TOKEN_KEY: 'cle-de-securite-de-test',
      BUNNY_STORAGE_ZONE: 'ma-zone',
      BUNNY_STORAGE_KEY: 'cle-de-zone-de-test',
    });
    assert.equal(config.delivery.mode, 'bunny');
    assert.equal(config.delivery.cdnUrl, 'https://videos.b-cdn.net', 'barre finale retirée');
    assert.equal(config.delivery.storageHost, 'storage.bunnycdn.com');
  });

  it('refuse un secret trop court', () => {
    assert.throws(() => loadConfig({ MEDIA_SECRET: 'court' }), /au moins 32 caractères/);
  });
});
