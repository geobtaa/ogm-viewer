import { describe, expect, it } from '@stencil/vitest';
import { iiifServiceId } from './iiif-service-id';

const encoded = 'https://asset.library.wisc.edu/iiif/1711.dl%2F5WA3TYLSGTMK29A';
const decoded = encoded.replace('%2F', '/');

describe('iiifServiceId', () => {
  it('preserves the requested identifier for a decoded service ID', () => {
    expect(iiifServiceId(decoded, encoded + '/info.json')).toBe(encoded);
    expect(iiifServiceId(decoded, encoded.replace('%2F', '%2f') + '/info.json')).toBe(encoded.replace('%2F', '%2f'));
  });

  it.each([encoded, decoded.replace('asset.', 'images.'), decoded.replace('1711', '1712'), decoded + '?v=1'])('honors the advertised service %s', canonical => {
    expect(iiifServiceId(canonical, encoded + '/info.json')).toBe(canonical);
  });
});
