import http from 'node:http';
import { createLensServer } from '../skills/local-lens/scripts/server.mjs';

export function selection(overrides = {}) {
  return {
    instruction: 'Give this button more breathing room.',
    page: { path: '/' },
    element: {
      tag: 'button', selector: '[data-testid="hero-cta"]', text: 'Find your flow',
      attributes: { 'data-testid': 'hero-cta' }, styles: { padding: '15px 21px' },
      rect: { x: 10, y: 20, width: 140, height: 45 }, ancestors: ['div.actions', 'main'],
    },
    ...overrides,
  };
}

export async function fixture(t, handler) {
  const upstream = http.createServer(handler ?? ((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end('<html><body><button id="save">Save</button></body></html>');
  }));
  const sockets = new Set();
  upstream.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const target = `http://127.0.0.1:${upstream.address().port}`;
  const lens = await createLensServer({ target });
  t.after(async () => {
    await lens.close();
    for (const socket of sockets) socket.destroy();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  });
  const api = async (endpoint, data, headers = {}) => fetch(`${lens.origin}${lens.prefix}/${endpoint}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { ...(data === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { upstream, target, lens, api };
}
