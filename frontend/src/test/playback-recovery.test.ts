import { describe, expect, it } from 'vitest';
import { MAX_MEDIA_RECOVERIES, MAX_NETWORK_RETRIES, nextRecovery, type FatalErrorContext } from '@/lib/playback-recovery';

const base: FatalErrorContext = { type: 'network', networkRetries: 0, mediaRecoveries: 0, refreshed: false };

describe('playback recovery policy', () => {
  it('asks for a new link once on 403, then reports an expired link', () => {
    expect(nextRecovery({ ...base, httpStatus: 403 })).toEqual({ action: 'refresh' });
    expect(nextRecovery({ ...base, httpStatus: 403, refreshed: true })).toEqual({ action: 'fail', kind: 'expired' });
  });

  it('retries network errors with growing delays, then stops', () => {
    const first = nextRecovery(base);
    const second = nextRecovery({ ...base, networkRetries: 1 });
    expect(first).toEqual({ action: 'retry', delayMs: 500 });
    expect(second).toEqual({ action: 'retry', delayMs: 1000 });
    expect(nextRecovery({ ...base, networkRetries: MAX_NETWORK_RETRIES })).toEqual({ action: 'fail', kind: 'network' });
  });

  it('recovers media errors a bounded number of times', () => {
    expect(nextRecovery({ ...base, type: 'media' })).toEqual({ action: 'recover-media' });
    expect(nextRecovery({ ...base, type: 'media', mediaRecoveries: MAX_MEDIA_RECOVERIES })).toEqual({ action: 'fail', kind: 'media' });
  });

  it('treats anything else as unsupported', () => {
    expect(nextRecovery({ ...base, type: 'other' })).toEqual({ action: 'fail', kind: 'unsupported' });
  });
});
