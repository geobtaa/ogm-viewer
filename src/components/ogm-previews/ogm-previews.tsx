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

@Component({
  tag: 'ogm-previews',
  styleUrl: 'ogm-previews.css',
  shadow: true,
})
export class OgmPreviews {
  @Element() el!: HTMLElement;
  @Prop() theme: 'light' | 'dark' = initialTheme(this.el);
  // A caller's own basemap for each mode, as a URL to a MapLibre style document; see
  // MapLibreTheme.getBaseMapStyle. Undefined keeps this library's own default.
  @Prop() darkBasemap?: string;
  @Prop() lightBasemap?: string;
  /** Omit metadata-only location previews derived from a record. Explicit previewers are preserved. */
  @Prop() omitLocation: boolean = false;
  /** Prefer complete manifests and recover initial image failures without replacing a working book. */
  @Prop() preferManifest: boolean = false;
  /** Hide tab navigation when only one preview is visible. */
  @Prop() hideSingleTab: boolean = false;
  @Prop() record?: OgmRecord;
  // Previews to show, for an application that builds its own rather than handing over a record - the
  // tab strip is worth having either way. Takes the place of `record`, which is then not read at all.
  // A DOM property, like `record`: neither survives being written as an attribute.
  @Prop() previewers?: AnyPreviewer[];
  // Passed to resourcesFor() when building this record's previews; see Resource.requestTransform.
  // Previewers handed over directly carry their own, by way of the resources they were built from.
  @Prop() requestTransform?: RequestTransform;
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

  // Which build of the list is the current one. A record can change while the previous one's
  // previews are still being worked out, and the answer that arrives last is not necessarily the
  // one still wanted.
  private pending = 0;

  // Every preview to show, one per tab: the ones we were handed, or else the ones this record turned
  // out to offer.
  private get tabs(): AnyPreviewer[] {
    if (this.previewers) return this.previewers;
    const previews = this.recordPreviewers.filter(preview => !this.omitLocation || preview.kind !== 'location');
    return this.preferManifest ? preferManifests(previews) : previews;
  }

  // @Watch only fires on changes, so the record we were rendered with is handled here. Returning
  // the promise makes Stencil hold the first render until the tabs are known, so the tab strip is
  // never painted empty and then filled in.
  componentWillLoad() {
    adoptWebAwesomeTheme(this.el);
    return this.buildPreviewers(this.record);
  }

  @Watch('record')
  protected async onRecordChange(record?: OgmRecord) {
    await this.buildPreviewers(record);
  }

  // Every preview this record offers, one per tab. Skipped entirely when previews were handed to us:
  // there is nothing for a record to add, and the work would only be thrown away.
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
      // A newer record started building while this one was waiting; that one's answer is the keeper
      if (build === this.pending) this.recordPreviewers = previewers;
    } finally {
      // Always paired with the emit above, even when superseded: ogm-viewer counts these
      this.previewsLoaded.emit();
    }
  }

  // Render as tabs for switching between previews.
  //
  // Keyed by which preview each element draws, not by where it sits. Position is the wrong identity
  // twice over: a tab and its panel are siblings inside the group, so numbering both from zero gave
  // it two children under every key and the diff went on to reuse a tab where a panel belonged. And
  // wa-tab-group tracks which tab is active itself, in a property no render of ours writes, so a
  // group left standing across a change of previews keeps pointing at whichever tab the user had
  // picked - the third one of a record that now offers two. Keying the group by the whole set
  // replaces it outright when the previews change, which is the only way to clear that.
  //
  // The tab group carries the Web Awesome scope as well as the Host, since the stylesheet linked here
  // establishes the palette with plain class selectors and those never match their own shadow host.
  // Everything the group draws - the tabs, their panels - reads its colors from it.
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
