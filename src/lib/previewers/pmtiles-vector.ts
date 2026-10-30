import TiledVectorPreviewer from './tiled-vector';
import type { AddVectorSourceObject } from './vector';

export default class PMTilesVectorPreviewer extends TiledVectorPreviewer {
  protected getSourceId(): string {
    return `${this.resource.id}${this.resource.previewKey ? `-${this.resource.previewKey}` : ''}`;
  }

  protected readonly featuresMayLackIds = true;

  protected async createSources(): Promise<AddVectorSourceObject[]> {
    return [
      {
        id: this.getSourceId(),
        type: 'vector',
        url: this.resource.getMapLibreSourceUrl(),
        encoding: await this.resource.getVectorEncoding(),
      },
    ];
  }
}
