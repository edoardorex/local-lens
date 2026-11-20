import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';

const MAX_BODY = 32 * 1024;
const MAX_HTML = 8 * 1024 * 1024;
const MAX_REQUESTS = 100;
const STYLE_KEYS = [
  'display', 'position', 'color', 'background-color', 'font-family', 'font-size',
  'font-weight', 'line-height', 'padding', 'margin', 'gap', 'border-radius',
  'border', 'width', 'height', 'align-items', 'justify-content', 'grid-template-columns',
];

export function parseTarget(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Use a loopback HTTP origin, for example http://localhost:5173 (no path or credentials).');
  }
  return url;
}

function text(value, max, name, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

export function validateSelection(input) {
  if (!input || typeof input !== 'object' || !input.element || !input.page) {
    throw new Error('Expected an instruction, element, and page.');
  }
  const { element, page } = input;
  const attributes = {};
  for (const key of ['id', 'class', 'role', 'aria-label', 'data-testid', 'type', 'name']) {
    if (element.attributes?.[key] !== undefined) {
      attributes[key] = text(element.attributes[key], 500, `attribute ${key}`);
    }
  }
  const styles = {};
  for (const key of STYLE_KEYS) {
    if (element.styles?.[key] !== undefined) styles[key] = text(element.styles[key], 500, `style ${key}`);
  }
  const rect = {};
  for (const key of ['x', 'y', 'width', 'height']) {
    const value = element.rect?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 10_000_000) {
      throw new Error(`Invalid rectangle ${key}.`);
    }
    rect[key] = value;
  }
  if (!Array.isArray(element.ancestors) || element.ancestors.length > 6) {
    throw new Error('Expected at most six ancestors.');
  }
  const path = text(page.path, 2000, 'page path', true);
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('?') || path.includes('#')) {
    throw new Error('Page path must be a local pathname without query or fragment.');
  }
  return {
    instruction: text(input.instruction, 4000, 'instruction', true).trim(),
    page: { path },
    element: {
      tag: text(element.tag, 50, 'tag', true),
      selector: text(element.selector, 2000, 'selector', true),
      text: text(element.text, 1000, 'element text'),
      attributes, styles, rect,
      ancestors: element.ancestors.map((item) => text(item, 500, 'ancestor')),
    },
  };
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function body(req) {
  const parts = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY) throw new Error('Request body exceeds 32 KiB.');
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

function headersFor(req, target, origin) {
  const headers = { ...req.headers, host: target.host };
  delete headers['accept-encoding'];
  headers['accept-encoding'] = 'identity';
  if (headers.origin === origin) headers.origin = target.origin;
  if (headers.referer?.startsWith(`${origin}/`)) {
    headers.referer = `${target.origin}${headers.referer.slice(origin.length)}`;
  }
  return headers;
}

export async function createLensServer({ target: targetValue, port = 0, onStop = () => {} }) {
  const target = parseTarget(targetValue);
  const client = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  const token = randomBytes(24).toString('hex');
  const prefix = `/__local_lens/${token}`;
  const requests = [];
  const waiters = new Set();
  const sockets = new Set();
  let origin;
  let closing = false;

  function allowed(req) {
    return req.headers.host === new URL(origin).host
      && (!req.headers.origin || req.headers.origin === origin)
      && req.headers['sec-fetch-site'] !== 'cross-site';
  }

  function deliver() {
    if (waiters.size === 0) return;
    const pending = requests.find((item) => item.status === 'active' || item.status === 'queued');
    if (!pending) return;
    pending.status = 'active';
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      json(waiter.res, 200, pending);
    }
    waiters.clear();
  }

  async function api(req, res, url) {
    res.setHeader('x-content-type-options', 'nosniff');
    if (req.method === 'GET' && url.pathname === `${prefix}/client.js`) {
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
      res.end(client.replace('__LOCAL_LENS_PREFIX__', prefix));
    } else if (req.method === 'GET' && url.pathname === `${prefix}/health`) {
      json(res, 200, { name: 'local-lens', target: target.origin, requests: requests.length });
    } else if (req.method === 'GET' && url.pathname === `${prefix}/requests`) {
      json(res, 200, requests.map(({ id, instruction, status, summary }) => ({ id, instruction, status, summary })));
    } else if (req.method === 'POST' && url.pathname === `${prefix}/requests`) {
      const selection = validateSelection(await body(req));
      if (requests.filter((item) => item.status === 'queued' || item.status === 'active').length >= 20) {
        return json(res, 429, { error: 'Queue full. Finish existing requests before adding more.' });
      }
      while (requests.length >= MAX_REQUESTS) {
        const index = requests.findIndex((item) => item.status === 'done' || item.status === 'failed');
        if (index < 0) return json(res, 429, { error: 'Request history is full.' });
        requests.splice(index, 1);
      }
      const request = { id: randomUUID(), ...selection, status: 'queued', createdAt: new Date().toISOString() };
      requests.push(request);
      json(res, 201, { id: request.id, status: request.status });
      deliver();
    } else if (req.method === 'GET' && url.pathname === `${prefix}/next`) {
      const seconds = Number(url.searchParams.get('timeout') ?? 120);
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 600) {
        return json(res, 400, { error: 'Timeout must be an integer from 0 to 600 seconds.' });
      }
      const waiter = { res, timer: null };
      waiter.timer = setTimeout(() => {
        waiters.delete(waiter);
        json(res, 408, { error: 'No selection received before the timeout.' });
      }, seconds * 1000);
      waiters.add(waiter);
      res.on('close', () => { clearTimeout(waiter.timer); waiters.delete(waiter); });
      deliver();
    } else if (req.method === 'POST' && url.pathname === `${prefix}/result`) {
      const input = await body(req);
      const item = requests.find((request) => request.id === input.id);
      if (!item) return json(res, 404, { error: 'Unknown request ID.' });
      if (!['done', 'failed'].includes(input.status)) {
        return json(res, 400, { error: 'Status must be done or failed.' });
      }
      const summary = text(input.summary, 2000, 'summary', true);
      if (item.status === 'done' || item.status === 'failed') {
        return json(res, 409, { error: 'This request has already been completed.' });
      }
      item.status = input.status;
      item.summary = summary;
      json(res, 200, { id: item.id, status: item.status, summary });
      deliver();
    } else if (req.method === 'POST' && url.pathname === `${prefix}/stop`) {
      json(res, 200, { stopped: true });
      setImmediate(() => void close());
    } else {
      json(res, 404, { error: 'Unknown Local Lens endpoint.' });
    }
  }

  function proxy(req, res) {
    const upstream = http.request(new URL(req.url, target), {
      method: req.method,
      headers: headersFor(req, target, origin),
    }, async (response) => {
      const headers = { ...response.headers };
      if (headers.location) {
        const location = new URL(headers.location, target);
        if (location.origin === target.origin) {
          headers.location = `${origin}${location.pathname}${location.search}${location.hash}`;
        }
      }
      const isHtml = req.method !== 'HEAD' && response.statusCode === 200
        && headers['content-type']?.includes('text/html');
      if (!isHtml) {
        res.writeHead(response.statusCode, headers);
        response.on('error', (error) => res.destroy(error));
        response.pipe(res);
        return;
      }
      try {
        const chunks = [];
        let length = 0;
        for await (const chunk of response) {
          length += chunk.length;
          if (length > MAX_HTML) throw new Error('HTML exceeds the 8 MiB picker limit.');
          chunks.push(chunk);
        }
        let buffer = Buffer.concat(chunks);
        const decompressors = { gzip: gunzipSync, deflate: inflateSync, br: brotliDecompressSync };
        const encoding = headers['content-encoding'];
        if (encoding && encoding !== 'identity') {
          if (!decompressors[encoding]) throw new Error(`Unsupported HTML encoding: ${encoding}.`);
          buffer = decompressors[encoding](buffer, { maxOutputLength: MAX_HTML });
        }
        let html = buffer.toString('utf8').replace(
          /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy(?:-report-only)?["']?[^>]*>/gi, '',
        );
        const script = `<script src="${prefix}/client.js" defer></script>`;
        html = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, `${script}</body>`) : html + script;
        for (const key of ['content-length', 'content-encoding', 'content-security-policy',
          'content-security-policy-report-only', 'etag', 'content-md5']) delete headers[key];
        headers['cache-control'] = 'no-store';
        res.writeHead(response.statusCode, headers);
        res.end(html);
      } catch (error) {
        json(res, 502, { error: `Could not inject picker: ${error.message}` });
      }
    });
    upstream.on('error', (error) => {
      if (res.headersSent) res.destroy(error);
      else json(res, 502, { error: `Local dev server unavailable: ${error.message}` });
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  }

  const server = http.createServer((req, res) => {
    if (!allowed(req)) return json(res, 403, { error: 'Only same-origin loopback requests are allowed.' });
    if (!req.url.startsWith('/') || req.url.startsWith('//')) {
      return json(res, 400, { error: 'Expected a local request path.' });
    }
    const url = new URL(req.url, origin);
    if (url.origin !== origin) return json(res, 400, { error: 'Expected a same-origin request path.' });
    if (url.pathname.startsWith('/__local_lens/')) {
      if (!url.pathname.startsWith(`${prefix}/`)) return json(res, 403, { error: 'Invalid session token.' });
      void api(req, res, url).catch((error) => {
        if (!res.headersSent && !res.destroyed) json(res, 400, { error: error.message });
      });
    } else {
      proxy(req, res);
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('upgrade', (req, socket, head) => {
    if (!allowed(req) || !req.url.startsWith('/') || req.url.startsWith('//')
      || new URL(req.url, origin).origin !== origin || req.url.startsWith('/__local_lens/')) {
      return socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    }
    const upstream = http.request(new URL(req.url, target), {
      headers: headersFor(req, target, origin),
    });
    upstream.on('upgrade', (response, remote, remoteHead) => {
      sockets.add(remote);
      remote.on('close', () => sockets.delete(remote));
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${response.rawHeaders
        .reduce((lines, value, index, all) => index % 2 === 0 ? [...lines, `${value}: ${all[index + 1]}`] : lines, [])
        .join('\r\n')}\r\n\r\n`);
      if (remoteHead.length) socket.write(remoteHead);
      if (head.length) remote.write(head);
      socket.on('error', () => remote.destroy());
      remote.on('error', () => socket.destroy());
      socket.pipe(remote).pipe(socket);
      socket.on('close', () => remote.destroy());
    });
    upstream.on('response', (response) => {
      response.resume();
      socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    });
    upstream.on('error', () => socket.destroy());
    socket.on('close', () => upstream.destroy());
    upstream.end();
  });

  async function close() {
    if (closing) return;
    closing = true;
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      json(waiter.res, 503, { error: 'Local Lens is shutting down.' });
    }
    waiters.clear();
    server.close();
    for (const socket of sockets) socket.destroy();
    await onStop();
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { server, origin, prefix, token, close };
}
