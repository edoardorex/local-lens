import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parseTarget, validateSelection } from '../skills/local-lens/scripts/server.mjs';
import { fixture, selection } from './helpers.mjs';

test('upstreams must be loopback HTTP origins', () => {
  for (const url of ['http://localhost:5173', 'http://127.0.0.1:3000', 'http://[::1]:8080']) {
    assert.ok(parseTarget(url));
  }
  for (const url of ['https://localhost:3000', 'http://example.com', 'http://127.0.0.1.evil.test',
    'http://user:pass@localhost', 'http://localhost/app', 'http://localhost/?token=secret', 'file:///tmp/app']) {
    assert.throws(() => parseTarget(url));
  }
});

test('selection validation bounds and strips context', () => {
  const input = selection();
  input.element.attributes.value = 'do-not-collect';
  input.element.outerHTML = '<input value="private">';
  const output = validateSelection(input);
  assert.equal(output.element.attributes.value, undefined);
  assert.equal(output.element.outerHTML, undefined);
  for (const invalid of [
    { ...input, instruction: '' },
    { ...input, instruction: 'x'.repeat(4001) },
    { ...input, page: { path: '/?secret=1' } },
    { ...input, element: { ...input.element, rect: { x: NaN } } },
    { ...input, element: { ...input.element, ancestors: Array(7).fill('main') } },
  ]) assert.throws(() => validateSelection(invalid));
});

test('HTML injection handles compression and removes only proxied CSP', async (t) => {
  const html = '<html><head><meta content="default-src \'none\'" http-equiv="Content-Security-Policy"></head><body>Hello</body></html>';
  const { lens } = await fixture(t, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip',
      'content-security-policy': "default-src 'none'", etag: '"original"' });
    res.end(gzipSync(html));
  });
  const response = await fetch(lens.origin);
  const body = await response.text();
  assert.ok(body.includes(`<script src="${lens.prefix}/client.js" defer></script></body>`));
  assert.ok(!body.includes('http-equiv'));
  assert.equal(response.headers.get('content-security-policy'), null);
  assert.equal(response.headers.get('etag'), null);
  assert.equal(response.headers.get('content-encoding'), null);
  const script = await fetch(`${lens.origin}${lens.prefix}/client.js`);
  assert.equal(script.status, 200);
  assert.ok((await script.text()).includes(`const prefix = '${lens.prefix}'`));
});

test('assets, SPA paths, bodies, and local redirects are forwarded', async (t) => {
  const { lens, target } = await fixture(t, async (req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: `${target}/dashboard?tab=1` });
      return res.end();
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ url: req.url, body: Buffer.concat(chunks).toString(), origin: req.headers.origin }));
  });
  const response = await fetch(`${lens.origin}/api/data?x=1`, {
    method: 'POST', headers: { origin: lens.origin }, body: 'original-body',
  });
  assert.deepEqual(await response.json(), { url: '/api/data?x=1', body: 'original-body', origin: target });
  const redirect = await fetch(`${lens.origin}/redirect`, { redirect: 'manual' });
  assert.equal(redirect.headers.get('location'), `${lens.origin}/dashboard?tab=1`);
});

test('token, host, and origin boundaries reject foreign callers', async (t) => {
  const { lens, api } = await fixture(t);
  assert.equal((await api('health')).status, 200);
  assert.equal((await fetch(`${lens.origin}/__local_lens/wrong/health`)).status, 403);
  assert.equal((await api('requests', selection(), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await api('health', undefined, { 'sec-fetch-site': 'cross-site' })).status, 403);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = http.get(lens.origin, { headers: { host: 'evil.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
  });
  assert.equal(hostStatus, 403);
  const escapedStatus = await new Promise((resolve, reject) => {
    const req = http.get(lens.origin, { path: '/\\example.com/private' }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
  });
  assert.equal(escapedStatus, 400);
});

test('long polling, redelivery, acknowledgement, and terminal results', async (t) => {
  const { api } = await fixture(t);
  const waiting = api('next?timeout=3');
  const posted = await (await api('requests', selection())).json();
  const delivered = await (await waiting).json();
  assert.equal(delivered.id, posted.id);
  assert.equal(delivered.status, 'active');
  assert.equal((await (await api('next?timeout=0')).json()).id, posted.id);
  const result = await api('result', { id: posted.id, status: 'done', summary: 'Updated component spacing.' });
  assert.equal(result.status, 200);
  assert.equal((await api('result', { id: posted.id, status: 'failed', summary: 'Duplicate.' })).status, 409);
  assert.equal((await api('next?timeout=0')).status, 408);
  const history = await (await api('requests')).json();
  assert.equal(history[0].summary, 'Updated component spacing.');
});

test('invalid input, queue limits, and failed requests are explicit', async (t) => {
  const { api } = await fixture(t);
  assert.equal((await api('requests', { instruction: 'missing element' })).status, 400);
  assert.equal((await api('requests', selection({ instruction: 'x'.repeat(40_000) }))).status, 400);
  assert.equal((await api('next?timeout=-1')).status, 400);
  assert.equal((await api('result', { id: 'missing', status: 'done', summary: 'No.' })).status, 404);
  const first = await (await api('requests', selection())).json();
  assert.equal(first.status, 'queued');
  assert.equal((await (await api('requests')).json())[0].status, 'queued');
  assert.equal((await api('result', { id: first.id, status: 'done', summary: '' })).status, 400);
  assert.equal((await api('result', { id: first.id, status: 'failed', summary: 'Source not found.' })).status, 200);
  for (let index = 0; index < 20; index++) assert.equal((await api('requests', selection())).status, 201);
  assert.equal((await api('requests', selection())).status, 429);
});

test('unavailable upstreams produce an explicit 502', async (t) => {
  const { upstream, lens } = await fixture(t);
  upstream.closeAllConnections();
  await new Promise((resolve) => upstream.close(resolve));
  const response = await fetch(lens.origin);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /dev server unavailable/);
});

test('WebSocket upgrades preserve HMR traffic', async (t) => {
  const { upstream, lens } = await fixture(t);
  upstream.on('upgrade', (req, socket) => {
    const accept = createHash('sha1')
      .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.write(Buffer.from([0x81, 5, ...Buffer.from('ready')]));
    socket.on('error', () => {});
  });
  const message = await new Promise((resolve, reject) => {
    const ws = new WebSocket(lens.origin.replace('http:', 'ws:'));
    const timeout = setTimeout(() => { ws.close(); reject(new Error('WebSocket test timed out.')); }, 3000);
    ws.onmessage = (event) => {
      clearTimeout(timeout);
      resolve(event.data);
      ws.close();
    };
    ws.onerror = () => { clearTimeout(timeout); reject(new Error('WebSocket upgrade failed.')); };
  });
  assert.equal(message, 'ready');
});
