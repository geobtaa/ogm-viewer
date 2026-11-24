# BTAA integration fork

This is a stabilization fork based on upstream **v1.8.0**, commit
`7bf2e2bb15f70ae126c5b100212417fd9b76c195`. No upstream PRs have been opened for
these changes. The integration branch is `feature/viewer-integration`; `main`
is the unmodified upstream history.

Upstream v1.8.0 adds popup auto-pan, explicit view bounds, and resolution of IIIF
canvas annotation targets to their images. The integration branch merges upstream main through commit
`21cb53080e59bf554726512603e2f3a61d6eb05c`, including the Development Seed 0.10.0 raster renderer for band-separate COGs,
the range reader, and support for linked georeference
annotations in the **Georeferenced content** preview.

The changes are intentionally separate commits:

1. Selection events, image-service capabilities, and validated page navigation.
2. Optional embedded menubar and Location suppression.
3. Optional manifest preference, initial-failure recovery, and single-tab presentation.
4. Browser contract tests using local IIIF and ArcGIS fixtures.
5. Fork-only package identity, provenance, and release safeguards.

The first four can be reviewed and proposed separately when ready. The packaging
commit belongs to this fork. Presentation options default to false, preserving
upstream behavior for other consumers. No compiled package is modified at install
time. Event declarations are generated from the TypeScript source and exported
from `ogm-viewer/lib` (using that dependency alias in consuming applications).

## Basemap and opacity controls

Map previews use the droplet to open layer opacity and visibility controls. The
stacked-layers button opens the same OpenFreeMap radio picker used by the
Geoportal sidebar. The default is Positron. An explicit choice is saved in the
`preferred_basemap` cookie when browser storage is available. Embedders can
still supply custom styles through `light-basemap` and `dark-basemap`.

## Embedded preview tabs

An embedder can set `external-preview-tabs` on `ogm-viewer` to place navigation
in its own header. Listen for the bubbling `previewTabsChange` event to receive
the ordered visible tabs with their IDs, labels, active state and availability.
Call `selectPreviewTab(id)` to activate an available preview. The viewer
continues to handle manifest preference, initial failure recovery and image
selection. The default viewer retains its built-in navigation.

PMTiles references can contain a single URL or a list of URLs and labelled links. Each distinct archive has its own tab, in metadata order. Unlabelled archives in a list appear as PMTiles 1, PMTiles 2, and so on.

## Bounds compatibility

Issue #1 adds support for `dcat_bbox` supplied as `west,south,east,north`,
using the existing bounds parser alongside Aardvark `ENVELOPE(...)` support.
A local WMS browser fixture uses the Ontario County coordinates from
`cugir-007910`. It checks actual tile extents while capabilities are delayed,
then checks the geographic window requested by a center click after loading.
This covers both the initial camera and later preview fitting without reading
private MapLibre state.

## Build and validate

Use the Node version in `.node-version`:

```sh
npm ci
npm run lint
npm test -- --run
npx playwright install chromium
npm run test:browser
npm run pack:fork
```

`pack:fork` requires committed source, builds the package, and writes a tarball and
SHA-256 file under `artifacts/`. The tarball includes `fork-build.json` identifying
the exact source commit, upstream baseline, lockfile hash, and Node version.
Publish a new **prerelease** asset for each integration version; never replace an
existing asset or move its tag. Consumers pin the exact asset URL and its npm
lockfile integrity, rather than a moving branch. GitHub release assets avoid
requiring a private registry credential in consuming builds.

The package is named `@geobtaa/ogm-viewer` and marked private to prevent accidental
npm publication. Inherited upstream npm-release and Pages workflows are guarded
to run only in the upstream repository. Fork releases are deliberate packaging
steps; creating a tag does not publish an npm package.

## Upgrade and eventual removal

1. Fetch upstream tags; identify the exact candidate baseline and review its API changes.
2. Merge the upstream release into the integration branch, preserving focused source commits. Drop changes that upstream now provides.
3. Regenerate declarations with `npm run build`; commit any generated changes.
4. Run source tests, real-browser tests, and the consuming application's development
   and production viewer/Downloads browser suites. Keep fixtures local and deterministic.
5. Review worker, decoder, and asset behavior with a full application production build.
6. Publish a new prerelease asset, update the application's pinned URL/lockfile,
   and smoke-test representative catalog records before deployment.

Once upstream provides the required contracts, change only the dependency and
thin React adapter as necessary. Downloads should continue to consume the public
selection payload, without reaching into OpenSeadragon or resolving manifests a
second time. Keep the browser tests as upgrade checks after the fork is retired.
