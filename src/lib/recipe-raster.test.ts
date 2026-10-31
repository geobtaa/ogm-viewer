import { describe, expect, it } from 'vitest';
import type { RasterArray } from '@developmentseed/geotiff';
import { recipePixels } from './recipe-raster';
import OgmRecord from './record';
import { resourcesFor } from './resources/factory';
import { previewersForResources } from './previewers/factory';

const array = (data: number[], count = 1) =>
  ({ layout: 'pixel-interleaved', data: new Float32Array(data), count, width: data.length / count, height: 1, mask: null, nodata: null }) as RasterArray;

describe('prepared raster recipes', () => {
  it('keeps separate prepared layers from the same native PMTiles archive', () => {
    const record = new OgmRecord({
      id: 'test',
      dct_title_s: 'Test',
      gbl_resourceClass_sm: [],
      dct_accessRights_s: 'Public',
      gbl_mdVersion_s: 'Aardvark',
      dct_references_s: JSON.stringify({ 'https://github.com/protomaps/PMTiles': 'https://example.org/multi.pmtiles' }),
    });
    record.preparedPreviews = ['parks', 'lakes'].map(name => ({ id: name, name, source_layer: name, url: 'https://example.org/multi.pmtiles', format: 'pmtiles' }));
    const resources = resourcesFor(record);
    expect(resources).toHaveLength(2);
    expect(resources.map(resource => resource.previewSourceLayer)).toEqual(['parks', 'lakes']);
    expect(resources.map(resource => resource.previewKey)).toEqual(['parks', 'lakes']);
    expect(JSON.parse(record.json.dct_references_s!)).toEqual({ 'https://github.com/protomaps/PMTiles': 'https://example.org/multi.pmtiles' });
  });
  it('preserves categorical colors and makes unknown classes transparent', () => {
    expect([...recipePixels(array([1, 2, 9]), { kind: 'classified', bands: [1], palette: { '1': [0, 100, 0, 255], '2': [10, 20, 30, 255] } })]).toEqual([
      0, 100, 0, 255, 10, 20, 30, 255, 0, 0, 0, 0,
    ]);
  });
  it('uses explicit RGB band order and source masks', () => {
    const pixels = array([10, 20, 30, 40, 50, 60], 3);
    pixels.mask = new Uint8Array([1, 0]);
    expect([...recipePixels(pixels, { kind: 'rgb', bands: [3, 2, 1] })]).toEqual([30, 20, 10, 255, 0, 0, 0, 0]);
  });
  it('applies the published scalar range and palette without local restretching', () => {
    expect([
      ...recipePixels(array([-10, 0, 10, NaN]), {
        kind: 'scalar',
        bands: [1],
        value_range: [-10, 10],
        palette: { '0': [1, 2, 3, 255], '127': [4, 5, 6, 255], '255': [7, 8, 9, 255] },
      }),
    ]).toEqual([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 0, 0, 0, 0]);
  });
  it('keeps prepared layers outside the original record and uniquely identifies previews', async () => {
    const source = { id: 'test', dct_title_s: 'Test', gbl_resourceClass_sm: [], dct_accessRights_s: 'Public', gbl_mdVersion_s: 'Aardvark' } as const;
    const record = new OgmRecord({ ...source, gbl_resourceClass_sm: [] });
    record.preparedPreviews = [
      { id: 'first', name: 'First', url: 'https://example.org/one.tif', format: 'cog' },
      { id: 'second', name: 'Second', url: 'https://example.org/two.tif', format: 'cog' },
    ];
    const resources = resourcesFor(record);
    expect(resources).toHaveLength(2);
    expect(resources.map(r => r.previewKey)).toEqual(['first', 'second']);
    expect(record.json.dct_references_s).toBeUndefined();
    const previews = await previewersForResources(resources);
    expect(new Set(previews.map(p => p.previewId)).size).toBe(2);
  });
});
