import { Component, Element, Event, EventEmitter, Host, Listen, Prop, State, Watch, h } from '@stencil/core';

import '@awesome.me/webawesome/dist/components/tab-group/tab-group.js';
import '@awesome.me/webawesome/dist/components/tab-panel/tab-panel.js';
import '@awesome.me/webawesome/dist/components/tab/tab.js';

import { hiddenImage, isIiifImage, preferManifests, recoveryPreview } from '../../lib/preview-policy';
import { previewSelection, type ImageSelection, type PreviewSelection } from '../../lib/preview-events';
import type OgmRecord from '../../lib/record';
import { adoptWebAwesomeTheme, initialTheme, waScope } from '../../lib/init';
import { resourcesFor } from '../../lib/resources/factory';
import { previewersForResources, type AnyPreviewer } from '../../lib/previewers/factory';
import type { RequestTransform } from '../../lib/request';
import { defaultBeforeId } from '../../lib/themes/maplibre';

@Component({
  tag: 'ogm-previews',
  styleUrl: 'ogm-previews.css',
  shadow: true,
})
export class OgmPreviews {
  @Element() el!: HTMLElement;
  @Prop() theme: 'light' | 'dark' = initialTheme(this.el);
  @Prop() darkBasemap?: string;
  @Prop() lightBasemap?: string;
  /** Omit metadata-only location previews derived from a record. Explicit previewers are preserved. */
  @Prop() omitLocation: boolean = false;
  /** Prefer complete manifests and recover initial image failures without replacing a working book. */
  @Prop() preferManifest: boolean = false;
  /** Hide tab navigation when only one preview is visible. */
  @Prop() hideSingleTab: boolean = false;
  @Prop() record?: OgmRecord;
  @Prop() previewers?: AnyPreviewer[];
  @Prop() requestTransform?: RequestTransform;
  /** Undefined uses the default label layer; an empty string places previews above the basemap. */
  @Prop() beforeId?: string;
  @Prop() sidebarPadding: number;
  @State() private recordPreviewers: AnyPreviewer[] = [];
  /** Active preview identity; null when there are no previews. */
  @Event() previewChange: EventEmitter<PreviewSelection | null>;
  @State() private activePreviewId?: string;
  @State() private opened: string[] = [];
  @State() private failed: string[] = [];
  private lastSelection?: string;
  private tabGroup?: HTMLElement;

  private get activePreview() {
    return this.tabs.find(preview => preview.previewId === this.activePreviewId) ?? this.tabs[0];
  }

  componentDidRender() {
    const detail = this.activePreview ? previewSelection(this.activePreview) : null;
    const serialized = JSON.stringify(detail);
    if (serialized !== this.lastSelection) {
      this.lastSelection = serialized;
      this.previewChange.emit(detail);
    }
  }

  @Listen('wa-tab-show')
  protected onTabShown(event: CustomEvent<{ name: string }>) {
    if (event.composedPath()[0] !== this.tabGroup) return;
    if (this.tabs.some(preview => preview.previewId === event.detail.name)) this.activePreviewId = event.detail.name;
    this.recover();
  }

  @Watch('previewers')
  protected resetSelection() {
    this.activePreviewId = undefined;
    this.lastSelection = undefined;
    this.opened = [];
    this.failed = [];
  }

  private matches(source?: PreviewSelection) {
    return source && this.tabs.find(preview => preview.previewId === source.previewId && preview.resourceId === source.resourceId && preview.url === source.resourceUrl);
  }

  private recover() {
    if (!this.preferManifest) return;
    const id = recoveryPreview(this.tabs, this.activePreview?.previewId, this.opened, this.failed);
    if (id) this.activePreviewId = id;
  }

  @Listen('imageChange')
  protected onImageChange(event: CustomEvent<ImageSelection>) {
    if (!this.preferManifest || !event.detail?.image) return;
    const preview = this.matches(event.detail);
    if (!preview || !isIiifImage(preview)) return;
    if (!this.opened.includes(preview.previewId)) this.opened = [...this.opened, preview.previewId];
    this.failed = this.failed.filter(id => id !== preview.previewId);
    this.recover();
  }

  @Listen('previewError', { capture: true })
  protected onPreviewError(event: Event) {
    if (!this.preferManifest) return;
    const image = event.composedPath().find(node => (node as HTMLElement).tagName === 'OGM-IMAGE') as HTMLOgmImageElement | undefined;
    const source = image?.previewer;
    const preview = source && this.matches(previewSelection(source));
    if (!preview || !isIiifImage(preview) || this.opened.includes(preview.previewId)) return;
    if (!this.failed.includes(preview.previewId)) this.failed = [...this.failed, preview.previewId];
    this.recover();
  }

  private hidden(preview: AnyPreviewer) {
    return this.preferManifest && hiddenImage(preview, this.tabs, this.activePreview?.previewId, this.failed);
  }

  private label(preview: AnyPreviewer) {
    if (this.preferManifest && isIiifImage(preview)) return preview.kind === 'iiif-manifest' ? 'Images' : 'Single image';
    return preview.label();
  }

  @Event() previewsLoading: EventEmitter<void>;
  @Event() previewsLoaded: EventEmitter<void>;

  // Ignore preview lists built for a record that has since changed.
  private pending = 0;

  private get tabs(): AnyPreviewer[] {
    if (this.previewers) return this.previewers;
    const previews = this.recordPreviewers.filter(preview => !this.omitLocation || preview.kind !== 'location');
    return this.preferManifest ? preferManifests(previews) : previews;
  }

  // Return the promise so the first render waits until the preview tabs are known.
  componentWillLoad() {
    adoptWebAwesomeTheme(this.el);
    return this.buildPreviewers(this.record);
  }

  @Watch('record')
  protected async onRecordChange(record?: OgmRecord) {
    await this.buildPreviewers(record);
  }

  private async buildPreviewers(record?: OgmRecord) {
    const build = ++this.pending;
    this.resetSelection();
    if (!record || this.previewers) {
      this.recordPreviewers = [];
      return;
    }

    this.previewsLoading.emit();
    try {
      const previewers = await previewersForResources(resourcesFor(record, this.requestTransform));
      this.applyBeforeId(previewers, this.beforeId);
      if (build === this.pending) this.recordPreviewers = previewers;
    } finally {
      this.previewsLoaded.emit();
    }
  }

  @Watch('beforeId')
  protected onBeforeIdChange(beforeId?: string) {
    this.applyBeforeId(this.recordPreviewers, beforeId ?? defaultBeforeId);
  }

  private applyBeforeId(previewers: AnyPreviewer[], beforeId?: string) {
    if (beforeId === undefined) return;
    for (const previewer of previewers) if (previewer.renderer === 'map') previewer.beforeId = beforeId;
  }

  // Key the group by its previews so a new set resets the internally managed active tab.
  render() {
    const tabs = this.tabs;
    if (!tabs.length) return;

    return (
      <Host class={waScope(this.theme)}>
        <wa-tab-group
          data-single-preview={this.hideSingleTab && tabs.filter(preview => !this.hidden(preview)).length === 1 ? '' : undefined}
          ref={(el: HTMLElement) => (this.tabGroup = el)}
          active={this.activePreview?.previewId}
          class={waScope(this.theme)}
          key={tabs.map(previewer => previewer.previewId).join()}
        >
          {tabs.map(previewer => (
            <wa-tab
              key={`tab-${previewer.previewId}`}
              panel={previewer.previewId}
              hidden={this.hidden(previewer)}
              style={{ display: this.hidden(previewer) ? 'none' : '' }}
              disabled={this.failed.includes(previewer.previewId) && previewer.previewId !== this.activePreview?.previewId}
              title={this.failed.includes(previewer.previewId) ? 'Preview unavailable' : undefined}
            >
              {this.label(previewer)}
            </wa-tab>
          ))}
          {tabs.map(previewer => (
            <wa-tab-panel key={`panel-${previewer.previewId}`} name={previewer.previewId} active={previewer.previewId === this.activePreview?.previewId}>
              <ogm-preview
                theme={this.theme}
                darkBasemap={this.darkBasemap}
                lightBasemap={this.lightBasemap}
                previewer={previewer}
                sidebar-padding={this.sidebarPadding}
                references={this.record?.references}
              ></ogm-preview>
            </wa-tab-panel>
          ))}
        </wa-tab-group>
      </Host>
    );
  }
}
