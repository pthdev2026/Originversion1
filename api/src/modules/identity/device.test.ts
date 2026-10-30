import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deviceLabel } from './device.ts';

describe('libellé d’appareil', () => {
  it('donne navigateur · système, sans rien conserver d’autre', () => {
    const cases: [string, string][] = [
      ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Chrome · macOS'],
      ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 'Safari · macOS'],
      ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Safari · iPhone'],
      ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0', 'Firefox · Windows'],
      ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', 'Edge · Windows'],
      ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', 'Chrome · Android'],
      ['Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1', 'Chrome · iPad'],
    ];
    for (const [ua, expected] of cases) assert.equal(deviceLabel(ua), expected, ua.slice(0, 60));
  });

  it('inconnu ou absent : null ; entrée démesurée tolérée ; jamais plus de 80 caractères', () => {
    assert.equal(deviceLabel(undefined), null);
    assert.equal(deviceLabel(''), null);
    assert.equal(deviceLabel('curl/8.4.0'), null);
    assert.equal(deviceLabel('x'.repeat(100_000) + ' Chrome/1 Macintosh'), null, 'tronqué avant analyse');
    assert.ok((deviceLabel('Mozilla/5.0 (Macintosh) Chrome/1 Safari/1') ?? '').length <= 80);
  });
});
