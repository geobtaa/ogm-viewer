import type { StyleSpecification } from 'maplibre-gl';

export const BASEMAP_STYLES = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  bright: 'https://tiles.openfreemap.org/styles/bright',
  positron: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  fiord: 'https://tiles.openfreemap.org/styles/fiord',
} as const;

export type BasemapKey = keyof typeof BASEMAP_STYLES;
export const DEFAULT_BASEMAP: BasemapKey = 'positron';
export const getAvailableBasemapKeys = () => Object.keys(BASEMAP_STYLES) as BasemapKey[];

export function getSavedBasemapKey(): BasemapKey {
  try {
    const key = document.cookie.match(/(?:^|;\s*)preferred_basemap=([^;]*)/)?.[1];
    if (key && Object.hasOwn(BASEMAP_STYLES, key)) return key as BasemapKey;
  } catch {
    // Server rendering and sandboxed embeds may have no cookie access.
  }
  return DEFAULT_BASEMAP;
}

type ApplyStyle = (style: StyleSpecification, url: string) => void;

/** Shared MapLibre control used in the Geoportal sidebar and OGM map previews. */
export class BasemapControl {
  private element?: HTMLElement;
  private removeOutsideListener?: () => void;
  private pending?: AbortController;
  private radios = new Map<BasemapKey, HTMLInputElement>();

  constructor(
    private currentUrl: string,
    private apply: ApplyStyle,
    private onOpen?: () => void,
  ) {}

  reset(url: string) {
    this.pending?.abort();
    this.currentUrl = url;
    for (const [key, radio] of this.radios) radio.checked = BASEMAP_STYLES[key] === url;
  }

  private async select(key: BasemapKey) {
    this.pending?.abort();
    const request = new AbortController();
    this.pending = request;
    const url = BASEMAP_STYLES[key];
    try {
      const response = await fetch(url, { signal: request.signal });
      if (!response.ok) throw new Error('Basemap unavailable');
      const style = await response.json();
      if (request.signal.aborted) return;
      this.apply(style, url);
      this.currentUrl = url;
      try {
        document.cookie = `preferred_basemap=${key}; Path=/; Max-Age=31536000; SameSite=Lax`;
      } catch {
        // The current map still works when the browser blocks cookies.
      }
    } catch (error) {
      if (request.signal.aborted) return;
      this.reset(this.currentUrl);
      console.warn('Unable to change basemap', error);
    }
  }

  onAdd(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'maplibregl-ctrl maplibregl-ctrl-group geo-map-basemap';
    div.style.position = 'relative';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'geo-map-control-button';
    button.title = 'Basemaps';
    button.setAttribute('aria-label', 'Change basemap');
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML =
      '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 10 5-10 5L2 8l10-5Z"/><path d="m2 12 10 5 10-5M2 16l10 5 10-5"/></svg>';
    const panel = document.createElement('div');
    panel.hidden = true;
    panel.setAttribute('role', 'radiogroup');
    panel.setAttribute('aria-label', 'Basemap style');
    panel.style.cssText = 'min-width:180px;padding:8px;background:white;color:#111827;border:1px solid #b9b9b9;border-radius:4px;box-shadow:0 1px 5px #0004;';
    const setOpen = (open: boolean, focus = false) => {
      // Expand in place, as the production layers control does. The button and
      // options share one continuous hit area; there is no hover gap to cross.
      if (open && panel.hidden) this.onOpen?.();
      button.hidden = open;
      button.style.display = open ? 'none' : '';
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      if (open && focus) (panel.querySelector<HTMLInputElement>('input:checked') ?? panel.querySelector<HTMLInputElement>('input'))?.focus();
    };
    const name = 'basemap-' + Math.random().toString(36).slice(2);
    for (const key of getAvailableBasemapKeys()) {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:7px;padding:4px;white-space:nowrap;font:13px/1.4 system-ui;cursor:pointer;';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = name;
      radio.value = key;
      radio.checked = BASEMAP_STYLES[key] === this.currentUrl;
      radio.onchange = () => {
        if (radio.checked) {
          void this.select(key);
          setOpen(false);
          button.focus();
        }
      };
      this.radios.set(key, radio);
      label.append(radio, document.createTextNode('OpenFreeMap ' + key[0].toUpperCase() + key.slice(1)));
      panel.append(label);
    }
    button.onclick = () => setOpen(true, true);
    div.onmouseenter = () => setOpen(true);
    div.onmouseleave = event => {
      if (event.relatedTarget instanceof Node && div.contains(event.relatedTarget)) return;
      if (!panel.matches(':focus-within')) setOpen(false);
    };
    div.onkeydown = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!event.composedPath().includes(div)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    this.removeOutsideListener = () => document.removeEventListener('pointerdown', outside);
    div.append(button, panel);
    this.element = div;
    return div;
  }

  onRemove() {
    this.pending?.abort();
    this.removeOutsideListener?.();
    this.element?.remove();
    this.radios.clear();
  }
}
