// Some Image API services (including UW–Madison) decode an identifier's %2F in
// info.json even though their tile endpoint requires the encoded path segment.
export function iiifServiceId(advertised: string, infoUrl?: string): string {
  if (!infoUrl || !/%2f/i.test(infoUrl)) return advertised;
  try {
    const requested = new URL(infoUrl);
    if (!requested.pathname.endsWith('/info.json')) return advertised;
    requested.pathname = requested.pathname.slice(0, -'/info.json'.length);
    const canonical = new URL(advertised);
    if (
      requested.origin === canonical.origin &&
      requested.username === canonical.username &&
      requested.password === canonical.password &&
      requested.search === canonical.search &&
      requested.hash === canonical.hash &&
      requested.pathname.replace(/%2f/gi, '/') === canonical.pathname
    ) {
      return requested.href;
    }
  } catch {
    // OpenSeadragon may also receive inline or relative source descriptions.
  }
  return advertised;
}
