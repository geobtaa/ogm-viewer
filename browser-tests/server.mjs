import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fixtureResponse } from './fixtures.mjs';
const root = resolve('.');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const fixture = fixtureResponse(url);
  if (fixture) {
    res.writeHead(fixture.status ?? 200, { 'Content-Type': fixture.type ?? 'text/plain' });
    res.end(fixture.body);
    return;
  }
  const file = resolve(root, `.${url.pathname === '/' ? '/browser-tests/harness.html' : url.pathname}`);
  if (!file.startsWith(root + '/') || (!['/dist/', '/browser-tests/'].some(prefix => url.pathname.startsWith(prefix)) && url.pathname !== '/')) {
    res.writeHead(404).end();
    return;
  }
  try {
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
}).listen(Number(process.env.PORT ?? 4177), '127.0.0.1');
