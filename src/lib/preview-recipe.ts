import type { LngLatBoundsLike } from 'maplibre-gl';

/** Runtime-only rendering instructions; never serialized into source OGM metadata. */
export interface PreviewRecipe {
  kind: 'rgb' | 'scalar' | 'classified' | 'vector';
  bands: number[];
  value_range?: [number, number] | null;
  palette?: Record<string, [number, number, number, number]> | null;
  ramp?: 'viridis';
  nodata?: number | null;
  units?: string | null;
  color?: string;
  fill_opacity?: number;
  stroke_width?: number;
  point_radius?: number;
}

export interface PreparedPreviewLayer {
  id: string;
  name: string;
  url: string;
  format: 'cog' | 'pmtiles';
  bounds?: LngLatBoundsLike;
  recipe?: PreviewRecipe;
}
