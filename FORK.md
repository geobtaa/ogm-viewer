# BTAA integration fork

This is a stabilization fork based on upstream **v1.6.0**, commit
`9bf7a870b6269b636f218874edcaa6d8d68e3406`. No upstream PRs have been opened for
these changes. The integration branch is `feature/viewer-integration`; `main`
is the unmodified upstream history.

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
2. Rebase the focused source commits in a new branch. Drop changes that upstream now provides.
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
