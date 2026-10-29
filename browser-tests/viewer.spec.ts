import { fixtureResponse } from './fixtures.mjs';
import { test, expect, type Page } from '@playwright/test';
const state = (page: Page) => page.locator('#selection').evaluate(el => JSON.parse(el.textContent || '{}'));
const opened = async (page: Page, index = 0) => expect.poll(async () => (await state(page)).selected?.image?.index).toBe(index);

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => {
    throw error;
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'https://cdnjs.cloudflare.com' && url.pathname.startsWith('/ajax/libs/openseadragon/6.1.1/images/'))
      return route.fulfill({ contentType: 'image/png', body: fixtureResponse(new URL('http://127.0.0.1/fixtures/iiif/a/full/full/0/default.png'))!.body });
    if (url.hostname !== '127.0.0.1') throw new Error(`Unexpected external request: ${url.href}`);
    return route.continue();
  });
});

for (const fixture of ['good', 'v2', 'multi-image'])
  test(`${fixture}: real image events and bidirectional navigation`, async ({ page }) => {
    await page.goto(`/?fixture=${fixture}`);
    await opened(page);
    expect((await state(page)).selected.image.service).toMatchObject({ version: 2, width: 512, height: 512 });
    await page.locator('#page').selectOption('1');
    await opened(page, 1);
    await page.locator('ogm-image').filter({ visible: true }).locator('.prev').click();
    await opened(page, 0);
    expect(await page.locator('ogm-menubar').count()).toBe(0);
    await expect(page.locator('ogm-previews wa-tab-group')).toHaveAttribute('data-single-preview', '');
    await expect(page.locator('wa-tab').filter({ hasText: 'Single image' })).toBeHidden();
    const events = JSON.parse((await page.locator('#events').textContent()) || '[]');
    expect(events.some((event: any) => event.pageIndex === 1 && event.image === null)).toBe(true);
  });

test('duplicate image URLs retain sequence position and occurrence', async ({ page }) => {
  await page.goto('/?fixture=duplicate');
  await opened(page);
  await page.locator('#page').selectOption('1');
  await opened(page, 1);
  expect((await state(page)).selected.image.occurrence).toBe(1);
});

test('initial failure reveals and selects a working fallback', async ({ page }) => {
  await page.goto('/?fixture=first-fails');
  await expect.poll(async () => (await state(page)).selected?.image?.url).toContain('/single/info.json');
  await expect(page.locator('wa-tab').filter({ hasText: 'Single image' })).toBeVisible();
  await expect(page.locator('wa-tab').filter({ hasText: 'Images' })).toHaveJSProperty('disabled', true);
});

test('later failure clears selection without abandoning the book', async ({ page }) => {
  await page.goto('/?fixture=later-fails');
  await opened(page);
  const preview = (await state(page)).active.previewId;
  await page.locator('#page').selectOption('1');
  await expect.poll(async () => (await state(page)).selected?.pageIndex).toBe(1);
  await expect(page.locator('ogm-alerts').filter({ visible: true })).toBeVisible();
  expect((await state(page)).active.previewId).toBe(preview);
  expect((await state(page)).selected.image).toBeNull();
});

test('record replacement rejects stale navigation', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  await page.locator('#page').selectOption('1');
  await opened(page, 1);
  await page.locator('#fixture').selectOption('v2');
  await opened(page);
  await page.locator('#stale').click();
  await expect(page.locator('#page')).toHaveValue('0');
  expect((await state(page)).selected.resourceId).toBe('v2');
});

test('location-only preview is omitted, while default chrome remains opt-in', async ({ page }) => {
  await page.goto('/?fixture=location');
  await expect.poll(async () => (await state(page)).active).toBeNull();
  await expect(page.locator('ogm-map')).toHaveCount(0);
  await page.goto('/?defaults=1');
  await expect(page.locator('ogm-menubar')).toBeVisible();
  await expect(page.locator('wa-tab').filter({ hasText: 'IIIF Image' })).toBeVisible();
  await expect(page.locator('ogm-previews wa-tab-group')).not.toHaveAttribute('data-single-preview');
});

test('ArcGIS draws with a real MapLibre worker and native feature inspection', async ({ page }) => {
  await page.goto('/?fixture=arcgis');
  await expect(page.locator('#ready')).toHaveText('Map loaded');
  const canvas = page.locator('ogm-map canvas.maplibregl-canvas');
  await expect(canvas).toBeVisible();
  await canvas.click({ position: { x: 400, y: 300 } });
  await expect(page.locator('ogm-attributes')).toContainText('Fixture region');
});

test('a chosen map remains active while hidden images finish loading', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/fixtures/iiif/single/info.json', async route => {
    await gate;
    await route.continue();
  });
  await page.goto('/?fixture=mixed', { waitUntil: 'domcontentloaded' });
  try {
    await opened(page);
    await page.locator('wa-tab').filter({ hasText: 'ArcGIS Feature Layer' }).click();
    await expect.poll(async () => (await state(page)).active?.renderer).toBe('map');
  } finally {
    release();
  }
  await expect.poll(async () => JSON.parse((await page.locator('#events').textContent()) || '[]').some((event: any) => event.image?.url.includes('/single/info.json'))).toBe(true);
  expect((await state(page)).active.renderer).toBe('map');
  expect((await state(page)).selected).toBeNull();
});

test('redundant tabs never flash while the first manifest image is loading', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).previewFrames = [];
    const inspect = () => {
      const previews = document.querySelector('ogm-viewer')?.shadowRoot?.querySelector('ogm-previews');
      const group = previews?.shadowRoot?.querySelector('wa-tab-group');
      const nav = group?.shadowRoot?.querySelector('[part~="nav"]');
      const single = Array.from(group?.querySelectorAll('wa-tab') ?? []).find(tab => tab.textContent?.trim() === 'Single image');
      if (nav && single) (window as any).previewFrames.push({ nav: nav.getBoundingClientRect().height > 0, single: single.getBoundingClientRect().height > 0 });
      requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  });
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/fixtures/iiif/a/info.json', async route => {
    await gate;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  try {
    await expect.poll(() => page.evaluate(() => (window as any).previewFrames.length)).toBeGreaterThan(2);
    expect(await page.evaluate(() => (window as any).previewFrames.every((frame: any) => !frame.nav && !frame.single))).toBe(true);
  } finally {
    release();
  }
  await opened(page);
  expect(await page.evaluate(() => (window as any).previewFrames.every((frame: any) => !frame.nav && !frame.single))).toBe(true);
});

// The published CUGIR record uses west,south,east,north, not ENVELOPE syntax.
// Observe actual WMS requests rather than mocking MapLibre or reading its private state.
test('CUGIR WMS fits resource bounds before and after delayed capabilities load', async ({ page }) => {
  const tiles: number[][] = [];
  let releaseCapabilities!: () => void;
  const capabilities = new Promise<void>(resolve => (releaseCapabilities = resolve));
  await page.route('**/fixtures/wms?*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('request')?.toLowerCase() === 'getcapabilities') await capabilities;
    if (url.searchParams.get('request')?.toLowerCase() === 'getmap') tiles.push(url.searchParams.get('bbox')!.split(',').map(Number));
    const response = fixtureResponse(url)!;
    await route.fulfill({ contentType: response.type, body: response.body });
  });
  const mercator = (lng: number, lat: number) => [(6378137 * lng * Math.PI) / 180, 6378137 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];
  const [west, south] = mercator(-77.612, 42.576);
  const [east, north] = mercator(-76.963, 43.04);
  try {
    await page.goto('/?fixture=cugir-007910');
    // Tiles render while GetCapabilities is held: the constructor must already have framed NY.
    await expect.poll(() => tiles.length).toBeGreaterThan(0);
    for (const [left, bottom, right, top] of tiles) {
      expect(right - left).toBeLessThan(100000);
      expect(left).toBeGreaterThan(west - 200000);
      expect(right).toBeLessThan(east + 200000);
      expect(bottom).toBeGreaterThan(south - 200000);
      expect(top).toBeLessThan(north + 200000);
    }
  } finally {
    releaseCapabilities();
  }
  await expect(page.locator('#ready')).toHaveText('Map loaded');
  // The requested tile coverage must include the entire record, not just its center.
  expect(Math.min(...tiles.map(box => box[0]))).toBeLessThanOrEqual(west);
  expect(Math.min(...tiles.map(box => box[1]))).toBeLessThanOrEqual(south);
  expect(Math.max(...tiles.map(box => box[2]))).toBeGreaterThanOrEqual(east);
  expect(Math.max(...tiles.map(box => box[3]))).toBeGreaterThanOrEqual(north);
  // A center click asks WMS about a small geographic window at the camera center.
  // This also catches a late metadata/style load resetting the view to the globe.
  const inspection = page.waitForRequest(request => new URL(request.url()).searchParams.get('request')?.toLowerCase() === 'getfeatureinfo');
  const canvas = page.locator('ogm-map canvas.maplibregl-canvas');
  await canvas.click();
  const bbox = new URL((await inspection).url()).searchParams.get('bbox')!.split(',').map(Number);
  expect((bbox[0] + bbox[2]) / 2).toBeGreaterThan(west);
  expect((bbox[0] + bbox[2]) / 2).toBeLessThan(east);
  expect((bbox[1] + bbox[3]) / 2).toBeGreaterThan(south);
  expect((bbox[1] + bbox[3]) / 2).toBeLessThan(north);
  expect(bbox[2] - bbox[0]).toBeLessThan(20000);
});
