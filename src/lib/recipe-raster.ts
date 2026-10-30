import type { RasterArray, GeoTIFF, Overview } from '@developmentseed/geotiff';
import type { GetTileDataOptions } from '@developmentseed/deck.gl-geotiff';
import { CreateTexture } from '@developmentseed/deck.gl-raster/gpu-modules';
import type { RenderTileResult } from '@developmentseed/deck.gl-raster';
import type { Texture } from '@luma.gl/core';
import type { PreviewRecipe } from './preview-recipe';

export type RecipeTile = { width: number; height: number; byteLength: number; texture: Texture };

/** Byte-for-byte palette lookup shared with server recipes, including transparent classes. */
export function recipePixels(array: RasterArray, recipe: PreviewRecipe): Uint8Array {
  if (recipe.bands.some(band => band < 1 || band > array.count)) throw new Error('Preview recipe band is unavailable');
  const data = new Uint8Array(array.width * array.height * 4);
  const sample = (pixel: number, band: number) => (array.layout === 'band-separate' ? array.bands[band - 1][pixel] : array.data[pixel * array.count + band - 1]);
  const nodata = recipe.nodata ?? array.nodata;
  for (let pixel = 0; pixel < array.width * array.height; pixel++) {
    const values = recipe.bands.map(band => sample(pixel, band));
    if (array.mask?.[pixel] === 0 || values.some(value => !Number.isFinite(value) || (nodata !== null && Math.fround(value) === Math.fround(nodata)))) continue;
    let rgba: number[] | undefined;
    if (recipe.kind === 'classified') rgba = recipe.palette?.[String(values[0])];
    else if (recipe.kind === 'scalar') {
      if (!recipe.value_range || !recipe.palette) throw new Error('Scalar recipe requires a range and palette');
      const [lo, hi] = recipe.value_range;
      const index = Math.max(0, Math.min(255, Math.floor(((values[0] - lo) / (hi - lo)) * 255)));
      rgba = recipe.palette[String(index)];
    } else {
      rgba = values.slice(0, 3).map(value => {
        if (recipe.value_range) value = ((value - recipe.value_range[0]) / (recipe.value_range[1] - recipe.value_range[0])) * 255;
        return Math.max(0, Math.min(255, Math.floor(value)));
      });
      rgba.push(255);
    }
    if (rgba) data.set(rgba, pixel * 4);
  }
  return data;
}

export function recipeTileData(recipe: PreviewRecipe) {
  return async (image: GeoTIFF | Overview, options: GetTileDataOptions): Promise<RecipeTile> => {
    const tile = await image.fetchTile(options.x, options.y, { boundless: false, pool: options.pool, signal: options.signal });
    const { width, height } = tile.array;
    const data = recipePixels(tile.array, recipe);
    const texture = options.device.createTexture({ data, width, height, format: 'rgba8unorm', sampler: { minFilter: 'nearest', magFilter: 'nearest' } });
    return { width, height, byteLength: data.byteLength, texture };
  };
}

export function renderRecipeTile(tile: RecipeTile): RenderTileResult {
  return { renderPipeline: [{ module: CreateTexture, props: { textureName: tile.texture } }] };
}
