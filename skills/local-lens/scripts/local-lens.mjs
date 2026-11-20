#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createLensServer, parseTarget } from './server.mjs';

const HELP = `Local Lens - point at your UI, tell Copilot what to change.

  start --url http://localhost:5173 [--port 0] [--open]
  next [--timeout 120]
  done --id <request-id> --summary "What changed"
  fail --id <request-id> --summary "What prevented the change"
  status
  stop

All commands accept --state <directory>. Default: a per-project OS temp directory.
Runtime: Node.js 22+. No dependencies. Only trusted, local HTTP development apps.
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string' }, port: { type: 'string' }, open: { type: 'boolean' },
    timeout: { type: 'string' }, state: { type: 'string' }, id: { type: 'string' },
    summary: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  },
});
const command = positionals[0];
const project = process.platform === 'win32' ? process.cwd().toLowerCase() : process.cwd();
const stateDirectory = path.resolve(values.state ?? path.join(tmpdir(), 'local-lens',
  createHash('sha256').update(project).digest('hex').slice(0, 20)));
const stateFile = path.join(stateDirectory, 'session.json');

async function readSession() {
  let session;
  try {
    session = JSON.parse(await readFile(stateFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('No Local Lens session. Run start from the project root first.');
    throw new Error(`Cannot read session: ${error.message}`);
  }
  const url = new URL(session.origin);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
    || url.pathname !== '/' || url.search || url.hash || url.username || url.password
    || !/^[a-f0-9]{48}$/.test(session.token)) throw new Error('Invalid Local Lens session file.');
  return session;
}

async function call(session, endpoint, data, timeout = 10_000) {
  let response;
  try {
    response = await fetch(`${session.origin}/__local_lens/${session.token}/${endpoint}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: data === undefined ? {} : { 'content-type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(timeout),
      redirect: 'error',
    });
  } catch (error) {
    throw new Error(`Cannot reach Local Lens: ${error.cause?.message ?? error.message}`);
  }
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error ?? `Local Lens returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return result;
}

function integer(value, fallback, max, name) {
  const result = Number(value ?? fallback);
  if (!Number.isInteger(result) || result < 0 || result > max) {
    throw new Error(`${name} must be an integer from 0 to ${max}.`);
  }
  return result;
}

async function start() {
  if (!values.url) throw new Error('start requires --url http://localhost:<port>.');
  const target = parseTarget(values.url);
  const port = integer(values.port, 0, 65535, 'Port');
  const probe = await fetch(target, { signal: AbortSignal.timeout(5000), redirect: 'manual' });
  await probe.body?.cancel();
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  // Exclusive creation prevents two agents from starting the same project session.
  try {
    await writeFile(stateFile, '', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`A session file already exists at ${stateFile}. Use status or stop. If stale, remove only that file and retry.`);
  }
  let lens;
  try {
    lens = await createLensServer({
      target: target.origin, port,
      onStop: async () => {
        await unlink(stateFile);
      },
    });
    await writeFile(stateFile, JSON.stringify({
      origin: lens.origin, token: lens.token, pid: process.pid, project: process.cwd(),
    }), { mode: 0o600 });
  } catch (error) {
    if (lens) await lens.close();
    else await unlink(stateFile);
    throw error;
  }
  process.once('SIGINT', () => void lens.close());
  process.once('SIGTERM', () => void lens.close());
  console.log(JSON.stringify({
    name: 'local-lens', url: lens.origin, target: target.origin, stateDirectory, pid: process.pid,
  }));
  if (values.open) {
    const [executable, args] = process.platform === 'win32'
      ? ['rundll32.exe', ['url.dll,FileProtocolHandler', lens.origin]]
      : process.platform === 'darwin' ? ['open', [lens.origin]] : ['xdg-open', [lens.origin]];
    const browser = spawn(executable, args, { stdio: 'ignore', windowsHide: true });
    browser.on('error', (error) => console.error(`Browser could not open: ${error.message}. Open ${lens.origin} manually.`));
    browser.on('exit', (code) => {
      if (code) console.error(`Browser opener exited ${code}. Open ${lens.origin} manually.`);
    });
  }
}

try {
  if (values.help || !command) console.log(HELP);
  else if (positionals.length !== 1) throw new Error('Expected exactly one command. See --help.');
  else if (command === 'start') await start();
  else if (['next', 'done', 'fail', 'status', 'stop'].includes(command)) {
    const session = await readSession();
    let result;
    if (command === 'next') {
      const timeout = integer(values.timeout, 120, 600, 'Timeout');
      result = await call(session, `next?timeout=${timeout}`, undefined, (timeout + 5) * 1000);
    } else if (command === 'done' || command === 'fail') {
      if (!values.id || !values.summary) throw new Error(`${command} requires --id and --summary.`);
      result = await call(session, 'result', {
        id: values.id, summary: values.summary, status: command === 'done' ? 'done' : 'failed',
      });
    } else result = await call(session, command === 'status' ? 'health' : 'stop', command === 'stop' ? {} : undefined);
    console.log(JSON.stringify(result, null, 2));
  } else throw new Error(`Unknown command: ${command}. See --help.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = error.status === 408 ? 2 : 1;
}
