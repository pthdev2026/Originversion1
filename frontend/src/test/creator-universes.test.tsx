import { describe, expect, it } from 'vitest';
import { originCreators } from '@/lib/origin-creators';
import { creatorContents, creatorUniverses, getCreatorUniverse } from '@/lib/creator-universes';
import { resolveWatchable } from '@/lib/watch-catalog';

describe('Creator universes', () => {
  it('gives every homepage creator a universe', () => {
    for (const creator of originCreators) expect(getCreatorUniverse(creator.id)?.creator).toBe(creator);
    expect(creatorUniverses).toHaveLength(originCreators.length);
  });
  it('keeps content ids unique and flagged as demonstrations', () => {
    expect(new Set(creatorContents.map(content => content.id)).size).toBe(creatorContents.length);
    expect(creatorContents.every(content => content.isDemo)).toBe(true);
    expect(creatorUniverses.every(universe => universe.isProvisional)).toBe(true);
  });
  it('opens every creator content on the universal watch landing', () => {
    for (const content of creatorContents) expect(resolveWatchable(content.id)?.title).toBe(content.title);
  });
});
