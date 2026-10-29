import { describe, expect, it } from 'vitest';
import { hiddenImage, preferManifests, recoveryPreview } from './preview-policy';

const single = { previewId: 'single', kind: 'iiif-image', renderer: 'image' as const };
const manifest = { previewId: 'book', kind: 'iiif-manifest', renderer: 'image' as const };
const map = { previewId: 'map', kind: 'geojson', renderer: 'map' as const };
const previews = [manifest, single, map];

describe('opt-in manifest presentation', () => {
  it('orders manifests without mutating the input', () => {
    const original = [single, map, manifest];
    expect(preferManifests(original)).toEqual(previews);
    expect(original).toEqual([single, map, manifest]);
  });
  it('hides redundant scans from the first render and reveals an initial fallback', () => {
    expect(hiddenImage(single, previews, 'book', [])).toBe(true);
    expect(hiddenImage(single, previews, 'book', ['book'])).toBe(false);
    expect(hiddenImage(single, previews, 'single', [])).toBe(false);
    expect(hiddenImage(map, previews, 'book', [])).toBe(false);
  });
  it('waits for a successfully opened fallback', () => {
    expect(recoveryPreview(previews, 'book', [], ['book'])).toBeUndefined();
    expect(recoveryPreview(previews, 'book', ['single'], ['book'])).toBe('single');
    expect(recoveryPreview(previews, 'book', ['single'], ['book', 'single'])).toBeUndefined();
  });
  it('preserves map selection and does not abandon a book after a later page fails', () => {
    expect(recoveryPreview(previews, 'map', ['single'], ['book'])).toBeUndefined();
    expect(recoveryPreview(previews, 'book', ['book', 'single'], ['book'])).toBeUndefined();
    expect(recoveryPreview(previews, 'single', ['book', 'single'], [])).toBe('book');
  });
});
