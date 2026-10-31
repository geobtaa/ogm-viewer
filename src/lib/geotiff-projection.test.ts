import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@stencil/vitest';
import { GeoTIFF } from '@developmentseed/geotiff';
import { parseWkt } from '@developmentseed/proj';
import proj4 from 'proj4';

import { normalizeGeoTIFFProjectionUnits } from './geotiff';

async function fixture() {
  const bytes = readFileSync(new URL('./fixtures/custom-survey-foot.tif', import.meta.url));
  return GeoTIFF.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

// Synthetic pixel values with the CRS and outer coordinates of the Sheboygan
// 2004 county DEM. Expected corners were independently transformed by GDAL/PROJ.
// No source raster pixels are redistributed in this 8x8 regression fixture.
describe('custom GeoTIFF projection units', () => {
  it('places all four survey-foot corners at their GDAL coordinates', async () => {
    const tiff = await fixture();
    const original = tiff.crs;
    expect(normalizeGeoTIFFProjectionUnits(tiff)).toBe(tiff);
    expect(tiff).toBeInstanceOf(GeoTIFF);
    expect(tiff.crs).not.toBe(original);
    if (typeof tiff.crs !== 'object') throw new Error('Expected custom CRS');
    // @ts-expect-error proj4 accepts the parsed projection, but its types omit that shape.
    const projection = proj4(parseWkt(tiff.crs), 'EPSG:4326');
    const [west, south, east, north] = tiff.bbox;
    const corners = [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
    ];
    const expected = [
      [-88.16151939634887, 43.541236270807296],
      [-87.69203938699206, 43.54278342226042],
      [-87.69287043774104, 43.8935638105433],
      [-88.16509704358499, 43.8919977082828],
    ];
    for (let i = 0; i < corners.length; i++) {
      const actual = projection.forward(corners[i]);
      expect(actual[0]).toBeCloseTo(expected[i][0], 7);
      expect(actual[1]).toBeCloseTo(expected[i][1], 7);
      const roundTrip = projection.inverse(expected[i]);
      expect(roundTrip[0]).toBeCloseTo(corners[i][0], 3);
      expect(roundTrip[1]).toBeCloseTo(corners[i][1], 3);
    }
    // The adjustment is idempotent, and retains original metadata for inspection.
    const corrected = tiff.crs;
    normalizeGeoTIFFProjectionUnits(tiff);
    expect(tiff.crs).toEqual(corrected);
    expect(tiff.gkd.projFalseEasting).toBe(262000);
  });

  it('also honors international feet, without changing angular or scale parameters', async () => {
    const tiff = await fixture();
    Object.assign(tiff.gkd, { projLinearUnits: 9002 });
    normalizeGeoTIFFProjectionUnits(tiff);
    const crs = tiff.crs;
    if (typeof crs !== 'object' || crs.type !== 'ProjectedCRS') throw new Error('Expected custom CRS');
    expect(crs.conversion.parameters.find(p => p.name === 'False easting')).toMatchObject({ value: 262000, unit: 'foot' });
    expect(crs.conversion.parameters.find(p => p.name === 'Latitude of natural origin')?.unit).toBe('degree');
    expect(crs.conversion.parameters.find(p => p.name === 'Scale factor at natural origin')?.unit).toBe('unity');
  });

  it.each([
    { modelType: 1, projectedCRS: 26916, projLinearUnits: 9001 },
    { modelType: 1, projectedCRS: 32767, projLinearUnits: 9001 },
    { modelType: 32767, projLinearUnits: 9003 },
  ])('leaves EPSG, metre and embedded-WKT projection paths untouched: %j', keys => {
    const tiff = {
      gkd: keys,
      get crs() {
        throw new Error('The normal CRS resolution should remain lazy');
      },
    } as unknown as GeoTIFF;
    expect(normalizeGeoTIFFProjectionUnits(tiff)).toBe(tiff);
  });
});
