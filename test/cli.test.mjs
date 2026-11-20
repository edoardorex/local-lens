import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { fixture, selection } from './helpers.mjs';

const script = fileURLToPath(new URL('../skills/local-lens/scripts/local-lens.mjs', import.meta.url));
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('CLI round trip: start, duplicate rejection, next, done, status, stop', async (t) => {
  const { target } = await fixture(t);
  const state = await mkdtemp(path.join(tmpdir(), 'lens-cli-test-'));
  const service = spawn(process.execPath, [script, 'start', '--url', target, '--state', state], { windowsHide: true });
  let errors = '';
  service.stderr.on('data', (data) => { errors += data; });
  const exited = once(service, 'exit');
  t.after(async () => {
    if (service.exitCode === null) {
      await run(['stop', '--state', state]);
      if (service.exitCode === null) service.kill();
    }
    await exited;
    await rm(state, { recursive: true, force: true });
  });
  const lines = createInterface({ input: service.stdout });
  const firstLine = await Promise.race([
    once(lines, 'line').then(([line]) => line),
    exited.then(() => { throw new Error(`Start exited early: ${errors}`); }),
  ]);
  const ready = JSON.parse(firstLine);
  const session = JSON.parse(await readFile(path.join(state, 'session.json'), 'utf8'));
  assert.equal(ready.url, session.origin);
  assert.equal((await fetch(ready.url)).status, 200);
  const duplicate = await run(['start', '--url', target, '--state', state]);
  assert.equal(duplicate.code, 1);
  assert.match(duplicate.stderr, /session file already exists/);
  assert.equal((await run(['next', '--timeout', '0', '--state', state])).code, 2);
  await fetch(`${session.origin}/__local_lens/${session.token}/requests`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(selection()),
  });
  const next = await run(['next', '--timeout', '1', '--state', state]);
  assert.equal(next.code, 0, next.stderr);
  const item = JSON.parse(next.stdout);
  const done = await run(['done', '--id', item.id, '--summary', 'Source updated.', '--state', state]);
  assert.equal(done.code, 0, done.stderr);
  assert.equal(JSON.parse(done.stdout).status, 'done');
  assert.equal((await run(['status', '--state', state])).code, 0);
  assert.equal((await run(['stop', '--state', state])).code, 0);
  await exited;
  assert.equal(service.exitCode, 0, errors);
  await assert.rejects(readFile(path.join(state, 'session.json')), { code: 'ENOENT' });
});

test('CLI rejects missing and invalid arguments', async () => {
  for (const args of [
    ['start'], ['start', '--url', 'https://example.com'],
    ['start', '--url', 'http://localhost:5173', '--port', 'not-a-number'],
    ['unknown'], ['start', 'unexpected'], ['--unknown'],
  ]) assert.equal((await run(args)).code, 1, JSON.stringify(args));
  const help = await run(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Local Lens/);
});
