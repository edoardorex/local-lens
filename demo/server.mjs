import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export async function createDemo(port = 0, source = new URL('./index.html', import.meta.url)) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.split('?')[0] === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      const html = await readFile(source);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(`Demo failed: ${error.message}`);
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const server = await createDemo(4173);
  console.log(`Local Lens demo: http://127.0.0.1:${server.address().port}`);
  const close = () => { server.closeAllConnections(); server.close(); };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
