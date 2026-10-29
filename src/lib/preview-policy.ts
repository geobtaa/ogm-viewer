import type { PreviewSelection } from './preview-events';

type Preview = { previewId: string; kind: string; renderer: PreviewSelection['renderer'] };
export const isIiifImage = (preview: Preview) => preview.renderer === 'image' && ['iiif-image', 'iiif-manifest'].includes(preview.kind);

export function preferManifests<T extends Preview>(previews: T[]): T[] {
  const manifests = previews.filter(preview => preview.kind === 'iiif-manifest' && preview.renderer === 'image');
  return [...manifests, ...previews.filter(preview => !manifests.includes(preview))];
}

export function hiddenImage(preview: Preview, previews: Preview[], activeId: string | undefined, failed: string[]): boolean {
  return (
    preview.kind === 'iiif-image' &&
    preview.previewId !== activeId &&
    previews.some(candidate => candidate.kind === 'iiif-manifest' && candidate.renderer === 'image' && !failed.includes(candidate.previewId))
  );
}

/** Recover only initial image failures, preserving map choices and an already opened book. */
export function recoveryPreview(previews: Preview[], activeId: string | undefined, opened: string[], failed: string[]): string | undefined {
  const available = previews.filter(preview => isIiifImage(preview) && opened.includes(preview.previewId) && !failed.includes(preview.previewId));
  const active = previews.find(preview => preview.previewId === activeId);
  const manifest = available.find(preview => preview.kind === 'iiif-manifest');
  if (active?.kind === 'iiif-image' && manifest) return manifest.previewId;
  if (!activeId || !failed.includes(activeId) || opened.includes(activeId)) return undefined;
  return available[0]?.previewId;
}
