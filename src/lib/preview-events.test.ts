import { describe, expect, it, vi } from 'vitest';
import { observeImageSelection } from './preview-events';

const image = { previewId: 'image-1', resourceId: 'record', url: 'https://example.org/manifest', renderer: 'image' as const };
const host = () => new EventTarget() as HTMLElement;

describe('image selection events', () => {
  it('reports initial and later opened sources, clearing during transitions and failures', () => {
    const handlers = new Map<string, () => void>();
    let page = 0;
    const viewer = {
      currentPage: () => page,
      goToPage: vi.fn(),
      tileSources: [{ tileSource: 'https://example.org/a/info.json' }, { tileSource: 'https://example.org/b/info.json' }],
      addHandler: (name: string, handler: () => void) => handlers.set(name, handler),
      removeHandler: (name: string) => handlers.delete(name),
    };
    const element = host();
    const emit = vi.fn();
    const stop = observeImageSelection(element, viewer, () => image, emit);
    handlers.get('open')!();
    expect(emit).toHaveBeenLastCalledWith({
      previewId: image.previewId,
      resourceId: image.resourceId,
      resourceUrl: image.url,
      renderer: 'image',
      sequence: viewer.tileSources.map((source, index) => ({ url: source.tileSource, index, occurrence: 0 })),
      pageIndex: 0,
      image: { url: viewer.tileSources[0].tileSource, index: 0, count: 2, occurrence: 0 },
    });
    page = 1;
    handlers.get('page')!();
    expect(emit.mock.lastCall?.[0].image).toBeNull();
    handlers.get('open')!();
    expect(emit.mock.lastCall?.[0].image).toEqual({ url: viewer.tileSources[1].tileSource, index: 1, count: 2, occurrence: 0 });
    viewer.tileSources[1] = viewer.tileSources[0];
    handlers.get('open')!();
    expect(emit.mock.lastCall?.[0].image.occurrence).toBe(1);
    page = 0;
    handlers.get('open')!();
    expect(emit.mock.lastCall?.[0].image.occurrence).toBe(0);
    handlers.get('open-failed')!();
    expect(emit.mock.lastCall?.[0].image).toBeNull();
    element.dispatchEvent(new Event('imageLoading'));
    expect(emit.mock.lastCall?.[0].image).toBeNull();
    stop();
    const count = emit.mock.calls.length;
    element.dispatchEvent(new Event('imageLoading'));
    expect(emit).toHaveBeenCalledTimes(count);
    expect(handlers.size).toBe(0);
  });

  it('does not invent a source URL for an unknown tile source', () => {
    const handlers = new Map<string, () => void>();
    const emit = vi.fn();
    const stop = observeImageSelection(
      host(),
      {
        currentPage: () => 0,
        goToPage: vi.fn(),
        tileSources: [{ type: 'custom' }],
        addHandler: (name, handler) => {
          handlers.set(name, handler);
        },
        removeHandler: name => {
          handlers.delete(name);
        },
      },
      () => image,
      emit,
    );
    handlers.get('open')!();
    expect(emit.mock.lastCall?.[0].image).toBeNull();
    stop();
  });
});

it('routes navigation through shadow hosts to the addressed image and removes the listener', () => {
  const root = Object.assign(new EventTarget(), { nodeName: 'OGM-VIEWER' });
  const element = Object.assign(new EventTarget(), { parentNode: { host: root } }) as unknown as HTMLElement;
  const goToPage = vi.fn();
  const viewer = {
    currentPage: () => 0,
    goToPage,
    tileSources: [{ tileSource: 'https://example.org/a/info.json' }, { tileSource: 'https://example.org/a/info.json' }],
    addHandler: vi.fn(),
    removeHandler: vi.fn(),
  };
  const stop = observeImageSelection(element, viewer, () => image, vi.fn());
  const request = { previewId: image.previewId, resourceId: image.resourceId, resourceUrl: image.url, renderer: 'image', index: 1, url: viewer.tileSources[1].tileSource };
  const send = (detail: unknown) => root.dispatchEvent(new CustomEvent('imageNavigationRequest', { detail }));
  for (const invalid of [
    null,
    { ...request, index: -1 },
    { ...request, index: 2 },
    { ...request, index: 0.5 },
    { ...request, previewId: 'hidden-preview' },
    { ...request, resourceId: 'old-record' },
    { ...request, resourceUrl: 'other-manifest' },
    { ...request, url: 'different-source' },
  ])
    send(invalid);
  expect(goToPage).not.toHaveBeenCalled();
  send(request);
  expect(goToPage).toHaveBeenCalledExactlyOnceWith(1);
  stop();
  send(request);
  expect(goToPage).toHaveBeenCalledTimes(1);
});

it('publishes the opened IIIF capabilities and clears them on page transitions', () => {
  const handlers = new Map<string, () => void>();
  const source = {
    '@id': 'https://example.org/image',
    'version': 3,
    'width': 4000,
    'height': 2000,
    'profile': 'level0',
    'sizes': [{ width: 400, height: 200 }],
    'maxArea': 2000000,
  };
  const viewer = {
    currentPage: () => 0,
    goToPage: vi.fn(),
    tileSources: ['https://example.org/image/info.json'],
    world: { getItemAt: () => ({ source }) },
    addHandler: (name: string, handler: () => void) => handlers.set(name, handler),
    removeHandler: (name: string) => handlers.delete(name),
  };
  const emit = vi.fn();
  observeImageSelection(host(), viewer, () => image, emit);
  handlers.get('open')!();
  expect(emit.mock.lastCall?.[0].image.service).toMatchObject({ id: source['@id'], version: 3, sizes: source.sizes, maxArea: source.maxArea });
  handlers.get('page')!();
  expect(emit.mock.lastCall?.[0].image).toBeNull();
});
