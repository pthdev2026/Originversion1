import { describe, expect, it } from 'vitest';
import { catalogContents, catalogThemes, contentsForTheme, originCatalogs } from '@/lib/origin-catalogs';
import { getProduction } from '@/lib/productions';

describe('ORIGIN editorial catalogs', () => {
  it('provides five populated collections with unique cards', () => {
    expect(Object.values(originCatalogs)).toHaveLength(5);
    for (const collection of Object.values(originCatalogs)) {
      expect(collection.contents.length).toBeGreaterThanOrEqual(5);
      expect(new Set(collection.contents.map(content => content.id)).size).toBe(collection.contents.length);
    }
  });
  it('uses Drama and gives Couple its own portrait presentation', () => {
    expect(originCatalogs.drama.title).toBe('Drama');
    expect(originCatalogs.couple.title).toBe('Couple');
    expect(originCatalogs.couple.cardStyle).toBe('portrait');
  });
  it('provides fourteen populated themes and a complete selection', () => {
    expect(catalogThemes).toHaveLength(14);
    for (const theme of catalogThemes) {
      expect(theme.image).toBeTruthy();
      expect(contentsForTheme(theme.id).length).toBeGreaterThan(0);
    }
    expect(contentsForTheme('all')).toEqual(catalogContents);
    expect(contentsForTheme('couple').every(content => content.themes.includes('couple'))).toBe(true);
  });
  it('keeps demonstration labels and resolves every detail destination', () => {
    for (const content of catalogContents) {
      expect(content.isDemo).toBe(true);
      if (content.productionSlug) expect(getProduction(content.productionSlug)).toBeDefined();
    }
  });
});