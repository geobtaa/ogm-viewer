import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
// A release must identify committed source, including the lockfile and generated declarations.
git('diff', '--exit-code', 'HEAD');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (pkg.name !== '@geobtaa/ogm-viewer' || !pkg.version.includes('-btaa.')) throw new Error('Expected a BTAA prerelease package');
const provenance = {
  repository: 'https://github.com/geobtaa/ogm-viewer',
  commit: git('rev-parse', 'HEAD'),
  upstream: { repository: 'https://github.com/OpenGeoMetadata/ogm-viewer', tag: 'v1.6.0', commit: '9bf7a870b6269b636f218874edcaa6d8d68e3406' },
  package: pkg.name,
  version: pkg.version,
  node: process.version,
  lockfileSha256: createHash('sha256')
    .update(await readFile('package-lock.json'))
    .digest('hex'),
};
await mkdir('artifacts', { recursive: true });
await writeFile('fork-build.json', JSON.stringify(provenance, null, 2) + '\n');
// Some npm versions write prepare/build output before the JSON pack result.
const output = execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', 'artifacts', '--json'], { encoding: 'utf8' });
const [packed] = JSON.parse(output.slice(output.lastIndexOf('\n[') + 1));
const checksum = createHash('sha256')
  .update(await readFile(`artifacts/${packed.filename}`))
  .digest('hex');
await writeFile(`artifacts/${packed.filename}.sha256`, `${checksum}  ${packed.filename}\n`);
console.log(JSON.stringify({ ...provenance, filename: packed.filename, integrity: packed.integrity, sha256: checksum }, null, 2));
