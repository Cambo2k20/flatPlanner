import { describe, expect, it } from 'vitest';
import { flatFile, readFile } from '../src/core/files.js';
import { normalizeFlat } from '../src/core/flat-model.js';
import { sampleFlat } from '../src/core/sample-flat.js';
import { flatLink, LINK_ROUTE, packFlat, unpackFlat } from '../src/core/share.js';

describe('flat links', () => {
  it('packs a flat into a short link and back', async () => {
    const flat = sampleFlat({}, { name: 'Link test', photos: ['https://example.com/a.jpg'], floorplanUrl: 'https://example.com/plan.png' });
    const file = flatFile(flat, []);
    const link = await flatLink(file, 'https://someone.github.io/flatPlanner/#/flat/abc/layout');
    expect(link.startsWith('https://someone.github.io/flatPlanner/' + LINK_ROUTE + 'z')).toBe(true);
    expect(link.length).toBeLessThan(JSON.stringify(file).length / 2);
    const back = await unpackFlat(link.slice(link.indexOf(LINK_ROUTE) + LINK_ROUTE.length));
    const { flats } = readFile(back, [], new Set());
    expect(flats[0].name).toBe('Link test');
    expect(flats[0].rooms).toHaveLength(6);
    expect(flats[0].photos).toEqual(['https://example.com/a.jpg']);
    expect(flats[0].floorplanUrl).toBe('https://example.com/plan.png');
  });

  it('rejects broken links', async () => {
    await expect(unpackFlat('zNOTVALID')).rejects.toThrow();
    await expect(unpackFlat('')).rejects.toThrow();
  });

  it('keeps only https web addresses for listing pictures', () => {
    const f = normalizeFlat({ photos: ['javascript:alert(1)', 'http://x.com/a.jpg', 'https://x.com/b.jpg', 'https://x.com/b.jpg'], floorplanUrl: 'data:image/png;base64,xx' });
    expect(f.photos).toEqual(['https://x.com/b.jpg']);
    expect(f.floorplanUrl).toBe('');
  });

  it('reads an uncompressed payload too', async () => {
    const json = JSON.stringify(flatFile(normalizeFlat({ name: 'Plain' }), []));
    const b64 = Buffer.from(json).toString('base64url');
    expect((await unpackFlat(b64)).flat.name).toBe('Plain');
    expect((await packFlat({ a: 1 }))[0]).toBe('z');
  });
});
