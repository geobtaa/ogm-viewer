/** Public selection events shared by the image and preview components. */
export interface PreviewSelection {
  previewId: string;
  resourceId: string;
  resourceUrl: string;
  renderer: 'image' | 'map';
}

export interface ImageSequenceEntry {
  url: string;
  index: number;
  occurrence: number;
}

export interface ImageNavigation extends PreviewSelection {
  index: number;
  url: string;
}

export interface ImageService {
  id: string;
  version: number;
  width: number;
  height: number;
  profile?: unknown;
  sizes?: { width: number; height: number }[];
  maxWidth?: number;
  maxHeight?: number;
  maxArea?: number;
}

export interface ImageSelection extends PreviewSelection {
  sequence: ImageSequenceEntry[];
  pageIndex: number;
  image: { url: string; index: number; count: number; occurrence: number; service?: ImageService } | null;
}

interface Preview {
  kind?: string;
  previewId: string;
  resourceId: string;
  url: string;
  renderer: 'image' | 'map';
}

interface ImageViewer {
  currentPage(): number;
  goToPage(index: number): unknown;
  tileSources?: unknown[];
  world?: { getItemAt(index: number): { source?: unknown } | undefined };
  addHandler(name: string, handler: () => void): void;
  removeHandler(name: string, handler: () => void): void;
}

export function previewSelection(preview: Preview): PreviewSelection {
  return {
    previewId: preview.previewId,
    resourceId: preview.resourceId,
    resourceUrl: preview.url,
    renderer: preview.renderer,
  };
}

/** Report the source actually opened, and clear it while a page changes or fails. */
export function observeImageSelection(host: HTMLElement, viewer: ImageViewer, getPreview: () => Preview | undefined, emit: (detail: ImageSelection) => void): () => void {
  const sourceUrl = (source: unknown) => {
    const url = typeof source === 'string' ? source : (source as { tileSource?: unknown })?.tileSource;
    return typeof url === 'string' ? url : undefined;
  };
  const snapshot = () => {
    const occurrences = new Map<string, number>();
    const sequence: ImageSequenceEntry[] = [];
    (viewer.tileSources ?? []).forEach((source, index) => {
      const url = sourceUrl(source);
      if (!url) return;
      const occurrence = occurrences.get(url) ?? 0;
      occurrences.set(url, occurrence + 1);
      sequence.push({ url, index, occurrence });
    });
    return { sequence, pageIndex: viewer.currentPage() };
  };
  const clear = () => {
    const preview = getPreview();
    if (preview) emit({ ...previewSelection(preview), ...snapshot(), image: null });
  };
  const opened = () => {
    const preview = getPreview();
    if (!preview) return;
    const state = snapshot();
    const image = state.sequence.find(image => image.index === state.pageIndex);
    const source = viewer.world?.getItemAt(0)?.source as (Partial<ImageService> & { '@id'?: string }) | undefined;
    // Publish only serializable Image API capabilities already loaded by the viewer.
    const id = source?.id ?? source?.['@id'];
    const service =
      source && id && typeof source.version === 'number' && [1, 2, 3].includes(source.version)
        ? ({
            id,
            version: source.version,
            width: source.width,
            height: source.height,
            profile: source.profile,
            sizes: source.sizes,
            maxWidth: source.maxWidth,
            maxHeight: source.maxHeight,
            maxArea: source.maxArea,
          } as ImageService)
        : undefined;
    emit({
      ...previewSelection(preview),
      ...state,
      image: image ? { ...image, count: viewer.tileSources?.length ?? 0, ...(service ? { service } : {}) } : null,
    });
  };
  // Requests are addressed to the public viewer host; each image validates its identity.
  // Standalone ogm-image elements receive the same request on their own host.
  let commandTarget = host;
  let ancestor: Node | undefined = host;
  while (ancestor) {
    if (ancestor.nodeName === 'OGM-VIEWER') {
      commandTarget = ancestor as HTMLElement;
      break;
    }
    ancestor = ancestor.parentNode ?? (ancestor as ShadowRoot).host;
  }
  const navigate = (event: Event) => {
    const request = (event as CustomEvent<ImageNavigation>).detail;
    const preview = getPreview();
    if (
      !request ||
      !preview ||
      request.previewId !== preview.previewId ||
      request.resourceId !== preview.resourceId ||
      request.resourceUrl !== preview.url ||
      request.renderer !== 'image' ||
      !Number.isInteger(request.index) ||
      request.index < 0 ||
      request.index >= (viewer.tileSources?.length ?? 0) ||
      request.url !== sourceUrl(viewer.tileSources?.[request.index])
    )
      return;
    viewer.goToPage(request.index);
  };
  commandTarget.addEventListener('imageNavigationRequest', navigate);
  viewer.addHandler('open', opened);
  for (const event of ['page', 'open-failed', 'close']) viewer.addHandler(event, clear);
  host.addEventListener('imageLoading', clear);
  return () => {
    viewer.removeHandler('open', opened);
    for (const event of ['page', 'open-failed', 'close']) viewer.removeHandler(event, clear);
    host.removeEventListener('imageLoading', clear);
    commandTarget.removeEventListener('imageNavigationRequest', navigate);
  };
}
